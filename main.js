/* ==========================
   Check Master - main.js
   نسخه پایدار بدون باگ سود
   ========================== */

let checks = [];
let referrers = ["بدون معرف"];
let futureDays = 30;

// Load from storage
function loadData() {
  checks = JSON.parse(localStorage.getItem("checks") || "[]");
  referrers = JSON.parse(localStorage.getItem("referrers") || `["بدون معرف"]`);
}

// Save all
function saveAll() {
  localStorage.setItem("checks", JSON.stringify(checks));
  localStorage.setItem("referrers", JSON.stringify(referrers));
}

/* -------------------------
   ابزارهای کمکی
   ------------------------- */

function toInt(x) {
  return parseInt(String(x).replace(/[^\d]/g, "")) || 0;
}

function fmt(x) {
  return x.toLocaleString("fa-IR");
}

// تاریخ میلادی → timestamp
function parseJalali(j) {
  try {
    const [yy, mm, dd] = j.split("/").map(Number);
    const g = JalaliDate.toGregorian(yy + 1300, mm, dd);
    return new Date(g.gy, g.gm - 1, g.gd).getTime();
  } catch {
    return null;
  }
}

// timestamp → جلالی yy/mm/dd
function toJalali(ts) {
  const d = new Date(ts);
  const j = JalaliDate.toJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return `${String(j.jy - 1300).padStart(2, "0")}/${String(j.jm).padStart(2, "0")}/${String(j.jd).padStart(2, "0")}`;
}

/* -------------------------
   محاسبه سود یک چک
   ------------------------- */
function computeProfit(principal, rate, start, end) {
  const oneDay = 86400000;
  const days = Math.max(1, Math.floor((end - start) / oneDay));
  const monthly = principal * (rate / 100);
  return Math.round((monthly / 30) * days);
}
/* -------------------------
   محاسبه و نمایش KPI ها
   ------------------------- */
function updateKPIs() {
  const now = Date.now();
  const oneDay = 86400000;

  let today = 0, month = 0, next = 0;
  let active = 0, near = 0, overdue = 0, paid = 0;

  let baseProfit = 0;
  let extProfit = 0;

  checks.forEach(ch => {
    const p = toInt(ch.principal);
    const rate = parseFloat(ch.rate);
    const profit = computeProfit(p, rate, ch.startDate, ch.endDate);

    if (ch.extendedProfit)
      extProfit += ch.extendedProfit;

    if (ch.status === "paid") {
      paid++;
      return;
    }

    baseProfit += profit;

    const daysLeft = Math.floor((ch.endDate - now) / oneDay);

    if (daysLeft < 0) overdue++;
    else if (daysLeft <= 10) near++;
    else active++;

    // امروز
    today += Math.round((p * (rate / 100)) / 30);

    // ماه جاری
    const date = new Date(now);
    if (new Date(ch.endDate).getMonth() === date.getMonth())
      month += profit;

    // 30 روز آینده
    if (ch.endDate <= now + futureDays * oneDay)
      next += profit;
  });

  // نمایش
  document.getElementById("kpiToday").innerText = fmt(today);
  document.getElementById("kpiMonth").innerText = fmt(month);
  document.getElementById("kpiNext30").innerText = fmt(next);

  document.getElementById("kpiActive").innerText = active;
  document.getElementById("kpiNear").innerText = near;
  document.getElementById("kpiOverdue").innerText = overdue;
  document.getElementById("kpiPaid").innerText = paid;

  document.getElementById("kpiTotalProfitBase").innerText = fmt(baseProfit);
  document.getElementById("kpiExtendedProfit").innerText = fmt(extProfit);
  document.getElementById("kpiTotalProfit").innerText = fmt(baseProfit + extProfit);
}

/* -------------------------
   سوییچ تب‌ها
   ------------------------- */
function switchTab(ev) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  ev.currentTarget.classList.add("active");

  const target = ev.currentTarget.dataset.target;
  document.querySelectorAll("main section").forEach(s => s.classList.add("hidden"));
  document.getElementById(target).classList.remove("hidden");
}

/* -------------------------
   تغییر تعداد روز آینده
   ------------------------- */
function changeFutureDays() {
  const n = prompt("محاسبه سود چند روز آینده؟", futureDays);
  if (!n) return;
  futureDays = Math.max(1, parseInt(n));
  document.getElementById("kpiNextDays").innerText = futureDays;
  updateKPIs();
}
/* -------------------------
   پیش‌نمایش سود
   ------------------------- */
function previewCalc() {
  const p = toInt(document.getElementById("principal").value);
  const r = parseFloat(document.getElementById("rate").value);
  const s = parseJalali(document.getElementById("startJ").value);
  const e = parseJalali(document.getElementById("endJ").value);

  if (!p || !r || !s || !e)
    return document.getElementById("previewBox").innerText = "اطلاعات ناقص است.";

  const pr = computeProfit(p, r, s, e);
  document.getElementById("previewBox").innerText = `سود این چک: ${fmt(pr)} ریال`;
}

