// เชื่อมต่อกับ Google Sheets: https://docs.google.com/spreadsheets/d/1p2EFyCT75y_u9VKmeGIhodDWXZqGEPA3tzXWmPibdbk/edit
// แทนที่ค่าด้านล่างนี้ด้วย Web App URL ที่ได้จากขั้นตอนการ Deploy Google Apps Script
const SCRIPT_URL = "ใส่_URL_ที่ได้จาก_Apps_Script_ตรงนี้"; // เปลี่ยนเป็น URL ของคุณหลัง Deploy

let allPendingJobs = []; // เก็บข้อมูลงานทั้งหมดเพื่อใช้ในการค้นหา
let currentViewData = { jobs: [], stock: [], payroll: [] };
let stockChartInstance = null; // เก็บ Instance ของกราฟเพื่อทำลายก่อนวาดใหม่

const JOBS_PER_PAGE = 10; // จำนวนงานที่แสดงต่อหน้า
let currentPage = 1;
let revenueChartInstance = null; // เก็บ Instance ของกราฟรายได้
let categoryChartInstance = null; // เก็บ Instance ของกราฟประเภทชุด

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
    user_id: sessionStorage.getItem("userId") || "GUEST"
  };

  if (!data.customer_name || !data.customer_phone || !data.job_detail) {
    alert("กรุณากรอก ชื่อ, เบอร์โทร และรายละเอียดงาน");
    return;
  }

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
    btn.innerText = "ส่งงาน";
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

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "login", username: username, password: password })
    });
    const result = await response.json();

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
      alert(result.message || "Login ไม่สำเร็จ");
    }
  } catch (error) {
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

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(data)
    });
    const result = await response.json();

    if (result.status === "success" && result.user.role === 'customer') {
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
      alert("ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง");
    }
  } catch (e) { alert("เกิดข้อผิดพลาด"); }
}

function logoutCustomer() {
  sessionStorage.clear();
  localStorage.clear();
  location.reload();
}

function checkCustomerAuth() {
  // ปิดระบบ Login สำหรับ Demo: บังคับเป็น Boss เพื่อให้เข้าถึงได้ทุกส่วน
  const role = "boss";
  const name = "ลูกค้า (Demo Mode)";
  const userId = "DEMO-CUSTOMER-001";

  const authView = document.getElementById("auth-view");
  const customerView = document.getElementById("customer-view");
  const profileHeader = document.getElementById("user-profile-header");
  const bossReturn = document.getElementById("boss-return-link");
  const portalAccessContainer = document.getElementById("portal-access-container");

  if (customerView) {
    authView.style.display = "none";
    customerView.style.display = "block";
    
    sessionStorage.setItem("userRole", role);
    sessionStorage.setItem("userName", name);
    sessionStorage.setItem("userId", userId);

    if (portalAccessContainer) portalAccessContainer.style.display = "none"; // ซ่อนปุ่มลับเมื่อ Login แล้ว

    if (role === 'boss' && bossReturn) {
      bossReturn.style.display = "block";
    } else {
      profileHeader.style.display = "block";
    }
    document.getElementById("display-user-name").innerText = "สวัสดี, " + name;
    
    // Autofill phone if available
    // (Optional: fetch user data to get phone)
  }
}

function switchCustomerTab(type) {
  document.getElementById('order-new-section').style.display = type === 'order' ? 'block' : 'none';
  document.getElementById('order-history-section').style.display = type === 'history' ? 'block' : 'none';
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + type).classList.add('active');
  if (type === 'history') loadCustomerJobs();
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
    alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
  }
}

function checkAuth() {
  const role = sessionStorage.getItem("userRole") || localStorage.getItem("userRole");
  const loginOverlay = document.getElementById("login-overlay");
  const mainContent = document.getElementById("main-content");
  const tailorView = document.getElementById("tailor-view");

  if (role) {
    // Sync session if coming from local
    if (!sessionStorage.getItem("userRole")) {
      sessionStorage.setItem("userRole", localStorage.getItem("userRole"));
      sessionStorage.setItem("userName", localStorage.getItem("userName"));
      sessionStorage.setItem("userId", localStorage.getItem("userId"));
    }

    if (loginOverlay) loginOverlay.style.display = "none";
    if (mainContent) mainContent.style.display = "block";
    if (tailorView) tailorView.style.display = "block";
    
    // ควบคุมการแสดงผลตามสิทธิ์
    const bossOnlyElements = document.querySelectorAll('.boss-only');
    if (role !== 'boss') {
      bossOnlyElements.forEach(el => el.style.setProperty('display', 'none', 'important'));
    } else {
      const stockBtn = document.getElementById('tab-stock');
      if(stockBtn) stockBtn.style.display = 'block';
      const usersBtn = document.getElementById('tab-users');
      if(usersBtn) usersBtn.style.display = 'block';
    }
    loadJobs('pending');
  }
}

async function loadCustomerJobs() {
  const container = document.getElementById("my-jobs-list");
  const userId = sessionStorage.getItem("userId");
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

    container.innerHTML = myJobs.map(job => `
      <div class="job-card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <span class="status-badge ${job.status}">${job.status}</span>
          <small>ID: ${job.rn}</small>
        </div>
        <h3>${job.job_detail}</h3>
        <p><strong>งบประมาณ:</strong> ฿${Number(job.budget).toLocaleString()}</p>
        <p><strong>ช่างผู้ดูแล:</strong> ${job.tailor_name || 'รอดำเนินการ'}</p>
      </div>
    `).join('');
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

    displayJobsData(data.jobs, filterType);
    renderStock(data.stock);
    renderStockChart(data.stock);
    renderRevenueChart(data.jobs);
    renderCategoryChart(data.jobs);
    renderUsers(data.users);
    renderTailorStats(data.jobs, data.payroll);
    renderPayrollManager(data.payroll);
  } catch (error) {
    container.innerHTML = "<p>ไม่สามารถโหลดข้อมูลได้</p>";
  }
}

