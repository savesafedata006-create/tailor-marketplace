/**
 * TailorHub Marketplace - Backend System (Google Apps Script)
 * รองรับระบบ Boss, Tailor และ Customer ตาม SOP/WI
 */

const SCRIPT_VERSION = "1.0.0";
const SHOP_NAME = "TailorHub Premium";

// ชื่อของ Sheet ต่างๆ ในระบบ
const SHEETS = {
  JOBS: 'JOBS',
  USERS: 'USERS',
  STOCK: 'STOCK',
  LOGS: 'LOGS',
  PAYROLL: 'PAYROLL',
  CONFIG: 'CONFIG',
  MEASUREMENTS: 'MEASUREMENTS',
  ATTENDANCE: 'ATTENDANCE'
};

/**
 * GET Request: ดึงข้อมูลทั้งหมดของระบบเพื่อนำไปแสดงผลบน Dashboard
 */
function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  initDatabase(ss); // ตรวจสอบและสร้างตารางถ้ายังไม่มี
  
  const data = {
    jobs: getSheetData(ss, SHEETS.JOBS),
    users: getSheetData(ss, SHEETS.USERS, true), // ซ่อนรหัสผ่าน
    stock: getSheetData(ss, SHEETS.STOCK),
    payroll: getSheetData(ss, SHEETS.PAYROLL),
    measurements: getSheetData(ss, SHEETS.MEASUREMENTS),
    logs: getSheetData(ss, SHEETS.LOGS).slice(-50).reverse(), // 50 รายการล่าสุด
    serverTime: new Date().toISOString()
  };
  
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * POST Request: จัดการ Action ต่างๆ จากฝั่ง Frontend
 */
