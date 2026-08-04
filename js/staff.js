// ==========================================================
// アルバイト画面ロジック
// ==========================================================

let currentUser = null;
let currentUserDoc = null;
let currentSlots = {}; // { "月_1": "○", ... }

// タブ切替
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "confirmed") { loadConfirmedShifts(); loadAllSessionsForStaff(); }
    if (btn.dataset.tab === "sessionAvailability") loadAllSessionsForStaff();
  });
});

requireAuth("staff", (user, userDoc) => {
  currentUser = user;
  currentUserDoc = userDoc;
  document.getElementById("userBadge").textContent = `${userDoc.name} 様（アルバイト）`;
  loadAvailability();
});

async function loadAvailability() {
  const snap = await db.collection("shift_availability").doc(currentUser.uid).get();
  currentSlots = snap.exists ? snap.data().slots || {} : {};
  renderAvailabilityGrid();
}

function renderAvailabilityGrid() {
  const wrap = document.getElementById("availabilityGrid");
  let html = '<table class="grid"><thead><tr><th>コマ</th><th>時間</th>';
  DAYS.forEach((d) => (html += `<th>${d}</th>`));
  html += "</tr></thead><tbody>";
  PERIODS.forEach((p) => {
    html += `<tr><td class="period-cell">${p.id}</td><td class="period-cell">${p.start}-${p.end}</td>`;
    DAYS.forEach((d) => {
      const key = slotKey(d, p.id);
      const mark = currentSlots[key] || "";
      const cls = mark === "○" ? "mark-hope" : mark === "△" ? "mark-possible" : "";
      html += `<td class="mark-cell ${cls}" data-key="${key}" onclick="toggleMark('${key}')">${mark}</td>`;
    });
    html += "</tr>";
  });
  html += "</tbody></table>";
  wrap.innerHTML = html;
}

let saveTimer = null;
function toggleMark(key) {
  currentSlots[key] = nextMark(currentSlots[key]);
  renderAvailabilityGrid();
  document.getElementById("saveStatus").textContent = "保存中...";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveAvailability, 500);
}

