// ==========================================================
// 共通定義・共通処理
// ==========================================================

// Firebase 初期化 (firebase-config.js が先に読み込まれている前提)
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// 曜日 (エクセルの調査表に準拠: 月〜土)
const DAYS = ["月", "火", "水", "木", "金", "土"];

// コマ (エクセル「通常授業日程希望調査表」の時間割に準拠)
const PERIODS = [
  { id: 1, start: "9:50", end: "11:10" },
  { id: 2, start: "11:20", end: "12:40" },
  { id: 3, start: "12:50", end: "14:10" },
  { id: 4, start: "14:20", end: "15:40" },
  { id: 5, start: "15:50", end: "17:10" },
  { id: 6, start: "17:20", end: "18:40" },
  { id: 7, start: "18:50", end: "20:10" },
  { id: 8, start: "20:20", end: "21:40" },
  { id: 9, start: "21:50", end: "23:10" }
];

// day_period のキー生成
function slotKey(day, periodId) {
  return `${day}_${periodId}`;
}

// ==========================================================
// 講習会（期間限定・日付ベースのシフト）用ユーティリティ
// ==========================================================

// 開始日〜終了日（"YYYY-MM-DD"形式）の間の日付を1日ずつ配列にする
function dateRangeArray(startStr, endStr) {
  const result = [];
  let d = new Date(startStr + "T00:00:00");
  const end = new Date(endStr + "T00:00:00");
  while (d <= end) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    result.push(`${y}-${m}-${day}`);
    d.setDate(d.getDate() + 1);
  }
  return result;
}

const WEEKDAY_JP = ["日", "月", "火", "水", "木", "金", "土"];

// "2026-08-10" -> "8/10(月)" のような表示用ラベルに変換
function formatDateLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY_JP[d.getDay()]})`;
}

// date_period のキー生成（講習会シフト用）
function sessionSlotKey(dateStr, periodId) {
  return `${dateStr}_${periodId}`;
}

// 今日の日付を "YYYY-MM-DD" 形式で取得
function todayDateStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 指定日付("YYYY-MM-DD")が過去日かどうか（今日自身は過去日に含めない）
function isPastDate(dateStr) {
  return dateStr < todayDateStr();
}

// ログイン必須ページの共通ガード。
// 呼び出し元は role ("admin" か "staff" か null=どちらでも可) を指定する。
// コールバックに (user, userDoc) を渡す。
function requireAuth(requiredRole, onReady) {
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }
    const snap = await db.collection("shift_users").doc(user.uid).get();
    if (!snap.exists) {
      alert("ユーザー情報が登録されていません。管理者にお問い合わせください。");
      await auth.signOut();
      window.location.href = "index.html";
      return;
    }
    const userDoc = snap.data();
    if (userDoc.active === false) {
      alert("このアカウントは無効化されています。管理者にお問い合わせください。");
      await auth.signOut();
      window.location.href = "index.html";
      return;
    }
    if (requiredRole && userDoc.role !== requiredRole) {
      // 役割が違う場合は適切なページへ誘導
      window.location.href = userDoc.role === "admin" ? "admin.html" : "staff.html";
      return;
    }
    onReady(user, userDoc);
  });
}

function logout() {
  auth.signOut().then(() => (window.location.href = "index.html"));
}

// マークの表示順 (クリックで循環): 空 -> ○(希望) -> △(可能) -> 空
const MARK_CYCLE = ["", "○", "△"];

function nextMark(current) {
  const idx = MARK_CYCLE.indexOf(current || "");
  return MARK_CYCLE[(idx + 1) % MARK_CYCLE.length];
}
