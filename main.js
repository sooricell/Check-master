// ================== Helper: digits & formatting ==================

function toEnglishDigits(str) {
  if (!str) return "";
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  const arabic = "٠١٢٢٣٤٥٦٧٨٩".replace("٢","2"); // just in case
  let res = "";
  for (const ch of String(str)) {
    const p = persian.indexOf(ch);
    if (p !== -1) { res += String(p); continue; }
    const a = arabic.indexOf(ch);
    if (a !== -1) { res += String(a); continue; }
    res += ch;
  }
  return res;
}

function onlyDigits(str) {
  return toEnglishDigits(str).replace(/\D+/g, "");
}

function formatMoney(num) {
  if (!num || isNaN(num)) return "0";
  return Number(num).toLocaleString("en-US");
}

function parseMoney(str) {
  const digits = onlyDigits(str);
  return digits ? Number(digits) : 0;
}

// ================== Jalali helpers ==================

// ورودی: yy/mm/dd → خروجی: {yy,mm,dd}
function parseJalali(str) {
  const clean = onlyDigits(str);
  if (clean.length < 6) return null;
  const yy = Number(clean.slice(0, 2));
  const mm = Number(clean.slice(2, 4));
  const dd = Number(clean.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return { yy, mm, dd };
}

function jalaliToString(j) {
  if (!j) return "";
  const pad = n => (n < 10 ? "0" + n : String(n));
  return pad(j.yy) + "/" + pad(j.mm) + "/" + pad(j.dd);
}

// هر ماه = ۳۰ روز، هر سال = ۱۲×۳۰ روز → فقط برای اختلاف روز
function jalaliToIndex(j) {
  const year = 1400 + j.yy;
  const totalMonths = year * 12 + (j.mm - 1);
  return totalMonths * 30 + (j.dd - 1);
}

function diffJalaliDays(j1, j2) {
  if (!j1 || !j2) return 0;
  return jalaliToIndex(j2) - jalaliToIndex(j1);
}

// بازه‌ی فعال هر چک (با در نظر گرفتن extraDays)
function getCheckRange(ch) {
  const s = jalaliToIndex(ch.startJ);
  const e = jalaliToIndex(ch.endJ) + (ch.extraDays || 0);
  return { start: s, end: e }; // [start, end)
}

// تعداد روز مشترک دو بازه [a1,a2) و [b1,b2)
function overlapDays(a1, a2, b1, b2) {
  const s = Math.max(a1, b1);
  const e = Math.min(a2, b2);
  return Math.max(0, e - s);
}

// تبدیل تقریبی امروز میلادی به جلالی با دقت مناسب
function todayJalaliApprox() {
  const g = new Date();
  const gy = g.getFullYear();
  const gm = g.getMonth() + 1;
  const gd = g.getDate();

  const g_d_m = [0,31,59,90,120,151,181,212,243,273,304,334];
  let jy, jm, jd;
  let gy2 = gy - 1600;
  let gm2 = gm - 1;
  let gd2 = gd - 1;
  let gDayNo =
    365 * gy2 +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400);

  gDayNo += g_d_m[gm2] + gd2;
  if (gm2 > 1 && ((gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0)) {
    gDayNo++;
  }
  let jDayNo = gDayNo - 79;
  const jNp = Math.floor(jDayNo / 12053);
  jDayNo %= 12053;
  jy = 979 + 33 * jNp + 4 * Math.floor(jDayNo / 1461);
  jDayNo %= 1461;
  if (jDayNo >= 366) {
    jy += Math.floor((jDayNo - 366) / 365);
    jDayNo = (jDayNo - 366) % 365;
  }
  const jMonthDays = [31,31,31,31,31,31,30,30,30,30,30,29];
  for (jm = 0; jm < 11 && jDayNo >= jMonthDays[jm]; jm++) {
    jDayNo -= jMonthDays[jm];
  }
  jd = jDayNo + 1;
  const yy = jy % 100;
  return { yy, mm: jm + 1, dd: jd };
}

// ================== State & storage ==================

const STORAGE_KEY = "checkMaster_v1";

let state = {
  referrers: ["بدون معرف"],
  checks: [],
  futureDays: 30
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.checks)) {
      state = Object.assign({}, state, parsed);
      if (!state.referrers.includes("بدون معرف")) {
        state.referrers.unshift("بدون معرف");
      }
    }
  } catch (e) {
    console.log("loadState error", e);
  }
}

