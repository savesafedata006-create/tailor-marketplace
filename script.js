// เชื่อมต่อกับ Google Sheets: https://docs.google.com/spreadsheets/d/1p2EFyCT75y_u9VKmeGIhodDWXZqGEPA3tzXWmPibdbk/edit
// แทนที่ค่าด้านล่างนี้ด้วย Web App URL ที่ได้จากขั้นตอนการ Deploy Google Apps Script
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwyHLnvQmRFTx6Qc9PYFcVFLj6ACZ_j6UX-Zci5iqwTtUaDQ618xsEMpo-7Qddc8bGSbg/exec";

let allPendingJobs = []; // เก็บข้อมูลงานทั้งหมดเพื่อใช้ในการค้นหา
let currentViewData = { jobs: [], stock: [], payroll: [] };
let currentFilteredJobs = []; // สำหรับจัดการการค้นหาและ Pagination
let stockChartInstance = null; // เก็บ Instance ของกราฟเพื่อทำลายก่อนวาดใหม่

const JOBS_PER_PAGE = 10; // จำนวนงานที่แสดงต่อหน้า
let currentPage = 1;
let revenueChartInstance = null; // เก็บ Instance ของกราฟรายได้
let categoryChartInstance = null; // เก็บ Instance ของกราฟประเภทชุด

// ฟังก์ชัน Debounce เพื่อลดภาระเครื่องเวลาพิมพ์ค้นหา
function debounce(func, timeout = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => { func.apply(this, args); }, timeout);
  };
}

// Run function when browser is idle or after short timeout (fallback)
function runWhenIdle(fn, options = { timeout: 200 }) {
  if (typeof window === 'undefined') return setTimeout(fn, 0);
  if ('requestIdleCallback' in window) {
    return requestIdleCallback(fn, options);
  }
  return setTimeout(fn, options.timeout || 200);
}

async function sendData() {
  const btn = document.querySelector("#customer-view .btn-primary");
  
  const data = {
    action: "create",
    customer_name: document.getElementById("customer_name").value,
    customer_phone: document.getElementById("customer_phone").value,
    customer_line: document.getElementById("customer_line").value,
    job_detail: document.getElementById("job_detail").value,
    job_category: document.getElementById("job_category").value,
    budget: document.getElementById("budget").value,
    user_id: sessionStorage.getItem("userId") || "GUEST",
    referral_code: document.getElementById("referral_code")?.value || "",
    measurements: JSON.stringify({
      chest: document.getElementById("m-chest")?.value || "",
      waist: document.getElementById("m-waist")?.value || "",
      hips: document.getElementById("m-hips")?.value || "",
      length: document.getElementById("m-length")?.value || "",
      shoulder: document.getElementById("m-shoulder")?.value || ""
    })
  };

  if (!data.customer_name || !data.customer_phone || !data.job_detail || !data.budget) {
    alert("กรุณากรอกข้อมูลให้ครบถ้วน: ชื่อ, เบอร์โทร, รายละเอียดงาน และงบประมาณ");
    return;
  }

  const confirmMsg = "ยืนยันการส่งงาน? \n*ราคาที่ระบุเป็นราคาประเมินเบื้องต้น อาจมีค่าใช้จ่ายเพิ่มเติมตามวัสดุที่เลือกจริง*";
  if (!confirm(confirmMsg)) return;

  try {
    btn.disabled = true;
    btn.innerText = "กำลังส่งข้อมูล...";

    const response = await fetch(SCRIPT_URL, {
      method: "POST", // GAS Web App requires POST for doPost
      body: JSON.stringify(data)
    });
    
    const res = await response.json();

    if (res.status === "success") {
      showReceipt(res.rn, data);
    } else {
      alert("เกิดข้อผิดพลาด: " + (res.message || "ไม่สามารถบันทึกข้อมูลได้"));
    }
  } catch (error) {
    console.error("Error:", error);
    alert("เกิดข้อผิดพลาดในการส่งข้อมูล");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> ส่งงานจ้าง';
  }
}

async function loginBoss() {
  const username = document.getElementById("boss-username").value;
  const password = document.getElementById("boss-password").value;
  const remember = document.getElementById("boss-remember").checked;
  if (!username || !password) return alert("กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน");

  const btn = document.querySelector(".login-box .btn-primary");
  btn.disabled = true;
  btn.innerText = "กำลังตรวจสอบ...";

  // Local Bypass สำหรับ Admin Demo (เข้าถึงได้ทุกอย่าง)
  if (username === "admin" && password === "1234") {
    const adminUser = { user_id: "ADMIN-001", full_name: "ผู้ดูแลระบบ (Master Admin)", role: "boss" };
    sessionStorage.setItem("userRole", adminUser.role);
    sessionStorage.setItem("userName", adminUser.full_name);
    sessionStorage.setItem("userId", adminUser.user_id);
    if (remember) {
      localStorage.setItem("userRole", adminUser.role);
    }
    return checkAuth();
  }

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "login", username: username, password: password })
    });
    const result = await response.json();
    console.log("Login Result:", result); // ดูข้อมูลที่ได้รับจาก Google Script

    if (result.status === "success") {
      sessionStorage.setItem("userRole", result.user.role);
      sessionStorage.setItem("userName", result.user.full_name);
      sessionStorage.setItem("userId", result.user.user_id);
      
      if (remember) {
        localStorage.setItem("userRole", result.user.role);
        localStorage.setItem("userName", result.user.full_name);
        localStorage.setItem("userId", result.user.user_id);
      }

      checkAuth();
    } else {
      console.warn("Login Failed:", result.message);
      alert(result.message || "Login ไม่สำเร็จ");
    }
  } catch (error) {
    console.error("Connection Error:", error); // ดู Error ของ Network หรือ Fetch
    alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
  } finally {
    btn.disabled = false;
    btn.innerText = "เข้าสู่ระบบ";
  }
}

function toggleAuth(type) {
  document.getElementById('login-form').style.display = type === 'login' ? 'flex' : 'none';
  document.getElementById('register-form').style.display = type === 'register' ? 'flex' : 'none';
  document.getElementById('forgot-form').style.display = type === 'forgot' ? 'flex' : 'none';
}

async function registerCustomer() {
  const data = {
    action: "register",
    username: document.getElementById('reg-username').value,
    password: document.getElementById('reg-password').value,
    full_name: document.getElementById('reg-fullname').value,
    phone: document.getElementById('reg-phone').value
  };

  if (!data.username || !data.password || !data.full_name) return alert("กรุณากรอกข้อมูลให้ครบถ้วน");

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(data)
    });
    const result = await response.json();
    console.log("Register Result:", result);

    if (result.status === "success") {
      alert("ลงทะเบียนสำเร็จ!");
      sessionStorage.setItem("userRole", result.user.role);
      sessionStorage.setItem("userName", result.user.full_name);
      sessionStorage.setItem("userId", result.user.user_id);
      checkCustomerAuth();
    } else {
      alert(result.message);
    }
  } catch (e) { alert("เกิดข้อผิดพลาด"); }
}

async function loginCustomer() {
  const data = {
    action: "login",
    username: document.getElementById('login-username').value,
    password: document.getElementById('login-password').value
  };
  const remember = document.getElementById('login-remember').checked;

  // Local Bypass สำหรับ Admin Demo (เข้าหน้าลูกค้าได้ด้วยสิทธิ์ Boss)
  if (data.username === "admin" && data.password === "1234") {
    const adminUser = { user_id: "ADMIN-001", full_name: "ผู้ดูแลระบบ (Master Admin)", role: "boss" };
    sessionStorage.setItem("userRole", adminUser.role);
    sessionStorage.setItem("userName", adminUser.full_name);
    sessionStorage.setItem("userId", adminUser.user_id);
    if (remember) {
      localStorage.setItem("userRole", adminUser.role);
    }
    return checkCustomerAuth();
  }

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(data)
    });
    const result = await response.json();
    console.log("Customer Login Result:", result);

    if (result.status === "success") {
      sessionStorage.setItem("userRole", result.user.role);
      sessionStorage.setItem("userName", result.user.full_name);
      sessionStorage.setItem("userId", result.user.user_id);

      if (remember) {
        localStorage.setItem("userRole", result.user.role);
        localStorage.setItem("userName", result.user.full_name);
        localStorage.setItem("userId", result.user.user_id);
      }

      checkCustomerAuth();
    } else {
      console.warn("Customer Login Failed:", result.message);
      alert("ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง");
    }
  } catch (e) {
    console.error("Customer Login Fetch Error:", e);
    alert("เกิดข้อผิดพลาด"); 
  }
}

function logoutCustomer() {
  sessionStorage.clear();
  localStorage.clear();
  location.reload();
}

function checkCustomerAuth() {
  const role = sessionStorage.getItem("userRole") || localStorage.getItem("userRole");
  const name = sessionStorage.getItem("userName") || localStorage.getItem("userName");

  const authView = document.getElementById("auth-view");
  const customerView = document.getElementById("customer-view");
  const profileHeader = document.getElementById("user-profile-header");
  const portalAccessContainer = document.getElementById("portal-access-container");
  const bossReturn = document.getElementById("boss-return-link");

  if (role) {
    if (authView) authView.classList.add('hidden');
    if (customerView) { customerView.classList.remove('hidden'); customerView.classList.add('fade-in'); }
    if (portalAccessContainer) portalAccessContainer.classList.add('hidden');
    if (profileHeader) profileHeader.classList.remove('hidden');

    if (role === 'boss' && bossReturn) {
      bossReturn.classList.remove('hidden');
    }

    if (document.getElementById("display-user-name")) {
      document.getElementById("display-user-name").innerHTML = `<i class="fas fa-user-circle"></i> ${name}`;
    }

    // Auto-fill สัดส่วนร่างกายในฟอร์มสั่งงาน จาก MEASUREMENTS sheet
    const userId = sessionStorage.getItem("userId") || localStorage.getItem("userId");
    if (userId) {
      fetch(SCRIPT_URL).then(r => r.json()).then(data => {
        const m = (data.measurements || []).find(x => x.user_id === userId);
        if (m) autoFillOrderMeasurements(m);
      }).catch(() => {});
    }
  } else {
    if (authView) authView.classList.remove('hidden');
    if (customerView) customerView.classList.add('hidden');
  }
}

