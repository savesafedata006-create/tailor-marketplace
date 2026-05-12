function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. ตรวจสอบ/สร้างแผ่นงาน JOBS
  let jobsSheet = ss.getSheetByName("JOBS") || ss.insertSheet("JOBS");
  if (jobsSheet.getLastRow() === 0) {
    jobsSheet.appendRow(["id", "rn", "customer_name", "customer_phone", "customer_line", "job_detail", "job_category", "budget", "status", "tailor_name", "user_id", "created_at", "cancellation_reason", "rating", "material_cost", "measurements", "progress_photo", "dispute_notes"]);
  }

  // 2. ตรวจสอบ/สร้างแผ่นงาน USERS
  let userSheet = ss.getSheetByName("USERS") || ss.insertSheet("USERS"); 
  if (userSheet.getLastRow() === 0) {
    userSheet.appendRow(["user_id", "username", "password", "role", "full_name", "phone"]);
    userSheet.appendRow([Utilities.getUuid(), "admin", "1234", "boss", "เจ้าของร้าน", "0000000000"]);
  }

  // 3. ตรวจสอบ/สร้างแผ่นงาน STOCK
  let stockSheet = ss.getSheetByName("STOCK") || ss.insertSheet("STOCK"); 
  if (stockSheet.getLastRow() === 0) {
    stockSheet.appendRow(["item_id", "category", "item_name", "quantity", "unit", "unit_price", "min_threshold", "last_updated"]);
    stockSheet.appendRow(["STK-001", "ผ้า", "ผ้าไหม", "50", "เมตร", "500", "10", new Date()]);
  }

  // 4. ตรวจสอบ/สร้างแผ่นงาน LOGS
  let logSheet = ss.getSheetByName("LOGS") || ss.insertSheet("LOGS"); 
  if (logSheet.getLastRow() === 0) {
    logSheet.appendRow(["timestamp", "user_id", "username", "action", "details", "status"]);
  }

  // 5. ตรวจสอบ/สร้างแผ่นงาน PAYROLL
  let paySheet = ss.getSheetByName("PAYROLL") || ss.insertSheet("PAYROLL"); 
  if (paySheet.getLastRow() === 0) {
    paySheet.appendRow(["pay_id", "user_id", "username", "gross_amount", "tax_3", "net_amount", "cycle", "status", "timestamp"]);
  }

  // 6. ตรวจสอบ/สร้างแผ่นงาน CONFIG
  let configSheet = ss.getSheetByName("CONFIG") || ss.insertSheet("CONFIG"); 
  if (configSheet.getLastRow() === 0) {
    configSheet.appendRow(["key", "value"]);
    configSheet.appendRow(["line_token", ""]);
  }

  // 7. ตรวจสอบ/สร้างแผ่นงาน MEASUREMENTS
  let measureSheet = ss.getSheetByName("MEASUREMENTS") || ss.insertSheet("MEASUREMENTS");
  if (measureSheet.getLastRow() === 0) {
    measureSheet.appendRow(["user_id", "chest", "waist", "hips", "length", "shoulder", "last_updated"]);
  }

  const response = {
    jobs: getSheetData(ss, "JOBS"), // ดึงข้อมูลจาก Sheet ที่อาจถูกสร้างขึ้นใหม่
    stock: getSheetData(ss, "STOCK"), // ดึงข้อมูลจาก Sheet ที่อาจถูกสร้างขึ้นใหม่
    users: getSheetData(ss, "USERS"), // ดึงข้อมูลจาก Sheet ที่อาจถูกสร้างขึ้นใหม่
    payroll: getSheetData(ss, "PAYROLL") // ดึงข้อมูลจาก Sheet ที่อาจถูกสร้างขึ้นใหม่
  };

  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // ป้องกัน Error เมื่อมีการเรียกใช้โดยไม่มีข้อมูลส่งมา (เช่น การกด Run ใน Editor)
  if (!e || !e.postData) {
    return createResponse({ status: "error", message: "No data received. Please access via Web App URL." });
  }

  const content = JSON.parse(e.postData.contents);
  
  // 1. สร้างงานใหม่
  if (content.action === "create") {
    const sheet = ss.getSheetByName("JOBS"); // ต้องมีอยู่แล้วจาก doGet
    const id = Utilities.getUuid();
    const rn = "RN-" + Math.floor(1000 + Math.random() * 9000) + "-" + Date.now().toString().slice(-4);
    sheet.appendRow([id, rn, content.customer_name, content.customer_phone, content.customer_line, content.job_detail, content.job_category, content.budget, "pending", "", content.user_id || "GUEST", new Date(), "", "", "", content.measurements || "", "", ""]);
    sendNotify(ss, `🆕 มีงานจ้างใหม่!\n📌 เลขที่: ${rn}\n👤 ลูกค้า: ${content.customer_name}\n📞 โทร: ${content.customer_phone}\n📝 รายละเอียด: ${content.job_detail}\n💰 งบประมาณ: ฿${Number(content.budget).toLocaleString()}`);
    return createResponse({ status: "success", id: id, rn: rn });
  }
  
  // 2. อัปเดตสถานะงาน
  if (content.action === "update_status") {
    const sheet = ss.getSheetByName("JOBS"); // ต้องมีอยู่แล้วจาก doGet
    const data = sheet.getDataRange().getValues();
    let jobRow = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == content.id) {
        sheet.getRange(i + 1, 9).setValue(content.status);
        if (content.tailor_name) sheet.getRange(i + 1, 10).setValue(content.tailor_name);
        
        // ระบบแจ้งเตือน LINE เฉพาะเมื่อสถานะเป็น Finished
        if (content.status === "finished") {
          sendNotify(ss, `✅ งานเสร็จแล้ว!\n📌 เลขที่: ${data[i][1]}\n👤 ลูกค้า: ${data[i][2]}\n👨‍🔧 ช่าง: ${content.tailor_name || "ไม่ระบุ"}\n📦 พร้อมสำหรับการส่งมอบหรือรับสินค้า`);
        }

        // บันทึกรูปถ่ายความคืบหน้า (ถ้ามี)
        if (content.progress_photo) sheet.getRange(i + 1, 17).setValue(content.progress_photo);

        // บันทึกหมายเหตุการเคลม/แก้ไข (ถ้ามี)
        if (content.dispute_notes) sheet.getRange(i + 1, 18).setValue(content.dispute_notes);
        
        
        // บันทึก Log การเปลี่ยนสถานะ
        const logDetails = `เปลี่ยนสถานะงาน ${data[i][1]} เป็น ${content.status}`;
        logEvent(ss, content.admin_id || "SYSTEM", content.tailor_name || "SYSTEM", "UPDATE_STATUS", logDetails, "success");

        
        // บันทึกคะแนน (Rating) ถ้ามีการส่งมา
        if (content.rating) {
          sheet.getRange(i + 1, 14).setValue(content.rating); // คอลัมน์ที่ 14
        }
        
        // แจ้งเตือนกรณีงานไม่สำเร็จ
        if (content.status === "cancelled" || content.status === "rejected") {
          const reason = content.cancellation_reason || "ไม่ได้ระบุ";
          sheet.getRange(i + 1, 13).setValue(reason);
          const prefix = content.status === "cancelled" ? "❌ งานถูกยกเลิก" : "🚫 ปฏิเสธงาน";
          sendNotify(ss, `${prefix}!\n📌 เลขที่: ${data[i][1]}\n👤 ลูกค้า: ${data[i][2]}\n📝 เหตุผล: ${reason}`);
        }
        jobRow = i;
        break;
      }
    }
    // หักสต็อกและคำนวณต้นทุนวัสดุ
    if (content.status === "accepted" && content.stock_id && jobRow > -1) {
      const sSheet = ss.getSheetByName("STOCK"); // ต้องมีอยู่แล้วจาก doGet
      const sData = sSheet.getDataRange().getValues();
      const sHeaders = sData[0];
      const priceIdx = sHeaders.indexOf("unit_price");

      for (let j = 1; j < sData.length; j++) {
        if (sData[j][0] == content.stock_id) {
          const qtyUsed = Number(content.stock_qty);
          const unitPrice = Number(sData[j][priceIdx]) || 0;
          const materialCost = qtyUsed * unitPrice;

          // หักสต็อก
          const newQty = Number(sData[j][3]) - qtyUsed;
          sSheet.getRange(j + 1, 4).setValue(newQty);
          sSheet.getRange(j + 1, 8).setValue(new Date());
          // บันทึกต้นทุนวัสดุลงในแผ่นงาน JOBS (คอลัมน์ที่ 15)
          sheet.getRange(jobRow + 1, 15).setValue(materialCost);

          if (newQty <= Number(sData[j][6])) {
            sendNotify(ss, `⚠️ เตือน: วัสดุใกล้หมด!\n📦 วัสดุ: ${sData[j][2]}\n📉 คงเหลือ: ${newQty} ${sData[j][4]}`);
          }
          break;
        }
      }
    }
    return createResponse({ status: "success" });
  }

  // 3. ลงทะเบียน
  if (content.action === "register") {
    const uSheet = ss.getSheetByName("USERS"); // ต้องมีอยู่แล้วจาก doGet
    const uData = uSheet.getDataRange().getValues();
    for (let i = 1; i < uData.length; i++) {
      if (uData[i][1] === content.username) return createResponse({ status: "error", message: "ชื่อผู้ใช้งานนี้ถูกใช้ไปแล้ว" });
    }
    const uId = "U-" + Utilities.getUuid().slice(0, 8).toUpperCase();
    uSheet.appendRow([uId, content.username, content.password, "customer", content.full_name, content.phone]);
    sendNotify(ss, `👤 มีสมาชิกใหม่ลงทะเบียน!\n🆔 User ID: ${uId}\n📛 ชื่อ: ${content.full_name}`);
    return createResponse({ status: "success", user: { user_id: uId, username: content.username, role: "customer", full_name: content.full_name } });
  }

  // 4. ล็อกอิน
  if (content.action === "login") {
    const uSheet = ss.getSheetByName("USERS"); // ต้องมีอยู่แล้วจาก doGet
    const uData = uSheet.getDataRange().getValues();
    for (let i = 1; i < uData.length; i++) {
      if (uData[i][1] === content.username && uData[i][2].toString() === content.password.toString()) {
        if (uData[i][3] === "boss") sendNotify(ss, `🔐 แจ้งเตือน: มีการเข้าสู่ระบบ BOSS\n👤 User: ${content.username}`);
        return createResponse({ status: "success", user: { user_id: uData[i][0], username: uData[i][1], role: uData[i][3], full_name: uData[i][4] } });
      }
    }
    return createResponse({ status: "error", message: "Username หรือ Password ไม่ถูกต้อง" });
  }

  // 5. เบิกเงิน (Request Payroll)
  if (content.action === "request_payment") {
    const pSheet = ss.getSheetByName("PAYROLL"); // ต้องมีอยู่แล้วจาก doGet
    const gross = parseFloat(content.amount);
    const tax = gross * 0.03;
    pSheet.appendRow(["PAY-" + Utilities.getUuid().slice(0, 8).toUpperCase(), content.user_id, content.username, gross, tax, gross - tax, content.cycle, "pending", new Date()]);
    return createResponse({ status: "success" });
  }

  // 6. อนุมัติเบิกเงิน
  if (content.action === "approve_payment") {
    const pSheet = ss.getSheetByName("PAYROLL"); // ต้องมีอยู่แล้วจาก doGet
    const pData = pSheet.getDataRange().getValues();
    for (let i = 1; i < pData.length; i++) {
      if (pData[i][0] === content.pay_id) {
        pSheet.getRange(i + 1, 8).setValue("approved");
        break;
      }
    }
    return createResponse({ status: "success" });
  }

  // 7. รีเซ็ตรหัสผ่าน
  if (content.action === "reset_password") {
    const uSheet = ss.getSheetByName("USERS"); // ต้องมีอยู่แล้วจาก doGet
    const uData = uSheet.getDataRange().getValues();
    for (let i = 1; i < uData.length; i++) {
      if (uData[i][1] === content.username && uData[i][5].toString() === content.phone.toString()) {
        uSheet.getRange(i + 1, 3).setValue(content.new_password);
        logEvent(ss, uData[i][0], content.username, "RESET_PASSWORD", "สำเร็จ", "success");
        sendNotify(ss, `🔐 แจ้งเตือน: กู้คืนรหัสผ่านสำเร็จ\n👤 ผู้ใช้งาน: ${content.username}`);
        return createResponse({ status: "success" });
      }
    }
    return createResponse({ status: "error", message: "ข้อมูลไม่ถูกต้อง" });
  }

  // 8. เปลี่ยนสิทธิ์ (Update Role)
  if (content.action === "update_role") {
    const uSheet = ss.getSheetByName("USERS"); // ต้องมีอยู่แล้วจาก doGet
    const uData = uSheet.getDataRange().getValues();
    for (let i = 1; i < uData.length; i++) {
      if (uData[i][0].toString() === content.user_id.toString()) {
        uSheet.getRange(i + 1, 4).setValue(content.role);
        logEvent(ss, content.admin_id, content.admin_name, "UPDATE_ROLE", `เปลี่ยนสิทธิ์ ${uData[i][1]} เป็น ${content.role}`, "success");
        break;
      }
    }
    return createResponse({ status: "success" });
  }

  // 9. เปลี่ยนรหัสผ่าน (Change Password)
  if (content.action === "change_password") {
    const uSheet = ss.getSheetByName("USERS"); // ต้องมีอยู่แล้วจาก doGet
    const uData = uSheet.getDataRange().getValues();
    for (let i = 1; i < uData.length; i++) {
      if (uData[i][0].toString() === content.user_id.toString()) {
        if (uData[i][2].toString() === content.old_password.toString()) {
          uSheet.getRange(i + 1, 3).setValue(content.new_password);
          logEvent(ss, content.user_id, uData[i][1], "CHANGE_PASSWORD", "สำเร็จ", "success");
          sendNotify(ss, `🔐 แจ้งเตือน: เปลี่ยนรหัสผ่านสำเร็จ\n👤 ผู้ใช้งาน: ${uData[i][1]}`);
          return createResponse({ status: "success" });
        }
        return createResponse({ status: "error", message: "รหัสผ่านเดิมไม่ถูกต้อง" });
      }
    }
    return createResponse({ status: "error", message: "ไม่พบผู้ใช้" });
  }

  // 10. อัปเดตสต็อก (BOSS เท่านั้น)
  if (content.action === "update_stock") {
    const sSheet = ss.getSheetByName("STOCK"); // ต้องมีอยู่แล้วจาก doGet
    const sData = sSheet.getDataRange().getValues();
    for (let i = 1; i < sData.length; i++) {
      if (sData[i][0] == content.id) {
        sSheet.getRange(i + 1, 4).setValue(content.quantity);
        sSheet.getRange(i + 1, 8).setValue(new Date());
        break;
      }
    }
    return createResponse({ status: "success" });
  }

  // 11. อัปเดตสัดส่วนลูกค้า (Update Measurements)
  if (content.action === "update_measurements") {
    const mSheet = ss.getSheetByName("MEASUREMENTS");
    const mData = mSheet.getDataRange().getValues();
    let found = false;
    for (let i = 1; i < mData.length; i++) {
      if (mData[i][0] == content.user_id) {
        mSheet.getRange(i + 1, 2, 1, 5).setValues([[content.chest, content.waist, content.hips, content.length, content.shoulder]]);
        mSheet.getRange(i + 1, 7).setValue(new Date());
        found = true;
        break;
      }
    }
    if (!found) {
      mSheet.appendRow([content.user_id, content.chest, content.waist, content.hips, content.length, content.shoulder, new Date()]);
    }
    return createResponse({ status: "success" });
  }
}