function saveState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        referrers: state.referrers,
        checks: state.checks,
        futureDays: state.futureDays
      })
    );
  } catch (e) {
    console.log("saveState error", e);
  }
}

function genId() {
  return "c_" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
}

// ================== Init ==================

window.addEventListener("DOMContentLoaded", () => {
  loadState();
  setupInputHandlers();
  renderRefSelects();
  updateFutureDaysLabel();
  updateKPIs();
  renderManage();

  // ثبت سرویس‌ورکر برای کار آفلاین
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(err =>
      console.log("SW register error", err)
    );
  }
});

// جلوگیری از زوم با دابل‌تپ
let lastTouchEnd = 0;
document.addEventListener(
  "touchend",
  e => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false }
);

// سوییچ تب‌ها
function switchTab(ev) {
  const targetId = ev.currentTarget.getAttribute("data-target");
  document.querySelectorAll("section[id^='view-']").forEach(sec =>
    sec.classList.add("hidden")
  );
  document.querySelectorAll(".tab").forEach(t =>
    t.classList.remove("active")
  );
  document.getElementById(targetId).classList.remove("hidden");
  ev.currentTarget.classList.add("active");
}

// ================== Input handlers ==================

function setupInputHandlers() {
  const doc = document;

  doc.addEventListener("input", e => {
    const el = e.target;

    if (el.classList.contains("money-input")) {
      const digits = onlyDigits(el.value).slice(0, 15);
      const num = digits ? Number(digits) : 0;
      el.value = digits ? formatMoney(num) : "";
    } else if (el.classList.contains("numeric-int")) {
      el.value = onlyDigits(el.value).slice(0, 6);
    } else if (el.classList.contains("numeric-dec")) {
      let v = toEnglishDigits(el.value).replace(/[^0-9.]/g, "");
      const parts = v.split(".");
      if (parts.length > 2) v = parts[0] + "." + parts.slice(1).join("");
      const m = v.match(/^(\d{0,4})(\.\d{0,2})?/);
      el.value = m ? (m[1] || "") + (m[2] || "") : "";
    } else if (el.classList.contains("jalali-input")) {
      let d = onlyDigits(el.value).slice(0, 6);
      let out = "";
      if (d.length <= 2) out = d;
      else if (d.length <= 4) out = d.slice(0, 2) + "/" + d.slice(2);
      else out = d.slice(0, 2) + "/" + d.slice(2, 4) + "/" + d.slice(4);
      el.value = out;
    } else if (el.classList.contains("phone-input")) {
      el.value = onlyDigits(el.value).slice(0, 11);
    } else if (el.classList.contains("code-16")) {
      el.value = onlyDigits(el.value).slice(0, 16);
    }
  });

  const typeSelect = document.getElementById("checkType");
  if (typeSelect) {
    typeSelect.addEventListener("change", handleCheckTypeChange);
    handleCheckTypeChange();
  }

  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", renderManage);
  }

  const fromJ = document.getElementById("fromJ");
  const toJ = document.getElementById("toJ");
  if (fromJ) fromJ.addEventListener("input", renderManage);
  if (toJ) toJ.addEventListener("input", renderManage);

  const months = document.getElementById("months");
  const grace = document.getElementById("graceMonths");
  if (months) months.addEventListener("input", buildMonthlyUI);
  if (grace) grace.addEventListener("input", buildMonthlyUI);
}

function handleCheckTypeChange() {
  const type = document.getElementById("checkType").value;
  const singleExtra = document.getElementById("singleExtra");
  const singleEndWrap = document.getElementById("singleEndWrap");
  const monthlyExtra = document.getElementById("monthlyExtra");

  if (type === "single") {
    singleExtra.classList.remove("hidden");
    singleEndWrap.style.display = "";
    monthlyExtra.classList.add("hidden");
  } else {
    singleExtra.classList.add("hidden");
    singleEndWrap.style.display = "none";
    monthlyExtra.classList.remove("hidden");
  }
}

// ================== Referrers ==================