function switchCustomerTab(type) {
  const sections = {
    order: document.getElementById('order-new-section'),
    history: document.getElementById('order-history-section'),
    notifications: document.getElementById('order-notifications-section'),
    profile: document.getElementById('order-profile-section')
  };

  Object.values(sections).forEach(el => { if (el) { el.style.display = 'none'; el.classList.remove('fade-in'); } });

  const active = sections[type];
  if (active) { active.style.display = 'block'; active.classList.add('fade-in'); }

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  const tabEl = document.getElementById('tab-' + type);
  if (tabEl) tabEl.classList.add('active');

  if (type === 'history') loadCustomerJobs();
  else if (type === 'notifications') loadNotifications();
  else if (type === 'profile') loadProfile();
}

function toggleTailorForgot(isForgot) {
  document.getElementById('tailor-login-fields').style.display = isForgot ? 'none' : 'block';
  document.getElementById('tailor-forgot-fields').style.display = isForgot ? 'block' : 'none';
}

async function handleResetPassword(type) {
  const prefix = type === 'customer' ? 'forgot-' : 't-forgot-';
  const data = {
    action: "reset_password",
    username: document.getElementById(prefix + 'username').value,
    phone: document.getElementById(prefix + 'phone').value,
    new_password: document.getElementById(prefix + 'new-pass').value
  };

  if (!data.username || !data.phone || !data.new_password) return alert("กรุณากรอกข้อมูลให้ครบถ้วน");

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(data)
    });
    const result = await response.json();

    if (result.status === "success") {
      alert("เปลี่ยนรหัสผ่านสำเร็จ! กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่");
      if (type === 'customer') toggleAuth('login');
      else toggleTailorForgot(false);
    } else {
      alert(result.message);
    }
  } catch (e) {
    console.error("Register Error:", e);
    alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
  }
}

function checkAuth() {
  const role = sessionStorage.getItem("userRole") || localStorage.getItem("userRole");
  const name = sessionStorage.getItem("userName") || localStorage.getItem("userName");

  const loginOverlay = document.getElementById("login-overlay");
  const mainContent = document.getElementById("main-content");
  const tailorView = document.getElementById("tailor-view");

  if (role === 'boss' || role === 'tailor') {
    if (loginOverlay) loginOverlay.classList.add('hidden');
    if (mainContent) { mainContent.classList.remove('hidden'); mainContent.classList.add('fade-in'); }
    if (tailorView) tailorView.classList.remove('hidden');
    
    // จัดการการแสดงผลตามสิทธิ์
    const isBoss = role === 'boss';
    document.querySelectorAll('.boss-only').forEach(el => {
        if (isBoss) el.classList.remove('hidden');
        else el.classList.add('hidden');
    });
    
    // เริ่มต้นหน้า Dashboard ด้วยแท็บงานใหม่
    setTimeout(() => {
      switchTab('pending');
    }, 100);
  } else {
    if (loginOverlay) { loginOverlay.classList.remove('hidden'); loginOverlay.style.display = 'flex'; }
    if (mainContent) mainContent.classList.add('hidden');
  }
}

async function loadCustomerJobs() {
  const container = document.getElementById("my-jobs-list");
  const userId = sessionStorage.getItem("userId");

  // แจ้งเตือนหากยังไม่ได้ตั้งค่า SCRIPT_URL
  if (SCRIPT_URL.includes("ใส่_URL_ที่ได้จาก_Apps_Script_ตรงนี้")) {
    if (container) container.innerHTML = `
      <div class="job-card" style="border: 2px dashed var(--warning); text-align: center;">
        <p>⚠️ <b>ระบบยังไม่ได้เชื่อมต่อฐานข้อมูล</b></p>
        <small>กรุณาตั้งค่า SCRIPT_URL ในไฟล์ script.js และ Deploy Apps Script</small>
      </div>`;
    return;
  }

  if (!container || !userId) return;
  
  container.innerHTML = "<p>กำลังโหลดข้อมูลงานของคุณ...</p>";

  try {
    const response = await fetch(SCRIPT_URL);
    const data = await response.json();
    // ตรวจสอบว่ามีข้อมูล jobs หรือไม่ก่อนทำการ filter
    const myJobs = (data.jobs || []).filter(j => j.user_id === userId);

    if (myJobs.length === 0) {
      container.innerHTML = "<p class='no-data'>คุณยังไม่มีประวัติการจ้างงาน</p>";
      return;
    }

    // Render jobs in small chunks to avoid freezing the UI on low-power devices
    container.innerHTML = '';
    const CHUNK = 6; // adjust as needed for performance vs perceived speed
    let idx = 0;

    function renderChunk() {
      const slice = myJobs.slice(idx, idx + CHUNK);
      const html = slice.map(job => {
        const statusLabel = { pending: 'รอรับงาน', accepted: 'รับงานแล้ว', sewing: 'กำลังเย็บ', finished: 'เสร็จแล้ว', rejected: 'ถูกปฏิเสธ', cancelled: 'ยกเลิกแล้ว', paid: 'ชำระเงินแล้ว' };
        const ratingStars = job.rating
          ? `<div class="rating-stars">${'★'.repeat(Number(job.rating))}${'☆'.repeat(5 - Number(job.rating))}<span style="color:var(--text-sub);font-size:12px;margin-left:5px;">(${job.rating}/5)</span></div>`
          : '';

        let actionButtons = '';
        if (job.status === 'pending' || job.status === 'accepted') {
          actionButtons = `<button class="btn-logout" style="width:100%;margin-top:10px;border-color:var(--warning);color:var(--warning);" onclick="cancelOrder('${job.id}')"><i class="fas fa-times-circle"></i> ยกเลิกการจ้างงาน</button>`;
        } else if (job.status === 'finished' && !job.rating) {
          actionButtons = `<button class="btn-primary" style="width:100%;margin-top:10px;background:var(--success);" onclick="confirmAndRateJob('${job.id}')"><i class="fas fa-star"></i> ยืนยันรับงานและให้คะแนน</button><button class="btn-logout" style="width:100%;margin-top:5px;border-color:var(--secondary);color:var(--secondary);" onclick="requestRevision('${job.id}')"><i class="fas fa-tools"></i> ขอแก้ไขงาน/ส่งเคลม</button>`;
        } else if (job.status === 'finished' && job.rating) {
          actionButtons = `${ratingStars}<button class="btn-primary" style="width:100%;margin-top:8px;background:linear-gradient(135deg,#5b21b6,#7c3aed);" onclick="payFinalPrice('${job.id}', ${Number(job.budget) || 0})"><i class="fas fa-credit-card"></i> ชำระเงินงวดสุดท้าย ฿${Number(job.budget).toLocaleString()}</button>`;
        } else if (job.status === 'paid') {
          actionButtons = `${ratingStars}<div style="margin-top:8px;padding:8px 12px;background:#ede9fe;border-radius:10px;color:#5b21b6;font-size:13px;display:flex;align-items:center;gap:6px;"><i class="fas fa-check-circle"></i> ชำระเงินเรียบร้อยแล้ว ฿${Number(job.budget).toLocaleString()}</div>`;
        } else {
          actionButtons = ratingStars;
        }

        return `
        <div class="job-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <span class="status-badge ${job.status}">${statusLabel[job.status] || job.status}</span>
            <small>ID: ${job.rn}</small>
          </div>
          <h3>${job.job_detail}</h3>
          <p><strong>งบประมาณ:</strong> ฿${Number(job.budget).toLocaleString()}</p>
          <p><strong>ช่างผู้ดูแล:</strong> ${job.tailor_name || 'รอดำเนินการ'}</p>

          ${job.progress_photo ? `<div style="margin-top:10px;"><a href="${job.progress_photo}" target="_blank" class="btn-demo" style="border-style:solid;font-size:12px;padding:8px;"><i class="fas fa-camera"></i> ดูรูปความคืบหน้างานเย็บ</a></div>` : ''}

          ${job.dispute_notes ? `<div style="margin-top:8px;padding:8px 12px;background:#fef9c3;border-radius:10px;font-size:12px;color:#854d0e;border:1px solid #facc15;"><i class="fas fa-exclamation-circle"></i> <strong>หมายเหตุเคลม:</strong> ${job.dispute_notes}</div>` : ''}

          ${actionButtons}
        </div>`;
      }).join('');

      container.insertAdjacentHTML('beforeend', html);
      idx += CHUNK;
      if (idx < myJobs.length) {
        setTimeout(renderChunk, 50);
      }
    }

    renderChunk();
  } catch (e) { container.innerHTML = "<p>ไม่สามารถโหลดข้อมูลได้</p>"; }
}