function getSheetData(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return []; // ป้องกัน error กรณีแผ่นงานว่างเปล่า

  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  return values.slice(1).map(row => {
    let obj = {};
    headers.forEach((h, i) => {
      if (h.toLowerCase() === 'password') return;
      let v = row[i];
      if (v instanceof Date) v = v.toISOString();
      obj[h] = v;
    });
    return obj;
  });
}

function sendNotify(ss, msg) {
  // Primary: Email to script owner (always works, no config needed)
  try {
    const ownerEmail = Session.getActiveUser().getEmail();
    if (ownerEmail) {
      const subject = "🔔 TailorHub แจ้งเตือน — " + msg.split('\n')[0];
      MailApp.sendEmail(ownerEmail, subject, msg);
    }
  } catch (e) {
    Logger.log("Email notify failed: " + e.message);
  }

  // Secondary: LINE Notify (deprecated April 2025 — kept for legacy config)
  try {
    const cSheet = ss.getSheetByName("CONFIG");
    if (!cSheet) return;
    const data = cSheet.getDataRange().getValues();
    let token = "";
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === "line_token") { token = data[i][1]; break; }
    }
    if (!token) return;
    const options = { "method": "post", "headers": { "Authorization": "Bearer " + token }, "payload": { "message": "\n" + msg } };
    UrlFetchApp.fetch("https://notify-api.line.me/api/notify", options);
  } catch (e) {
    Logger.log("LINE notify failed: " + e.message);
  }
}

function logEvent(ss, uId, uName, action, details, status) {
  const lSheet = ss.getSheetByName("LOGS");
  if (lSheet) lSheet.appendRow([new Date(), uId, uName, action, details, status]);
}

function createResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