function renderRefSelects() {
  const refSelect = document.getElementById("refSelect");
  const editRef = document.getElementById("editRef");

  const fill = sel => {
    if (!sel) return;
    sel.innerHTML = "";
    state.referrers.forEach(r => {
      const opt = document.createElement("option");
      opt.value = r;
      opt.textContent = r;
      sel.appendChild(opt);
    });
  };

  fill(refSelect);
  fill(editRef);
}

function addReferrer() {
  const inp = document.getElementById("newReferrer");
  if (!inp) return;
  const name = inp.value.trim();
  if (!name) return;
  if (!state.referrers.includes(name)) {
    state.referrers.push(name);
    saveState();
    renderRefSelects();
  }
  inp.value = "";
}

// ================== Build checks from form ==================

function getFormBaseData() {
  const type = document.getElementById("checkType").value;
  const ref = document.getElementById("refSelect").value || "بدون معرف";
  const buyer = document.getElementById("buyerName").value.trim();
  const phone = document.getElementById("buyerPhone").value.trim();
  const principal = parseMoney(document.getElementById("principal").value);
  const rate = Number(toEnglishDigits(document.getElementById("rate").value));
  const startJStr = document.getElementById("startJ").value;
  const startJ = parseJalali(startJStr);

  if (!buyer) throw new Error("نام خریدار خالی است.");
  if (!principal || principal <= 0) throw new Error("مبلغ اصل را درست وارد کن.");
  if (!rate || rate <= 0) throw new Error("درصد سود را درست وارد کن.");
  if (!startJ) throw new Error("تاریخ صدور را به صورت yy/mm/dd وارد کن.");

  return { type, ref, buyer, phone, principal, rate, startJ, startJStr };
}

function buildSingleCheckFromForm() {
  const base = getFormBaseData();
  const endJStr = document.getElementById("endJ").value;
  const endJ = parseJalali(endJStr);
  if (!endJ) throw new Error("تاریخ سررسید را به صورت yy/mm/dd وارد کن.");
  const code = document.getElementById("singleCode").value.trim();

  const check = {
    id: genId(),
    type: "single",
    seriesId: null,
    index: 1,
    ref: base.ref,
    buyer: base.buyer,
    phone: base.phone,
    principal: base.principal,
    rate: base.rate,
    startJ: base.startJ,
    startJStr: base.startJStr,
    endJ,
    endJStr,
    amount: 0,
    code,
    label: "",
    note: "",
    status: "unpaid",
    extraDays: 0,
    extraProfit: 0
  };

  return [check];
}

function buildMonthlyChecksFromForm() {
  const base = getFormBaseData();
  const months = Number(toEnglishDigits(document.getElementById("months").value));
  const graceMonths = Number(
    toEnglishDigits(document.getElementById("graceMonths").value || "0")
  );

  if (!months || months <= 0 || months > 36)
    throw new Error("تعداد ماه باید بین 1 تا 36 باشد.");

  const seriesId = genId();
  const checks = [];
  const monthlyList = document.getElementById("monthlyList");
  const rows = monthlyList.querySelectorAll("[data-month-index]");

  if (rows.length > 0) {
    rows.forEach(row => {
      const idx = Number(row.getAttribute("data-month-index"));
      const endJInput = row.querySelector(".m-end");
      const codeInput = row.querySelector(".m-code");
      const amtInput = row.querySelector(".m-amount");

      const endJStr = endJInput.value;
      const endJ = parseJalali(endJStr);
      if (!endJ)
        throw new Error("تاریخ سررسید قسط " + idx + " نامعتبر است.");

      const code = codeInput.value.trim();
      const amount = parseMoney(amtInput.value);

      checks.push({
        id: genId(),
        type: "monthly",
        seriesId,
        index: idx,
        ref: base.ref,
        buyer: base.buyer,
        phone: base.phone,
        principal: base.principal,
        rate: base.rate,
        startJ: base.startJ,
        startJStr: base.startJStr,
        endJ,
        endJStr,
        amount,
        code,
        label: "",
        note: "",
        status: "unpaid",
        extraDays: 0,
        extraProfit: 0
      });
    });
    return checks;
  }

  // اگر UI ساخته نشده باشد، خودمان تاریخ‌ها را می‌سازیم
  const baseIndex = jalaliToIndex(base.startJ);
  for (let i = 0; i < months; i++) {
    const monthOffset = graceMonths + i;
    const endIndex = baseIndex + monthOffset * 30;
    const totalMonths = Math.floor(endIndex / 30);
    const dayInMonth = (endIndex % 30) + 1;
    const year = Math.floor(totalMonths / 12);
    const month = (totalMonths % 12) + 1;
    const jy = year - 1400;
    const endJ = { yy: jy, mm: month, dd: dayInMonth };
    const endJStr = jalaliToString(endJ);

    checks.push({
      id: genId(),
      type: "monthly",
      seriesId,
      index: i + 1,
      ref: base.ref,
      buyer: base.buyer,
      phone: base.phone,
      principal: base.principal,
      rate: base.rate,
      startJ: base.startJ,
      startJStr: base.startJStr,
      endJ,
      endJStr,
      amount: 0,
      code: "",
      label: "",
      note: "",
      status: "unpaid",
      extraDays: 0,
      extraProfit: 0
    });
  }

  return checks;
}

