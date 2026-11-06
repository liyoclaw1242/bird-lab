# 一鳥在手（A Bird in the Hand）

[English](README.en.md) · 繁體中文

百鳥在林，不如一鳥在手。每天搖一棵樹，遇見一隻真實世界的鳥，再帶三隻去打看起來超正經的 BOSS。

這是我做給小姪子的小程式，讓他每天玩一點、順便認識世界上的鳥。所以每隻鳥都用真實照片，名字、體重、吃什麼、住在哪裡都取自鳥類學的公開資料，想深入的話，牌上也有連到 eBird、xeno-canto、維基百科的路。

正式站：<https://bird-lab-three.vercel.app>

## 玩法

- 每天搖一棵樹，掉下一隻還沒遇過的鳥。卡池有 1 萬多種鳥，每一隻都是 Wikimedia Commons 或 iNaturalist 上的真實照片；還沒找到合用照片的鳥先收起來，不會抽到。
- 每天固定一隻 BOSS，用稻草人身上的 3 隻打 5 回合，依傷害得 0 到 3 星。不論輸贏都有獎勵樹可以搖：沒贏 1 棵，每顆星再多 1 棵。戰鬥結果由伺服器重算。
- 在「百鳥在林」可以看收集到的鳥，用吃肉、吃素、雜食篩選。點開一隻鳥會看到牠的數字、怎麼過日子，以及「想多認識牠？」的外部連結：分布地圖、叫聲、更多照片、吃什麼和築巢。
- 抽到的鳥可以用連結分給朋友，稀有度越高份數越少。
- 抽卡有保底和補運，機率直接顯示在遊戲裡。設計依據見 [docs/gacha-research/ODDS.md](docs/gacha-research/ODDS.md)。

## 架構

| 部分 | 位置 | 服務 |
|---|---|---|
| 前端（原生 JS，沒有建置步驟） | `public/` | Vercel 靜態檔 |
| API（單一函式，`?op=` 分路由） | `api/gacha.js`、`server/` | Vercel Functions |
| 資料庫 | `server/schema.sql` | Supabase Postgres（東京） |
| 鳥照片 | `stickers/`（資料夾沿用舊名） | Cloudflare Workers 靜態資產 |
| 每日健康檢查 | `.github/workflows/health.yml` | GitHub Actions |

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

## 備份

不備份資料庫。卡池可以用 `npm run seed` 重新匯入；玩家資料只存在 Supabase，資料庫出事就找不回來。

## 多語系

支援繁體中文和英文，字串都在 `public/i18n.js`。語言依序取自網址 `?lang=`、已存的設定、瀏覽器語言；中文系瀏覽器顯示繁中，其他顯示英文。

新增語言時，在 `DICT` 加一份並補上 `detect` 和切換按鈕的邏輯。缺的字會退回繁中，`server/test/i18n.test.js` 會檢查字串鍵是否一致。

目前還沒翻譯的內容：

- 首頁的社群預覽（OG）和 PWA 名稱：靜態檔無法依語言切換，目前是中文。分享連結的預覽則跟著分享者的語言（英文介面分享的連結帶 `?lang=en`）。

隱私說明和資料來源與授權各有一份英文版（`privacy-en.html`、`credits-en.html`），改動時兩份要一起改，授權內容要一致。

## 桌布

`/wallpaper.html` 是獨立的動畫桌布「雨夜樹屋」，每 120 秒無縫循環，陽台上的鳥跟著當天的 BOSS。雨聲和爐火聲由程式合成，音樂的位置留在 `public/wallpaper-sound.js` 的 `TRACKS`，目前是空的。網址參數：`?sound=1` 預設開聲音，`?boss=` 指定 BOSS，`?t=` 凍結畫面。

## 安全

- 資料表全部開啟 RLS 且不設政策，遊戲只透過伺服器連線存取，不使用 Supabase Data API。
- 安全標頭和 CSP 設定在 `vercel.json`。新增外部資源時要同步更新。
- 伺服器只存登入憑證的雜湊值，Google 帳號只存編號。

## 授權與素材

程式碼以 MIT 授權釋出，見 [LICENSE](LICENSE)。鳥照片、鳥類資料和背景音不在 MIT 範圍內，各有自己的授權，摘要見 [NOTICE](NOTICE)，完整標示見 [public/credits.html](public/credits.html)。

- 鳥的圖片是真實照片（`tools/build-photos.py`）：先用 Wikidata 代表圖（Wikimedia Commons），沒有合用的再用 iNaturalist 研究級觀察裡 CC BY／CC0 的照片。照片只縮圖、加紙框，不裁切不翻轉。找不到照片的鳥凍結：抽不到、不算收集總數，已有的顯示剪影。
- 照片放在照片站 `stickers/dist/photos/`；換照片後部署照片站，並把 `public/game.js` 的 `STICKER_VERSION` 加一。再跑 `tools/gacha-photo-json.py` 更新 `server/data/photos.json`：伺服器靠這個檔決定誰有照片、誰凍結，不必改正式資料庫。
- 卡池固定在建立時的鳥種和數值（`server/data/cards.json.gz`），重建會讓玩家手上的鳥消失或變數值，所以只更新文字和照片。鳥名、目科和解說由 `tools/gacha-primary-text.py` 從 IOC 15.2 多語版、AVONET、AviList v2025 重建，輸出 `server/data/cardtext.json`，伺服器回傳牌時覆蓋資料庫裡的舊文字。
- 商業化前要先處理 IUCN 資料的授權，Vercel Hobby 方案也限非商業使用。

開發脈絡和已知問題見 [docs/gacha-research/HANDOFF.md](docs/gacha-research/HANDOFF.md)。

聯絡：<liyoclaw1242@gmail.com>
