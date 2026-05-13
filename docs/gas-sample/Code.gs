/**
 * Sample Google Apps Script backend for Tailor Marketplace
 * Paste this into a new Apps Script project (bound to your Spreadsheet or standalone) and update the SPREADSHEET_ID
 * Then Deploy -> New deployment -> Web app and set access appropriately.
 *
 * NOTE: This is a simple example for testing/demo. Do NOT use as-is in production without auditing security.
 */

var SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || 'REPLACE_WITH_SHEET_ID';
var ADMIN_API_KEY = PropertiesService.getScriptProperties().getProperty('ADMIN_API_KEY') || 'REPLACE_WITH_ADMIN_KEY';
var DRIVE_FOLDER_ID = PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID') || '';

// Small compatibility helpers
function normalizePayload(p) {
  p = p || {};
  // allow jobId, id, job_rn, rn
  if (!p.jobId) p.jobId = p.id || p.job_rn || p.rn || p.jobId;
  // allow actor variations
  p.actorId = p.actorId || p.user_id || p.userId || p.payerId || p.tailorId || p.customerId;
  p.actorRole = p.actorRole || p.role || p.user_role || p.actor_role;
  return p;
}

function requireRole(p, allowedRoles) {
  // allowedRoles: array of strings
  p = p || {};
  if (!p.actorRole) return false;
  return allowedRoles.indexOf(p.actorRole) >= 0;
}

function doGet(e) {
  // Support simple read endpoints via ?action=list_jobs or ?action=get_job&jobId=...
  try {
    var action = e && e.parameter && e.parameter.action;
    if (!action) return ContentService.createTextOutput(JSON.stringify({status:'ok', message:'Tailor Marketplace GAS running'})).setMimeType(ContentService.MimeType.JSON);
    if (action === 'list_jobs') {
      var filter = {};
      // allow status filter: ?status=new
      if (e.parameter.status) filter.status = e.parameter.status;
      var result = handleListJobs({ filter: filter });
      return jsonSuccess({ status:'ok', jobs: result });
    }
    if (action === 'get_job' && e.parameter.jobId) {
      var job = handleGetJob({ jobId: e.parameter.jobId });
      return jsonSuccess({ status:'ok', job: job });
    }
    return jsonFail('unknown GET action');
  } catch (err) {
    return jsonFail(err.message || err.toString());
  }
}

function doPost(e) {
  try {
    var body = e.postData && e.postData.type === 'application/json' ? JSON.parse(e.postData.contents) : JSON.parse(e.postData.contents);
    var action = body.action;
    if (!action) return jsonFail('missing action');

    switch(action) {
      case 'create': return jsonSuccess(handleCreateJob(body));
      case 'list_jobs': return jsonSuccess(handleListJobs(body));
      case 'get_job': return jsonSuccess(handleGetJob(body));
      case 'upload_image': return jsonSuccess(handleUploadImage(body));
      case 'accept_job': return jsonSuccess(handleAcceptJob(body));
      case 'update_status': return jsonSuccess(handleUpdateStatus(body));
      case 'add_stock': return jsonSuccess(handleAddStock(body));
      case 'update_stock_qty': return jsonSuccess(handleUpdateStockQty(body));
      case 'pay_final_price': return jsonSuccess(handlePayFinal(body));
      default: return jsonFail('unknown action');
    }
  } catch(err) {
    return jsonFail(err.message || err.toString());
  }
}

/* ---------- Handlers ---------- */

function handleCreateJob(payload) {
  // basic validation
  if (!payload.customer_name || !payload.customer_phone || !payload.job_detail) throw 'missing required fields';

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var jobsSheet = ss.getSheetByName('jobs');
  if (!jobsSheet) throw 'jobs sheet not found';

  // build RN
  var settings = getSettings(ss);
  var counter = parseInt(settings.next_rn_counter || '1', 10);
  var rn = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd') + '-' + ('0000' + counter).slice(-4);
  var jobId = 'RN-' + rn;

  var createdAt = new Date().toISOString();
  var row = [jobId, jobId, payload.customerId || ('GUEST-'+Math.random().toString(36).slice(2,8)), payload.customer_name, payload.customer_phone, payload.customer_line || '', payload.job_category || '', payload.job_detail || '', JSON.stringify(payload.measurements || {}), payload.budget || '', payload.referral_code || '', 'new', '', createdAt, createdAt, 'pending', '',''];

  jobsSheet.appendRow(row);

  // increment counter
  updateSetting(ss, 'next_rn_counter', (counter+1).toString());

  // audit log
  appendAudit(ss, 'jobs_audit', [createdAt, jobId, payload.customerId || '', 'customer', 'create', '', 'new', 'Created via API']);

  return { status:'success', rn: jobId };
}