function buildMonthlyUI() {
  const list = document.getElementById("monthlyList");
  if (!list) return;
  try {
    const checks = buildMonthlyChecksFromForm();
    list.innerHTML = "";
    checks.forEach(ch => {
      const row = document.createElement("div");
      row.className = "check-card";
      row.setAttribute("data-month-index", String(ch.index));
      row.innerHTML = `
        <div class="row">
          <div>
            <label>قسط ${ch.index} - تاریخ سررسید (جلالی)</label>
            <input class="jalali-input m-end" value="${ch.endJStr}">
          </div>
          <div>
            <label>شناسه ۱۶ رقمی</label>
            <input class="code-16 m-code" maxlength="16" inputmode="numeric" placeholder="فقط عدد">
          </div>
        </div>
        <div class="row">
          <div>
            <label>مبلغ چک (نمایشی)</label>
            <input class="money-input m-amount" data-money="1" placeholder="مثلاً 120,000,000">
          </div>
        </div>
      `;
      list.appendChild(row);
    });
  } catch (e) {
    list.innerHTML =
      '<div class="tiny" style="color:#fecaca;">' + e.message + "</div>";
  }
}

// ================== Profit calculations ==================

function calcProfitForCheck(ch) {
  const range = getCheckRange(ch);
  const days = range.end - range.start;
  const extra = ch.extraProfit || 0;
  if (days <= 0) return { base: 0, extra, total: extra };
  const baseProfit = ch.principal * (ch.rate / 100) * (days / 30);
  return { base: baseProfit, extra, total: baseProfit + extra };
}

// سود یک چک در یک بازه‌ی مشخص [s,e)
function intervalProfit(ch, s, e) {
  const r = getCheckRange(ch);
  const d = overlapDays(r.start, r.end, s, e);
  if (d <= 0) return 0;
  return ch.principal * (ch.rate / 100) * (d / 30);
}

function previewCalc() {
  const box = document.getElementById("previewBox");
  box.textContent = "";
  try {
    const type = document.getElementById("checkType").value;
    let checks =
      type === "single"
        ? buildSingleCheckFromForm()
        : buildMonthlyChecksFromForm();

    let totalProfit = 0;
    checks.forEach(ch => {
      totalProfit += calcProfitForCheck(ch).total;
    });

    box.innerHTML =
      "تعداد چک‌ها: <b>" +
      checks.length +
      "</b> | سود کل تقریبی: <b>" +
      formatMoney(Math.round(totalProfit)) +
      "</b> ریال";
  } catch (e) {
    box.innerHTML =
      '<span style="color:#fecaca;">' + e.message + "</span>";
  }
}

function saveCheck() {
  try {
    const type = document.getElementById("checkType").value;
    let checks =
      type === "single"
        ? buildSingleCheckFromForm()
        : buildMonthlyChecksFromForm();

    state.checks = state.checks.concat(checks);
    saveState();

    document.getElementById("buyerName").value = "";
    document.getElementById("buyerPhone").value = "";
    document.getElementById("principal").value = "";
    document.getElementById("rate").value = "";
    document.getElementById("startJ").value = "";
    document.getElementById("endJ").value = "";
    document.getElementById("singleCode").value = "";
    document.getElementById("months").value = "";
    document.getElementById("graceMonths").value = "1";
    document.getElementById("monthlyList").innerHTML = "";
    document.getElementById("previewBox").textContent = "";

    updateKPIs();
    renderManage();

    alert("چک‌ها با موفقیت ذخیره شدند.");
  } catch (e) {
    alert("خطا در ذخیره: " + e.message);
  }
}