async function loadJobs(filterType = 'pending', forceRefresh = false) {
  const container = document.getElementById("job-list");
  const searchInput = document.getElementById("search-input");
  
  const CACHE_KEY = "tailor_jobs_cache";
  const CACHE_TIME_KEY = "tailor_jobs_timestamp";
  const TTL = 3 * 60 * 1000; // ตั้งค่า Cache ไว้ 3 นาที

  // จัดการ UI Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.innerText.includes('งานใหม่') && filterType === 'pending') btn.classList.add('active');
    if (btn.innerText.includes('กำลังทำ') && filterType === 'active') btn.classList.add('active');
  });

  if (searchInput) searchInput.value = ""; // รีเซ็ตช่องค้นหาทุกครั้งที่กดสลับหน้ามา

  // ตรวจสอบ Cache เบื้องต้น
  // (Cache logic omitted for brevity, but same principle applies)

  container.innerHTML = "<p>กำลังโหลดรายการงาน...</p>";

  try {
    const response = await fetch(SCRIPT_URL);
    const data = await response.json();
    currentViewData = data;
    
    // กรองข้อมูลตาม Tab ที่เลือก
    if (filterType === 'pending') {
      allPendingJobs = data.jobs.filter(j => j.status === 'pending');
    } else {
      allPendingJobs = data.jobs.filter(j => j.status === 'accepted' || j.status === 'sewing');
    }

    currentFilteredJobs = allPendingJobs;
    currentPage = 1;

    // Critical: update dashboard and render job list immediately
    updateDashboard(data.jobs);
    renderJobs(currentFilteredJobs);

    // Defer heavier or non-critical rendering to idle time to avoid blocking mobile
    runWhenIdle(() => {
      try {
        renderStock(data.stock);
        renderStockChart(data.stock);
      } catch (e) { console.warn('deferred stock render failed', e); }
    });

    runWhenIdle(() => {
      try {
        renderRevenueChart(data.jobs);
        renderCategoryChart(data.jobs);
      } catch (e) { console.warn('deferred chart render failed', e); }
    });

    runWhenIdle(() => {
      try {
        renderUsers(data.users);
        renderTailorStats(data.jobs, data.payroll);
        renderPayrollManager(data.payroll);
      } catch (e) { console.warn('deferred user/payroll render failed', e); }
    });
  } catch (error) {
    container.innerHTML = "<p>ไม่สามารถโหลดข้อมูลได้</p>";
  }
}

function switchTab(type) {
  const jobList = document.getElementById('job-list');
  const searchContainer = document.querySelector('.search-container');
  const perfSections = document.querySelectorAll('.performance-section');
  const userSection = document.getElementById('user-management-section');
  const plSection = document.getElementById('pl-report-section');
  const analysisSection = document.getElementById('rejected-analysis-section');
  const tailorStatsSection = document.getElementById('tailor-stats-section');
  const payrollMgmtSection = document.getElementById('payroll-management-section');

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + type)?.classList.add('active');

  if (type === 'stock') {
    jobList.style.display = 'none';
    searchContainer.style.display = 'none';
    const hideIds = ['user-management-section', 'tailor-stats-section', 'payroll-management-section'];
    perfSections.forEach(el => {
      el.style.display = hideIds.includes(el.id) ? 'none' : 'block';
    });
    if (plSection) plSection.style.display = 'none';
    if (analysisSection) analysisSection.style.display = 'none';
    loadJobs('pending');
  } else if (type === 'users') {
    jobList.style.display = 'none';
    searchContainer.style.display = 'none';
    perfSections.forEach(el => el.style.display = 'none');
    if (userSection) userSection.style.display = 'block';
    renderUsers(currentViewData.users);
  } else if (type === 'pl-report') {
    jobList.style.display = 'none';
    searchContainer.style.display = 'none';
    perfSections.forEach(el => el.style.display = 'none');
    if (plSection) plSection.style.display = 'block';
    renderPLReport(currentViewData.jobs);
  } else if (type === 'analysis') {
    jobList.style.display = 'none';
    searchContainer.style.display = 'none';
    perfSections.forEach(el => el.style.display = 'none');
    if (analysisSection) analysisSection.style.display = 'block';
    renderRejectedAnalysis(currentViewData.jobs);
  } else if (type === 'my-stats') {
    jobList.style.display = 'none';
    searchContainer.style.display = 'none';
    perfSections.forEach(el => el.style.display = 'none');
    if (tailorStatsSection) tailorStatsSection.style.display = 'block';
    renderTailorStats(currentViewData.jobs || [], currentViewData.payroll || []);
  } else if (type === 'payroll') {
    jobList.style.display = 'none';
    searchContainer.style.display = 'none';
    perfSections.forEach(el => el.style.display = 'none');
    if (payrollMgmtSection) payrollMgmtSection.style.display = 'block';
    renderPayrollManager(currentViewData.payroll || []);
  } else {
    jobList.style.display = 'grid';
    searchContainer.style.display = 'block';
    perfSections.forEach(el => el.style.display = 'none');
    loadJobs(type);
  }
}

function renderStockChart(stock) {
  const ctx = document.getElementById('stockChart')?.getContext('2d');
  if (!ctx) return;

  // จัดกลุ่มข้อมูลตามหมวดหมู่และคำนวณมูลค่า (จำนวน * ราคาต่อหน่วย)
  const categoryTotals = stock.reduce((acc, item) => {
    const cat = item.category || 'ไม่ระบุหมวดหมู่';
    const value = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0);
    acc[cat] = (acc[cat] || 0) + value;
    return acc;
  }, {});

  const labels = Object.keys(categoryTotals);
  const dataValues = Object.values(categoryTotals);

  // ทำลายกราฟเก่าก่อนวาดใหม่เพื่อป้องกันปัญหาทับซ้อน
  if (stockChartInstance) {
    stockChartInstance.destroy();
  }

  stockChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'มูลค่าสต๊อก (บาท)',
        data: dataValues,
        backgroundColor: 'rgba(67, 97, 238, 0.7)',
        borderColor: 'rgba(67, 97, 238, 1)',
        borderWidth: 1,
        borderRadius: 10
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: (value) => '฿' + value.toLocaleString() }
        }
      }
    }
  });
}

function renderRevenueChart(jobs) {
  const ctx = document.getElementById('revenueChart')?.getContext('2d');
  if (!ctx) return;

  // กรองเฉพาะงานที่เสร็จแล้ว
  const finishedJobs = jobs.filter(j => j.status === 'finished');
  
  // จัดกลุ่มรายได้ตามเดือน
  const monthlyData = finishedJobs.reduce((acc, job) => {
    const date = new Date(job.created_at);
    // สร้าง Key รูปแบบ YYYY-MM สำหรับการเรียงลำดับ
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    acc[monthKey] = (acc[monthKey] || 0) + (Number(job.budget) || 0);
    return acc;
  }, {});

  // เรียงลำดับเดือนจากอดีตไปปัจจุบัน
  const sortedMonths = Object.keys(monthlyData).sort();
  const labels = sortedMonths.map(m => {
    const [year, month] = m.split('-');
    return new Date(year, month - 1).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
  });
  const dataValues = sortedMonths.map(m => monthlyData[m]);

  if (revenueChartInstance) {
    revenueChartInstance.destroy();
  }

  revenueChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'รายได้รวม (บาท)',
        data: dataValues,
        borderColor: '#4361ee',
        backgroundColor: 'rgba(67, 97, 238, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4, // ทำให้เส้นมีความโค้งมนสวยงาม
        pointRadius: 4,
        pointBackgroundColor: '#4361ee'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: (value) => '฿' + value.toLocaleString() }
        }
      }
    }
  });
}

function renderCategoryChart(jobs) {
  const ctx = document.getElementById('categoryChart')?.getContext('2d');
  if (!ctx) return;

  // กรองเฉพาะงานที่เสร็จแล้ว
  const finishedJobs = jobs.filter(j => j.status === 'finished');

  // สรุปรายได้แยกตามประเภท
  const categoryData = finishedJobs.reduce((acc, job) => {
    const cat = job.job_category || 'อื่นๆ';
    acc[cat] = (acc[cat] || 0) + (Number(job.budget) || 0);
    return acc;
  }, {});

  const labels = Object.keys(categoryData);
  const dataValues = Object.values(categoryData);
  
  // กำหนดสีประจำประเภท
  const bgColors = ['#4361ee', '#4cc9f0', '#4895ef', '#f72585', '#7209b7'];

  if (categoryChartInstance) {
    categoryChartInstance.destroy();
  }

  categoryChartInstance = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [{
        data: dataValues,
        backgroundColor: bgColors,
        hoverOffset: 10
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { font: { family: 'Kanit' } }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              let label = context.label || '';
              let value = context.parsed || 0;
              let total = context.dataset.data.reduce((a, b) => a + b, 0);
              let percentage = ((value / total) * 100).toFixed(1);
              return `${label}: ฿${value.toLocaleString()} (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}

function applyStockFilter() {
  renderStock(currentViewData.stock);
}

function renderStock(stock) {
  const container = document.getElementById('stock-list');
  if (!container) return;
  
  const filterActive = document.getElementById('low-stock-filter')?.checked;
  const displayData = filterActive 
    ? stock.filter(item => Number(item.quantity) <= Number(item.min_threshold))
    : stock;

  if (displayData.length === 0) {
    container.innerHTML = `<p class="no-data" style="padding: 30px; text-align: center; color: var(--text-sub);">
      ${filterActive ? '<i class="fas fa-check-circle"></i> ไม่มีวัสดุที่ของใกล้หมดในขณะนี้' : 'ไม่มีข้อมูลในคลังสินค้า'}
    </p>`;
    return;
  }

  const totalValue = displayData.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0), 0);

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
      <span style="font-size:13px; color:var(--text-sub);">มูลค่าคลังรวม: <strong style="color:var(--primary);">฿${totalValue.toLocaleString()}</strong></span>
      <button class="btn-primary" style="padding:8px 16px; font-size:13px;" onclick="showAddStockModal()">
        <i class="fas fa-plus"></i> เพิ่มรายการ
      </button>
    </div>
    <table class="stats-table">
      <thead>
        <tr>
          <th>วัสดุ</th>
          <th>หมวดหมู่</th>
          <th>คงเหลือ</th>
          <th>ราคา/หน่วย</th>
          <th>สถานะ</th>
          <th>จัดการ</th>
        </tr>
      </thead>
      <tbody>
        ${displayData.map(item => {
          const isLow = Number(item.quantity) <= Number(item.min_threshold);
          return `
          <tr class="${isLow ? 'low-stock-row' : ''}">
            <td><strong>${item.item_name}</strong></td>
            <td>${item.category || '-'}</td>
            <td>${item.quantity} ${item.unit}</td>
            <td>฿${Number(item.unit_price || 0).toLocaleString()}</td>
            <td><span class="status-badge ${isLow ? 'low-stock' : 'normal'}">
              ${isLow ? '<i class="fas fa-exclamation-triangle"></i> ใกล้หมด' : '<i class="fas fa-check"></i> ปกติ'}
            </span></td>
            <td><button onclick="updateStockQty('${item.item_id}', ${item.quantity})" class="btn-logout" title="แก้ไขจำนวน"><i class="fas fa-edit"></i></button></td>
          </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

async function updateStockQty(id, currentQty) {
  const newQty = prompt("กรุณาระบุจำนวนสต๊อกใหม่:", currentQty);
  if (newQty === null) return;
  
  try {
    await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "update_stock", id: id, quantity: newQty })
    });
    alert("อัปเดตสต๊อกสำเร็จ");
    loadJobs('pending', true);
  } catch (e) { alert("ผิดพลาด"); }
}