function handleAcceptJob(payload) {
  payload = normalizePayload(payload);
  if (!payload.jobId || !payload.tailorId) throw 'missing jobId or tailorId';
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var jobs = ss.getSheetByName('jobs');
  var data = jobs.getDataRange().getValues();
  var header = data.shift();
  var idx = findRowIndex(data, header, 'jobId', payload.jobId);
  if (idx < 0) throw 'job not found';

  var rowIndex = idx + 2; // account for header
  var statusCol = header.indexOf('status') + 1;
  var assignCol = header.indexOf('assigned_tailor') + 1;
  jobs.getRange(rowIndex, statusCol).setValue('assigned');
  jobs.getRange(rowIndex, assignCol).setValue(payload.tailorId);

  var ts = new Date().toISOString();
  appendAudit(ss, 'jobs_audit', [ts, payload.jobId, payload.tailorId, 'tailor', 'accept', 'new', 'assigned', 'Tailor accepted job']);
  return { status:'ok', jobId: payload.jobId };
}

function handleUpdateStatus(payload) {
  payload = normalizePayload(payload);
  if (!payload.jobId || !payload.newStatus) throw 'missing jobId or newStatus';
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var jobs = ss.getSheetByName('jobs');
  var data = jobs.getDataRange().getValues();
  var header = data.shift();
  var idx = findRowIndex(data, header, 'jobId', payload.jobId);
  if (idx < 0) throw 'job not found';
  var rowIndex = idx + 2;
  var statusCol = header.indexOf('status') + 1;
  var prev = jobs.getRange(rowIndex, statusCol).getValue();
  jobs.getRange(rowIndex, statusCol).setValue(payload.newStatus);

  var ts = new Date().toISOString();
  appendAudit(ss, 'jobs_audit', [ts, payload.jobId, payload.actorId || '', payload.actorRole || '', 'update_status', prev, payload.newStatus, payload.note || '']);
  return { status:'ok' };
}

function handleAddStock(payload) {
  // require admin key
  payload = normalizePayload(payload);
  if (!isAdmin(payload) && !requireRole(payload, ['boss'])) throw 'admin auth required';
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var stock = ss.getSheetByName('stock');
  stock.appendRow([payload.sku, payload.name, payload.qty || 0, payload.unit || '', JSON.stringify(payload.meta||{}), new Date().toISOString(), new Date().toISOString()]);
  appendAudit(ss, 'stock_audit', [new Date().toISOString(), payload.sku, payload.qty || 0, 'add_stock', payload.actorId || 'ADMIN', 'boss']);
  return { status:'ok' };
}

function handleUpdateStockQty(payload) {
  payload = normalizePayload(payload);
  if (!isAdmin(payload) && !requireRole(payload, ['boss'])) throw 'admin auth required';
  if (!payload.sku || payload.delta === undefined) throw 'missing sku or delta';
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var stock = ss.getSheetByName('stock');
    var data = stock.getDataRange().getValues();
    var header = data.shift();
    var idx = findRowIndex(data, header, 'sku', payload.sku);
    if (idx < 0) throw 'sku not found';
    var rowIndex = idx + 2;
    var qtyCol = header.indexOf('qty') + 1;
    var cur = Number(stock.getRange(rowIndex, qtyCol).getValue()) || 0;
    var next = cur + Number(payload.delta);
    if (next < 0) throw 'insufficient stock';
    stock.getRange(rowIndex, qtyCol).setValue(next);
    appendAudit(ss, 'stock_audit', [new Date().toISOString(), payload.sku, payload.delta, payload.reason || '', payload.actorId || 'ADMIN', 'boss']);
    return { status:'ok', sku: payload.sku, qty: next };
  } finally {
    lock.releaseLock();
  }
}

function handlePayFinal(payload) {
  payload = normalizePayload(payload);
  if (!payload.jobId || !payload.amount) throw 'missing jobId or amount';
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var payments = ss.getSheetByName('payments');
  var paymentId = 'PAY-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd') + '-' + Math.floor(Math.random()*10000);
  payments.appendRow([paymentId, payload.jobId, payload.amount, payload.payment_method || 'unknown', payload.payment_ref || '', 'paid', new Date().toISOString()]);

  // update job payment_status
  var jobs = ss.getSheetByName('jobs');
  var data = jobs.getDataRange().getValues();
  var header = data.shift();
  var idx = findRowIndex(data, header, 'jobId', payload.jobId);
  if (idx >= 0) {
    var rowIndex = idx + 2;
    var payCol = header.indexOf('payment_status') + 1;
    var payRefCol = header.indexOf('payment_ref') + 1;
    jobs.getRange(rowIndex, payCol).setValue('paid');
    jobs.getRange(rowIndex, payRefCol).setValue(paymentId);
    appendAudit(ss, 'jobs_audit', [new Date().toISOString(), payload.jobId, payload.payerId || '', payload.payerRole || 'customer', 'pay_final_price', '', 'paid', 'Payment received: ' + paymentId]);
  }
  return { status:'ok', paymentId: paymentId };
}