async function saveAvailability() {
  await db.collection("shift_availability").doc(currentUser.uid).set(
    {
      staffId: currentUser.uid,
      staffName: currentUserDoc.name,
      slots: currentSlots,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );
  document.getElementById("saveStatus").textContent =
    "保存しました（" + new Date().toLocaleTimeString("ja-JP") + "）";
}

async function loadConfirmedShifts() {
  const wrap = document.getElementById("confirmedGrid");
  wrap.innerHTML = "読み込み中...";
  const snap = await db.collection("shift_shifts").where("staffId", "==", currentUser.uid).get();
  const shiftsBySlot = {};
  snap.forEach((doc) => {
    const s = doc.data();
    const key = slotKey(s.day, s.period);
    shiftsBySlot[key] = s;
  });

  let html = '<table class="grid"><thead><tr><th>コマ</th><th>時間</th>';
  DAYS.forEach((d) => (html += `<th>${d}</th>`));
  html += "</tr></thead><tbody>";
  PERIODS.forEach((p) => {
    html += `<tr><td class="period-cell">${p.id}</td><td class="period-cell">${p.start}-${p.end}</td>`;
    DAYS.forEach((d) => {
      const key = slotKey(d, p.id);
      const s = shiftsBySlot[key];
      if (s) {
        html += `<td class="shift-cell"><div class="shift-entry">
          <div class="student-line">生徒: ${escapeHtml(s.studentName || "-")}</div>
          <div class="student-line">学年: ${escapeHtml(s.studentGrade || "-")}</div>
          <div class="student-line">科目: ${escapeHtml(s.subject || "-")}</div>
        </div></td>`;
      } else {
        html += "<td></td>";
      }
    });
    html += "</tr>";
  });
  html += "</tbody></table>";
  wrap.innerHTML = html;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

// ==========================================================
// 講習会シフト希望・確定シフト（期間限定・日付ベース）
// ==========================================================
let allSessionsForStaff = [];
let currentAvailSession = null;
let currentAvailDates = [];
let currentSessionSlots = {};
let sessionSaveTimer = null;
let currentConfirmSession = null;

async function loadAllSessionsForStaff() {
  const snap = await db.collection("shift_sessions").orderBy("startDate", "desc").get();
  allSessionsForStaff = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const optsHtml = allSessionsForStaff.length
    ? allSessionsForStaff.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}（${s.startDate}〜${s.endDate}）</option>`).join("")
    : '<option value="">（講習会はまだありません）</option>';

  const availSelect = document.getElementById("sessionAvailabilitySelect");
  if (availSelect) {
    availSelect.innerHTML = optsHtml;
    if (allSessionsForStaff.length) {
      availSelect.value = allSessionsForStaff[0].id;
      await onAvailabilitySessionChange();
    } else {
      document.getElementById("sessionAvailabilityGrid").innerHTML = '<p class="hint">講習会が登録されたらここに表示されます。</p>';
    }
  }

  const confirmSelect = document.getElementById("confirmedSessionSelect");
  if (confirmSelect) {
    confirmSelect.innerHTML = optsHtml;
    if (allSessionsForStaff.length) {
      confirmSelect.value = allSessionsForStaff[0].id;
      await loadConfirmedSessionShifts();
    } else {
      document.getElementById("confirmedSessionGrid").innerHTML = '<p class="hint">講習会が登録されたらここに表示されます。</p>';
    }
  }
}

async function onAvailabilitySessionChange() {
  const id = document.getElementById("sessionAvailabilitySelect").value;
  currentAvailSession = allSessionsForStaff.find((s) => s.id === id) || null;
  const wrap = document.getElementById("sessionAvailabilityGrid");

  if (!currentAvailSession) {
    wrap.innerHTML = '<p class="hint">講習会を選択してください。</p>';
    return;
  }

  currentAvailDates = dateRangeArray(currentAvailSession.startDate, currentAvailSession.endDate);
  const docId = `${currentAvailSession.id}_${currentUser.uid}`;
  const snap = await db.collection("shift_session_availability").doc(docId).get();
  currentSessionSlots = snap.exists ? snap.data().slots || {} : {};
  renderSessionAvailabilityGrid();
}

function renderSessionAvailabilityGrid() {
  const wrap = document.getElementById("sessionAvailabilityGrid");
  let html = '<table class="grid"><thead><tr><th>コマ</th><th>時間</th>';
  currentAvailDates.forEach((dt) => (html += `<th>${formatDateLabel(dt)}</th>`));
  html += "</tr></thead><tbody>";
  PERIODS.forEach((p) => {
    html += `<tr><td class="period-cell">${p.id}</td><td class="period-cell">${p.start}-${p.end}</td>`;
    currentAvailDates.forEach((dt) => {
      const key = sessionSlotKey(dt, p.id);
      const mark = currentSessionSlots[key] || "";
      const cls = mark === "○" ? "mark-hope" : mark === "△" ? "mark-possible" : "";
      if (isPastDate(dt)) {
        html += `<td class="mark-cell mark-disabled ${cls || "mark-disabled-empty"}" title="過去の日付は入力できません">${mark}</td>`;
      } else {
        html += `<td class="mark-cell ${cls}" onclick="toggleSessionMark('${key}')">${mark}</td>`;
      }
    });
    html += "</tr>";
  });
  html += "</tbody></table>";
  wrap.innerHTML = html;
}

function toggleSessionMark(key) {
  currentSessionSlots[key] = nextMark(currentSessionSlots[key]);
  renderSessionAvailabilityGrid();
  document.getElementById("sessionSaveStatus").textContent = "保存中...";
  clearTimeout(sessionSaveTimer);
  sessionSaveTimer = setTimeout(saveSessionAvailability, 500);
}

async function saveSessionAvailability() {
  if (!currentAvailSession) return;
  const docId = `${currentAvailSession.id}_${currentUser.uid}`;
  await db.collection("shift_session_availability").doc(docId).set(
    {
      sessionId: currentAvailSession.id,
      staffId: currentUser.uid,
      staffName: currentUserDoc.name,
      slots: currentSessionSlots,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );
  document.getElementById("sessionSaveStatus").textContent =
    "保存しました（" + new Date().toLocaleTimeString("ja-JP") + "）";
}

async function loadConfirmedSessionShifts() {
  const id = document.getElementById("confirmedSessionSelect").value;
  currentConfirmSession = allSessionsForStaff.find((s) => s.id === id) || null;
  const wrap = document.getElementById("confirmedSessionGrid");

  if (!currentConfirmSession) {
    wrap.innerHTML = '<p class="hint">講習会を選択してください。</p>';
    return;
  }
  wrap.innerHTML = "読み込み中...";

  const dates = dateRangeArray(currentConfirmSession.startDate, currentConfirmSession.endDate);
  const snap = await db.collection("shift_session_shifts")
    .where("sessionId", "==", currentConfirmSession.id)
    .where("staffId", "==", currentUser.uid)
    .get();
  const shiftsBySlot = {};
  snap.forEach((doc) => {
    const s = doc.data();
    shiftsBySlot[sessionSlotKey(s.date, s.period)] = s;
  });

  let html = '<table class="grid"><thead><tr><th>コマ</th><th>時間</th>';
  dates.forEach((dt) => (html += `<th>${formatDateLabel(dt)}</th>`));
  html += "</tr></thead><tbody>";
  PERIODS.forEach((p) => {
    html += `<tr><td class="period-cell">${p.id}</td><td class="period-cell">${p.start}-${p.end}</td>`;
    dates.forEach((dt) => {
      const s = shiftsBySlot[sessionSlotKey(dt, p.id)];
      if (s) {
        html += `<td class="shift-cell"><div class="shift-entry">
          <div class="student-line">生徒: ${escapeHtml(s.studentName || "-")}</div>
          <div class="student-line">学年: ${escapeHtml(s.studentGrade || "-")}</div>
          <div class="student-line">科目: ${escapeHtml(s.subject || "-")}</div>
        </div></td>`;
      } else {
        html += "<td></td>";
      }
    });
    html += "</tr>";
  });
  html += "</tbody></table>";
  wrap.innerHTML = html;
}
