Tailor Systems Design

This document outlines the systems required for tailors beyond the basic job flow: job assignment, stock withdrawal (materials consumption), payroll/wages, finance (cashbook), leave/attendance, and related processes. It maps the required Google Sheets schema, API endpoints (GAS), UI hooks, SOP/WI, and an MVP implementation plan.

1. Domain overview
------------------
Actors:
- Boss / Owner
- Tailor (employee)
- Customer

Primary flows for tailors:
- Receive assigned job
- Withdraw / allocate stock (materials) to jobs
- Log progress (photos, status)
- Mark job finished and claim wage
- Boss approves wage payouts
- Track leaves and attendance
- Record petty cash and finance entries (cashbook)

2. Sheets schema (tabs & columns)
---------------------------------
- jobs (existing)
  - columns: rn, jobId, user_id, customer_name, customer_phone, customer_line, job_category, job_detail, measurements, budget, referral_code, status, assigned_tailor, created_at, updated_at, payment_status, payment_ref, images

- jobs_audit (existing)
  - columns: ts, jobId, actorId, actorRole, action, prev, next, note

- stock (existing)
  - columns: sku, item_name, qty, unit, meta_json, created_at, updated_at, min_threshold, unit_price

- stock_consumption (new)
  - columns: consumption_id, job_rn, sku, qty, actorId, actorRole, ts, note

- stock_audit (existing)
  - columns: ts, sku, delta, action, actorId, actorRole

- users (existing)
  - columns: user_id, username, full_name, phone, role, password_hash, created_at

- payroll (new)
  - columns: pay_id, user_id, username, gross_amount, tax_3, net_amount, cycle, status (pending/approved/paid), created_at, approved_by, approved_at

- payroll_audit (new)
  - columns: ts, pay_id, action, actorId, actorRole, note

- attendance (new)
  - columns: attendance_id, user_id, date, check_in, check_out, hours, note

- leave_requests (new)
  - columns: leave_id, user_id, username, from_date, to_date, reason, status, approver, created_at

- cashbook (new)
  - columns: entry_id, date, type(debit/credit), category, description, amount, reference, created_by, created_at

- settings (existing)
  - used for bank details, rates, next_rn_counter, etc.

3. API endpoints (GAS) — new & existing
--------------------------------------
Existing handlers to reuse:
- list_jobs, get_job, update_status, accept_job, upload_image

New handlers to add to `doPost`:
- withdraw_stock: { action: 'withdraw_stock', job_rn, sku, qty, actorId, actorRole, note }
  - Lock and decrement stock.qty, append to `stock_consumption` and `stock_audit`.

- return_stock (optional): allow returning unused stock to inventory.

- request_payroll: { action: 'request_payroll', user_id, gross_amount, cycle }
  - Append to `payroll`, status 'pending'.

- approve_payroll: boss-only: { action: 'approve_payroll', pay_id, admin_key/admin_id }
  - Move status to 'approved', append to `payroll_audit`.

- pay_out_payroll: boss-only: marks record as 'paid' and append to `payroll_audit` and `payments`.

- attendance_checkin / attendance_checkout
  - Record times and compute hours.

- create_leave_request / approve_leave

- add_cashbook_entry: { action:'add_cashbook', date, type, category, description, amount, created_by }

4. UI Hooks and pages
---------------------
- Tailor portal (`tailor-portal.html`) additions:
  - "Withdraw materials" button on job card: opens small modal to select SKU, qty -> calls `withdraw_stock`.
  - Display list of materials consumed for each job (from `stock_consumption`).
  - Tailor stats: total consumed materials, hours worked (from `attendance`), pending pays.
  - Attendance buttons at top: Check-in / Check-out.
  - Leave request form (simple date range + reason).

- Boss pages (`tailor.html` / admin dashboard):
  - Payroll manager: list `payroll` entries, approve/mark paid.
  - Stock manager: see `stock_consumption` & reconcile.
  - Cashbook: list and add entries.

5. SOP / WI (High level)
-------------------------
- WI-S01 Withdraw materials for job
  - Tailor opens job -> selects SKU -> specify qty -> submit -> GAS locks stock and decrements qty, writes `stock_consumption` and `stock_audit`.

- WI-S02 Request payroll
  - Tailor clicks Request Payroll -> enter gross amount and cycle -> system creates payroll request.
  - Boss reviews -> Approve -> Admin marks as paid -> `payments` and payroll status updated.

- WI-S03 Attendance
  - Tailor checks in/out via portal -> records saved to `attendance` -> used for hours tracking and payroll checks.

- WI-S04 Leave request
  - Tailor files request -> Boss approves/denies.

6. Edge cases & validations
---------------------------
- Prevent negative stock: use LockService and atomic update.
- Partial consumption: allow multiple withdraw records per job.
- Reconciliation: boss can reverse stock_consumption with `return_stock` action.
- Payroll double-pay protection: only allow marking 'paid' once and record payments.
- Timezones: store ISO timestamps and show localized where needed.

7. MVP roadmap & priorities
---------------------------
MVP 1 (2-4 days):
- Implement `withdraw_stock`, `stock_consumption` sheet, UI hook on `tailor-portal.html` (small modal), basic tests.
- Implement attendance check-in / check-out simple write.

MVP 2 (3-6 days):
- Payroll request/approval flow and `payroll` sheet; boss approval UI.
- Cashbook basic entries.

MVP 3 (optional):
- Leave approval workflow, payroll payouts integration, auto PDF payslips, monthly reports.

8. Acceptance criteria
----------------------
- Stock withdrawal is atomic and recorded in `stock_consumption` and `stock_audit`.
- Payroll requests created by tailors and approved by boss appear in payroll sheet with audit trail.
- Attendance entries exist and produce workable hours per tailor.
- Cashbook entries can be added and exported.

9. Next steps I can take now
---------------------------
- Implement `withdraw_stock` and `attendance` handlers in `docs/gas-sample/Code.gs` and update `doPost` routing.
- Add UI modal to `tailor-portal.html` for withdraw and check-in/check-out buttons.
- Create simple test scripts (curl examples) to exercise withdraw, attendance, and payroll request.

Which of these should I implement next? I can start with the withdraw_stock handler and small UI changes (recommended) and provide test examples.