# 一鳥在手（A Bird in the Hand）

百鳥在林，不如一鳥在手。每天搖一棵樹，遇見一隻真實世界的鳥，再帶三隻潦草的牠們去打看起來超正經的 BOSS。

正式站：<https://bird-lab-three.vercel.app>

## 玩法

- 每天免費抽一次，打贏當天 BOSS 再抽一次。卡池有 10,572 種鳥，不會抽到重複的。
- 每天固定一隻 BOSS，用手上 3 隻打 5 回合，依傷害得 0 到 3 星。戰鬥結果由伺服器重算。
- 抽到的鳥可以用連結分給朋友，稀有度越高份數越少。
- 抽卡有保底和補運，機率直接顯示在遊戲裡。設計依據見 [docs/gacha-research/ODDS.md](docs/gacha-research/ODDS.md)。

## 架構

| 部分 | 位置 | 服務 |
|---|---|---|
| 前端（原生 JS，沒有建置步驟） | `public/` | Vercel 靜態檔 |
| API（單一函式，`?op=` 分路由） | `api/gacha.js`、`server/` | Vercel Functions |
| 資料庫 | `server/schema.sql` | Supabase Postgres（東京） |
| 貼紙圖片 | `stickers/` | Cloudflare Workers 靜態資產 |
| 每日備份 | `.github/workflows/backup.yml` | GitHub Actions |

遊戲規則和機率放在 `public/engine.js`、`public/data.js`，前後端共用。抽卡和戰鬥結算一律由伺服器決定。

## 本機開發

需要 Node.js 20.6 以上。

```sh
npm install
npm run dev    # http://localhost:5298/，資料存在 .data/，不會碰正式資料庫
npm test
```

想測 Google 登入流程，可用 `GACHA_FAKE_GOOGLE=1 GOOGLE_CLIENT_ID=x npm run dev`，把憑證內容直接當帳號編號。這只適合本機。

## 設定

把 `.env.example` 複製成 `.env.local` 再填值，裡面有各項 token 的取得步驟。`npm run check-env` 會檢查設定，不會印出內容。

`.env.local` 刻意不使用 `DATABASE_URL`，避免本機開發連到正式資料庫。正式站需要的變數設定在 Vercel。

## 部署

**push 到 `main` 會直接部署到正式站。**

資料庫結構有變動時，要另外把 `DATABASE_URL` 和 `DATABASE_CA` 設好再跑 `npm run seed`。它可以重複執行，會建表並更新卡池。

## 備份與還原

每天台灣時間 02:20 備份玩家資料，檔案保留 30 天。卡片可以重新匯入，所以不備份。

一般的 `pg_restore` 會因外鍵失敗，要用腳本還原到全新的資料庫。目標已有玩家時，腳本會直接停止：

```sh
tools/restore-backup.sh backup.dump 'postgresql://...'
```

## 多語系

支援繁體中文和英文，字串都在 `public/i18n.js`。語言依序取自網址 `?lang=`、已存的設定、瀏覽器語言；中文系瀏覽器顯示繁中，其他顯示英文。

新增語言時，在 `DICT` 加一份並補上 `detect` 和切換按鈕的邏輯。缺的字會退回繁中，`server/test/i18n.test.js` 會檢查字串鍵是否一致。

目前還沒翻譯的內容：

- 卡片的人工趣聞（約 1,400 隻鳥有）。英文版先不顯示，其他解說由模板翻譯。
- 隱私說明、資料來源與授權頁。
- 分享連結的預覽文字、網站 metadata 和 PWA 名稱。

## 桌布

`/wallpaper.html` 是獨立的動畫桌布「雨夜樹屋」，每 120 秒無縫循環，陽台上的鳥跟著當天的 BOSS。雨聲和爐火聲由程式合成，音樂的位置留在 `public/wallpaper-sound.js` 的 `TRACKS`，目前是空的。網址參數：`?sound=1` 預設開聲音，`?boss=` 指定 BOSS，`?t=` 凍結畫面。

## 安全

- 資料表全部開啟 RLS 且不設政策，遊戲只透過伺服器連線存取，不使用 Supabase Data API。
- 安全標頭和 CSP 設定在 `vercel.json`。新增外部資源時要同步更新。
- 伺服器只存登入憑證的雜湊值，Google 帳號只存編號。
- repo 要保持私有，備份檔內含玩家的憑證雜湊和遊戲紀錄。

## 授權與素材

貼紙、鳥類資料和背景音各有不同授權，完整標示見 [public/credits.html](public/credits.html)。

- 貼紙來自 [[removed]]([removed])，依 PolyForm Shield 1.0.0 使用，不能用於和原作者競爭的產品（觀鳥、識鳥、圖鑑類）。
- 商業化前要先處理 IUCN 資料和貼紙參考照片的授權，Vercel Hobby 方案也限非商業使用。

開發脈絡和已知問題見 [docs/gacha-research/HANDOFF.md](docs/gacha-research/HANDOFF.md)。

聯絡：<liyoclaw1242@gmail.com>