function doPost(e) {
  let postData;
  try {
    postData = JSON.parse(e.postData.contents);
  } catch (f) {
    return response({ status: "error", message: "Invalid JSON format" });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const action = postData.action;
  
  switch (action) {
    case 'login':
      return handleLogin(ss, postData);
    case 'register':
      return handleRegister(ss, postData);
    case 'create': // สร้างงานจ้างใหม่
      return handleCreateJob(ss, postData);
    case 'update_status': // อัปเดตสถานะงาน (รับงาน/เย็บ/เสร็จ)
      return handleUpdateStatus(ss, postData);
    case 'update_stock': // บอสแก้ไขจำนวนสต็อก
      return handleUpdateStock(ss, postData);
    case 'add_stock': // บอสเพิ่มวัสดุใหม่
      return handleAddStock(ss, postData);
    case 'update_role': // บอสจัดการสิทธิ์ผู้ใช้
      return handleUpdateRole(ss, postData);
    case 'request_payment': // ช่างขอเบิกเงิน
      return handleRequestPayment(ss, postData);
    case 'approve_payment': // บสอนุมัติเงินเดือน
      return handleApprovePayment(ss, postData);
    case 'update_additional_cost': // บอสปรับราคา/เพิ่มค่าใช้จ่าย
      return handleUpdateCost(ss, postData);
    case 'upload_image': // ช่างอัปโหลดรูปงาน
      return handleUploadImage(ss, postData);
    case 'reset_password':
      return handleResetPassword(ss, postData);
    case 'change_password':
      return handleChangePassword(ss, postData);
    case 'update_profile':
      return handleUpdateProfile(ss, postData);
    case 'update_measurements':
      return handleUpdateMeasurements(ss, postData);
    case 'pay_final_price':
      return handlePayFinal(ss, postData);
    case 'edit_stock': // บอสแก้ไขรายละเอียดสต็อกทั้งหมด
      return handleEditStock(ss, postData);
    case 'delete_stock': // บอสลบรายการสต็อก
      return handleDeleteStock(ss, postData);
    case 'clock_work': // ระบบแจ้งเข้า-ออกงาน
      return handleClockWork(ss, postData);
    case 'request_leave': // ระบบแจ้งหยุดงาน
      return handleRequestLeave(ss, postData);
    default:
      return response({ status: "error", message: "Action not found" });
  }
}

/* --- Action Handlers --- */

function handleLogin(ss, data) {
  const users = getSheetData(ss, SHEETS.USERS);
  const user = users.find(u => u.username === data.username && u.password === data.password);
  if (user) {
    const { password, ...userPublic } = user;
    if (user.role === 'boss') sendEmailNotify("🔐 Boss Login", `มีการเข้าสู่ระบบด้วยสิทธิ์ผู้ดูแลสูงสุด (${user.full_name})`);
    return response({ status: "success", user: userPublic });
  }
  return response({ status: "error", message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
}

function handleRegister(ss, data) {
  const sheet = ss.getSheetByName(SHEETS.USERS);
  const rows = sheet.getDataRange().getValues();
  
  // ตรวจสอบ Username ซ้ำ
  const exists = rows.some(r => r[1] === data.username);
  if (exists) return response({ status: "error", message: "ชื่อผู้ใช้งานนี้ถูกใช้ไปแล้ว" });

  const userId = "U-" + Math.floor(10000000 + Math.random() * 90000000);
  const newUser = [userId, data.username, data.password, "customer", data.full_name, data.phone];
  sheet.appendRow(newUser);
  
  logEvent(ss, userId, data.username, "REGISTER", "New user registered");
  sendEmailNotify("👤 สมาชิกใหม่", `ชื่อ: ${data.full_name}\nUsername: ${data.username}`);
  
  return response({ status: "success", user: { user_id: userId, role: "customer", full_name: data.full_name } });
}

function handleCreateJob(ss, data) {
  const sheet = ss.getSheetByName(SHEETS.JOBS);
  const id = Utilities.getUuid();
  const datePrefix = Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd");
  const rn = `RN-${datePrefix}-${Math.floor(1000 + Math.random() * 9000)}`;
  
  const row = [
    id, rn, data.customer_name, data.phone, data.line || "",
    data.job_detail, data.category, data.budget, "pending",
    "", data.user_id || "GUEST", new Date(), "", 0, 0, 
    JSON.stringify(data.measurements || {}), "", ""
  ];
  
  sheet.appendRow(row);
  sendEmailNotify("🆕 งานจ้างใหม่", `ลูกค้า: ${data.customer_name}\nงาน: ${data.job_detail}\nงบประมาณ: ฿${data.budget}`);
  return response({ status: "success", rn: rn, jobId: id });
}

function handleUpdateStatus(ss, data) {
  const sheet = ss.getSheetByName(SHEETS.JOBS);
  const rows = sheet.getDataRange().getValues();
  let rowIndex = -1;
  
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.id || rows[i][1] === data.id) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex === -1) return response({ status: "error", message: "ไม่พบใบงาน" });

  // จัดการเรื่อง Stock หากเป็นการ "รับงาน" (accepted)
  if (data.status === 'accepted' && data.stock_id) {
    deductStock(ss, data.stock_id, data.stock_qty || 1, rowIndex);
  }

  const currentStatus = rows[rowIndex-1][8];
  if (data.status) sheet.getRange(rowIndex, 9).setValue(data.status);
  if (data.tailor_name) sheet.getRange(rowIndex, 10).setValue(data.tailor_name);
  if (data.progress_photo) sheet.getRange(rowIndex, 17).setValue(data.progress_photo);
  if (data.cancellation_reason) sheet.getRange(rowIndex, 13).setValue(data.cancellation_reason);
  if (data.rating) sheet.getRange(rowIndex, 14).setValue(data.rating);
  if (data.dispute_notes) sheet.getRange(rowIndex, 18).setValue(data.dispute_notes);

  logEvent(ss, data.actorId || "System", data.actorName || "System", "UPDATE_STATUS", `RN: ${rows[rowIndex-1][1]} (${currentStatus} -> ${data.status})`);
  
  if (data.status === 'finished') sendEmailNotify("✅ งานเสร็จแล้ว", `ใบงาน ${rows[rowIndex-1][1]} ตัดเย็บเสร็จเรียบร้อยพร้อมส่งมอบ`);
  
  return response({ status: "success" });
}

function handleUpdateStock(ss, data) {
  const sheet = ss.getSheetByName(SHEETS.STOCK);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.item_id) {
      sheet.getRange(i + 1, 4).setValue(data.quantity); // Qty
      sheet.getRange(i + 1, 8).setValue(new Date()); // Last Updated
      return response({ status: "success" });
    }
  }
  return response({ status: "error", message: "ไม่พบสินค้า" });
}