function updateDashboard(jobs) {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  
  // จัดการวันที่แสดงผล
  const dateDisplay = document.getElementById('today-date-display');
  if (dateDisplay) dateDisplay.innerText = "ข้อมูลประจำวันที่: " + now.toLocaleDateString('th-TH');

  // กรองงานวันนี้
  const todayJobs = jobs.filter(j => j.created_at && j.created_at.startsWith(todayStr));
  const todayFinished = todayJobs.filter(j => j.status === 'finished');
  const todayIncome = todayFinished.reduce((sum, j) => sum + (Number(j.budget) || 0), 0);

  // กรองภาพรวม
  const finishedJobs = jobs.filter(j => j.status === 'finished');
  const totalIncome = finishedJobs.reduce((sum, j) => sum + (Number(j.budget) || 0), 0);
  
  const pendingCount = jobs.filter(j => j.status === 'pending').length;

  // อัปเดตตัวเลขบน Dashboard
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  };

  const badge = document.getElementById('pending-badge');
  if (badge) {
    badge.innerText = pendingCount;
    badge.style.display = pendingCount > 0 ? 'flex' : 'none';
  }

  setVal('today-count', todayJobs.length);
  setVal('today-income', `฿${todayIncome.toLocaleString()}`);
  setVal('today-finished', todayFinished.length);
  setVal('total-income', `฿${totalIncome.toLocaleString()}`);
  setVal('count-pending', pendingCount);
  setVal('count-active', jobs.filter(j => j.status === 'accepted' || j.status === 'sewing').length);
  setVal('count-finished', finishedJobs.length);
  setVal('count-rejected', jobs.filter(j => j.status === 'rejected').length);

  // ระบบแจกแจงค่าแรงช่าง
  const tailorStats = {};
  finishedJobs.forEach(j => {
    const name = j.tailor_name || "ไม่ระบุช่าง";
    if (!tailorStats[name]) tailorStats[name] = { count: 0, total: 0, material: 0 };
    tailorStats[name].count++;
    tailorStats[name].total += (Number(j.budget) || 0);
    tailorStats[name].material += (Number(j.material_cost) || 0);
  });

  const perfDiv = document.getElementById('tailor-performance');
  if (perfDiv) {
    perfDiv.innerHTML = `
      <div class="table-container">
        <table class="stats-table">
          <thead>
            <tr>
              <th>ชื่อช่าง</th>
              <th>งานเสร็จ</th>
              <th>ยอดรวม</th>
              <th>ต้นทุนวัสดุ</th>
              <th>ค่าแรง (40%)</th>
              <th>กำไรร้านสุทธิ</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(tailorStats).map(([name, stat]) => `
              <tr>
                <td><strong>${name}</strong></td>
                <td>${stat.count}</td>
                <td>฿${stat.total.toLocaleString()}</td>
                <td class="text-warning">฿${stat.material.toLocaleString()}</td>
                <td class="text-success">฿${(stat.total * 0.4).toLocaleString()}</td>
                <td class="text-primary">฿${((stat.total * 0.6) - stat.material).toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
}

function renderPLReport(jobs) {
  const container = document.getElementById('pl-report-section');
  if (!container) return;

  const finishedJobs = jobs.filter(j => j.status === 'finished');
  
  // จัดกลุ่มข้อมูลตามเดือน (Monthly Grouping)
  const monthlyData = finishedJobs.reduce((acc, job) => {
    const date = new Date(job.created_at);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    
    if (!acc[monthKey]) {
      acc[monthKey] = { revenue: 0, labor: 0, material: 0, net: 0 };
    }
    
    const budget = Number(job.budget) || 0;
    const material = Number(job.material_cost) || 0;
    const labor = budget * 0.4; // ค่าแรงช่าง 40%
    
    acc[monthKey].revenue += budget;
    acc[monthKey].labor += labor;
    acc[monthKey].material += material;
    acc[monthKey].net += (budget * 0.6) - material; // กำไรสุทธิของร้าน (60% - ต้นทุนวัสดุ)
    
    return acc;
  }, {});

  const sortedMonths = Object.keys(monthlyData).sort().reverse();

  container.innerHTML = `
    <div class="table-container">
      <table class="stats-table">
        <thead>
          <tr>
            <th>เดือน/ปี</th>
            <th>รายได้รวม</th>
            <th>ค่าแรงช่าง (40%)</th>
            <th>ต้นทุนวัสดุ</th>
            <th>กำไรสุทธิร้าน</th>
          </tr>
        </thead>
        <tbody>
          ${sortedMonths.map(m => {
            const data = monthlyData[m];
            const [year, month] = m.split('-');
            const monthLabel = new Date(year, month - 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
            return `
              <tr>
                <td><strong>${monthLabel}</strong></td>
                <td>฿${data.revenue.toLocaleString()}</td>
                <td class="text-warning">฿${data.labor.toLocaleString()}</td>
                <td class="text-warning">฿${data.material.toLocaleString()}</td>
                <td class="text-primary" style="font-size: 1.1em;">฿${data.net.toLocaleString()}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderRejectedAnalysis(jobs) {
  const container = document.getElementById('rejected-list');
  if (!container) return;

  const rejectedJobs = jobs.filter(j => j.status === 'rejected' || j.status === 'cancelled');
  const disputedJobs = jobs.filter(j => j.dispute_notes && j.dispute_notes.trim() !== '');

  let html = '';

  if (rejectedJobs.length === 0 && disputedJobs.length === 0) {
    container.innerHTML = "<p class='no-data'>ไม่มีประวัติการปฏิเสธหรือการเคลมงาน</p>";
    return;
  }

  if (rejectedJobs.length > 0) {
    html += `
      <h4 style="margin:0 0 10px;font-size:14px;color:var(--warning);"><i class="fas fa-ban"></i> งานที่ปฏิเสธ / ยกเลิก (${rejectedJobs.length} รายการ)</h4>
      <div class="table-container" style="margin-bottom:20px;">
        <table class="stats-table">
          <thead>
            <tr>
              <th>เลขที่งาน</th>
              <th>ลูกค้า</th>
              <th>ประเภท</th>
              <th>งบประมาณ</th>
              <th>สถานะ</th>
              <th>สาเหตุ</th>
            </tr>
          </thead>
          <tbody>
            ${rejectedJobs.map(j => `
              <tr>
                <td><strong>${j.rn}</strong></td>
                <td>${j.customer_name}</td>
                <td>${j.job_category || '-'}</td>
                <td>฿${Number(j.budget).toLocaleString()}</td>
                <td><span class="status-badge ${j.status}">${j.status === 'rejected' ? 'ถูกปฏิเสธ' : 'ยกเลิกแล้ว'}</span></td>
                <td style="color:var(--warning);">${j.cancellation_reason || 'ไม่ได้ระบุ'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  }

  if (disputedJobs.length > 0) {
    html += `
      <h4 style="margin:0 0 10px;font-size:14px;color:#854d0e;"><i class="fas fa-exclamation-triangle"></i> งานที่ลูกค้าส่งเคลม/แจ้งปัญหา (${disputedJobs.length} รายการ)</h4>
      <div class="table-container">
        <table class="stats-table">
          <thead>
            <tr>
              <th>เลขที่งาน</th>
              <th>ลูกค้า</th>
              <th>ช่าง</th>
              <th>สถานะ</th>
              <th>รายละเอียดเคลม</th>
            </tr>
          </thead>
          <tbody>
            ${disputedJobs.map(j => `
              <tr>
                <td><strong>${j.rn}</strong></td>
                <td>${j.customer_name}</td>
                <td>${j.tailor_name || '-'}</td>
                <td><span class="status-badge ${j.status}">${j.status}</span></td>
                <td style="color:#854d0e;"><i class="fas fa-exclamation-circle"></i> ${j.dispute_notes}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  }

  container.innerHTML = html;
}

function renderJobs(jobsToRender) { // Renamed parameter for clarity
  const container = document.getElementById("job-list");
  const paginationContainer = document.getElementById("pagination-controls");
  
  if (jobsToRender.length === 0) {
    container.innerHTML = "<p class='no-data'>ไม่พบรายการงานที่ตรงกับการค้นหา</p>";
    if (paginationContainer) paginationContainer.innerHTML = ""; // Clear pagination
    return;
  }

  const totalPages = Math.ceil(jobsToRender.length / JOBS_PER_PAGE);
  const startIndex = (currentPage - 1) * JOBS_PER_PAGE;
  const endIndex = startIndex + JOBS_PER_PAGE;
  const paginatedJobs = jobsToRender.slice(startIndex, endIndex);

  const statusLabelMap = { pending: 'รอรับงาน', accepted: 'รับงานแล้ว', sewing: 'กำลังเย็บ', finished: 'เสร็จสมบูรณ์', cancelled: 'ยกเลิกแล้ว', rejected: 'ถูกปฏิเสธ', paid: 'ชำระเงินแล้ว' };

  container.innerHTML = paginatedJobs.map(job => {
    let m = { chest: '-', waist: '-', hips: '-', length: '-', shoulder: '-' };
    try {
      if (job.measurements) {
        const parsed = JSON.parse(job.measurements);
        m = { ...m, ...parsed };
      }
    } catch (e) { /* measurements อาจเป็น string เก่า */ }

    return `
    <div class="job-card fade-in">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <span class="status-badge ${job.status}">${statusLabelMap[job.status] || job.status}</span>
        <small>${job.created_at ? job.created_at.split('T')[0] : ''}</small>
      </div>
      <h3>${job.job_detail}</h3>

      <div class="measurement-spec">
        <div class="spec-item"><strong>อก</strong> <span class="spec-val">${m.chest || '-'}</span></div>
        <div class="spec-item"><strong>เอว</strong> <span class="spec-val">${m.waist || '-'}</span></div>
        <div class="spec-item"><strong>สะโพก</strong> <span class="spec-val">${m.hips || '-'}</span></div>
        <div class="spec-item"><strong>ยาว</strong> <span class="spec-val">${m.length || '-'}</span></div>
        <div class="spec-item"><strong>ไหล่</strong> <span class="spec-val">${m.shoulder || '-'}</span></div>
      </div>

      <p><strong>ผู้โพสต์:</strong> ${job.customer_name}</p>
      <p><strong>ติดต่อ:</strong> ${job.customer_phone || '-'}</p>
      <p><strong>งบประมาณ:</strong> ฿${Number(job.budget).toLocaleString()}</p>

      ${job.dispute_notes ? `
        <div style="margin:8px 0;padding:10px 14px;background:#fef9c3;border-radius:10px;font-size:13px;color:#854d0e;border:1px solid #facc15;">
          <i class="fas fa-exclamation-triangle"></i> <strong>ลูกค้าส่งเคลม:</strong> ${job.dispute_notes}
        </div>` : ''}

      ${renderActionButtons(job)}
    </div>
    `;
  }).join('');

  renderPaginationControls(jobsToRender.length, totalPages);
}

function renderActionButtons(job) {
  const isBoss = (sessionStorage.getItem("userRole") || localStorage.getItem("userRole")) === 'boss';
  const costBtn = isBoss ? `
    <button class="btn-logout" style="width:100%; margin-top:5px; border-color:var(--secondary); color:var(--secondary);" onclick="updateAdditionalCost('${job.id}', ${job.budget})">
      <i class="fas fa-plus-circle"></i> เพิ่มค่าใช้จ่าย (Boss)
    </button>` : '';

  if (job.status === 'pending') {
    return `
      <div style="display:flex; gap:10px;">
        <button class="btn-primary" style="flex:2" onclick="updateStatus('${job.id}', 'accepted')"><i class="fas fa-check"></i> รับงาน</button>
        <button class="btn-logout" style="flex:1" onclick="updateStatus('${job.id}', 'rejected')"><i class="fas fa-times"></i> ปฏิเสธ</button>
      </div>
      ${costBtn}
    `;
  } else if (job.status === 'accepted') {
    return `
      <button class="btn-primary" style="background:var(--success); width:100%;" onclick="updateStatus('${job.id}', 'sewing')"><i class="fas fa-cut"></i> เริ่มขั้นตอนตัดเย็บ</button>
      ${costBtn}
    `;
  } else if (job.status === 'sewing') {
    return `
      <button class="btn-primary" style="background:var(--secondary); margin-bottom:5px; width:100%;" onclick="uploadProgressPhoto('${job.id}')"><i class="fas fa-camera"></i> อัปเดตรูปความคืบหน้า</button>
      <button class="btn-primary" style="background:var(--primary-dark); width:100%;" onclick="updateStatus('${job.id}', 'finished')"><i class="fas fa-check-double"></i> แจ้งงานเสร็จสมบูรณ์</button>
      ${costBtn}
    `;
  } else if (job.status === 'finished') {
    return costBtn;
  } else if (job.status === 'paid') {
    return `
      <div style="margin-top:8px;padding:8px 12px;background:#ede9fe;border-radius:10px;color:#5b21b6;font-size:13px;display:flex;align-items:center;gap:6px;">
        <i class="fas fa-check-circle"></i> ลูกค้าชำระเงินเรียบร้อยแล้ว
      </div>
      ${costBtn}`;
  }
  return '';
}

// Render a Pay button for customers when appropriate
function renderPayButtonForCustomer(job) {
  try {
    const role = sessionStorage.getItem('userRole') || localStorage.getItem('userRole');
    const userId = sessionStorage.getItem('userId') || localStorage.getItem('userId');
    // Only show to logged-in customers who own the job and when status is accepted (or pending if you support paying before work)
    if (!role || role === 'boss' || role === 'tailor') return ''; // not a customer view
    if (!userId || job.user_id !== userId) return '';
    if (job.status !== 'accepted' && job.status !== 'pending') return '';

    return `
      <button class="btn-primary" style="margin-top:8px; width:100%; background:linear-gradient(135deg,#16a34a,#059669);" onclick="payFinalPrice('${job.id}', ${Number(job.budget) || 0})">
        <i class="fas fa-credit-card"></i> ชำระเงิน (ชำระเงินปลายทาง / ทดลอง)
      </button>
    `;
  } catch (e) { return ''; }
}

// Small fetch wrapper to standardize POST calls
async function apiPost(payload) {
  try {
    const res = await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) });
    return await res.json();
  } catch (error) {
    console.error('apiPost error', error);
    return { status: 'error', message: 'Connection error' };
  }
}