/* -------------------------
   ساخت چک جدید
   ------------------------- */
function saveCheck() {
  const type = document.getElementById("checkType").value;
  const buyer = document.getElementById("buyerName").value.trim();
  const phone = document.getElementById("buyerPhone").value.trim();
  const ref = document.getElementById("refSelect").value;

  const principal = toInt(document.getElementById("principal").value);
  const rate = parseFloat(document.getElementById("rate").value);

  const sJ = document.getElementById("startJ").value;
  const sDate = parseJalali(sJ);

  if (type === "single") {
    const endJ = document.getElementById("endJ").value;
    const eDate = parseJalali(endJ);

    const code = document.getElementById("singleCode").value;

    checks.push({
      id: crypto.randomUUID(),
      type,
      buyer,
      phone,
      ref,
      principal,
      rate,
      startJ: sJ,
      startDate: sDate,
      endJ,
      endDate: eDate,
      code,
      label: "",
      note: "",
      status: "unpaid",
      extendedProfit: 0
    });
  }

  else {
    const months = parseInt(document.getElementById("months").value);
    let grace = parseInt(document.getElementById("graceMonths").value);
    if (grace < 1) grace = 1; // پیش فرض

    let baseDate = sDate;

    for (let i = 1; i <= months; i++) {
      const mIndex = i + (grace - 1);

      // تاریخ سررسید
      const d = new Date(sDate);
      d.setMonth(d.getMonth() + mIndex);

      const endDate = d.getTime();
      const endJ = toJalali(endDate);

      checks.push({
        id: crypto.randomUUID(),
        type,
        buyer,
        phone,
        ref,
        principal,
        rate,
        startJ: sJ,
        startDate: sDate,
        endJ,
        endDate,
        code: "",
        label: "",
        note: "",
        status: "unpaid",
        extendedProfit: 0
      });
    }
  }

  saveAll();
  alert("چک با موفقیت ذخیره شد");
  updateKPIs();
  renderManage();
}
/* -------------------------
   نمایش مدیریت
   ------------------------- */
function renderManage() {
  const box = document.getElementById("manageList");
  const q = document.getElementById("searchInput").value.trim();

  let list = checks.filter(ch => {
    if (q) {
      const S = JSON.stringify(ch);
      if (!S.includes(q)) return false;
    }
    return true;
  });

  box.innerHTML = "";
  list.forEach(ch => {
    const div = document.createElement("div");
    div.className = "check-card";
    div.innerHTML = `
      <div class="check-top">
        <div><b>${ch.buyer}</b> - ${fmt(ch.principal)} ریال</div>
        <button class="small" onclick="openEdit('${ch.id}')">ویرایش</button>
      </div>
      <div>${ch.endJ} - سود: ${fmt(computeProfit(ch.principal, ch.rate, ch.startDate, ch.endDate))}</div>
    `;
    box.appendChild(div);
  });
}

/* -------------------------
   ویرایش چک
   ------------------------- */
function openEdit(id) {
  const ch = checks.find(c => c.id === id);
  if (!ch) return;

  document.getElementById("editBack").style.display = "flex";

  document.getElementById("editId").value = ch.id;
  document.getElementById("editBuyer").value = ch.buyer;
  document.getElementById("editPhone").value = ch.phone;
  document.getElementById("editType").value = ch.type;
  document.getElementById("editCode").value = ch.code;
  document.getElementById("editLabel").value = ch.label || "";
  document.getElementById("editNote").value = ch.note || "";

  document.getElementById("editRate").value = ch.rate;
  document.getElementById("editAmount").value = fmt(ch.principal);

  document.getElementById("editStartJ").value = ch.startJ;
  document.getElementById("editStart").value = ch.startDate;

  document.getElementById("editEndJ").value = ch.endJ;
  document.getElementById("editEnd").value = ch.endDate;

  document.getElementById("editStatus").value = ch.status;

  const pr = computeProfit(ch.principal, ch.rate, ch.startDate, ch.endDate) + (ch.extendedProfit || 0);
  document.getElementById("editProfitDisplay").value = fmt(pr);

  // Referrer list
  const sel = document.getElementById("editRef");
  sel.innerHTML = "";
  referrers.forEach(r => {
    const opt = document.createElement("option");
    opt.value = r;
    opt.innerText = r;
    if (r === ch.ref) opt.selected = true;
    sel.appendChild(opt);
  });
}

function closeEdit() {
  document.getElementById("editBack").style.display = "none";
}

/* -------------------------
   ذخیره ویرایش
   ------------------------- */