function handleAddStock(ss, data) {
  const sheet = ss.getSheetByName(SHEETS.STOCK);
  const id = "STK-" + Math.floor(100000 + Math.random() * 900000);
  sheet.appendRow([
    id, data.category, data.item_name, data.quantity, 
    data.unit, data.unit_price, data.min_threshold, new Date()
  ]);
  return response({ status: "success", item_id: id });
}

function handleUpdateRole(ss, data) {
  const sheet = ss.getSheetByName(SHEETS.USERS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.user_id) {
      sheet.getRange(i + 1, 4).setValue(data.role);
      logEvent(ss, data.admin_id, data.admin_name, "UPDATE_ROLE", `User: ${rows[i][1]} -> ${data.role}`);
      return response({ status: "success" });
    }
  }
  return response({ status: "error" });
}

function handleRequestPayment(ss, data) {
  const sheet = ss.getSheetByName(SHEETS.PAYROLL);
  const id = "PAY-" + Utilities.getUuid().substring(0,8).toUpperCase();
  const gross = Number(data.amount);
  const tax = gross * 0.03; // หักภาษี 3% ตาม WI
  const net = gross - tax;
  
  sheet.appendRow([
    id, data.user_id, data.username, gross, tax, net, data.cycle, "pending", new Date()
  ]);
  return response({ status: "success", pay_id: id });
}

function handleApprovePayment(ss, data) {
  const sheet = ss.getSheetByName(SHEETS.PAYROLL);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.pay_id) {
      sheet.getRange(i + 1, 8).setValue("approved");
      return response({ status: "success" });
    }
  }
  return response({ status: "error" });
}

function handleUpdateCost(ss, data) {
  const sheet = ss.getSheetByName(SHEETS.JOBS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.id || rows[i][1] === data.id) {
      const currentBudget = Number(rows[i][7]);
      const newBudget = currentBudget + Number(data.additional_cost);
      sheet.getRange(i + 1, 8).setValue(newBudget);
      logEvent(ss, "BOSS", "Admin", "UPDATE_COST", `RN: ${rows[i][1]} +${data.additional_cost}`);
      return response({ status: "success", new_budget: newBudget });
    }
  }
  return response({ status: "error" });
}

function handleResetPassword(ss, data) {
  const sheet = ss.getSheetByName(SHEETS.USERS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1] === data.username && rows[i][5].toString() === data.phone.toString()) {
      sheet.getRange(i + 1, 3).setValue(data.new_password);
      logEvent(ss, rows[i][0], data.username, "RESET_PASSWORD", "User reset password via phone verification");
      return response({ status: "success" });
    }
  }
  return response({ status: "error", message: "ชื่อผู้ใช้หรือเบอร์โทรศัพท์ไม่ถูกต้อง" });
}

function handleChangePassword(ss, data) {
  const sheet = ss.getSheetByName(SHEETS.USERS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.user_id && rows[i][2] === data.old_password) {
      sheet.getRange(i + 1, 3).setValue(data.new_password);
      logEvent(ss, data.user_id, rows[i][1], "CHANGE_PASSWORD", "User changed their password");
      return response({ status: "success" });
    }
  }
  return response({ status: "error", message: "รหัสผ่านเดิมไม่ถูกต้อง" });
}

function handleUpdateProfile(ss, data) {
  const sheet = ss.getSheetByName(SHEETS.USERS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.user_id) {
      if (data.full_name) sheet.getRange(i + 1, 5).setValue(data.full_name);
      if (data.phone) sheet.getRange(i + 1, 6).setValue(data.phone);
      // สมมติว่า Line ID อยู่คอลัมน์ที่ 7 (ถ้าเพิ่มในอนาคต)
      return response({ status: "success" });
    }
  }
  return response({ status: "error" });
}

function handleUpdateMeasurements(ss, data) {
  const sheet = ss.getSheetByName(SHEETS.MEASUREMENTS);
  const rows = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.user_id) {
      rowIndex = i + 1;
      break;
    }
  }
  
  const rowData = [data.user_id, data.chest, data.waist, data.hips, data.length, data.shoulder, new Date()];
  if (rowIndex > -1) {
    sheet.getRange(rowIndex, 1, 1, 7).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
  return response({ status: "success" });
}

