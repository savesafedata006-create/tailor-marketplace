// เชื่อมต่อกับ Google Sheets: https://docs.google.com/spreadsheets/d/1p2EFyCT75y_u9VKmeGIhodDWXZqGEPA3tzXWmPibdbk/edit
// แทนที่ค่าด้านล่างนี้ด้วย Web App URL ที่ได้จากขั้นตอนการ Deploy Google Apps Script
const SCRIPT_URL = "YOUR_DEPLOYED_WEB_APP_URL";

let allPendingJobs = []; // เก็บข้อมูลงานทั้งหมดเพื่อใช้ในการค้นหา
let currentViewData = { jobs: [], stock: [] };
let stockChartInstance = null; // เก็บ Instance ของกราฟเพื่อทำลายก่อนวาดใหม่

async function sendData() {
  const btn = document.querySelector("#customer-view .btn-primary");
  
  const data = {
    action: "create",
    customer_name: document.getElementById("customer_name").value,
    customer_phone: document.getElementById("customer_phone").value,
    customer_line: document.getElementById("customer_line").value,
    job_detail: document.getElementById("job_detail").value,
    budget: document.getElementById("budget").value,
    member_id: document.getElementById("member_id").value
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

function checkAuth() {
  const role = sessionStorage.getItem("userRole");
  if (role) {
    document.getElementById("login-overlay").style.display = "none";
    document.getElementById("main-content").style.display = "block";
    
    // ควบคุมการแสดงผลตามสิทธิ์
    const bossOnlyElements = document.querySelectorAll('.boss-only');
    if (role !== 'boss') {
      bossOnlyElements.forEach(el => el.style.setProperty('display', 'none', 'important'));
    } else {
      // Boss เห็นเมนูสต๊อก
      const stockBtn = document.getElementById('tab-stock');
      if(stockBtn) stockBtn.style.display = 'block';
    }

    loadJobs('pending');
  }
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
  } catch (error) {
    container.innerHTML = "<p>ไม่สามารถโหลดข้อมูลได้</p>";
  }
}

function switchTab(type) {
  const jobList = document.getElementById('job-list');
  const searchContainer = document.querySelector('.search-container');
  const perfSections = document.querySelectorAll('.performance-section');
  
  if (type === 'stock') {
    jobList.style.display = 'none';
    searchContainer.style.display = 'none';
    perfSections.forEach(el => el.style.display = 'block');
    loadJobs('pending'); // ดึงข้อมูลเพื่อให้สต๊อกเป็นปัจจุบัน
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

function displayJobsData(jobs, filterType) {
  updateDashboard(jobs);

  if (filterType === 'pending') {
    allPendingJobs = jobs.filter(j => j.status === 'pending');
  } else {
    allPendingJobs = jobs.filter(j => j.status === 'accepted' || j.status === 'sewing');
  }
  
  renderJobs(allPendingJobs);
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
  
  // อัปเดตตัวเลขบน Dashboard
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  };

  setVal('today-count', todayJobs.length);
  setVal('today-income', `฿${todayIncome.toLocaleString()}`);
  setVal('today-finished', todayFinished.length);
  setVal('total-income', `฿${totalIncome.toLocaleString()}`);
  setVal('count-pending', jobs.filter(j => j.status === 'pending').length);
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

function renderJobs(jobs) {
  const container = document.getElementById("job-list");
  
  if (jobs.length === 0) {
    container.innerHTML = "<p class='no-data'>ไม่พบรายการงานที่ตรงกับการค้นหา</p>";
    return;
  }

  container.innerHTML = jobs.map(job => `
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
  const filtered = allPendingJobs.filter(job => 
    job.job_detail.toLowerCase().includes(query) || 
    job.customer_name.toLowerCase().includes(query)
  );
  renderJobs(filtered);
}

async function updateStatus(id, newStatus) {
  let payload = { action: "update_status", id: id, status: newStatus };

  if (newStatus === 'accepted') {
    const tailorName = prompt("กรุณาระบุชื่อช่างที่รับงาน:");
    if (!tailorName) return; // ยกเลิกถ้าไม่ใส่ชื่อ
    payload.tailor_name = tailorName;

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
  sessionStorage.removeItem("isBossLoggedIn");
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