function applyEdit() {
  const id = document.getElementById("editId").value;
  const ch = checks.find(c => c.id === id);

  ch.buyer = document.getElementById("editBuyer").value.trim();
  ch.phone = document.getElementById("editPhone").value.trim();
  ch.ref = document.getElementById("editRef").value;
  ch.code = document.getElementById("editCode").value;
  ch.label = document.getElementById("editLabel").value;
  ch.note = document.getElementById("editNote").value;

  ch.rate = parseFloat(document.getElementById("editRate").value);

  const ps = parseInt(document.getElementById("editAmount").value.replace(/,/g, ""));
  ch.principal = ps;

  ch.startJ = document.getElementById("editStartJ").value;
  ch.startDate = parseJalali(ch.startJ);

  ch.endJ = document.getElementById("editEndJ").value;
  ch.endDate = parseJalali(ch.endJ);

  ch.status = document.getElementById("editStatus").value;

  saveAll();
  closeEdit();
  renderManage();
  updateKPIs();
}

/* -------------------------
   تمدید چک
   ------------------------- */
function extendCheck() {
  const id = document.getElementById("editId").value;
  const ch = checks.find(c => c.id === id);

  const newEnd = prompt("تاریخ سررسید جدید (جلالی: yy/mm/dd)", ch.endJ);
  if (!newEnd) return;

  const oldProfit = computeProfit(ch.principal, ch.rate, ch.startDate, ch.endDate);
  const newDate = parseJalali(newEnd);

  const newProfit = computeProfit(ch.principal, ch.rate, ch.startDate, newDate);

  const diff = newProfit - oldProfit;

  ch.extendedProfit = (ch.extendedProfit || 0) + diff;
  ch.endJ = newEnd;
  ch.endDate = newDate;

  saveAll();
  alert("تمدید شد");
  closeEdit();
  updateKPIs();
  renderManage();
}
/* -------------------------
   نمایش جزئیات گزارش
   ------------------------- */
function openDetail(type) {
  const box = document.getElementById("detailBody");
  box.innerHTML = "";

  const now = Date.now();
  const oneDay = 86400000;

  let title = "";

  checks.forEach(ch => {
    let show = false;

    if (type === "today") show = true;
    if (type === "month") {
      if (new Date(ch.endDate).getMonth() === new Date(now).getMonth()) show = true;
    }
    if (type === "next30") {
      if (ch.endDate <= now + futureDays * oneDay) show = true;
    }
    if (type === "active") {
      if (ch.status === "unpaid" && ch.endDate > now + 10 * oneDay) show = true;
    }
    if (type === "near") {
      const left = Math.floor((ch.endDate - now) / oneDay);
      if (left <= 10 && left >= 0) show = true;
    }
    if (type === "overdue") {
      if (ch.endDate < now && ch.status === "unpaid") show = true;
    }
    if (type === "paid") {
      if (ch.status === "paid") show = true;
    }

    if (show) {
      const div = document.createElement("div");
      div.className = "check-card";
      const profit = computeProfit(ch.principal, ch.rate, ch.startDate, ch.endDate);
      div.innerHTML = `
        <div class="check-top">
          <div><b>${ch.buyer}</b> - ${fmt(ch.principal)} ریال</div>
        </div>
        <div>${ch.endJ} - سود: ${fmt(profit)}</div>
      `;
      box.appendChild(div);
    }
  });

  let map = {
    today: "سود امروز",
    month: "سود ماه جاری",
    next30: `${futureDays} روز آینده`,
    active: "چک‌های فعال",
    near: "نزدیک سررسید",
    overdue: "چک‌های معوق",
    paid: "پرداخت شده‌ها"
  };

  document.getElementById("detailTitle").innerText = map[type] || "جزئیات";
  document.getElementById("detailBack").style.display = "flex";
}

function closeDetail() {
  document.getElementById("detailBack").style.display = "none";
}

/* -------------------------
   سرچ و فیلتر
   ------------------------- */
function clearSearch() {
  document.getElementById("searchInput").value = "";
  renderManage();
}

/* -------------------------
   پشتیبان‌گیری
   ------------------------- */
function exportCSV() {
  let out = "buyer,ref,principal,rate,start,end\n";
  checks.forEach(c => {
    out += `${c.buyer},${c.ref},${c.principal},${c.rate},${c.startJ},${c.endJ}\n`;
  });
  const blob = new Blob([out], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "checks.csv";
  link.click();
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(checks, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "checks.json";
  link.click();
}

/* -------------------------
   شروع
   ------------------------- */
window.onload = () => {
  loadData();

  // لیست معرف‌ها
  const refSel = document.getElementById("refSelect");
  refSel.innerHTML = "";
  referrers.forEach(r => {
    const opt = document.createElement("option");
    opt.value = r;
    opt.innerText = r;
    refSel.appendChild(opt);
  });

  updateKPIs();
  renderManage();
};
// --- PWA: ثبت سرویس‌ورکر برای کار کردن آفلاین ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .catch(err => {
        console.log("Service Worker registration failed:", err);
      });
  });
}
