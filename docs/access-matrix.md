## Access & Feature Matrix — Tailor Marketplace

เอกสารนี้สรุปสิทธิ์การเข้าถึง (access) และฟีเจอร์หลักของแต่ละส่วนของระบบ เพื่อให้เห็นชัดว่า "ใครเข้าอะไรได้" และ "แต่ละส่วนมีอะไรบ้าง" (สำหรับการแก้ไข/เพิ่มเติม)

### สรุปบทบาท (Roles)
- Guest: ผู้เข้าชมทั่วไป (ไม่มีการล็อคอิน)
- Customer: ลูกค้าที่ส่งงาน (สร้างคำสั่งซื้อ / ดูประวัติ / โปรไฟล์)
- Tailor: ช่างผู้รับงาน (รับงาน, อัปเดตสถานะงาน, ส่งรูป/งานเสร็จ)
- Boss / Admin: ผู้จัดการร้าน (แดชบอร์ด, ควบคุมสต็อก, อนุมัติ/คืนเงิน ฯลฯ)

> หมายเหตุ: ปัจจุบันส่วนใหญ่เป็นการตรวจสอบฝั่งลูกค้า (client-side). ต้องทำการตรวจสอบบทบาทบนเซิร์ฟเวอร์ (server-side) เพื่อความปลอดภัยก่อนนำสู่ production

---

## หน้าเพจ (Pages) และสิทธิ์

- `index.html` — หน้าแรก / สร้างงาน (Customer order)
  - Purpose: ผู้ใช้ (Guest/Customer) กรอกรายละเอียดการจ้างเพื่อส่งให้ช่าง
  - Components: ฟอร์มสร้างงาน, ปุ่มส่ง (`sendData()`), หน้าโปรไฟล์/สัดส่วน, ประวัติงาน, แจ้งเตือน
  - Visible to: Guest (ดูและส่งงาน), Customer (เต็มฟีเจอร์)
  - Actions (client): create_job (POST action: `create`), update_profile, update_measurements, view_history, view_notifications
  - Server-side checks: ตรวจสอบฟิลด์ required (name, phone, job_detail, budget numeric), rate-limit/anti-spam, associate job to customerId (or create guest record), sanitize inputs

- `tailor.html` — แดชบอร์ดช่าง
  - Purpose: สำหรับช่างดูงานที่ได้รับมอบหมาย, อัปเดตสถานะ, อัปโหลดรูปผลงาน
  - Components: job queues (available / assigned), job detail, action buttons (accept / start / mark_ready / deliver), chat/notes (ถ้ามี)
  - Visible to: Tailor, Boss
  - Actions (client): accept_job, update_job_status, upload_image, post_comment
  - Server-side checks: ต้องตรวจสอบบทบาท `tailor` หรือ `boss`, ตรวจสอบ ownership (ช่างที่ทำงานถูกต้อง), audit trail (who changed status+timestamp)

- `stock.html` — จัดการคลังสินค้า
  - Purpose: เพิ่ม/แก้ไข/ปรับสต็อกวัตถุดิบหรือผลิตภัณฑ์
  - Components: เพิ่มสินค้า, ปรับจำนวน, ประวัติการปรับสต็อก
  - Visible to: Boss (อ่าน/เขียน), Tailor (อ่าน-only – ตามนโยบายถ้าต้องการ)
  - Actions (client): add_stock, update_stock_qty, get_stock
  - Server-side checks: บทบาทต้องเป็น `boss` เพื่อแก้ไข, ใช้ LockService (หรือ transaction) เมื่อลดสต็อกจากคำสั่ง, validate qty >= 0, log adjustments

- `present.html` — วิธีใช้งาน / SOP / WI
  - Purpose: เอกสารภายใน (วิธีปฏิบัติ) สำหรับช่างและบอส
  - Visible to: Tailor, Boss (ปัจจุบัน client-side guard redirect non-staff)
  - Actions (client): ไม่มี/อ่านอย่างเดียว
  - Server-side checks: หากต้องการเก็บเอกสารเฉพาะ ให้ตรวจสอบ session/role ก่อนส่งเนื้อหา