// ================== KPI ==================

function updateFutureDaysLabel() {
  const el = document.getElementById("kpiNextDays");
  if (el) el.textContent = String(state.futureDays);
}

function changeFutureDays() {
  const v = prompt("چند روز آینده را ببینیم؟", String(state.futureDays));
  if (!v) return;
  const n = Number(toEnglishDigits(v));
  if (!n || n < 1 || n > 365) {
    alert("عدد بین ۱ تا ۳۶۵ بده.");
    return;
  }
  state.futureDays = n;
  saveState();
  updateFutureDaysLabel();
  updateKPIs();
}

function updateKPIs() {
  const todayJ = todayJalaliApprox();
  const todayIdx = jalaliToIndex(todayJ);
  const monthStart = { yy: todayJ.yy, mm: todayJ.mm, dd: 1 };
  const monthStartIdx = jalaliToIndex(monthStart);
  const monthEndIdx = monthStartIdx + 30;
  const futureStartIdx = todayIdx;
  const futureEndIdx = todayIdx + state.futureDays;

  let todayProfit = 0;
  let monthProfit = 0;
  let futureProfit = 0;
  let totalBase = 0;
  let totalExtra = 0;

  let active = 0;
  let near = 0;
  let overdue = 0;
  let paid = 0;

  state.checks.forEach(ch => {
    const r = getCheckRange(ch);
    const full = calcProfitForCheck(ch);
    totalBase += full.base;
    totalExtra += full.extra;

    const daily = intervalProfit(ch, todayIdx, todayIdx + 1);
    todayProfit += daily;

    monthProfit += intervalProfit(ch, monthStartIdx, monthEndIdx);
    futureProfit += intervalProfit(ch, futureStartIdx, futureEndIdx);

    const dueIdx = jalaliToIndex(ch.endJ);
    const diffToDue = dueIdx - todayIdx;

    if (ch.status === "paid") {
      paid++;
    } else {
      active++;
      if (diffToDue < 0) overdue++;
      else if (diffToDue >= 0 && diffToDue <= 10) near++;
    }
  });

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = formatMoney(Math.round(val));
  };

  set("kpiToday", todayProfit);
  set("kpiMonth", monthProfit);
  set("kpiNext30", futureProfit);

  const elA = document.getElementById("kpiActive");
  const elN = document.getElementById("kpiNear");
  const elO = document.getElementById("kpiOverdue");
  const elP = document.getElementById("kpiPaid");
  if (elA) elA.textContent = String(active);
  if (elN) elN.textContent = String(near);
  if (elO) elO.textContent = String(overdue);
  if (elP) elP.textContent = String(paid);

  set("kpiTotalProfitBase", totalBase);
  set("kpiExtendedProfit", totalExtra);
  set("kpiTotalProfit", totalBase + totalExtra);
}

// ================== Manage list ==================

function getStatusInfo(ch) {
  const todayIdx = jalaliToIndex(todayJalaliApprox());
  const dueIdx = jalaliToIndex(ch.endJ);
  const diffToDue = dueIdx - todayIdx;

  if (ch.status === "paid") {
    return { cls: "st-paid", text: "پرداخت‌شده" };
  }
  if (diffToDue < 0) return { cls: "st-overdue", text: "معوق" };
  if (diffToDue <= 10) return { cls: "st-near", text: "نزدیک سررسید" };
  return { cls: "st-unpaid", text: "فعال" };
}

