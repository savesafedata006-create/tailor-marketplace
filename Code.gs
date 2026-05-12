function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("JOBS") || ss.insertSheet("JOBS");
  
  // สร้างหัวตารางถ้ายังไม่มีข้อมูล (รองรับฟิลด์ใหม่ๆ)
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["id", "rn", "customer_name", "customer_phone", "customer_line", "job_detail", "budget", "status", "tailor_name", "user_id", "created_at"]);
  }
  
  // สร้าง Sheet สำหรับผู้ใช้งาน (Users) ถ้ายังไม่มี
  if (!ss.getSheetByName("USERS")) {
    const userSheet = ss.insertSheet("USERS");
    userSheet.appendRow(["user_id", "username", "password", "role", "full_name", "phone"]);
    // เพิ่ม User เริ่มต้น (Boss)
    userSheet.appendRow([Utilities.getUuid(), "admin", "1234", "boss", "เจ้าของร้าน", "0000000000"]);
  }
  
  // สร้าง Sheet สำหรับสต๊อกสินค้าถ้ายังไม่มี
  if (!ss.getSheetByName("STOCK")) {
    ss.insertSheet("STOCK").appendRow(["item_id", "category", "item_name", "quantity", "unit", "unit_price", "min_threshold", "last_updated"]);
    ss.getSheetByName("STOCK").appendRow(["STK-001", "ผ้า", "ผ้าไหม", "50", "เมตร", "500", "10", new Date()]);
  }

  // สร้าง Sheet สำหรับบันทึก Log ถ้ายังไม่มี
  if (!ss.getSheetByName("LOGS")) {
    const logSheet = ss.insertSheet("LOGS");
    logSheet.appendRow(["timestamp", "user_id", "username", "action", "details", "status"]);
  }

  const response = {
    jobs: getSheetData(ss, "JOBS"),
    stock: getSheetData(ss, "STOCK"),
    users: getSheetData(ss, "USERS") // ส่งข้อมูลผู้ใช้ (ควรระวังในการใช้งานจริงให้ส่งเฉพาะที่จำเป็น)
  };

  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheetData(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  return values.slice(1).map(row => {
    let obj = {};
    headers.forEach((header, index) => {
      // Security: ป้องกันการส่งรหัสผ่านไปยัง Client-side
      if (header.toLowerCase() === 'password') return;
      let value = row[index];
      // จัดการรูปแบบวันที่ให้เป็น ISO String เพื่อให้ Frontend ใช้งานง่าย
      if (value instanceof Date) value = value.toISOString();
      obj[header] = value;
    });
    return obj;
  });
}