- `portfolio.html` — ผลงานโชว์
  - Purpose: หน้าสาธารณะ แสดงผลงานตัวอย่าง
  - Visible to: ทุกคน
  - Actions (client): ดูผลงาน, ไม่ปรับข้อมูล

- `contact.html` — ติดต่อ
  - Purpose: ฟอร์มติดต่อทั่วไป, ข้อมูลร้าน
  - Visible to: ทุกคน

---

## API actions (สรุป payloads & required roles)

- create (create_job)
  - Caller: Guest/Customer
  - Payload: { action: 'create', customer_name, customer_phone, job_category, job_detail, budget, measurements?, referral_code? }
  - Server: validate fields, assign RN (receipt number), store job row, respond { status:'success', rn }

- accept_job
  - Caller: Tailor (or Boss assigning)
  - Payload: { action:'accept_job', jobId, tailorId }
  - Server: verify caller role, verify job state is assignable, set assignedTailor, update state, notify customer

- update_status
  - Caller: Tailor or Boss
  - Payload: { action:'update_status', jobId, newStatus, note? }
  - Server: verify role and ownership, validate allowed status transitions, log timestamp & actor

- add_stock / update_stock_qty
  - Caller: Boss
  - Payload: { action:'add_stock', sku, name, qty, meta } or { action:'update_stock_qty', sku, delta }
  - Server: require boss role, validate qty, use LockService to avoid race conditions, write audit row

- deduct_stock (internal during job completion)
  - Caller: Server-side process when a job consumes items
  - Server: atomic decrement, check negative prevention, log transaction

- pay_final_price
  - Caller: Customer (or integrated payment webhook)
  - Payload: { action:'pay_final_price', jobId, amount, paymentRef }
  - Server: verify amount, update job payment status, create receipt, notify relevant parties

- upload_image
  - Caller: Tailor (upload proof / sample)
  - Server: accept base64 or blob, validate size/type, store in Drive or Cloud Storage, return fileUrl

---

## Recommended server-side checks & security

1. Enforce role checks server-side for any sensitive action (stock ops, status changes, payment updates).
2. Validate and sanitize all incoming payloads. Reject incomplete/invalid requests with clear errors.
3. Use locks (LockService in GAS) when updating stock or doing multi-step transactions to avoid race conditions.
4. Keep an audit log sheet for critical ops: job status changes, stock adjustments, payments, admin logins.
5. Require an admin token / API key or OAuth for boss-only operations when deploying (store key in PropertiesService). Rotate the key periodically.
6. Rate-limit or anti-spam for `create` action (Guest can send many requests). Consider Captcha or throttling.
7. Do not rely solely on client-side guards (remove demo quick-switch in production or hide behind a dev flag).

---

## Minimal suggestions for immediate next steps

1. Implement sample GAS `Code.gs` stubs for `doPost()` with the above actions (I have a todo item for this and can generate it).
2. Add server-side role verification helpers (e.g., `requireRole(role)`), and an `auditLog(action, details)` helper.
3. Remove or gate demo quick-switch buttons behind a debug flag in `index.html`.
4. Create a Google Sheet template with tabs: `jobs`, `jobs_audit`, `stock`, `stock_audit`, `users`.

---

Files created/edited in this step:
- `docs/access-matrix.md` — New file: maps roles → pages → allowed actions and server-side checks (this file).

If you want, I can now:
- A) Generate example `Code.gs` GAS handler stubs + sample Sheet schema (recommended next), or
- B) Produce a compact CSV/Sheet template for the data schema only.

บอกผมได้เลยว่าจะให้ผมต่อเป็น A (เขียนตัวอย่าง GAS handlers + sheet schema) หรือต้องการแค่ B (ไฟล์โครงสร้างข้อมูล) — ผมจะทำต่อให้ทันที