// Customer action: pay final price (calls backend action=pay_final_price)
async function payFinalPrice(jobId, amount) {
  const userId = sessionStorage.getItem('userId') || localStorage.getItem('userId');
  if (!userId) return alert('กรุณาเข้าสู่ระบบก่อนทำการชำระเงิน');

  if (!confirm(`ยืนยันการชำระเงินยอดรวม ฿${Number(amount).toLocaleString()}?`)) return;

  try {
    const payload = { action: 'pay_final_price', id: jobId, user_id: userId };
    const result = await apiPost(payload);
    if (result.status === 'success') {
      alert('บันทึกการชำระเงินเรียบร้อยแล้ว');
      // Refresh customer's job list or general jobs depending on which view
      loadCustomerJobs();
      setTimeout(() => loadJobs('pending', true), 400);
    } else {
      alert(result.message || 'ไม่สามารถบันทึกการชำระเงินได้');
    }
  } catch (e) {
    console.error('payFinalPrice error', e);
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
  }
}

function filterJobs() {
  const query = document.getElementById("search-input").value.toLowerCase();
  currentFilteredJobs = allPendingJobs.filter(job => // Filter from the full set of jobs for the current tab
    job.job_detail.toLowerCase().includes(query) || 
    job.customer_name.toLowerCase().includes(query)
  );
  currentPage = 1; // Reset to first page after filtering
  renderJobs(currentFilteredJobs);
}

// สร้างฟังก์ชัน Debounced สำหรับเรียกใช้ใน HTML
const debouncedFilterJobs = debounce(() => filterJobs());

// New pagination functions
function renderPaginationControls(totalItems, totalPages) {
  const paginationContainer = document.getElementById("pagination-controls");
  if (!paginationContainer) return;

  if (totalPages <= 1) {
    paginationContainer.innerHTML = "";
    paginationContainer.style.display = 'none'; // Hide if no pagination needed
    return;
  }

  paginationContainer.style.display = 'flex'; // Show if pagination needed
  let paginationHtml = `
    <button class="btn-pagination" onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
      <i class="fas fa-chevron-left"></i> ก่อนหน้า
    </button>
    <span>หน้า ${currentPage} จาก ${totalPages}</span>
    <button class="btn-pagination" onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
      ถัดไป <i class="fas fa-chevron-right"></i>
    </button>
  `;
  paginationContainer.innerHTML = paginationHtml;
}

function goToPage(pageNumber) {
  const totalPages = Math.ceil(currentFilteredJobs.length / JOBS_PER_PAGE);
  if (pageNumber < 1 || pageNumber > totalPages) return;

  currentPage = pageNumber;
  renderJobs(currentFilteredJobs);
  // Scroll to top of job list for better UX
  const jobList = document.getElementById("job-list");
  if (jobList) jobList.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function updateStatus(id, newStatus) {
  let payload = { action: "update_status", id: id, status: newStatus };

  if (newStatus === 'rejected') {
    const reason = prompt("กรุณาระบุสาเหตุที่ปฏิเสธงานนี้ (ข้อมูลนี้จะถูกเก็บไว้เพื่อพัฒนาธุรกิจ):");
    if (reason === null) return; // กดยกเลิก
    payload.cancellation_reason = reason || "ไม่ระบุสาเหตุ";
  }

  if (newStatus === 'accepted') {
    // ใช้ชื่อจาก Session อัตโนมัติเพื่อป้องกันพนักงานพิมพ์ชื่อผิด
    payload.tailor_name = sessionStorage.getItem("userName");

    // ถามเรื่องการหักสต๊อก
    const useStock = confirm("ต้องการหักสต๊อกวัสดุสำหรับงานนี้ทันทีหรือไม่?");
    if (useStock && currentViewData.stock.length > 0) {
      const stockOptions = currentViewData.stock
        .map((item, index) => `${index + 1}. ${item.item_name} (คงเหลือ ${item.quantity} ${item.unit}) [ID: ${item.item_id}]`)
        .join('\n');
      
      const choice = prompt(`เลือกวัสดุที่ต้องการใช้ (ระบุหมายเลข):\n${stockOptions}`);
      const selectedItem = currentViewData.stock[parseInt(choice) - 1];

      if (selectedItem) {
        const qty = prompt(`ระบุจำนวน ${selectedItem.item_name} ที่ใช้ (${selectedItem.unit}):`, "1");
        if (qty && !isNaN(qty)) {
          payload.stock_id = selectedItem.item_id;
          payload.stock_qty = qty;
        }
      }
    }
  }

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    alert("อัปเดตสถานะสำเร็จ!");
    setTimeout(() => loadJobs('pending', true), 2000); // บังคับโหลดใหม่ (Bypass Cache)
  } catch (error) {
    alert("เกิดข้อผิดพลาด");
  }
}

