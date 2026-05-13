# Deploying Google Apps Script (GAS) backend — quick guide

เอกสารนี้อธิบายขั้นตอนการ deploy Google Apps Script เป็น Web App สำหรับเชื่อมต่อกับหน้า frontend (`script.js`) ของโปรเจคนี้ และตัวอย่าง payloads สำหรับทดสอบ

สิ่งที่ต้องเตรียม
- Google account
- Google Spreadsheet (ใช้เทมเพลตจาก `docs/sheets-templates/`) และจด `SPREADSHEET_ID`

ขั้นตอนการติดตั้ง (สั้นๆ)
1. เปิด Google Drive → สร้าง Google Spreadsheet ใหม่ → Import แต่ละไฟล์ CSV จาก `docs/sheets-templates/` เพื่อสร้าง tabs
2. เปิด Google Apps Script: Extensions → Apps Script (บน Spreadsheet เดียวกัน หรือสร้างโปรเจคใหม่)
3. สร้างไฟล์ `Code.gs` แล้ววางโค้ด handler (ผมสามารถสร้างตัวอย่างให้ได้ — เลือก A ถ้าต้องการ) หรือใช้ตัวอย่างที่เราจะให้ไว้
4. ใน Apps Script: คลิก Deploy → New deployment → เลือก "Web app"
   - Description: tailor-marketplace backend
   - Execute as: Me (เจ้าของสคริปต์)
   - Who has access: Anyone (หรือ Anyone with Google account ถ้าต้องการจำกัด)
5. หลัง deploy จะได้ `WEB_APP_URL` — เก็บ URL นี้ไว้ และนำไปกำหนดใน `script.js` เป็น `SCRIPT_URL`

ตั้งค่า Properties (แนะนำใช้ PropertiesService เพื่อเก็บค่า):
- SPREADSHEET_ID = <your spreadsheet id>
- ADMIN_API_KEY = <random secret string> (ใช้ตรวจสอบ boss-only API calls)
- ALLOWED_ORIGINS = (optional) comma separated origins for CORS checks

ตัวอย่าง POST payloads (ทดสอบด้วย curl หรือ fetch)

- Create job (customer)

POST { action: 'create', customer_name, customer_phone, job_category, job_detail, budget }

- Accept job (tailor)

POST { action: 'accept_job', jobId, tailorId }

- Update status

POST { action: 'update_status', jobId, newStatus, actorId, actorRole }

- Add stock (boss)

POST { action: 'add_stock', sku, name, qty, unit }

- Update stock qty (boss)

POST { action: 'update_stock_qty', sku, delta }

- Pay final price (customer)

POST { action: 'pay_final_price', jobId, amount, paymentRef }

Security checklist (minimum)
- ตรวจสอบบทบาท server-side ก่อนอนุญาตการเปลี่ยนแปลง (ไม่พึ่ง client-side only)
- ใช้ `ADMIN_API_KEY` หรือ OAuth เพื่อตรวจสอบคำขอ boss-only
- ใช้ LockService เมื่ออัปเดต/ลดสต็อก
- บันทึก audit trail ใน `jobs_audit` และ `stock_audit`
- จำกัดการเข้าถึง Web App (ถ้าจำเป็น) และพิจารณา CORS origin checks

Manual testing tips
- ใช้ curl หรือ Postman ส่ง POST JSON ไปที่ `WEB_APP_URL`:

curl -X POST -H "Content-Type: application/json" --data '{"action":"create","customer_name":"Test","customer_phone":"0812345678","job_category":"เดรส","job_detail":"Test job","budget":1000}' "<WEB_APP_URL>"

- ตรวจสอบ Google Sheet ว่ามีแถวใหม่ใน `jobs` และ `jobs_audit`

ถ้าต้องการ ผมสามารถ:
- A: สร้างตัวอย่าง `Code.gs` ที่ทำงานกับ schema นี้ (doPost/doGet + helper functions) — แนะนำและพร้อมทดสอบ
- B: สร้างตัวอย่าง `Code.gs` เบื้องต้นแค่โครง (boilerplate) และ README deployment step-by-step (น้อยความเสี่ยง)
