Tailor Portal Specification

Overview
--------
This document describes the tailor-facing portal for the Tailor Marketplace. It covers pages, UI components, data shapes, API mapping to the provided Google Apps Script handlers, SOP/WI (work instructions) mapping, edge cases, acceptance criteria, and a small implementation plan so you or another developer can implement the portal front-end and server adjustments.

Goals
-----
- Provide a focused portal for tailors to manage assigned jobs, update job status, upload progress photos, and request / review payments.
- Keep interactions lightweight and mobile-friendly for tailors working on sewing machines.
- Ensure server-side checks exist for role enforcement and audit trails.

Roles & Permissions (tailor view)
---------------------------------
- Tailor: can view assigned/accepted jobs, change status to "sewing" and "finished", upload progress photos for jobs they are assigned to, and request help/revision.
- Boss/Owner: can view all jobs, assign jobs to tailors, modify stock, approve payroll.
- Customer: can view their jobs and pay; not part of this portal spec other than cross-API mapping.

Pages & Core Views
------------------
1. Tailor Login / Landing (tailor.html) - lightweight
   - Fields: username, password (for demo: quick demo buttons exist)
   - Buttons: Login, Forgot password (demo flow), Demo login
   - After login: load dashboard

2. Tailor Dashboard
   - Top summary: Assigned jobs count, Active jobs (in-progress), Finished today
   - Job list (primary): card list with assigned / accepted / sewing / finished statuses - filter by: All / Assigned / In-progress / Finished
   - Quick action buttons on each card depending on status:
     - "Start sewing" -> update status to 'sewing'
     - "Upload progress photo" -> open upload modal / file picker -> call `upload_image` API
     - "Mark finished" -> update status to 'finished'
     - "Request revision" -> sets dispute_notes and status to 'sewing' (or a dedicated 'revision' flag)
   - Each card shows: RN, short detail, customer name, contact, budget, measurements summary, images (thumbnails), created_at, assigned_tailor

3. Job Detail (modal or page)
   - Full job detail: measurements, notes, images gallery, audit trail (jobs_audit rows), payment status, actions.

4. Upload UI
   - Allow multiple images (stretch goal); for now single image with optional caption.
   - Show preview and file size before upload.
   - Progress indicator and final URL.

5. Tailor Profile / My Stats
   - Completed jobs count, rating average, pending payout, past payroll.

6. Notifications / Timeline
   - Recent status updates or assigned jobs.

Data Shapes & API Mapping
-------------------------
- Frontend expects a single `SCRIPT_URL` that is a GAS Web App endpoint.
- Use these actions (doPost payloads) mapped to GAS handlers in `docs/gas-sample/Code.gs`:
  - create job: { action: 'create', customer_name, customer_phone, job_detail, measurements, budget }
  - list jobs: { action: 'list_jobs' } or GET ?action=list_jobs
  - get job: { action: 'get_job', jobId }
  - accept job (tailor accepts): { action: 'accept_job', jobId, tailorId }
  - update status: { action: 'update_status', jobId, newStatus, actorId, actorRole }
  - upload image: { action: 'upload_image', jobId (or job_rn), fileName, mimeType, data(base64), actorId, actorRole }
  - add stock / update stock: boss-only actions
  - pay final: { action: 'pay_final_price', jobId, amount, payerId }

SOP / WI Mapping (work instructions)
------------------------------------
- WI-T01: Logging in as a tailor
  - Steps: Login -> Dashboard -> View assigned jobs
  - Expected: Only jobs assigned to the tailor or public job list if shop permits

- WI-T02: Start working on a job
  - Click "Start sewing" -> update_status 'sewing' -> append audit row (actorId, actorRole)

- WI-T03: Upload progress photo
  - Use upload UI -> send image base64 -> GAS saves file to Drive and appends URL to `images` column
  - Audit: record 'upload_image' with actor info and filename

- WI-T04: Mark finished and handover
  - Click "Mark finished" -> update_status 'finished' -> customer notified

- WI-T05: Request revision / record dispute
  - Use "Request revision" -> update_status 'sewing' + append dispute_notes

Edge cases & Error Handling
---------------------------
- Offline / Slow network: show spinner and handle timeouts gracefully. Provide retry for upload.
- Large images: client should warn > 2–3 MB and optionally resize before sending base64.
- Missing DRIVE_FOLDER_ID: GAS returns clear error; frontend should display the message and suggest contacting admin.
- Unauthorized actions: GAS should reject (isAdmin or role mismatch). Frontend should hide boss-only buttons for non-boss roles.
- Conflicting updates: stock updates use LockService. Job status updates should be idempotent where possible.

Acceptance Criteria
-------------------
- Tailor can login and see only assigned/accepted jobs.
- Tailor can change status to 'sewing' and 'finished' and each change is recorded in `jobs_audit` with correct actorId/actorRole.
- Tailor can upload a progress photo and the resulting Drive URL is saved in the job's `images` column and an audit row is created.
- Boss-only actions are rejected by GAS if API key / role not present.
- The portal is mobile-first, responsive, and actions use small JSON payloads to GAS.

Implementation Plan (small incremental)
--------------------------------------
1. Frontend audit (I can do now): scan `script.js` for every POST payload, list keys used and map to GAS expectations. We'll standardize on these keys:
   - jobId (string) — canonical job identifier (RN...)
   - actorId, actorRole (string)
   - fileName, mimeType, data
2. Update GAS to accept aliases (done) and enforce role checks.
3. Add upload helper in `script.js` (already added). Add client-side file size check and optional resizing (next step).
4. Add a small test harness (curl examples) for create -> accept -> upload -> update status.
5. UX polish: thumbnails, preview, retry, progress.

Developer Notes
---------------
- Use `normalizePayload()` (already added in the sample) to make the GAS robust to different frontend key names.
- For production, migrate away from ADMIN_API_KEY in Script Properties to OAuth or a proper session-based authentication.

Next actions I can take now
--------------------------
- Audit `script.js` POST payloads and produce a short mapping report + recommended standard payload fields (I recommend canonical names: jobId, actorId, actorRole).
- Add client-side image resizing to keep uploads small (< 2MB) and automatically create thumbnails.
- Create cURL / Apps Script test harness to exercise the primary flows.

Which next action should I take now? (pick one)
- Audit `script.js` payloads (recommended first step)
- Add client-side image resizing + preview
- Create smoke-test cURL / GAS test harness

If you want me to proceed, I'll run the chosen step and report back with findings and concrete code changes.