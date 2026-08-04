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
    if (btn.dataset.tab === "confirmed") loadConfirmedShifts();
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
