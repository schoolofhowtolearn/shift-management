# 個別指導塾 シフト管理アプリ

Firebase（認証・Firestore）+ GitHub Pages で動かす、サーバー不要のシフト管理Webアプリです。
アップロードいただいた「通常授業日程希望調査表.xlsx」の時間割（月〜土、1〜9コマ）をそのままアプリの時間割に反映しています。

## できること

- **管理者**: スタッフの登録・無効化、全スタッフのシフト希望一覧の確認、コマ単位でのスタッフ・生徒（氏名・学年・科目）の割り当て確定、確定シフトの週間カレンダー表示・印刷
- **アルバイト**: 自分のシフト希望（○希望／△可能）をコマ×曜日で入力、管理者が確定した自分の担当シフト（生徒情報つき）の確認

## ファイル構成

```
shift-app/
├── index.html          … ログイン画面
├── staff.html           … アルバイト画面
├── admin.html           … 管理者画面
├── css/style.css
├── js/
│   ├── firebase-config.js  … ★ここにFirebaseの設定を入力
│   ├── common.js            … 共通処理・時間割定義
│   ├── staff.js
│   └── admin.js
├── firestore.rules      … Firestoreセキュリティルール
└── README.md
```

## セットアップ手順

### 1. Firebaseプロジェクトを準備

新規プロジェクトを作らず、既存のFirebaseプロジェクト（例: Learning Station）にこのアプリを追加する場合は、そのプロジェクトを開いて以下を行います。

1. https://console.firebase.google.com/ で対象プロジェクトを開く
2. 左メニュー「構築」→「Authentication」→「Sign-in method」で **メール/パスワード** を有効化（既に他の用途で有効化済みなら不要）
3. 左メニュー「構築」→「Firestore Database」→ 既にデータベースがあればそのまま利用（無ければ **データベースを作成**、本番モードでOK。リージョンは asia-northeast1 など日本に近い場所を推奨）

※ このアプリのFirestoreコレクションはすべて `shift_` 接頭辞（`shift_users` など）を付けているため、同じプロジェクト内の既存アプリのデータと混ざる心配はありません。

### 2. Webアプリを登録して設定情報を取得

1. プロジェクトの設定（歯車アイコン）→「マイアプリ」→ `</>` (Web) を選択してアプリを追加
2. 表示された `firebaseConfig` の値を `js/firebase-config.js` にコピーして貼り付けてください

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

### 3. セキュリティルールを設定

Firebaseコンソールの「Firestore Database」→「ルール」タブに `firestore.rules` の内容をそのまま貼り付けて公開してください。
（Firebase CLIを使える場合は `firebase deploy --only firestore:rules` でも可）

### 4. 最初の管理者アカウントを作成

管理者アカウントは画面からは作れないので、最初の1人だけ手動で作成します。

1. Firebaseコンソール「Authentication」→「Users」→「ユーザーを追加」で、管理者のメールアドレス・パスワードを登録し、**発行されたUID**をコピー
2. 「Firestore Database」→「データ」で `shift_users` コレクションを作成し、ドキュメントIDに先ほどのUIDを指定して、以下のフィールドを追加

| フィールド名 | 型 | 値の例 |
|---|---|---|
| name | string | 塾長 太郎 |
| email | string | 管理者のメールアドレス |
| role | string | admin |
| active | boolean | true |
| subjects | array | （空でOK） |
| contact | string | （空でOK） |

以降のアルバイトのアカウントは、管理者としてログイン後「スタッフ管理」タブの「＋スタッフを追加」から作成できます（Authenticationアカウントの作成もアプリ内で自動的に行われます）。

### 5. GitHub Pagesで公開

1. このフォルダの中身をそのままGitHubリポジトリにpushする
2. リポジトリの Settings → Pages → Source で公開用ブランチ（例: main）とルートフォルダを指定して保存
3. 数分後、`https://<ユーザー名>.github.io/<リポジトリ名>/` でアクセス可能になります

ローカルでの動作確認だけしたい場合は、`index.html` をブラウザで直接開くだけでも動作します（`file://` でも動きますが、ブラウザによってはローカルサーバー経由(`python3 -m http.server` 等)を推奨します）。

## 時間割（アプリに反映済み）

| コマ | 時間 |
|---|---|
| 1 | 9:50 - 11:10 |
| 2 | 11:20 - 12:40 |
| 3 | 12:50 - 14:10 |
| 4 | 14:20 - 15:40 |
| 5 | 15:50 - 17:10 |
| 6 | 17:20 - 18:40 |
| 7 | 18:50 - 20:10 |
| 8 | 20:20 - 21:40 |
| 9 | 21:50 - 23:10 |

曜日は月・火・水・木・金・土に対応しています。時間割やコマ数を変更したい場合は `js/common.js` の `PERIODS` / `DAYS` を編集してください。

## データ構造（Firestore）

既存のFirebaseプロジェクト（例: Learning Station）に相乗りする場合を想定し、コレクション名には `shift_` の接頭辞を付けています。他のアプリが使っている `users` 等のコレックションとは重複しません。

- `shift_users/{uid}`: `{ name, email, role: "admin"|"staff", subjects: [], contact, active }`
- `shift_availability/{uid}`: `{ staffId, staffName, slots: { "月_1": "○"|"△", ... } }`
- `shift_shifts/{autoId}`: `{ day, period, staffId, staffName, studentName, studentGrade, subject, notes }`

## 注意事項

- 「通常授業日程希望調査表.xlsx」は月〜土・週次の繰り返しパターンとして扱っています（特定の日付ではなく曜日ベース）。特定の日付単位で管理したい場合は追加の改修が必要です。
- スタッフの退会（Authenticationアカウントの完全削除）はセキュリティ上クライアント側からはできないため、現在は「無効化」による運用としています。完全削除が必要な場合はFirebaseコンソールから手動で削除してください。
