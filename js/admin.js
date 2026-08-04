// ==========================================================
// 管理者画面ロジック
// ==========================================================

let adminUser = null;
let adminUserDoc = null;

let allStaff = []; // users(role=staff) の配列
let allAvailability = {}; // { uid: { slots: {...}, staffName } }
let allShifts = []; // shifts コレクションの配列（doc.id含む）

// ---- タブ切替 ----
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "overview") renderOverviewGrid();
    if (btn.dataset.tab === "confirm") renderConfirmGrid();
    if (btn.dataset.tab === "calendar") renderCalendarGrid();
  });
});

requireAuth("admin", async (user, userDoc) => {
  adminUser = user;
  adminUserDoc = userDoc;
  document.getElementById("userBadge").textContent = `${userDoc.name} 様（管理者）`;
  await loadAllData();
  renderStaffList();
});

async function loadAllData() {
  const usersSnap = await db.collection("shift_users").where("role", "==", "staff").get();
  allStaff = usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));

  const availSnap = await db.collection("shift_availability").get();
  allAvailability = {};
  availSnap.forEach((d) => (allAvailability[d.id] = d.data()));

  const shiftsSnap = await db.collection("shift_shifts").get();
  allShifts = shiftsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function escapeHtml(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

// ==========================================================
// スタッフ管理
// ==========================================================
function renderStaffList() {
  const wrap = document.getElementById("staffList");
  if (allStaff.length === 0) {
    wrap.innerHTML = '<p class="hint">まだスタッフが登録されていません。</p>';
    return;
  }
  let html = '<table class="list"><thead><tr><th>氏名</th><th>メール</th><th>担当科目</th><th>連絡先</th><th>状態</th><th></th></tr></thead><tbody>';
  allStaff.forEach((s) => {
    html += `<tr>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.email)}</td>
      <td>${escapeHtml((s.subjects || []).join(", "))}</td>
      <td>${escapeHtml(s.contact)}</td>
      <td><span class="badge ${s.active === false ? "inactive" : "active"}">${s.active === false ? "無効" : "有効"}</span></td>
      <td><button class="secondary small" onclick="toggleStaffActive('${s.uid}', ${s.active === false})">${s.active === false ? "有効化" : "無効化"}</button></td>
    </tr>`;
  });
  html += "</tbody></table>";
  wrap.innerHTML = html;
}

async function toggleStaffActive(uid, makeActive) {
  await db.collection("shift_users").doc(uid).update({ active: makeActive });
  await loadAllData();
  renderStaffList();
}

function openAddStaffModal() {
  document.getElementById("newStaffName").value = "";
  document.getElementById("newStaffEmail").value = "";
  document.getElementById("newStaffPassword").value = "";
  document.getElementById("newStaffSubjects").value = "";
  document.getElementById("newStaffContact").value = "";
  document.getElementById("staffModalError").textContent = "";
  document.getElementById("staffModal").classList.add("open");
}
function closeAddStaffModal() {
  document.getElementById("staffModal").classList.remove("open");
}

async function submitAddStaff() {
  const name = document.getElementById("newStaffName").value.trim();
  const email = document.getElementById("newStaffEmail").value.trim();
  const password = document.getElementById("newStaffPassword").value;
  const subjects = document.getElementById("newStaffSubjects").value
    .split(",").map((s) => s.trim()).filter(Boolean);
  const contact = document.getElementById("newStaffContact").value.trim();
  const errBox = document.getElementById("staffModalError");
  errBox.textContent = "";

  if (!name || !email || password.length < 6) {
    errBox.textContent = "氏名・メールアドレスを入力し、パスワードは6文字以上にしてください。";
    return;
  }

  try {
    // 管理者自身のログインセッションを維持したまま新規スタッフの認証アカウントを作るため、
    // セカンダリの Firebase アプリインスタンスを使う。
    const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary-" + Date.now());
    const secondaryAuth = secondaryApp.auth();
    const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
    const uid = cred.user.uid;
    await secondaryAuth.signOut();
    await secondaryApp.delete();

    await db.collection("shift_users").doc(uid).set({
      name,
      email,
      role: "staff",
      subjects,
      contact,
      active: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    closeAddStaffModal();
    await loadAllData();
    renderStaffList();
  } catch (err) {
    errBox.textContent = "追加に失敗しました: " + err.message;
  }
}

// ==========================================================
// シフト希望一覧（読み取り専用グリッド）
// ==========================================================
function renderOverviewGrid() {
  const wrap = document.getElementById("overviewGrid");
  let html = '<table class="grid"><thead><tr><th>コマ</th><th>時間</th>';
  DAYS.forEach((d) => (html += `<th>${d}</th>`));
  html += "</tr></thead><tbody>";

  PERIODS.forEach((p) => {
    html += `<tr><td class="period-cell">${p.id}</td><td class="period-cell">${p.start}-${p.end}</td>`;
    DAYS.forEach((d) => {
      const key = slotKey(d, p.id);
      const hopeNames = [];
      const possibleNames = [];
      Object.values(allAvailability).forEach((a) => {
        const mark = (a.slots || {})[key];
        if (mark === "○") hopeNames.push(a.staffName);
        else if (mark === "△") possibleNames.push(a.staffName);
      });
      let cellClass = "";
      if (hopeNames.length) cellClass = "mark-hope";
      else if (possibleNames.length) cellClass = "mark-possible";
      const title = [
        hopeNames.length ? "希望: " + hopeNames.join("、") : "",
        possibleNames.length ? "可能: " + possibleNames.join("、") : ""
      ].filter(Boolean).join(" / ");
      const countLabel = hopeNames.length + possibleNames.length
        ? `${hopeNames.length}○ ${possibleNames.length}△`
        : "";
      html += `<td class="mark-cell ${cellClass}" title="${escapeHtml(title)}">${countLabel}</td>`;
    });
    html += "</tr>";
  });
  html += "</tbody></table>";
  wrap.innerHTML = html;
}

// ==========================================================
// シフト確定・編集
// ==========================================================
let modalContext = { day: null, period: null }; // 追加対象のセル

function renderConfirmGrid() {
  renderShiftGrid("confirmGrid", true);
}
function renderCalendarGrid() {
  renderShiftGrid("calendarGrid", false);
}

function renderShiftGrid(elementId, editable) {
  const wrap = document.getElementById(elementId);
  let html = '<table class="grid"><thead><tr><th>コマ</th><th>時間</th>';
  DAYS.forEach((d) => (html += `<th>${d}</th>`));
  html += "</tr></thead><tbody>";

  PERIODS.forEach((p) => {
    html += `<tr><td class="period-cell">${p.id}</td><td class="period-cell">${p.start}-${p.end}</td>`;
    DAYS.forEach((d) => {
      const key = slotKey(d, p.id);
      const entries = allShifts.filter((s) => slotKey(s.day, s.period) === key);
      html += `<td class="shift-cell">`;
      entries.forEach((s) => {
        html += `<div class="shift-entry">
          ${editable ? `<span class="remove-btn" onclick="removeShift('${s.id}')">×</span>` : ""}
          <div class="staff-name">${escapeHtml(s.staffName)}</div>
          <div class="student-line">${escapeHtml(s.studentName || "-")}（${escapeHtml(s.studentGrade || "-")}）</div>
          <div class="student-line">${escapeHtml(s.subject || "-")}</div>
        </div>`;
      });
      if (editable) {
        html += `<button class="add-shift-btn" onclick="openShiftModal('${d}', ${p.id})">＋追加</button>`;
      }
      html += "</td>";
    });
    html += "</tr>";
  });
  html += "</tbody></table>";
  wrap.innerHTML = html;
}

function openShiftModal(day, period) {
  modalContext = { day, period };
  const key = slotKey(day, period);
  document.getElementById("shiftModalTitle").textContent = `シフト追加: ${day}曜 ${period}コマ`;
  document.getElementById("shiftModalError").textContent = "";
  document.getElementById("shiftStudentName").value = "";
  document.getElementById("shiftStudentGrade").value = "";
  document.getElementById("shiftSubject").value = "";
  document.getElementById("shiftNotes").value = "";

  // このコマに ○/△ を付けているスタッフを優先的に上部へ表示
  const available = [];
  const others = [];
  allStaff.forEach((s) => {
    if (s.active === false) return;
    const mark = (allAvailability[s.uid] || {}).slots && allAvailability[s.uid].slots[key];
    if (mark === "○" || mark === "△") available.push({ ...s, mark });
    else others.push(s);
  });

  let optionsHtml = "";
  if (available.length) {
    optionsHtml += `<optgroup label="この時間の希望あり">`;
    available.forEach((s) => (optionsHtml += `<option value="${s.uid}">${escapeHtml(s.name)}（${s.mark}）</option>`));
    optionsHtml += `</optgroup>`;
  }
  if (others.length) {
    optionsHtml += `<optgroup label="その他のスタッフ">`;
    others.forEach((s) => (optionsHtml += `<option value="${s.uid}">${escapeHtml(s.name)}</option>`));
    optionsHtml += `</optgroup>`;
  }
  if (!available.length && !others.length) {
    optionsHtml = `<option value="">（有効なスタッフがいません）</option>`;
  }
  document.getElementById("shiftStaffSelect").innerHTML = optionsHtml;

  document.getElementById("shiftModal").classList.add("open");
}
function closeShiftModal() {
  document.getElementById("shiftModal").classList.remove("open");
}

async function submitShift() {
  const errBox = document.getElementById("shiftModalError");
  const staffUid = document.getElementById("shiftStaffSelect").value;
  const studentName = document.getElementById("shiftStudentName").value.trim();
  const studentGrade = document.getElementById("shiftStudentGrade").value.trim();
  const subject = document.getElementById("shiftSubject").value.trim();
  const notes = document.getElementById("shiftNotes").value.trim();

  if (!staffUid) {
    errBox.textContent = "担当スタッフを選択してください。";
    return;
  }
  const staff = allStaff.find((s) => s.uid === staffUid);

  try {
    await db.collection("shift_shifts").add({
      day: modalContext.day,
      period: modalContext.period,
      staffId: staffUid,
      staffName: staff ? staff.name : "",
      studentName,
      studentGrade,
      subject,
      notes,
      createdBy: adminUser.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    closeShiftModal();
    await loadAllData();
    renderConfirmGrid();
  } catch (err) {
    errBox.textContent = "保存に失敗しました: " + err.message;
  }
}

async function removeShift(shiftId) {
  if (!confirm("このシフトを削除しますか？")) return;
  await db.collection("shift_shifts").doc(shiftId).delete();
  await loadAllData();
  renderConfirmGrid();
}