function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("JOBS");
  const content = JSON.parse(e.postData.contents);
  
  // 1. สร้างงานใหม่ (Create Job)
  if (content.action === "create") {
    const id = Utilities.getUuid();
    const rn = "RN-" + Math.floor(1000 + Math.random() * 9000) + "-" + Date.now().toString().slice(-4);
    sheet.appendRow([
      id,
      rn,
      content.customer_name,
      content.customer_phone,
      content.customer_line,
      content.job_detail,
      content.budget,
      "pending",
      "", // tailor_name
      content.user_id || "GUEST",
      new Date()
    ]);

    // แจ้งเตือน LINE Notify เมื่อมีงานใหม่
    const configSheet = ss.getSheetByName("CONFIG");
    if (configSheet) {
      const configData = configSheet.getDataRange().getValues();
      let lineToken = "";
      for (let i = 1; i < configData.length; i++) {
        if (configData[i][0] === "line_token") {
          lineToken = configData[i][1].toString();
          break;
        }
      }
      if (lineToken && lineToken.trim() !== "") {
        const msg = `\n🆕 มีงานจ้างใหม่!\n📌 เลขที่: ${rn}\n👤 ลูกค้า: ${content.customer_name}\n📞 โทร: ${content.customer_phone}\n📝 รายละเอียด: ${content.job_detail}\n💰 งบประมาณ: ฿${Number(content.budget).toLocaleString()}\n📅 วันที่: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`;
        sendLineNotify(msg, lineToken);
      }
    }

    return createResponse({ status: "success", id: id, rn: rn });
  }
  
  // 2. อัปเดตสถานะงาน (Update Status)
  if (content.action === "update_status") {
    const data = sheet.getDataRange().getValues();
    const jobId = content.id;
    const newStatus = content.status;
    const tailorName = content.tailor_name || "";
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == jobId) {
        // คอลัมน์ Status (H=8), Tailor Name (I=9)
        sheet.getRange(i + 1, 8).setValue(newStatus);
        if (tailorName) sheet.getRange(i + 1, 9).setValue(tailorName);
        break;
      }
    }

    // หักสต๊อกอัตโนมัติ (ถ้ามีการส่งข้อมูลสต๊อกมา)
    if (newStatus === "accepted" && content.stock_id && content.stock_qty) {
      const stockSheet = ss.getSheetByName("STOCK");
      const stockData = stockSheet.getDataRange().getValues();
      for (let j = 1; j < stockData.length; j++) {
        if (stockData[j][0] == content.stock_id) {
          const currentQty = Number(stockData[j][3]);
          const usedQty = Number(content.stock_qty);
          const newQty = currentQty - usedQty;
          const minThreshold = Number(stockData[j][6]);
          const itemName = stockData[j][2];
          const unit = stockData[j][4];

          stockSheet.getRange(j + 1, 4).setValue(newQty);
          stockSheet.getRange(j + 1, 8).setValue(new Date());

          // ตรวจสอบเกณฑ์ขั้นต่ำและแจ้งเตือนผ่าน LINE Notify
          if (newQty <= minThreshold) {
            const configSheet = ss.getSheetByName("CONFIG");
            if (configSheet) {
              const configValues = configSheet.getDataRange().getValues();
              let lineToken = "";
              for (let k = 1; k < configValues.length; k++) {
                if (configValues[k][0] === "line_token") {
                  lineToken = configValues[k][1].toString();
                  break;
                }
              }
              if (lineToken) {
                const alertMsg = `\n⚠️ เตือน: วัสดุใกล้หมด!\n📦 วัสดุ: ${itemName}\n📉 คงเหลือปัจจุบัน: ${newQty} ${unit}\n🚩 เกณฑ์ขั้นต่ำ: ${minThreshold} ${unit}`;
                sendLineNotify(alertMsg, lineToken);
              }
            }
          }
          break;
        }
      }
    }
    return createResponse({ status: "success" });
  }

  // 3. ลงทะเบียนสมาชิกใหม่
  if (content.action === "register") {
    const userSheet = ss.getSheetByName("USERS");
    const userData = userSheet.getDataRange().getValues();
    const username = content.username;

    // ตรวจสอบว่ามีชื่อผู้ใช้นี้หรือยัง
    for (let i = 1; i < userData.length; i++) {
      if (userData[i][1] === username) {
        return createResponse({ status: "error", message: "ชื่อผู้ใช้งานนี้ถูกใช้ไปแล้ว" });
      }
    }

    const userId = "U-" + Utilities.getUuid().slice(0, 8).toUpperCase();
    userSheet.appendRow([
      userId,
      username,
      content.password,
      "customer",
      content.full_name,
      content.phone
    ]);

    // แจ้งเตือน LINE Notify เมื่อมีสมาชิกใหม่
    const configSheet = ss.getSheetByName("CONFIG");
    if (configSheet) {
      const configData = configSheet.getDataRange().getValues();
      let lineToken = "";
      for (let i = 1; i < configData.length; i++) {
        if (configData[i][0] === "line_token") {
          lineToken = configData[i][1].toString();
          break;
        }
      }
      if (lineToken && lineToken.trim() !== "") {
        const msg = `\n👤 มีสมาชิกใหม่ลงทะเบียน!\n🆔 User ID: ${userId}\n📛 ชื่อ: ${content.full_name}\n📧 Username: ${username}\n📞 โทร: ${content.phone}\n📅 วันที่: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`;
        sendLineNotify(msg, lineToken);
      }
    }

    return createResponse({ 
      status: "success", 
      user: { user_id: userId, username: username, role: "customer", full_name: content.full_name } 
    });
  }

  // 3. ระบบ Login รวม (Boss, Tailor, Customer)
  if (content.action === "login") {
    const userSheet = ss.getSheetByName("USERS");
    const userData = userSheet.getDataRange().getValues();
    const username = content.username;
    const password = content.password;
    
    for (let i = 1; i < userData.length; i++) {
      if (userData[i][1] === username && userData[i][2].toString() === password.toString()) {
        const userProfile = {
          user_id: userData[i][0],
          username: userData[i][1],
          role: userData[i][3],
          full_name: userData[i][4]
        };

        // แจ้งเตือน LINE เฉพาะ Boss
        if (userProfile.role === "boss") {
          notifyLogin(ss, userProfile.username);
        }

        return createResponse({ status: "success", user: userProfile });
      }
    }
    return createResponse({ status: "error", message: "Username หรือ Password ไม่ถูกต้อง" });
  }

  function notifyLogin(ss, username) {
    const configSheet = ss.getSheetByName("CONFIG");
    if (configSheet) {
      const configData = configSheet.getDataRange().getValues();
      let lineToken = "";
      for (let i = 1; i < configData.length; i++) {
        if (configData[i][0] === "line_token") {
          lineToken = configData[i][1].toString();
          break;
        }
      }
      if (lineToken && lineToken.trim() !== "") {
        sendLineNotify("\n🔐 แจ้งเตือน: มีการเข้าสู่ระบบ BOSS\n👤 User: " + username + "\n📅 วันที่: " + new Date().toLocaleString('th-TH'), lineToken);
      }
    }
  }

  // 4. อัปเดตสต๊อกสินค้า
  if (content.action === "update_stock") {
    const stockSheet = ss.getSheetByName("STOCK");
    const data = stockSheet.getDataRange().getValues();
    const itemId = content.id;
    const newQty = content.quantity;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] == itemId) {
        stockSheet.getRange(i + 1, 4).setValue(newQty);
        stockSheet.getRange(i + 1, 8).setValue(new Date());
        break;
      }
    }
    return createResponse({ status: "success" });
  }

  // 5. ระบบกู้คืนรหัสผ่าน (Reset Password)
  if (content.action === "reset_password") {
    const userSheet = ss.getSheetByName("USERS");
    const userData = userSheet.getDataRange().getValues();
    const username = content.username;
    const phone = content.phone;
    const newPassword = content.new_password;

    for (let i = 1; i < userData.length; i++) {
      if (userData[i][1] === username && userData[i][5].toString() === phone.toString()) {
        userSheet.getRange(i + 1, 3).setValue(newPassword);
        logEvent(ss, userData[i][0], username, "RESET_PASSWORD", "เปลี่ยนรหัสผ่านสำเร็จ", "success");
        return createResponse({ status: "success" });
      }
    }
    logEvent(ss, "N/A", username, "RESET_PASSWORD", "พยายามเปลี่ยนรหัสผ่านแต่เบอร์โทรไม่ถูกต้อง", "failure");
    return createResponse({ status: "error", message: "ข้อมูลไม่ถูกต้อง (ชื่อผู้ใช้หรือเบอร์โทรศัพท์ไม่ตรงกัน)" });
  }

  // 6. อัปเดตสิทธิ์ผู้ใช้งาน (Update User Role)
  if (content.action === "update_role") {
    const userSheet = ss.getSheetByName("USERS");
    const userData = userSheet.getDataRange().getValues();
    const userId = content.user_id;
    const newRole = content.role;
    
    for (let i = 1; i < userData.length; i++) {
      if (userData[i][0].toString() === userId.toString()) {
        userSheet.getRange(i + 1, 4).setValue(newRole); // Column 4 คือ role
        logEvent(ss, content.admin_id, content.admin_name, "UPDATE_ROLE", "เปลี่ยนสิทธิ์ผู้ใช้ " + userData[i][1] + " เป็น " + newRole, "success");
        break;
      }
    }
    return createResponse({ status: "success" });
  }

  // 7. เปลี่ยนรหัสผ่าน (Change Password) สำหรับผู้ที่ Login อยู่แล้ว
  if (content.action === "change_password") {
    const userSheet = ss.getSheetByName("USERS");
    const userData = userSheet.getDataRange().getValues();
    const userId = content.user_id;
    const oldPassword = content.old_password;
    const newPassword = content.new_password;

    for (let i = 1; i < userData.length; i++) {
      if (userData[i][0].toString() === userId.toString()) {
        if (userData[i][2].toString() === oldPassword.toString()) {
          userSheet.getRange(i + 1, 3).setValue(newPassword);
          logEvent(ss, userId, userData[i][1], "CHANGE_PASSWORD", "เปลี่ยนรหัสผ่านสำเร็จ", "success");
          return createResponse({ status: "success" });
        } else {
          return createResponse({ status: "error", message: "รหัสผ่านเดิมไม่ถูกต้อง" });
        }
      }
    }
    return createResponse({ status: "error", message: "ไม่พบผู้ใช้งานในระบบ" });
  }
}

function logEvent(ss, userId, username, action, details, status) {
  const logSheet = ss.getSheetByName("LOGS");
  if (logSheet) {
    logSheet.appendRow([new Date(), userId, username, action, details, status]);
  }
}

function createResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function sendLineNotify(message, token) {
  const url = "https://notify-api.line.me/api/notify";
  const options = {
    "method": "post",
    "headers": {
      "Authorization": "Bearer " + token
    },
    "payload": {
      "message": message
    }
  };
  UrlFetchApp.fetch(url, options);
}