function logoutBoss() {
  sessionStorage.clear(); // ล้างข้อมูล Session ทั้งหมด (role, Name, ID) เพื่อความปลอดภัย
  localStorage.clear();   // ล้างข้อมูลที่จดจำไว้ด้วย
  location.reload();
}

function showReceipt(rn, data) {
  const modal = document.getElementById("receipt-modal");
  const view = document.getElementById("customer-view");
  
  if (!modal) return;

  if (view) view.style.display = "none";
  modal.style.display = "block";

  document.getElementById("receipt-rn").innerText = rn;
  document.getElementById("r-name").innerText = data.customer_name;
  document.getElementById("r-detail").innerText = data.job_detail;
  document.getElementById("r-budget").innerText = Number(data.budget).toLocaleString();
}

async function downloadReceipt() {
  const element = document.getElementById("receipt-to-print");
  if (!element) return;
  const canvas = await html2canvas(element);
  const link = document.createElement("a");
  link.download = `Receipt-${document.getElementById("receipt-rn").innerText}.png`;
  link.href = canvas.toDataURL();
  link.click();
}

function openChangePasswordModal() {
  const modal = document.getElementById("change-password-modal");
  if (modal) modal.style.display = "flex";
}

function closeChangePasswordModal() {
  const modal = document.getElementById("change-password-modal");
  if (modal) {
    modal.style.display = "none";
    document.getElementById("cp-old-pass").value = "";
    document.getElementById("cp-new-pass").value = "";
  }
}

async function handleChangePassword() {
  const oldPass = document.getElementById("cp-old-pass").value;
  const newPass = document.getElementById("cp-new-pass").value;
  const userId = sessionStorage.getItem("userId");

  if (!oldPass || !newPass) return alert("กรุณากรอกข้อมูลให้ครบถ้วน");
  if (oldPass === newPass) return alert("รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม");

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "change_password",
        user_id: userId,
        old_password: oldPass,
        new_password: newPass
      })
    });
    const result = await response.json();
    if (result.status === "success") {
      alert("เปลี่ยนรหัสผ่านสำเร็จ");
      closeChangePasswordModal();
    } else {
      alert(result.message);
    }
  } catch (e) { alert("เกิดข้อผิดพลาดในการเชื่อมต่อ"); }
}

// ฟังก์ชันยืนยันรับงานและให้คะแนน
async function confirmAndRateJob(id) {
  const rating = prompt("งานของคุณเสร็จเรียบร้อยแล้ว!\nกรุณาให้คะแนนความพึงพอใจ (1-5 ดาว):", "5");
  
  if (rating === null) return;
  const ratingNum = parseInt(rating);
  
  if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return alert("กรุณาระบุคะแนนเป็นตัวเลข 1 ถึง 5 เท่านั้นครับ");
  }

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ 
        action: "update_status", 
        id: id, 
        status: "finished",
        rating: ratingNum 
      })
    });
    const res = await response.json();
    if (res.status === "success") {
      alert("ขอบคุณสำหรับคะแนนความพึงพอใจครับ!");
      loadCustomerJobs();
    }
  } catch (e) { alert("เกิดข้อผิดพลาดในการเชื่อมต่อ"); }
}

// === แจ้งเตือนลูกค้า: ดึงงานล่าสุดมาแสดงเป็น timeline ===
async function loadNotifications() {
  const container = document.getElementById("notifications-list");
  const userId = sessionStorage.getItem("userId");
  if (!container || !userId) return;
  container.innerHTML = "<p>กำลังโหลด...</p>";

  try {
    const response = await fetch(SCRIPT_URL);
    const data = await response.json();
    const myJobs = (data.jobs || []).filter(j => j.user_id === userId);

    if (myJobs.length === 0) {
      container.innerHTML = "<p class='no-data'>ยังไม่มีการแจ้งเตือน</p>";
      return;
    }

    const statusLabel = { pending: 'รอรับงาน', accepted: 'รับงานแล้ว', sewing: 'กำลังเย็บ', finished: 'เสร็จสมบูรณ์', cancelled: 'ยกเลิกแล้ว', rejected: 'ถูกปฏิเสธ', paid: 'ชำระเงินแล้ว' };
    const statusIcon  = { pending: 'fa-clock', accepted: 'fa-check', sewing: 'fa-cut', finished: 'fa-check-double', cancelled: 'fa-times-circle', rejected: 'fa-ban', paid: 'fa-credit-card' };

    // Chunk notifications to avoid blocking
    container.innerHTML = '';
    const notes = myJobs.slice().reverse();
    const CHUNK = 8;
    let i = 0;
    function renderNotesChunk() {
      const slice = notes.slice(i, i + CHUNK);
      const html = slice.map(job => `
        <div class="job-card fade-in" style="border-left: 4px solid var(--primary);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span class="status-badge ${job.status}"><i class="fas ${statusIcon[job.status] || 'fa-info-circle'}"></i> ${statusLabel[job.status] || job.status}</span>
            <small style="color:var(--text-sub);">${job.rn}</small>
          </div>
          <p style="margin:4px 0; font-size:14px;"><strong>${job.job_detail}</strong></p>
          ${job.tailor_name ? `<p style="margin:4px 0; font-size:13px; color:var(--text-sub);">ช่าง: ${job.tailor_name}</p>` : ''}
          ${(job.status === 'cancelled' || job.status === 'rejected') && job.cancellation_reason ? `<p style="margin:4px 0; font-size:12px; color:var(--warning);"><i class="fas fa-exclamation-circle"></i> ${job.cancellation_reason}</p>` : ''}
          <small style="color:var(--text-sub);">${job.created_at ? job.created_at.split('T')[0] : ''}</small>
        </div>
      `).join('');
      container.insertAdjacentHTML('beforeend', html);
      i += CHUNK;
      if (i < notes.length) setTimeout(renderNotesChunk, 40);
    }
    renderNotesChunk();
  } catch (e) {
    container.innerHTML = "<p class='no-data'>ไม่สามารถโหลดข้อมูลได้</p>";
  }
}

// === โหลดข้อมูลโปรไฟล์จาก server + สัดส่วนร่างกาย (WI-S03 action 12+15) ===
async function loadProfile() {
  const userId = sessionStorage.getItem("userId") || localStorage.getItem("userId");
  const cachedName = sessionStorage.getItem("userName") || localStorage.getItem("userName") || "";

  const nameEl = document.getElementById("profile-name");
  if (nameEl) nameEl.value = cachedName;

  try {
    const res = await fetch(SCRIPT_URL);
    const data = await res.json();

    // Pre-fill ข้อมูลติดต่อจาก USERS sheet
    const user = (data.users || []).find(u => u.user_id === userId);
    if (user) {
      const setField = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
      setField("profile-name",  user.full_name);
      setField("profile-phone", user.phone);
      setField("profile-line",  user.line_id || "");
    }

    // Pre-fill สัดส่วนร่างกายจาก MEASUREMENTS sheet
    const mData = (data.measurements || []).find(m => m.user_id === userId);
    if (mData) {
      const setM = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
      setM("p-m-chest",   mData.chest);
      setM("p-m-waist",   mData.waist);
      setM("p-m-hips",    mData.hips);
      setM("p-m-length",  mData.length);
      setM("p-m-shoulder",mData.shoulder);
    }
  } catch (e) {
    console.warn("loadProfile: ไม่สามารถดึงข้อมูลจาก server ได้");
  }
}

// === บันทึกสัดส่วนร่างกาย (WI-S03 action 15: update_measurements) ===
async function updateMeasurements() {
  const userId = sessionStorage.getItem("userId") || localStorage.getItem("userId");
  if (!userId) return alert("กรุณาเข้าสู่ระบบก่อน");

  const chest    = document.getElementById("p-m-chest")?.value || "";
  const waist    = document.getElementById("p-m-waist")?.value || "";
  const hips     = document.getElementById("p-m-hips")?.value || "";
  const length   = document.getElementById("p-m-length")?.value || "";
  const shoulder = document.getElementById("p-m-shoulder")?.value || "";

  if (!chest && !waist && !length) return alert("กรุณากรอกสัดส่วนอย่างน้อย 1 ช่อง");

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "update_measurements", user_id: userId, chest, waist, hips, length, shoulder })
    });
    const res = await response.json();
    if (res.status === "success") {
      alert("บันทึกสัดส่วนสำเร็จ! ระบบจะเติมอัตโนมัติในฟอร์มสั่งงาน");
      autoFillOrderMeasurements({ chest, waist, hips, length, shoulder });
    } else {
      alert(res.message || "เกิดข้อผิดพลาด");
    }
  } catch (e) { alert("เกิดข้อผิดพลาดในการเชื่อมต่อ"); }
}

// เติมสัดส่วนจาก profile ลงในฟอร์มสั่งงานอัตโนมัติ
function autoFillOrderMeasurements(m) {
  const setField = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
  setField("m-chest",   m.chest);
  setField("m-waist",   m.waist);
  setField("m-hips",    m.hips);
  setField("m-length",  m.length);
  setField("m-shoulder",m.shoulder);
}