function handlePayFinal(ss, data) {
  const sheet = ss.getSheetByName(SHEETS.JOBS);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.id) {
      sheet.getRange(i + 1, 9).setValue("paid");
      logEvent(ss, data.user_id, "Customer", "PAY_FINAL", `Payment received for RN: ${rows[i][1]}`);
      return response({ status: "success" });
    }
  }
  return response({ status: "error" });
}

function handleUploadImage(ss, data) {
  // ในเวอร์ชันนี้ เราจะบันทึก URL รูปภาพลงในคอลัมน์ progress_photo ของ JOBS โดยตรง
  // หากส่ง base64 มา จะต้องใช้ Google Drive API ในการบันทึกไฟล์ (แนะนำให้ส่งเป็น URL สำหรับ Demo)
  const sheet = ss.getSheetByName(SHEETS.JOBS);
  const rows = sheet.getDataRange().getValues();
  const jobRn = data.job_rn;
  
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1] === jobRn) {
      // สมมติว่า data.data คือ URL หรือเราประมวลผลเป็นลิงก์แล้ว
      sheet.getRange(i + 1, 17).setValue(data.image_url || data.data); 
      logEvent(ss, data.actorId, "Staff", "UPLOAD_IMAGE", `Uploaded photo for ${jobRn}`);
      return response({ status: "success" });
    }
  }
  return response({ status: "error", message: "ไม่พบเลขที่ใบงาน (RN)" });
}

function handleEditStock(ss, data) {
  const sheet = ss.getSheetByName(SHEETS.STOCK);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] == data.id) {
      if (data.category    !== undefined) sheet.getRange(i+1,2).setValue(data.category);
      if (data.item_name   !== undefined) sheet.getRange(i+1,3).setValue(data.item_name);
      if (data.quantity    !== undefined) sheet.getRange(i+1,4).setValue(Number(data.quantity));
      if (data.unit        !== undefined) sheet.getRange(i+1,5).setValue(data.unit);
      if (data.unit_price  !== undefined) sheet.getRange(i+1,6).setValue(Number(data.unit_price));
      if (data.min_threshold !== undefined) sheet.getRange(i+1,7).setValue(Number(data.min_threshold));
      sheet.getRange(i+1,8).setValue(new Date());
      logEvent(ss, data.admin_id||"BOSS", "boss", "EDIT_STOCK", `แก้ไขสต๊อก: ${data.item_name||rows[i][2]}`);
      return response({ status: "success" });
    }
  }
  return response({ status: "error", message: "ไม่พบรายการสต๊อก" });
}

function handleDeleteStock(ss, data) {
  const sheet = ss.getSheetByName(SHEETS.STOCK);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] == data.id) {
      const name = rows[i][2];
      sheet.deleteRow(i+1);
      logEvent(ss, data.admin_id||"BOSS", "boss", "DELETE_STOCK", `ลบสต๊อก: ${name} (${data.id})`);
      return response({ status: "success" });
    }
  }
  return response({ status: "error", message: "ไม่พบรายการสต๊อก" });
}

function handleClockWork(ss, data) {
  const sheet = ss.getSheetByName(SHEETS.ATTENDANCE);
  const id = "ATT-" + Utilities.getUuid().substring(0,8).toUpperCase();
  // Columns: id, user_id, username, type (in/out), timestamp, note
  sheet.appendRow([
    id, data.user_id, data.username, data.type, new Date(), data.note || ""
  ]);
  
  const typeText = data.type === 'in' ? "เข้างาน" : "ออกงาน";
  logEvent(ss, data.user_id, data.username, "CLOCK_" + data.type.toUpperCase(), `พนักงานแจ้ง${typeText}`);
  
  return response({ status: "success", att_id: id });
}

function handleRequestLeave(ss, data) {
  const sheet = ss.getSheetByName(SHEETS.ATTENDANCE);
  const id = "LEV-" + Utilities.getUuid().substring(0,8).toUpperCase();
  // Columns: id, user_id, username, type (leave), timestamp (start), note (reason)
  sheet.appendRow([
    id, data.user_id, data.username, "leave", data.start_date, data.reason || ""
  ]);
  
  logEvent(ss, data.user_id, data.username, "REQUEST_LEAVE", `แจ้งหยุดงาน: ${data.reason}`);
  sendEmailNotify("📅 แจ้งหยุดงาน", `พนักงาน: ${data.username}\nวันที่: ${data.start_date}\nเหตุผล: ${data.reason}`);
  
  return response({ status: "success", leave_id: id });
}