function renderManage() {
  const list = document.getElementById("manageList");
  if (!list) return;

  const mode = document.getElementById("manageMode").value;
  const statusFilter = document.getElementById("statusFilter").value;
  const search = (document.getElementById("searchInput").value || "")
    .toLowerCase()
    .trim();

  const fromJ = parseJalali(document.getElementById("fromJ").value);
  const toJ = parseJalali(document.getElementById("toJ").value);
  const fromIdx = fromJ ? jalaliToIndex(fromJ) : null;
  const toIdx = toJ ? jalaliToIndex(toJ) : null;

  let filtered = state.checks.slice();

  filtered = filtered.filter(ch => {
    if (statusFilter === "paid" && ch.status !== "paid") return false;
    if (statusFilter === "unpaid" && ch.status === "paid") return false;

    if (fromIdx !== null || toIdx !== null) {
      const d = jalaliToIndex(ch.endJ);
      if (fromIdx !== null && d < fromIdx) return false;
      if (toIdx !== null && d > toIdx) return false;
    }

    if (search) {
      const hay = (
        ch.buyer +
        " " +
        ch.ref +
        " " +
        (ch.code || "") +
        " " +
        (ch.label || "") +
        " " +
        (ch.phone || "")
      )
        .toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  list.innerHTML = "";

  if (!filtered.length) {
    list.innerHTML =
      '<div class="tiny" style="padding:4px;">هیچ چکی مطابق فیلترها پیدا نشد.</div>';
    return;
  }

  if (mode === "folders") {
    const byRef = new Map();
    filtered.forEach(ch => {
      if (!byRef.has(ch.ref)) byRef.set(ch.ref, []);
      byRef.get(ch.ref).push(ch);
    });

    byRef.forEach((checks, ref) => {
      const folder = document.createElement("div");
      folder.className = "folder";
      const unpaidCount = checks.filter(c => c.status !== "paid").length;
      const paidCount = checks.length - unpaidCount;
      folder.innerHTML = `
        <div class="folder-main">
          <div class="folder-name">${ref}</div>
          <div class="folder-meta">
            ${checks.length} چک | فعال: ${unpaidCount} | پرداخت‌شده: ${paidCount}
          </div>
        </div>
        <div class="folder-badge">نمایش جزئیات زیر</div>
      `;
      list.appendChild(folder);

      checks
        .sort((a, b) => jalaliToIndex(a.endJ) - jalaliToIndex(b.endJ))
        .forEach(ch => list.appendChild(buildCheckCard(ch)));
    });
  } else {
    filtered
      .sort((a, b) => jalaliToIndex(a.endJ) - jalaliToIndex(b.endJ))
      .forEach(ch => list.appendChild(buildCheckCard(ch)));
  }
}

function buildCheckCard(ch) {
  const div = document.createElement("div");
  div.className = "check-card";
  const st = getStatusInfo(ch);
  const p = calcProfitForCheck(ch);

  div.innerHTML = `
    <div class="check-top">
      <div>
        <div><b>${ch.buyer}</b> – <span class="tiny">${ch.ref}</span></div>
        <div class="tiny">
          سررسید: ${ch.endJStr} | اصل: ${formatMoney(ch.principal)} | سود کل: ${formatMoney(Math.round(p.total))}
        </div>
      </div>
      <div class="status-pill ${st.cls}">${st.text}</div>
    </div>
    <div class="check-actions">
      <button class="small" onclick="openEdit('${ch.id}')">ویرایش / تمدید</button>
      <button class="small" onclick="togglePaid('${ch.id}')">
        ${ch.status === "paid" ? "برگردان به فعال" : "علامت به پرداخت‌شده"}
      </button>
    </div>
  `;
  return div;
}

function clearSearch() {
  const s = document.getElementById("searchInput");
  if (s) s.value = "";
  renderManage();
}

function clearFilters() {
  const fromJ = document.getElementById("fromJ");
  const toJ = document.getElementById("toJ");
  const status = document.getElementById("statusFilter");
  if (fromJ) fromJ.value = "";
  if (toJ) toJ.value = "";
  if (status) status.value = "any";
  renderManage();
}

function togglePaid(id) {
  const ch = state.checks.find(c => c.id === id);
  if (!ch) return;
  ch.status = ch.status === "paid" ? "unpaid" : "paid";
  saveState();
  updateKPIs();
  renderManage();
}

// ================== Detail overlay ==================

function openDetail(kind) {
  const back = document.getElementById("detailBack");
  const title = document.getElementById("detailTitle");
  const body = document.getElementById("detailBody");
  if (!back || !title || !body) return;

  const todayJ = todayJalaliApprox();
  const todayIdx = jalaliToIndex(todayJ);
  const monthStart = { yy: todayJ.yy, mm: todayJ.mm, dd: 1 };
  const monthStartIdx = jalaliToIndex(monthStart);
  const monthEndIdx = monthStartIdx + 30;
  const futureStartIdx = todayIdx;
  const futureEndIdx = todayIdx + state.futureDays;

  let checks = [];
  let profitFn = () => 0;

  if (kind === "today") {
    title.textContent = "سود امروز";
    profitFn = ch => intervalProfit(ch, todayIdx, todayIdx + 1);
    checks = state.checks.slice();
  } else if (kind === "month") {
    title.textContent = "سود ماه جاری";
    profitFn = ch => intervalProfit(ch, monthStartIdx, monthEndIdx);
    checks = state.checks.slice();
  } else if (kind === "next30") {
    title.textContent = `سود ${state.futureDays} روز آینده`;
    profitFn = ch => intervalProfit(ch, futureStartIdx, futureEndIdx);
    checks = state.checks.slice();
  } else if (kind === "active") {
    title.textContent = "چک‌های فعال";
    checks = state.checks.filter(c => c.status !== "paid");
  } else if (kind === "near") {
    title.textContent = "نزدیک سررسید (۱۰ روز)";
    checks = state.checks.filter(c => {
      const d = jalaliToIndex(c.endJ) - todayIdx;
      return c.status !== "paid" && d >= 0 && d <= 10;
    });
  } else if (kind === "overdue") {
    title.textContent = "چک‌های معوق";
    checks = state.checks.filter(c => {
      const d = jalaliToIndex(c.endJ) - todayIdx;
      return c.status !== "paid" && d < 0;
    });
  } else if (kind === "paid") {
    title.textContent = "چک‌های پرداخت‌شده";
    checks = state.checks.filter(c => c.status === "paid");
  }

  let total = 0;
  let html = "";

  if (profitFn) {
    checks.forEach(ch => (total += profitFn(ch)));
  }

  html += `<div class="tiny">تعداد چک‌ها: ${checks.length} | جمع سود این بخش: ${formatMoney(
    Math.round(total)
  )} ریال</div><div class="sep"></div>`;

  if (!checks.length) {
    html += '<div class="tiny">چکی در این بخش وجود ندارد.</div>';
  } else {
    checks
      .sort((a, b) => jalaliToIndex(a.endJ) - jalaliToIndex(b.endJ))
      .forEach(ch => {
        const p = calcProfitForCheck(ch);
        const st = getStatusInfo(ch);
        html += `
          <div class="check-card">
            <div class="check-top">
              <div>
                <div><b>${ch.buyer}</b> – <span class="tiny">${ch.ref}</span></div>
                <div class="tiny">
                  صدور: ${ch.startJStr} | سررسید: ${ch.endJStr}
                </div>
                <div class="tiny">
                  اصل: ${formatMoney(ch.principal)} | سود کل: ${formatMoney(Math.round(p.total))}
                </div>
              </div>
              <div class="status-pill ${st.cls}">${st.text}</div>
            </div>
          </div>
        `;
      });
  }

  body.innerHTML = html;
  back.style.display = "flex";
}

function closeDetail() {
  const back = document.getElementById("detailBack");
  if (back) back.style.display = "none";
}

// ================== Edit / extend overlay ==================

function openEdit(id) {
  const ch = state.checks.find(c => c.id === id);
  if (!ch) return;
  const back = document.getElementById("editBack");
  if (!back) return;

  renderRefSelects();

  document.getElementById("editId").value = ch.id;
  document.getElementById("editBuyer").value = ch.buyer;
  document.getElementById("editRef").value = ch.ref;
  document.getElementById("editType").value = ch.type;
  document.getElementById("editPhone").value = ch.phone || "";
  document.getElementById("editCode").value = ch.code || "";
  document.getElementById("editLabel").value = ch.label || "";
  document.getElementById("editNote").value = ch.note || "";
  document.getElementById("editAmount").value = ch.amount
    ? formatMoney(ch.amount)
    : "";
  document.getElementById("editRate").value = ch.rate;
  document.getElementById("editStartJ").value = ch.startJStr;
  document.getElementById("editEndJ").value = ch.endJStr;
  document.getElementById("editStatus").value = ch.status;

  const p = calcProfitForCheck(ch);
  document.getElementById("editProfitDisplay").value = formatMoney(
    Math.round(p.total)
  );

  back.style.display = "flex";
}

function closeEdit() {
  const back = document.getElementById("editBack");
  if (back) back.style.display = "none";
}

function applyEdit() {
  try {
    const id = document.getElementById("editId").value;
    const ch = state.checks.find(c => c.id === id);
    if (!ch) return;

    ch.buyer = document.getElementById("editBuyer").value.trim();
    ch.ref = document.getElementById("editRef").value || "بدون معرف";
    ch.phone = document.getElementById("editPhone").value.trim();
    ch.code = document.getElementById("editCode").value.trim();
    ch.label = document.getElementById("editLabel").value.trim();
    ch.note = document.getElementById("editNote").value.trim();
    ch.amount = parseMoney(document.getElementById("editAmount").value);
    ch.rate = Number(
      toEnglishDigits(document.getElementById("editRate").value)
    );
    ch.status = document.getElementById("editStatus").value;

    const sStr = document.getElementById("editStartJ").value;
    const eStr = document.getElementById("editEndJ").value;
    const sJ = parseJalali(sStr);
    const eJ = parseJalali(eStr);
    if (!sJ || !eJ) throw new Error("تاریخ‌ها را به صورت yy/mm/dd وارد کن.");
    ch.startJ = sJ;
    ch.startJStr = jalaliToString(sJ);
    ch.endJ = eJ;
    ch.endJStr = jalaliToString(eJ);

    saveState();
    updateKPIs();
    renderManage();
    closeEdit();
  } catch (e) {
    alert("خطا در ویرایش: " + e.message);
  }
}

function extendCheck() {
  try {
    const id = document.getElementById("editId").value;
    const ch = state.checks.find(c => c.id === id);
    if (!ch) return;

    const newEndStr = document.getElementById("editEndJ").value;
    const newEndJ = parseJalali(newEndStr);
    if (!newEndJ) throw new Error("تاریخ سررسید جدید معتبر نیست.");

    const oldEndIdx = jalaliToIndex(ch.endJ);
    const newEndIdx = jalaliToIndex(newEndJ);
    const diff = newEndIdx - oldEndIdx;
    if (diff <= 0) throw new Error("تاریخ جدید باید بعد از تاریخ قبلی باشد.");

    const addProfit = ch.principal * (ch.rate / 100) * (diff / 30);

    ch.endJ = newEndJ;
    ch.endJStr = jalaliToString(newEndJ);
    ch.extraDays = (ch.extraDays || 0) + diff;
    ch.extraProfit = (ch.extraProfit || 0) + addProfit;
    ch.status = "unpaid";

    saveState();
    updateKPIs();
    renderManage();

    const p = calcProfitForCheck(ch);
    document.getElementById("editProfitDisplay").value = formatMoney(
      Math.round(p.total)
    );

    alert("تمدید با موفقیت ثبت شد.");
  } catch (e) {
    alert("خطا در تمدید: " + e.message);
  }
}

// ================== Backup & reset ==================

function exportCSV() {
  if (!state.checks.length) {
    alert("چکی برای خروجی وجود ندارد.");
    return;
  }
  const header = [
    "id",
    "type",
    "seriesId",
    "index",
    "ref",
    "buyer",
    "phone",
    "principal",
    "rate",
    "startJ",
    "endJ",
    "amount",
    "code",
    "label",
    "note",
    "status",
    "extraDays",
    "extraProfit"
  ];
  const rows = state.checks.map(ch =>
    header
      .map(k => String(ch[k] !== undefined ? ch[k] : ""))
      .join(",")
  );
  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "checks.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportJSON() {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "checkmaster-backup.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function wipeData() {
  if (!confirm("همه داده‌ها پاک شود؟")) return;
  state = {
    referrers: ["بدون معرف"],
    checks: [],
    futureDays: 30
  };
  saveState();
  renderRefSelects();
  updateFutureDaysLabel();
  updateKPIs();
  renderManage();
  alert("همه داده‌ها پاک شد.");
}