// === บันทึกโปรไฟล์ลูกค้า (WI-C, action=update_profile) ===
async function updateProfile() {
  const userId = sessionStorage.getItem("userId") || localStorage.getItem("userId");
  const fullName = document.getElementById("profile-name")?.value;
  const phone    = document.getElementById("profile-phone")?.value;
  const line     = document.getElementById("profile-line")?.value;

  if (!fullName) return alert("กรุณากรอกชื่อ-นามสกุล");

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "update_profile", user_id: userId, full_name: fullName, phone: phone, line: line })
    });
    const res = await response.json();
    if (res.status === "success") {
      sessionStorage.setItem("userName", fullName);
      localStorage.setItem("userName", fullName);
      const displayEl = document.getElementById("display-user-name");
      if (displayEl) displayEl.innerHTML = `<i class="fas fa-user-circle"></i> ${fullName}`;
      alert("อัปเดตโปรไฟล์สำเร็จ");
    } else {
      alert(res.message || "เกิดข้อผิดพลาด");
    }
  } catch (e) { alert("เกิดข้อผิดพลาดในการเชื่อมต่อ"); }
}

// ระบบกดค้าง 3 วินาทีสำหรับปุ่มลับ
let portalTimer;
function initPortalLongPress() {
    const btn = document.querySelector('.portal-access-btn');
    if (!btn) return;

    const startPress = (e) => {
        if (e.type === 'touchstart') e.preventDefault();
        portalTimer = setTimeout(() => {
            togglePortalDropdown();
        }, 3000); // 3 วินาที
    };

    const cancelPress = () => {
        clearTimeout(portalTimer);
    };

    btn.addEventListener('mousedown', startPress);
    btn.addEventListener('touchstart', startPress);
    btn.addEventListener('mouseup', cancelPress);
    btn.addEventListener('mouseleave', cancelPress);
    btn.addEventListener('touchend', cancelPress);
}

function togglePortalDropdown() {
  const dropdown = document.getElementById("portal-dropdown");
  if (dropdown) {
    dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
  }
}

// เรียกใช้งานระบบกดค้างเมื่อโหลดหน้าเว็บ

// --- ระบบ Scroll Reveal โดยใช้ Intersection Observer ---
function initScrollReveal() {
  const observerOptions = {
    threshold: 0.15, // เริ่มทำงานเมื่อองค์ประกอบปรากฏในจอ 15%
    rootMargin: "0px 0px -50px 0px" // ให้เริ่มแสดงก่อนถึงขอบล่างของจอนิดหน่อยเพื่อให้ดูเป็นธรรมชาติ
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('active');
      }
    });
  }, observerOptions);

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

// ฟังก์ชันช่วยเติมข้อมูลสำหรับ Demo เพื่อความสะดวกในการทดสอบ
function fillDemoLogin(type) {
  if (type === 'customer') {
    document.getElementById('login-username').value = "admin";
    document.getElementById('login-password').value = "1234";
    loginCustomer();
  } else {
    document.getElementById('boss-username').value = "admin";
    document.getElementById('boss-password').value = "1234";
    loginBoss();
  }
}

// ฟังก์ชันยกเลิกงานพร้อมระบุเหตุผล
async function cancelOrder(id) {
  const reason = prompt("กรุณาระบุเหตุผลในการยกเลิกงานจ้างนี้ (เช่น เปลี่ยนใจ, ได้ร้านอื่นแล้ว):");
  
  if (reason === null) return; // กดยกเลิกใน prompt
  if (reason.trim() === "") return alert("กรุณาระบุเหตุผลเพื่อให้เรานำไปปรับปรุงบริการครับ");

  if (!confirm("ยืนยันการยกเลิกงานจ้างนี้ใช่หรือไม่?")) return;

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ 
        action: "update_status", 
        id: id, 
        status: "cancelled",
        cancellation_reason: reason 
      })
    });
    const res = await response.json();
    if (res.status === "success") {
      alert("ยกเลิกงานจ้างเรียบร้อยแล้ว");
      loadCustomerJobs();
    } else {
      alert("ไม่สามารถยกเลิกได้: " + res.message);
    }
  } catch (e) { alert("เกิดข้อผิดพลาดในการเชื่อมต่อ"); }
}

// === จัดการสิทธิ์ผู้ใช้ ===
function renderUsers(users) {
  const container = document.getElementById('user-list');
  if (!container || !users) return;
  const currentUserId = sessionStorage.getItem("userId");

  container.innerHTML = `
    <table class="stats-table">
      <thead>
        <tr><th>ID</th><th>ชื่อผู้ใช้</th><th>ชื่อจริง</th><th>โทร</th><th>สิทธิ์</th><th>จัดการ</th></tr>
      </thead>
      <tbody>
        ${users.map(u => `
          <tr>
            <td><small>${u.user_id}</small></td>
            <td>${u.username}</td>
            <td>${u.full_name}</td>
            <td>${u.phone || '-'}</td>
            <td><span class="status-badge ${u.role === 'boss' ? 'accepted' : u.role === 'tailor' ? 'sewing' : 'pending'}">
              ${u.role === 'boss' ? 'เจ้าของร้าน' : u.role === 'tailor' ? 'ช่าง' : 'ลูกค้า'}
            </span></td>
            <td>
              ${u.user_id !== currentUserId ? `
                <select onchange="changeUserRole('${u.user_id}', this.value)" style="padding:5px; border-radius:8px; border:1px solid var(--primary);">
                  <option value="customer" ${u.role === 'customer' ? 'selected' : ''}>ลูกค้า</option>
                  <option value="tailor" ${u.role === 'tailor' ? 'selected' : ''}>ช่าง</option>
                  <option value="boss" ${u.role === 'boss' ? 'selected' : ''}>เจ้าของร้าน</option>
                </select>
              ` : '<span style="color:var(--text-sub); font-size:12px;">บัญชีปัจจุบัน</span>'}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function changeUserRole(userId, newRole) {
  const roleLabel = newRole === 'boss' ? 'เจ้าของร้าน' : newRole === 'tailor' ? 'ช่าง' : 'ลูกค้า';
  if (!confirm(`ยืนยันการเปลี่ยนสิทธิ์เป็น "${roleLabel}"?`)) {
    renderUsers(currentViewData.users);
    return;
  }
  try {
    await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "update_role",
        user_id: userId,
        role: newRole,
        admin_id: sessionStorage.getItem("userId"),
        admin_name: sessionStorage.getItem("userName")
      })
    });
    alert("เปลี่ยนสิทธิ์สำเร็จ");
    loadJobs('pending', true);
  } catch (e) { alert("เกิดข้อผิดพลาดในการเชื่อมต่อ"); }
}

// === สถิติส่วนตัวช่าง ===
function renderTailorStats(jobs, payroll) {
  const myName = sessionStorage.getItem("userName");
  const myId   = sessionStorage.getItem("userId");
  const myJobs = jobs.filter(j => j.tailor_name === myName && j.status === 'finished');

  // คำนวณรายได้
  const totalWage    = myJobs.reduce((sum, j) => sum + (Number(j.budget) || 0), 0) * 0.4;
  const myPayroll    = (payroll || []).filter(p => p.user_id === myId);
  const paidAmount   = myPayroll.filter(p => p.status === 'approved').reduce((sum, p) => sum + (Number(p.net_amount) || 0), 0);
  const pendingAmt   = myPayroll.filter(p => p.status === 'pending').reduce((sum, p) => sum + (Number(p.net_amount) || 0), 0);
  const available    = Math.max(0, totalWage - paidAmount - pendingAmt);

  // คำนวณ Rating เฉลี่ย (WI-T06: ช่างเห็นคะแนนในแท็บรายได้ของฉัน)
  const ratedJobs    = myJobs.filter(j => j.rating && Number(j.rating) > 0);
  const avgRating    = ratedJobs.length > 0
    ? (ratedJobs.reduce((sum, j) => sum + Number(j.rating), 0) / ratedJobs.length).toFixed(1)
    : null;

  // อัปเดตการ์ด
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
  setVal('my-available-income', `฿${available.toLocaleString()}`);
  setVal('my-finished-count',   myJobs.length);
  setVal('my-total-wage',       `฿${totalWage.toLocaleString()}`);
  setVal('my-avg-rating',       avgRating ? `${'★'.repeat(Math.round(avgRating))}${'☆'.repeat(5 - Math.round(avgRating))} (${avgRating})` : 'ยังไม่มี');

  // ประวัติงานที่ทำเสร็จ (WI-T05/T06)
  const jobHistEl = document.getElementById('my-jobs-history');
  if (jobHistEl) {
    if (myJobs.length === 0) {
      jobHistEl.innerHTML = "<p class='no-data'>ยังไม่มีงานที่ทำเสร็จ</p>";
    } else {
      jobHistEl.innerHTML = `
        <table class="stats-table">
          <thead>
            <tr><th>เลขที่</th><th>รายละเอียด</th><th>ประเภท</th><th>งบ</th><th>ค่าแรง (40%)</th><th>Rating</th><th>วันที่</th></tr>
          </thead>
          <tbody>
            ${myJobs.slice().reverse().map(j => `
              <tr>
                <td><small>${j.rn}</small></td>
                <td>${j.job_detail?.substring(0, 30)}${j.job_detail?.length > 30 ? '...' : ''}</td>
                <td>${j.job_category || '-'}</td>
                <td>฿${Number(j.budget).toLocaleString()}</td>
                <td class="text-success">฿${(Number(j.budget) * 0.4).toLocaleString()}</td>
                <td>${j.rating ? '★'.repeat(Number(j.rating)) + '☆'.repeat(5 - Number(j.rating)) : '<span style="color:var(--text-sub)">รอ</span>'}</td>
                <td><small>${j.created_at ? j.created_at.split('T')[0] : ''}</small></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
  }

  // ประวัติการเบิกเงิน
  const histEl = document.getElementById('my-payroll-history');
  if (!histEl) return;

  if (myPayroll.length === 0) {
    histEl.innerHTML = "<p class='no-data'>ยังไม่มีประวัติการเบิกเงิน</p>";
    return;
  }

  histEl.innerHTML = `
    <table class="stats-table">
      <thead>
        <tr><th>รหัส</th><th>รอบวันที่</th><th>ยอดรวม</th><th>ภาษี 3%</th><th>ยอดสุทธิ</th><th>สถานะ</th></tr>
      </thead>
      <tbody>
        ${myPayroll.map(p => `
          <tr>
            <td><small>${p.pay_id}</small></td>
            <td>วันที่ ${p.cycle}</td>
            <td>฿${Number(p.gross_amount).toLocaleString()}</td>
            <td class="text-warning">฿${Number(p.tax_3).toLocaleString()}</td>
            <td class="text-primary"><strong>฿${Number(p.net_amount).toLocaleString()}</strong></td>
            <td><span class="status-badge ${p.status === 'approved' ? 'finished' : 'pending'}">${p.status === 'approved' ? 'อนุมัติแล้ว' : 'รอพิจารณา'}</span></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function requestPayment() {
  const myId = sessionStorage.getItem("userId");
  const myName = sessionStorage.getItem("userName");
  const cycle = document.getElementById('pay-cycle')?.value;
  const amountText = document.getElementById('my-available-income')?.innerText?.replace(/[฿,]/g, '') || '0';
  const amount = Number(amountText);

  if (amount <= 0) return alert("ไม่มียอดเงินที่สามารถเบิกได้ในขณะนี้");
  if (!confirm(`ยืนยันการยื่นขอเบิกเงิน ฿${amount.toLocaleString()} (รอบวันที่ ${cycle})?`)) return;

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "request_payment", user_id: myId, username: myName, amount: amount, cycle: cycle })
    });
    const res = await response.json();
    if (res.status === "success") {
      alert("ส่งคำขอเบิกเงินสำเร็จ! กรุณารอการอนุมัติจากเจ้าของร้าน");
      loadJobs('pending', true);
    }
  } catch (e) { alert("เกิดข้อผิดพลาดในการเชื่อมต่อ"); }
}