/* --- Helper Functions --- */

function deductStock(ss, stockId, qtyUsed, jobRowIndex) {
  const stockSheet = ss.getSheetByName(SHEETS.STOCK);
  const stockData = stockSheet.getDataRange().getValues();
  for (let j = 1; j < stockData.length; j++) {
    if (stockData[j][0] === stockId) {
      const currentQty = Number(stockData[j][3]);
      const unitPrice = Number(stockData[j][5]);
      const minThreshold = Number(stockData[j][6]);
      const newQty = currentQty - qtyUsed;
      
      stockSheet.getRange(j + 1, 4).setValue(newQty);
      stockSheet.getRange(j + 1, 8).setValue(new Date());
      
      // บันทึกต้นทุนวัสดุลงในใบงาน
      const materialCost = qtyUsed * unitPrice;
      ss.getSheetByName(SHEETS.JOBS).getRange(jobRowIndex, 15).setValue(materialCost);
      
      // แจ้งเตือนถ้าของใกล้หมด
      if (newQty <= minThreshold) {
        sendEmailNotify("⚠️ วัสดุใกล้หมดคลัง", `วัสดุ: ${stockData[j][2]} คงเหลือเพียง ${newQty} ${stockData[j][4]}`);
      }
      break;
    }
  }
}

function getSheetData(ss, sheetName, hidePassword = false) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const result = [];
  
  for (let i = 1; i < data.length; i++) {
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      if (hidePassword && headers[j].toString().toLowerCase() === 'password') continue;
      obj[headers[j]] = data[i][j];
    }
    result.push(obj);
  }
  return result;
}