/* ---------- Read endpoints & uploads ---------- */

function handleListJobs(payload) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var jobs = ss.getSheetByName('jobs');
  var data = jobs.getDataRange().getValues();
  var header = data.shift();
  var out = [];
  for (var i=0;i<data.length;i++) {
    var row = rowToObject(header, data[i]);
    if (payload && payload.filter && payload.filter.status) {
      if (row.status !== payload.filter.status) continue;
    }
    out.push(row);
  }
  return out;
}

function handleGetJob(payload) {
  if (!payload || !payload.jobId) throw 'jobId required';
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var jobs = ss.getSheetByName('jobs');
  var data = jobs.getDataRange().getValues();
  var header = data.shift();
  var idx = findRowIndex(data, header, 'jobId', payload.jobId);
  if (idx < 0) throw 'job not found';
  return rowToObject(header, data[idx]);
}

function handleUploadImage(payload) {
  // payload should contain: jobId (or job_rn), fileName, mimeType, data (base64), actorId, actorRole
  payload = normalizePayload(payload);
  if (!payload.jobId && !payload.job_rn) throw 'missing upload job identifier';
  if (!payload.data || !payload.fileName) throw 'missing upload fields (fileName/data)';
  if (!DRIVE_FOLDER_ID) throw 'DRIVE_FOLDER_ID not configured - set in Script Properties';
  var blob;
  try {
    blob = Utilities.newBlob(Utilities.base64Decode(payload.data), payload.mimeType || 'image/png', payload.fileName);
  } catch (err) {
    throw 'Invalid base64 data';
  }
  var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  var file = folder.createFile(blob);
  var url = file.getUrl();
  // append URL to jobs sheet in a new images column (or stock_consumed)
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var jobs = ss.getSheetByName('jobs');
  var data = jobs.getDataRange().getValues();
  var header = data.shift();
  var idx = -1;
  if (payload.jobId) idx = findRowIndex(data, header, 'jobId', payload.jobId);
  if (idx < 0 && payload.job_rn) idx = findRowIndex(data, header, 'rn', payload.job_rn);
  if (idx >= 0) {
    var rowIndex = idx + 2;
    var imgCol = header.indexOf('images');
    if (imgCol < 0) {
      // add new column
      imgCol = header.length;
      jobs.getRange(1, imgCol+1).setValue('images');
    }
    var existing = jobs.getRange(rowIndex, imgCol+1).getValue() || '';
    var updated = existing ? existing + '|' + url : url;
    jobs.getRange(rowIndex, imgCol+1).setValue(updated);
    appendAudit(ss, 'jobs_audit', [new Date().toISOString(), payload.jobId, payload.actorId || '', payload.actorRole || '', 'upload_image', '', '', 'Uploaded image: ' + file.getName()]);
  }
  return { status:'ok', url: url };
}

function rowToObject(header, row) {
  var obj = {};
  for (var i=0;i<header.length;i++) obj[header[i]] = row[i];
  return obj;
}

/* ---------- Helpers ---------- */

function jsonSuccess(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function jsonFail(msg) { return ContentService.createTextOutput(JSON.stringify({ status:'error', message: msg })).setMimeType(ContentService.MimeType.JSON); }

function getSettings(ss) {
  var s = ss.getSheetByName('settings');
  if (!s) return {};
  var data = s.getDataRange().getValues();
  var out = {};
  for (var i=1;i<data.length;i++) {
    if (!data[i] || !data[i][0]) continue;
    out[data[i][0]] = data[i][1];
  }
  return out;
}

function updateSetting(ss, key, value) {
  var s = ss.getSheetByName('settings');
  if (!s) return;
  var data = s.getDataRange().getValues();
  for (var i=1;i<data.length;i++) {
    if (data[i][0] === key) { s.getRange(i+1,2).setValue(value); return; }
  }
  s.appendRow([key, value]);
}

function appendAudit(ss, sheetName, rowArray) {
  var s = ss.getSheetByName(sheetName);
  if (!s) return;
  s.appendRow(rowArray);
}

function findRowIndex(data, header, keyName, value) {
  var col = header.indexOf(keyName);
  if (col < 0) return -1;
  for (var i=0;i<data.length;i++) {
    if (data[i][col] == value) return i;
  }
  return -1;
}

function isAdmin(payload) {
  // Accept ADMIN_API_KEY in payload for demo; production should use OAuth or secure session
  if (payload && payload.admin_key && payload.admin_key === ADMIN_API_KEY) return true;
  return false;
}
