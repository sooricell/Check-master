// ====== Helper functions for digits & formatting ======

function toEnglishDigits(str) {
  if (!str) return "";
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  let res = "";
  for (let ch of String(str)) {
    const pIndex = persian.indexOf(ch);
    if (pIndex !== -1) {
      res += String(pIndex);
      continue;
    }
    const aIndex = arabic.indexOf(ch);
    if (aIndex !== -1) {
      res += String(aIndex);
      continue;
    }
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

// تاریخ جلالی به صورت yy/mm/dd نگه می‌داریم و برای اختلاف روز از مدل ساده استفاده می‌کنیم
// هر ماه = 30 روز، سال = 12*30 روز (برای سود کاملاً سازگاره)
function parseJalali(str) {
  const clean = onlyDigits(str);
  if (clean.length < 6) return null; // yy mm dd => حداقل ۶ رقم لازم
  const yy = Number(clean.slice(0, 2));
  const mm = Number(clean.slice(2, 4));
  const dd = Number(clean.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return { yy, mm, dd };
}

// تبدیل yy/mm/dd به یک اندیس روز فرضی برای محاسبه اختلاف
function jalaliToIndex(j) {
  // سال مبنا 1400 + yy
  const year = 1400 + j.yy;
  const totalMonths = year * 12 + (j.mm - 1);
  const index = totalMonths * 30 + (j.dd - 1);
  return index;
}

function diffJalaliDays(j1, j2) {
  if (!j1 || !j2) return 0;
  const d1 = jalaliToIndex(j1);
  const d2 = jalaliToIndex(j2);
  return d2 - d1;
}

// امروز را هم به صورت تقریبی جلالی (فقط برای طبقه‌بندی سود) محاسبه می‌کنیم
function todayJalaliApprox() {
  // تبدیل ساده گرگوری به جلالی با تقریب، برای گزارش کافی است
  const g = new Date();
  const gy = g.getFullYear();
  const gm = g.getMonth() + 1;
  const gd = g.getDate();

  // الگوریتم تبدیل ساده‌سازی‌شده (برای ماه‌های اخیر معمولاً درست است)
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
  jDayNo = jDayNo % 12053;
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

  // فقط دو رقم آخر سال می‌خواهیم
  const yy = jy % 100;
  return { yy, mm: jm + 1, dd: jd };
}

function jalaliToString(j) {
  if (!j) return "";
  const pad = n => (n < 10 ? "0" + n : String(n));
  return pad(j.yy) + "/" + pad(j.mm) + "/" + pad(j.dd);
}

// ====== State & storage ======
const STORAGE_KEY = "checkMaster_v1";

let state = {
  referrers: ["بدون معرف"],
  checks: [], // هر چک یک شیء با فیلدهای: id, type, seriesId, index, ref, buyer, phone, principal, rate, startJ, endJ, amount, code, label, note, status, extraDays, extraProfit
  futureDays: 30
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.checks)) {
      state = Object.assign({}, state, parsed);
      // تضمین اینکه "بدون معرف" وجود دارد
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
  return (
    "c_" +
    Math.random().toString(36).slice(2, 8) +
    Date.now().toString(36)
  );
}

// ====== Init & global wiring ======

window.addEventListener("DOMContentLoaded", () => {
  loadState();
  setupInputHandlers();
  renderRefSelects();
  updateKPIs();
  renderManage();
});

// جلوگیری از زوم با دابل-تپ روی iOS
let lastTouchEnd = 0;
document.addEventListener(
  "touchend",
  function (event) {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  },
  { passive: false }
);

// سوییچ تب‌ها (از HTML صدا زده می‌شود)
function switchTab(ev) {
  const targetId = ev.currentTarget.getAttribute("data-target");
  document.querySelectorAll("section[id^='view-']").forEach(sec => {
    sec.classList.add("hidden");
  });
  document.querySelectorAll(".tab").forEach(t => {
    t.classList.remove("active");
  });
  document.getElementById(targetId).classList.remove("hidden");
  ev.currentTarget.classList.add("active");
}
// ====== Input handlers (money, numeric, jalali, etc.) ======

function setupInputHandlers() {
  const doc = document;

  // فرمت مبلغ‌ها
  doc.addEventListener("input", function (e) {
    const el = e.target;
    if (el.classList.contains("money-input")) {
      const digits = onlyDigits(el.value).slice(0, 15); // حداکثر ۱۵ رقم
      const num = digits ? Number(digits) : 0;
      el.value = digits ? formatMoney(num) : "";
    } else if (el.classList.contains("numeric-int")) {
      el.value = onlyDigits(el.value).slice(0, 6);
    } else if (el.classList.contains("numeric-dec")) {
      let v = toEnglishDigits(el.value);
      v = v.replace(/[^0-9.]/g, "");
      // فقط یک نقطه
      const parts = v.split(".");
      if (parts.length > 2) {
        v = parts[0] + "." + parts.slice(1).join("");
      }
      // محدود کردن به 2 رقم اعشار
      const m = v.match(/^(\d{0,4})(\.\d{0,2})?/);
      el.value = m ? (m[1] || "") + (m[2] || "") : "";
    } else if (el.classList.contains("jalali-input")) {
      let d = onlyDigits(el.value).slice(0, 6);
      let out = "";
      if (d.length <= 2) {
        out = d;
      } else if (d.length <= 4) {
        out = d.slice(0, 2) + "/" + d.slice(2);
      } else {
        out = d.slice(0, 2) + "/" + d.slice(2, 4) + "/" + d.slice(4);
      }
      el.value = out;
    } else if (el.classList.contains("phone-input")) {
      el.value = onlyDigits(el.value).slice(0, 11);
    } else if (el.classList.contains("code-16")) {
      el.value = onlyDigits(el.value).slice(0, 16);
    }
  });

  // وقتی نوع چک عوض می‌شود، قسمت‌های مربوطه را نشان/مخفی می‌کنیم
  const typeSelect = document.getElementById("checkType");
  if (typeSelect) {
    typeSelect.addEventListener("change", handleCheckTypeChange);
    handleCheckTypeChange(); // بار اول
  }

  // سرچ مدیریت
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", () => renderManage());
  }

  // فیلدهای تاریخ فیلتر
  const fromJ = document.getElementById("fromJ");
  const toJ = document.getElementById("toJ");
  if (fromJ) fromJ.addEventListener("input", () => renderManage());
  if (toJ) toJ.addEventListener("input", () => renderManage());
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

// ====== Referrers ======

function renderRefSelects() {
  const refSelect = document.getElementById("refSelect");
  const editRef = document.getElementById("editRef");

  const makeOptions = sel => {
    if (!sel) return;
    sel.innerHTML = "";
    state.referrers.forEach(r => {
      const opt = document.createElement("option");
      opt.value = r;
      opt.textContent = r;
      sel.appendChild(opt);
    });
  };

  makeOptions(refSelect);
  makeOptions(editRef);
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

// ====== Building check objects from form ======

function getFormBaseData() {
  const type = document.getElementById("checkType").value;
  const ref = document.getElementById("refSelect").value || "بدون معرف";
  const buyer = document.getElementById("buyerName").value.trim();
  const phone = document.getElementById("buyerPhone").value.trim();
  const principal = parseMoney(
    document.getElementById("principal").value
  );
  const rate = Number(
    toEnglishDigits(document.getElementById("rate").value)
  );
  const startJStr = document.getElementById("startJ").value;
  const startJ = parseJalali(startJStr);

  if (!buyer) throw new Error("نام خریدار خالی است.");
  if (!principal || principal <= 0)
    throw new Error("مبلغ اصل را درست وارد کن.");
  if (!rate || rate <= 0)
    throw new Error("درصد سود را درست وارد کن.");
  if (!startJ)
    throw new Error("تاریخ صدور را به صورت yy/mm/dd وارد کن.");

  return {
    type,
    ref,
    buyer,
    phone,
    principal,
    rate,
    startJ,
    startJStr
  };
}

function buildSingleCheckFromForm() {
  const base = getFormBaseData();
  const endJStr = document.getElementById("endJ").value;
  const endJ = parseJalali(endJStr);
  if (!endJ)
    throw new Error("تاریخ سررسید را به صورت yy/mm/dd وارد کن.");
  const code = document.getElementById("singleCode").value.trim();

  const id = genId();

  const check = {
    id,
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
    amount: 0, // بعداً اگر خواستی دستی ست کن
    code,
    label: "",
    note: "",
    status: "unpaid",
    extraDays: 0,
    extraProfit: 0
  };

  return [check];
}

// برای چک‌های ماهانه
function buildMonthlyChecksFromForm() {
  const base = getFormBaseData();
  const months = Number(
    toEnglishDigits(document.getElementById("months").value)
  );
  const graceMonths = Number(
    toEnglishDigits(document.getElementById("graceMonths").value || "0")
  );

  if (!months || months <= 0 || months > 36)
    throw new Error("تعداد ماه باید بین 1 تا 36 باشد.");

  const seriesId = genId();
  const checks = [];

  // اگر لیست ماهانه قبلاً تولید شده باشد (کاربر ویرایش کرده)، از آن بخوانیم
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

      const c = {
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
      };
      checks.push(c);
    });

    return checks;
  }

  // در غیر این صورت، خودمان تاریخ‌ها را به صورت ساده می‌سازیم
  const baseIndex = jalaliToIndex(base.startJ);
  for (let i = 0; i < months; i++) {
    const monthOffset = graceMonths + i; // چند ماه بعد از شروع
    const endIndex = baseIndex + monthOffset * 30;
    // تبدیل معکوس index به yy/mm/dd ساده (هر ماه 30 روز)
    const totalMonths = Math.floor(endIndex / 30);
    const dayInMonth = (endIndex % 30) + 1;
    const year = Math.floor(totalMonths / 12);
    const month = (totalMonths % 12) + 1;
    const jy = year - 1400; // برعکس کاری که در jalaliToIndex کردیم
    const endJ = { yy: jy, mm: month, dd: dayInMonth };
    const endJStr = jalaliToString(endJ);

    const c = {
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
    };
    checks.push(c);
  }

  return checks;
}