// === จัดการเงินเดือน (Boss) ===
function renderPayrollManager(payroll) {
  const container = document.getElementById('admin-payroll-list');
  if (!container) return;

  const pending = (payroll || []).filter(p => p.status === 'pending');

  if (pending.length === 0) {
    container.innerHTML = "<p class='no-data'>ไม่มีคำขอเบิกเงินที่รอการพิจารณา</p>";
    return;
  }

  container.innerHTML = `
    <table class="stats-table">
      <thead>
        <tr><th>รหัส</th><th>ช่าง</th><th>รอบ</th><th>ยอดรวม</th><th>ภาษี 3%</th><th>ยอดสุทธิ</th><th>จัดการ</th></tr>
      </thead>
      <tbody>
        ${pending.map(p => `
          <tr>
            <td><small>${p.pay_id}</small></td>
            <td>${p.username}</td>
            <td>วันที่ ${p.cycle}</td>
            <td>฿${Number(p.gross_amount).toLocaleString()}</td>
            <td class="text-warning">฿${Number(p.tax_3).toLocaleString()}</td>
            <td class="text-primary"><strong>฿${Number(p.net_amount).toLocaleString()}</strong></td>
            <td>
              <button class="btn-primary" style="padding:6px 14px; font-size:13px;" onclick="approvePayment('${p.pay_id}')">
                <i class="fas fa-check"></i> อนุมัติ
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function approvePayment(payId) {
  if (!confirm("ยืนยันการอนุมัติการเบิกเงินนี้?")) return;
  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "approve_payment", pay_id: payId })
    });
    const res = await response.json();
    if (res.status === "success") {
      alert("อนุมัติสำเร็จ");
      loadJobs('pending', true);
    }
  } catch (e) { alert("เกิดข้อผิดพลาดในการเชื่อมต่อ"); }
}

// === ช่างอัปเดตรูปความคืบหน้า ===
async function uploadProgressPhoto(id) {
  const photoUrl = prompt("วางลิงก์รูปภาพความคืบหน้าของงาน:\n(อัปโหลดรูปที่ Google Drive แล้วตั้งค่าให้เปิดได้สาธารณะ)");
  if (!photoUrl || !photoUrl.trim()) return;

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "update_status", id: id, status: "sewing", progress_photo: photoUrl.trim() })
    });
    const res = await response.json();
    if (res.status === "success") {
      alert("อัปเดตรูปภาพสำเร็จ");
      loadJobs('active', true);
    }
  } catch (e) { alert("เกิดข้อผิดพลาดในการเชื่อมต่อ"); }
}

// === Boss: เพิ่มรายการสต๊อกใหม่ (WI-B02, action=add_stock) ===
function showAddStockModal() {
  const existing = document.getElementById('add-stock-modal');
  if (existing) { existing.style.display = 'flex'; return; }

  const modal = document.createElement('div');
  modal.id = 'add-stock-modal';
  modal.className = 'modal';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="receipt-content" style="max-width:400px; width:100%;">
      <div class="section-header">
        <h2><i class="fas fa-plus-circle"></i> เพิ่มรายการสต๊อกใหม่</h2>
      </div>
      <div class="form-group">
        <input type="text"   id="ns-name"       placeholder="ชื่อวัสดุ (เช่น ผ้าวูล)" required>
        <input type="text"   id="ns-category"   placeholder="หมวดหมู่ (เช่น ผ้า, ด้าย, กระดุม)">
        <input type="number" id="ns-qty"        placeholder="จำนวนเริ่มต้น" min="0">
        <input type="text"   id="ns-unit"       placeholder="หน่วย (เช่น เมตร, เม็ด)">
        <input type="number" id="ns-price"      placeholder="ราคาต่อหน่วย (บาท)" min="0">
        <input type="number" id="ns-min"        placeholder="ขั้นต่ำแจ้งเตือน" min="0">
        <button class="btn-primary" onclick="addNewStock()"><i class="fas fa-save"></i> บันทึก</button>
        <button class="btn-secondary" onclick="document.getElementById('add-stock-modal').style.display='none'">ยกเลิก</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

async function addNewStock() {
  const name      = document.getElementById('ns-name')?.value?.trim();
  const category  = document.getElementById('ns-category')?.value?.trim() || 'ทั่วไป';
  const qty       = document.getElementById('ns-qty')?.value || '0';
  const unit      = document.getElementById('ns-unit')?.value?.trim() || 'ชิ้น';
  const price     = document.getElementById('ns-price')?.value || '0';
  const minThresh = document.getElementById('ns-min')?.value || '5';

  if (!name) return alert("กรุณาระบุชื่อวัสดุ");

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "add_stock", category, item_name: name, quantity: qty, unit, unit_price: price, min_threshold: minThresh })
    });
    const res = await response.json();
    if (res.status === "success") {
      alert("เพิ่มรายการสต๊อกสำเร็จ! (ID: " + (res.item_id || '-') + ")");
      document.getElementById('add-stock-modal').style.display = 'none';
      loadJobs('pending', true);
    } else {
      alert(res.message || "เกิดข้อผิดพลาด");
    }
  } catch (e) { alert("เกิดข้อผิดพลาดในการเชื่อมต่อ"); }
}

// === Boss: เพิ่มค่าใช้จ่ายงาน (WI-B08, action=update_additional_cost) ===
async function updateAdditionalCost(id, currentBudget) {
  const extra = prompt(`งบประมาณปัจจุบัน: ฿${Number(currentBudget).toLocaleString()}\nระบุจำนวนเงินที่เพิ่มเติม (บาท):`);
  if (extra === null) return;
  const extraNum = Number(extra);
  if (isNaN(extraNum) || extraNum <= 0) return alert("กรุณาระบุจำนวนเงินที่ถูกต้อง (> 0)");

  if (!confirm(`ยืนยันเพิ่มค่าใช้จ่าย ฿${extraNum.toLocaleString()} → งบใหม่ = ฿${(Number(currentBudget) + extraNum).toLocaleString()}?`)) return;

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "update_additional_cost", id: id, additional_cost: extraNum })
    });
    const res = await response.json();
    if (res.status === "success") {
      alert("อัปเดตค่าใช้จ่ายสำเร็จ");
      loadJobs('active', true);
    } else {
      alert(res.message || "เกิดข้อผิดพลาด");
    }
  } catch (e) { alert("เกิดข้อผิดพลาดในการเชื่อมต่อ"); }
}

// === Dark Mode Toggle ===
function initTheme() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;

  if (localStorage.getItem('tailorTheme') === 'dark') {
    document.documentElement.classList.add('dark-mode');
    btn.innerHTML = '<i class="fas fa-sun"></i>';
  }

  btn.addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark-mode');
    btn.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    localStorage.setItem('tailorTheme', isDark ? 'dark' : 'light');
  });
}

// === ลูกค้าขอแก้ไข/เคลมงาน ===
async function requestRevision(id) {
  const notes = prompt("ระบุรายละเอียดที่ต้องการแก้ไข หรือปัญหาที่พบ:");
  if (notes === null) return;
  if (!notes.trim()) return alert("กรุณาระบุรายละเอียดก่อน");

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "update_status", id: id, status: "sewing", dispute_notes: notes.trim() })
    });
    const res = await response.json();
    if (res.status === "success") {
      alert("ส่งคำขอแก้ไขสำเร็จ ช่างจะดำเนินการแก้ไขให้");
      loadCustomerJobs();
    }
  } catch (e) { alert("เกิดข้อผิดพลาดในการเชื่อมต่อ"); }
}