function switchTab(type) {
  const jobList = document.getElementById('job-list');
  const searchContainer = document.querySelector('.search-container');
  const perfSections = document.querySelectorAll('.performance-section');
  const userSection = document.getElementById('user-management-section');
  
  if (type === 'stock') {
    jobList.style.display = 'none';
    searchContainer.style.display = 'none';
    perfSections.forEach(el => {
      if (el.id !== 'user-management-section') el.style.display = 'block';
    });
    if (userSection) userSection.style.display = 'none';
    loadJobs('pending'); // ดึงข้อมูลเพื่อให้สต๊อกเป็นปัจจุบัน
  } else if (type === 'users') {
    jobList.style.display = 'none';
    searchContainer.style.display = 'none';
    perfSections.forEach(el => el.style.display = 'none');
    if (userSection) userSection.style.display = 'block';
    renderUsers(currentViewData.users);
  } else {
    jobList.style.display = 'grid';
    searchContainer.style.display = 'block';
    perfSections.forEach(el => el.style.display = 'none');
    if (userSection) userSection.style.display = 'none';
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

  container.innerHTML = `
    <table class="stats-table">
      <thead>
        <tr>
          <th>วัสดุ</th>
          <th>คงเหลือ</th>
          <th>สถานะ</th>
          <th>จัดการ</th>
        </tr>
      </thead>
      <tbody>
        ${displayData.map(item => {
          const isLow = Number(item.quantity) <= Number(item.min_threshold);
          return `
          <tr class="${isLow ? 'low-stock-row' : ''}">
            <td>${item.item_name}</td>
            <td>${item.quantity} ${item.unit}</td>
            <td><span class="status-badge ${isLow ? 'low-stock' : 'normal'}">
              ${isLow ? '<i class="fas fa-exclamation-triangle"></i> ของใกล้หมด' : '<i class="fas fa-check"></i> ปกติ'}
            </span></td>
            <td><button onclick="updateStockQty('${item.item_id}', ${item.quantity})" class="btn-logout"><i class="fas fa-edit"></i></button></td>
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

  // ระบบแจกแจงค่าแรงช่าง
  const tailorStats = {};
  finishedJobs.forEach(j => {
    const name = j.tailor_name || "ไม่ระบุช่าง";
    if (!tailorStats[name]) tailorStats[name] = { count: 0, total: 0 };
    tailorStats[name].count++;
    tailorStats[name].total += (Number(j.budget) || 0);
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
              <th>ค่าแรง (40%)</th>
              <th>กำไรร้าน (60%)</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(tailorStats).map(([name, stat]) => `
              <tr>
                <td><strong>${name}</strong></td>
                <td>${stat.count}</td>
                <td>฿${stat.total.toLocaleString()}</td>
                <td class="text-success">฿${(stat.total * 0.4).toLocaleString()}</td>
                <td class="text-primary">฿${(stat.total * 0.6).toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
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

  container.innerHTML = paginatedJobs.map(job => `
    <div class="job-card">
      <h3>${job.job_detail}</h3>
      <p><strong>ผู้โพสต์:</strong> ${job.customer_name}</p>
      <p><strong>ติดต่อ:</strong> ${job.customer_phone || '-'}</p>
      <p><strong>งบประมาณ:</strong> ฿${job.budget}</p>
      ${renderActionButtons(job)}
    </div>
  `).join('');

  renderPaginationControls(jobsToRender.length, totalPages);
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

  container.innerHTML = paginatedJobs.map(job => `
    <div class="job-card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <span class="status-badge ${job.status}">${job.status}</span>
        <small>${job.created_at ? job.created_at.split('T')[0] : ''}</small>
      </div>
      <h3>${job.job_detail}</h3>
      <p><strong>ผู้โพสต์:</strong> ${job.customer_name}</p>
      <p><strong>ติดต่อ:</strong> ${job.customer_phone || '-'}</p>
      <p><strong>งบประมาณ:</strong> ฿${job.budget}</p>
      ${renderActionButtons(job)}
    </div>
  `).join('');

  renderPaginationControls(jobsToRender.length, totalPages);
}

function renderActionButtons(job) {
  if (job.status === 'pending') {
    return `<button class="btn-primary" onclick="updateStatus('${job.id}', 'accepted')">รับงานนี้</button>`;
  } else if (job.status === 'accepted') {
    return `<button class="btn-primary" style="background:var(--success)" onclick="updateStatus('${job.id}', 'sewing')">เริ่มเย็บ</button>`;
  } else if (job.status === 'sewing') {
    return `<button class="btn-primary" style="background:var(--secondary)" onclick="updateStatus('${job.id}', 'finished')">แจ้งงานเสร็จ</button>`;
  }
  return '';
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
document.addEventListener('DOMContentLoaded', initPortalLongPress);
document.addEventListener('DOMContentLoaded', initThemeToggle);

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    checkCustomerAuth();
});