// ساخت لیست قابل ویرایش برای چک‌های ماهانه
function buildMonthlyUI() {
  try {
    const checks = buildMonthlyChecksFromForm();
    const list = document.getElementById("monthlyList");
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
    document.getElementById("monthlyList").innerHTML =
      '<div class="tiny" style="color:#fecaca;">' + e.message + "</div>";
  }
}

// ====== Preview & Save ======

function calcProfitForCheck(ch) {
  const days = diffJalaliDays(ch.startJ, ch.endJ) + ch.extraDays;
  if (days <= 0) return { base: 0, extra: ch.extraProfit || 0, total: ch.extraProfit || 0 };
  const baseProfit = ch.principal * (ch.rate / 100) * (days / 30);
  const extra = ch.extraProfit || 0;
  return {
    base: baseProfit,
    extra,
    total: baseProfit + extra
  };
}

function previewCalc() {
  const box = document.getElementById("previewBox");
  box.textContent = "";
  try {
    const type = document.getElementById("checkType").value;
    let checks;
    if (type === "single") {
      checks = buildSingleCheckFromForm();
    } else {
      checks = buildMonthlyChecksFromForm();
    }
    let totalProfit = 0;
    checks.forEach(ch => {
      const p = calcProfitForCheck(ch);
      totalProfit += p.total;
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
    let checks;
    if (type === "single") {
      checks = buildSingleCheckFromForm();
    } else {
      // اگر هنوز UI ساخته نشده باشد، اول بسازیم
      if (!document.getElementById("monthlyList").children.length) {
        buildMonthlyUI();
      }
      checks = buildMonthlyChecksFromForm();
    }

    // اضافه به استیت
    state.checks = state.checks.concat(checks);
    saveState();

    // ریست فرم
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

// وقتی تعداد ماه یا تنفس عوض شد، لیست ماهانه را بسازیم
(function () {
  const months = document.getElementById("months");
  const grace = document.getElementById("graceMonths");
  if (months) months.addEventListener("input", buildMonthlyUI);
  if (grace) grace.addEventListener("input", buildMonthlyUI);
})();
// ====== Input handlers (money, numeric, jalali, etc.) ======

function setupInputHandlers() {
  const doc = document;

  // فرمت مبلغ‌ها
  doc.addEventListener("input", function (e) {
    const el = e.target;
    if (el.classList.contains("money-input")) {
      const digits = onlyDigits(el.value).slice(0, 15); // حداکثر ۱۵ رقم
      const num = digits ? Number(digits) : 0;
      el.value = digits ? formatMoney(num) : "";
    } else if (el.classList.contains("numeric-int")) {
      el.value = onlyDigits(el.value).slice(0, 6);
    } else if (el.classList.contains("numeric-dec")) {
      let v = toEnglishDigits(el.value);
      v = v.replace(/[^0-9.]/g, "");
      // فقط یک نقطه
      const parts = v.split(".");
      if (parts.length > 2) {
        v = parts[0] + "." + parts.slice(1).join("");
      }
      // محدود کردن به 2 رقم اعشار
      const m = v.match(/^(\d{0,4})(\.\d{0,2})?/);
      el.value = m ? (m[1] || "") + (m[2] || "") : "";
    } else if (el.classList.contains("jalali-input")) {
      let d = onlyDigits(el.value).slice(0, 6);
      let out = "";
      if (d.length <= 2) {
        out = d;
      } else if (d.length <= 4) {
        out = d.slice(0, 2) + "/" + d.slice(2);
      } else {
        out = d.slice(0, 2) + "/" + d.slice(2, 4) + "/" + d.slice(4);
      }
      el.value = out;
    } else if (el.classList.contains("phone-input")) {
      el.value = onlyDigits(el.value).slice(0, 11);
    } else if (el.classList.contains("code-16")) {
      el.value = onlyDigits(el.value).slice(0, 16);
    }
  });

  // وقتی نوع چک عوض می‌شود، قسمت‌های مربوطه را نشان/مخفی می‌کنیم
  const typeSelect = document.getElementById("checkType");
  if (typeSelect) {
    typeSelect.addEventListener("change", handleCheckTypeChange);
    handleCheckTypeChange(); // بار اول
  }

  // سرچ مدیریت
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", () => renderManage());
  }

  // فیلدهای تاریخ فیلتر
  const fromJ = document.getElementById("fromJ");
  const toJ = document.getElementById("toJ");
  if (fromJ) fromJ.addEventListener("input", () => renderManage());
  if (toJ) toJ.addEventListener("input", () => renderManage());
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

// ====== Referrers ======

function renderRefSelects() {
  const refSelect = document.getElementById("refSelect");
  const editRef = document.getElementById("editRef");

  const makeOptions = sel => {
    if (!sel) return;
    sel.innerHTML = "";
    state.referrers.forEach(r => {
      const opt = document.createElement("option");
      opt.value = r;
      opt.textContent = r;
      sel.appendChild(opt);
    });
  };

  makeOptions(refSelect);
  makeOptions(editRef);
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

// ====== Building check objects from form ======

function getFormBaseData() {
  const type = document.getElementById("checkType").value;
  const ref = document.getElementById("refSelect").value || "بدون معرف";
  const buyer = document.getElementById("buyerName").value.trim();
  const phone = document.getElementById("buyerPhone").value.trim();
  const principal = parseMoney(
    document.getElementById("principal").value
  );
  const rate = Number(
    toEnglishDigits(document.getElementById("rate").value)
  );
  const startJStr = document.getElementById("startJ").value;
  const startJ = parseJalali(startJStr);

  if (!buyer) throw new Error("نام خریدار خالی است.");
  if (!principal || principal <= 0)
    throw new Error("مبلغ اصل را درست وارد کن.");
  if (!rate || rate <= 0)
    throw new Error("درصد سود را درست وارد کن.");
  if (!startJ)
    throw new Error("تاریخ صدور را به صورت yy/mm/dd وارد کن.");

  return {
    type,
    ref,
    buyer,
    phone,
    principal,
    rate,
    startJ,
    startJStr
  };
}

function buildSingleCheckFromForm() {
  const base = getFormBaseData();
  const endJStr = document.getElementById("endJ").value;
  const endJ = parseJalali(endJStr);
  if (!endJ)
    throw new Error("تاریخ سررسید را به صورت yy/mm/dd وارد کن.");
  const code = document.getElementById("singleCode").value.trim();

  const id = genId();

  const check = {
    id,
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
    amount: 0, // بعداً اگر خواستی دستی ست کن
    code,
    label: "",
    note: "",
    status: "unpaid",
    extraDays: 0,
    extraProfit: 0
  };

  return [check];
}

// برای چک‌های ماهانه
function buildMonthlyChecksFromForm() {
  const base = getFormBaseData();
  const months = Number(
    toEnglishDigits(document.getElementById("months").value)
  );
  const graceMonths = Number(
    toEnglishDigits(document.getElementById("graceMonths").value || "0")
  );

  if (!months || months <= 0 || months > 36)
    throw new Error("تعداد ماه باید بین 1 تا 36 باشد.");

  const seriesId = genId();
  const checks = [];

  // اگر لیست ماهانه قبلاً تولید شده باشد (کاربر ویرایش کرده)، از آن بخوانیم
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

      const c = {
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
      };
      checks.push(c);
    });

    return checks;
  }

  // در غیر این صورت، خودمان تاریخ‌ها را به صورت ساده می‌سازیم
  const baseIndex = jalaliToIndex(base.startJ);
  for (let i = 0; i < months; i++) {
    const monthOffset = graceMonths + i; // چند ماه بعد از شروع
    const endIndex = baseIndex + monthOffset * 30;
    // تبدیل معکوس index به yy/mm/dd ساده (هر ماه 30 روز)
    const totalMonths = Math.floor(endIndex / 30);
    const dayInMonth = (endIndex % 30) + 1;
    const year = Math.floor(totalMonths / 12);
    const month = (totalMonths % 12) + 1;
    const jy = year - 1400; // برعکس کاری که در jalaliToIndex کردیم
    const endJ = { yy: jy, mm: month, dd: dayInMonth };
    const endJStr = jalaliToString(endJ);

    const c = {
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
    };
    checks.push(c);
  }

  return checks;
}

// ساخت لیست قابل ویرایش برای چک‌های ماهانه
function buildMonthlyUI() {
  try {
    const checks = buildMonthlyChecksFromForm();
    const list = document.getElementById("monthlyList");
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
    document.getElementById("monthlyList").innerHTML =
      '<div class="tiny" style="color:#fecaca;">' + e.message + "</div>";
  }
}

// ====== Preview & Save ======

function calcProfitForCheck(ch) {
  const days = diffJalaliDays(ch.startJ, ch.endJ) + ch.extraDays;
  if (days <= 0) return { base: 0, extra: ch.extraProfit || 0, total: ch.extraProfit || 0 };
  const baseProfit = ch.principal * (ch.rate / 100) * (days / 30);
  const extra = ch.extraProfit || 0;
  return {
    base: baseProfit,
    extra,
    total: baseProfit + extra
  };
}

function previewCalc() {
  const box = document.getElementById("previewBox");
  box.textContent = "";
  try {
    const type = document.getElementById("checkType").value;
    let checks;
    if (type === "single") {
      checks = buildSingleCheckFromForm();
    } else {
      checks = buildMonthlyChecksFromForm();
    }
    let totalProfit = 0;
    checks.forEach(ch => {
      const p = calcProfitForCheck(ch);
      totalProfit += p.total;
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
    let checks;
    if (type === "single") {
      checks = buildSingleCheckFromForm();
    } else {
      // اگر هنوز UI ساخته نشده باشد، اول بسازیم
      if (!document.getElementById("monthlyList").children.length) {
        buildMonthlyUI();
      }
      checks = buildMonthlyChecksFromForm();
    }

    // اضافه به استیت
    state.checks = state.checks.concat(checks);
    saveState();

    // ریست فرم
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

// وقتی تعداد ماه یا تنفس عوض شد، لیست ماهانه را بسازیم
(function () {
  const months = document.getElementById("months");
  const grace = document.getElementById("graceMonths");
  if (months) months.addEventListener("input", buildMonthlyUI);
  if (grace) grace.addEventListener("input", buildMonthlyUI);
})();