function response(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function logEvent(ss, userId, username, action, details) {
  const sheet = ss.getSheetByName(SHEETS.LOGS);
  sheet.appendRow([new Date(), userId, username, action, details, "success"]);
}

function sendEmailNotify(subject, body) {
  try {
    const adminEmail = Session.getActiveUser().getEmail();
    if (adminEmail) {
      MailApp.sendEmail({
        to: adminEmail,
        subject: `🔔 TailorHub แจ้งเตือน — ${subject}`,
        body: body + `\n\nตรวจสอบข้อมูลได้ที่: ${ScriptApp.getService().getUrl()}`
      });
    }
  } catch (e) {
    console.error("Email failed: " + e.toString());
  }
}

/**
 * เริ่มต้นสร้างตารางข้อมูล (Run ครั้งเดียวตอนติดตั้ง)
 */
function initDatabase(ss) {
  const sheetsConfig = [
    { name: SHEETS.JOBS, headers: ['id', 'rn', 'customer_name', 'phone', 'line', 'job_detail', 'category', 'budget', 'status', 'tailor_name', 'user_id', 'created_at', 'cancellation_reason', 'rating', 'material_cost', 'measurements', 'progress_photo', 'dispute_notes'] },
    { name: SHEETS.USERS, headers: ['user_id', 'username', 'password', 'role', 'full_name', 'phone'] },
    { name: SHEETS.STOCK, headers: ['item_id', 'category', 'item_name', 'quantity', 'unit', 'unit_price', 'min_threshold', 'last_updated'] },
    { name: SHEETS.LOGS, headers: ['timestamp', 'user_id', 'username', 'action', 'details', 'status'] },
    { name: SHEETS.PAYROLL, headers: ['pay_id', 'user_id', 'username', 'gross_amount', 'tax_3', 'net_amount', 'cycle', 'status', 'timestamp'] },
    { name: SHEETS.CONFIG, headers: ['key', 'value'] },
    { name: SHEETS.MEASUREMENTS, headers: ['user_id', 'chest', 'waist', 'hips', 'length', 'shoulder', 'last_updated'] },
    { name: SHEETS.ATTENDANCE, headers: ['log_id', 'user_id', 'username', 'type', 'timestamp', 'note'] }
  ];

  sheetsConfig.forEach(cfg => {
    let s = ss.getSheetByName(cfg.name);
    if (!s) {
      s = ss.insertSheet(cfg.name);
      s.appendRow(cfg.headers);
      s.getRange(1, 1, 1, cfg.headers.length).setFontWeight("bold").setBackground("#f3f3f3");
    }
  });
  
  // สร้าง Default Boss ถ้ายังไม่มีผู้ใช้เลย
  const userSheet = ss.getSheetByName(SHEETS.USERS);
  if (userSheet.getLastRow() === 1) {
    userSheet.appendRow(['ADMIN-001', 'admin', '1234', 'boss', 'เจ้าของร้าน (Admin)', '0800000000']);
  }
}

/**
 * Seed ข้อมูลตัวอย่างสำหรับ Demo
 */
function seedSampleData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  initDatabase(ss);
  
  // เพิ่มสต็อกตัวอย่าง
  const stockSheet = ss.getSheetByName(SHEETS.STOCK);
  if (stockSheet.getLastRow() === 1) {
    stockSheet.appendRow(['STK-001', 'ผ้า', 'ผ้าคอตตอน 100%', 50, 'เมตร', 120, 10, new Date()]);
    stockSheet.appendRow(['STK-002', 'ผ้า', 'ผ้าซิลค์ซาตินพรีเมียม', 20, 'เมตร', 450, 5, new Date()]);
    stockSheet.appendRow(['STK-003', 'อะไหล่', 'กระดุมสูทพรีเมียม', 100, 'เม็ด', 15, 20, new Date()]);
    stockSheet.appendRow(['STK-004', 'อะไหล่', 'ซิปซ่อน 22 นิ้ว', 40, 'เส้น', 25, 10, new Date()]);
    stockSheet.appendRow(['STK-005', 'ผ้า', 'ผ้าวูล (Wool) สำหรับสูท', 15, 'เมตร', 1200, 3, new Date()]);
    stockSheet.appendRow(['STK-006', 'อะไหล่', 'ซับในอย่างดี', 30, 'เมตร', 80, 5, new Date()]);
  }
  
  // เพิ่มพนักงานตัวอย่าง
  const userSheet = ss.getSheetByName(SHEETS.USERS);
  if (userSheet.getLastRow() === 2) { // 2 เพราะมี Admin อยู่แล้ว
    userSheet.appendRow(['TAILOR-001', 'tailor1', '1234', 'tailor', 'ช่างสมชาย', '0811111111']);
    userSheet.appendRow(['TAILOR-002', 'tailor2', '1234', 'tailor', 'ช่างสมศรี', '0822222222']);
    userSheet.appendRow(['CUST-001', 'customer1', '1234', 'customer', 'คุณวิภาวรรณ', '0833333333']);
    userSheet.appendRow(['CUST-002', 'customer2', '1234', 'customer', 'คุณมานะศักดิ์', '0844444444']);
  }
  
  // เพิ่มงานตัวอย่าง 10 รายการ (10 Use Cases)
  const jobSheet = ss.getSheetByName(SHEETS.JOBS);
  if (jobSheet.getLastRow() === 1) {
    const now = new Date();
    const jobs = [
      // 1. งานเสร็จแล้ว ได้ Rating 5 ดาว
      ['J-001', 'RN-20240501-001', 'คุณวิภาวรรณ', '0833333333', '@vipa', 'ชุดเดรสผ้าไหมไปงานแต่ง', 'เดรส', 4500, 'finished', 'ช่างสมศรี', 'CUST-001', now, '', 5, 900, '{"chest":"34","waist":"26","hips":"36","length":"40","shoulder":"15"}', 'https://images.unsplash.com/photo-1585487000160-6ebcfceb0d03', ''],
      
      // 2. งานกำลังเย็บ มีรูปความคืบหน้า
      ['J-002', 'RN-20240502-002', 'คุณมานะศักดิ์', '0844444444', '', 'สูทสากลสีเทาเข้ม Slim Fit', 'สูท', 8500, 'sewing', 'ช่างสมชาย', 'CUST-002', now, '', 0, 2400, '{"chest":"40","waist":"34","hips":"42","length":"29","shoulder":"18"}', 'https://images.unsplash.com/photo-1594932224444-116045763262', ''],
      
      // 3. งานใหม่ รอช่างกดรับ (Pending)
      ['J-003', 'RN-20240503-003', 'คุณใจดี', '0855555555', '@jaidee', 'กางเกงสแล็คสีดำ 2 ตัว', 'กางเกง', 2400, 'pending', '', 'GUEST', now, '', 0, 0, '{"waist":"32","hips":"38","length":"38"}', '', ''],
      
      // 4. งานถูกปฏิเสธโดยช่าง (Rejected)
      ['J-004', 'RN-20240504-004', 'คุณสมปอง', '0866666666', '', 'ชุดมาสคอตแฟนซี', 'อื่นๆ', 5000, 'rejected', 'ช่างสมชาย', 'GUEST', now, 'ไม่มีวัสดุผ้าขนสัตว์สีเขียวสะท้อนแสงในสต็อกและไม่รับงานโครงสร้างเหล็ก', 0, 0, '{}', '', ''],
      
      // 5. งานเสร็จแล้ว ชำระเงินเรียบร้อย (Paid)
      ['J-005', 'RN-20240505-005', 'คุณจอย', '0877777777', '', 'กระโปรงทรงเอ ลายไทย', 'กระโปรง', 1200, 'paid', 'ช่างสมศรี', 'GUEST', now, '', 4, 350, '{"waist":"28","hips":"37","length":"22"}', '', ''],
      
      // 6. งานที่ลูกค้ายกเลิก (Cancelled)
      ['J-006', 'RN-20240506-006', 'คุณแบงค์', '0888888888', '', 'สูททักซิโด้สีขาว', 'สูท', 9500, 'cancelled', '', 'GUEST', now, 'ลูกค้าย้ายไปจัดงานต่างประเทศด่วน ไม่ใช้ชุดแล้ว', 0, 0, '{}', '', ''],
      
      // 7. งานกำลังเย็บ (เพิ่งเริ่ม)
      ['J-007', 'RN-20240507-007', 'คุณมณี', '0899999999', '', 'ชุดเดรสสั้นผ้าลูกไม้', 'เดรส', 3200, 'sewing', 'ช่างสมศรี', 'GUEST', now, '', 0, 800, '{"chest":"32","waist":"25","hips":"35"}', '', ''],
      
      // 8. งานที่มีข้อร้องเรียน/เคลม (Dispute)
      ['J-008', 'RN-20240508-008', 'คุณพีระ', '0800000001', '', 'กางเกงยีนส์สั่งตัด', 'กางเกง', 1800, 'finished', 'ช่างสมชาย', 'GUEST', now, '', 2, 400, '{"waist":"34"}', '', 'สะโพกฟิตเกินไป ลุกนั่งลำบาก ขอขยายออก 1 นิ้ว'],
      
      // 9. งานที่บอสเพิ่มค่าใช้จ่ายเพิ่มเติม (Additional Cost)
      ['J-009', 'RN-20240509-009', 'คุณฟ้า', '0800000002', '', 'ชุดราตรีปักมุก', 'เดรส', 12500, 'accepted', 'ช่างสมชาย', 'GUEST', now, '', 0, 4500, '{"chest":"35"}', '', ''],
      
      // 10. งานใหม่ เร่งด่วน
      ['J-010', 'RN-20240510-010', 'คุณหนุ่ม', '0800000003', '', 'เสื้อเชิ้ตขาว 5 ตัว', 'อื่นๆ', 3500, 'pending', '', 'GUEST', now, '', 0, 0, '{"chest":"42","shoulder":"19"}', '', '']
    ];

    jobs.forEach(row => jobSheet.appendRow(row));
    
    // เพิ่มประวัติการเข้างาน (Attendance)
    const attSheet = ss.getSheetByName(SHEETS.ATTENDANCE);
    if (attSheet && attSheet.getLastRow() === 1) {
      attSheet.appendRow(['ATT-01', 'TAILOR-001', 'ช่างสมชาย', 'in', now, 'เข้างานตรงเวลา']);
      attSheet.appendRow(['ATT-02', 'TAILOR-002', 'ช่างสมศรี', 'in', now, '']);
    }
  }
  
  Browser.msgBox("Seed Data เรียบร้อยแล้ว!");
}