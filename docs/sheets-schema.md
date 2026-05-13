# Google Sheets Schema — Tailor Marketplace

เอกสารนี้อธิบายโครงสร้างตาราง (tabs) ใน Google Sheets ที่ระบบ GAS backend จะใช้เก็บข้อมูลแบบง่ายเพื่อให้เริ่มต้นได้เร็ว

แนะนำให้สร้าง Spreadsheet ใหม่ แล้วสร้าง sheet (tab) ตามรายการด้านล่าง (ชื่อ tab ต้องตรงกันเพื่อง่ายต่อโค้ดตัวอย่าง)

Tabs และคอลัมน์ (แถวหัวตาราง):

1) jobs
 - rn (Receipt/Job Number, e.g., RN-20230513-0001)
 - jobId (unique id, can be same as rn)
 - customerId
 - customer_name
 - customer_phone
 - customer_line
 - job_category
 - job_detail
 - measurements (JSON string)
 - budget (number)
 - referral_code
 - status (new / assigned / in_progress / ready / delivered / cancelled)
 - assigned_tailor
 - created_at (ISO datetime)
 - updated_at (ISO datetime)
 - payment_status (pending / paid / refunded)
 - payment_ref
 - stock_consumed (JSON string of sku->qty)

2) jobs_audit
 - timestamp
 - jobId
 - actorId
 - actorRole
 - action (e.g., create, accept, update_status)
 - from_status
 - to_status
 - note

3) stock
 - sku
 - name
 - qty (number)
 - unit
 - meta (JSON string, optional)
 - created_at
 - updated_at

4) stock_audit
 - timestamp
 - sku
 - delta (positive/negative integer)
 - reason
 - actorId
 - actorRole

5) users
 - userId
 - name
 - role (customer / tailor / boss)
 - contact_phone
 - contact_line
 - created_at

6) payments
 - paymentId
 - jobId
 - amount
 - payment_method
 - payment_ref
 - status
 - created_at

7) settings
 - key
 - value

---

Usage notes:
- Keep `jobs` as the primary source of truth for job lifecycle. `jobs_audit` records who changed what and when.
- Use `stock` + `stock_audit` to track inventory changes and support reconciling.
- `users` can be minimal for now; you can extend to include hashed passwords if you implement login later.
- `settings` can hold small config values like next_rn_counter or admin_api_key.

Next: I added CSV templates for each tab under `docs/sheets-templates/` so you can import them directly into a new Google Sheet.
