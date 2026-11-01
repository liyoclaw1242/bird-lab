# 一鳥在手：交接備忘錄

> 每天搖一棵樹抽一隻真實的鳥，帶三隻潦草線稿去打正經的 BOSS。今天抽到的鳥能分給朋友。

## 現況（2026-11-01）

舊的 Weird Bird Anatomy Lab 已從工作目錄移除，最後一版在 commit `861bd21`。**這次所有改動都還沒 commit，正式站仍是舊站。push 到 `main` 會直接部署，要先問使用者。**

本機：`npm install && npm run dev`，開 http://localhost:5298/ 。測試：`npm test`（含真實 Postgres 併發，用 embedded-postgres）。平衡模擬：`node tools/gacha-sim.js [場數]`。

- `public/`：網站（`game.js` 畫面、`engine.js` 瀏覽器和伺服器共用的規則、`data.js` 機率／BOSS／分享限制、`doodle.js` 即時描線稿、`scenery.js` 程式畫林子）。
- `server/game.js` 權威邏輯、`api.js` 路由、`share-page.js` 分享連結給爬蟲看的頁面、`db.js` 連線、`setup.js` 建表與匯入（不進線上函式）。
- `api/gacha.js` Vercel 入口；`/s/:code` 由 `vercel.json` 改寫到它。
- 品牌：`public/logo.svg`，圖示和 OG 圖由 `tools/brand/build.js` 從它和 `tools/brand/og.html` 產生（要 `PLAYWRIGHT_PATH` 或裝 playwright）。
- 卡池：`tools/gacha-build-pool.py <species.json> <field-guide.zh-Hans.json>` 產生 `server/data/cards.json.gz`，10,572 隻。

### 使用者已決定

遊戲當主要應用、舊站移除；名稱「一鳥在手」；免費方案部署：Vercel Hobby（頁面＋API）、Supabase（資料庫）、Cloudflare Workers 靜態資源（貼紙）、GitHub Actions（備份與監控）。獨立頁面、每回合出一張牌、相剋＋星數、只手繪招牌動作、完全免費。

### 分享規則（數值是我定的，可調，在 `public/data.js`）

- 只有當天抽到的牌能分享，一次抽卡一條連結。領取只是複製，分享者不會失去牠。領到的牌不能再分享。
- 領取上限：N 10、R 5、SR 3、SSR 2、UR 1。連結含抽到當天開放 3 天，失效後不再露出鳥的內容。每人每天最多領 5 隻。
- 授權底線不變：沒有列舉卡池的路由，連結代碼不可猜。分享頁標 noindex。

### Google 登入、PWA、稀有度特效

- 「RWA」當成 PWA 處理（使用者原話是 RWA，還沒確認）。`public/sw.js` 網路優先，只快取同網域的網頁檔；API 和跨網域貼紙不經手。
- Google 用 Google Identity Services 的 ID token，伺服器驗證（`server/google.js`），只存 `sub`。沒設 `GOOGLE_CLIENT_ID` 時按鈕不會出現。本機可用 `GACHA_FAKE_GOOGLE=1 GOOGLE_CLIENT_ID=x` 測流程，但瀏覽器要自己替換 Google 的腳本，**真實 Google 登入還沒測過，iOS 桌面版尤其要實測**。
- 憑證移到 `sessions`，一個帳號可多裝置登入。兩片林子不合併，避免用匿名分身養大 Google 帳號；裝置上有進度時，切換前會問。
- 特效數值在 `public/scenery.js` 的 `RARITY_FX`。對戰顯示稀有度標籤和邊框，SR 以上有光環、專屬提示帶和飛葉。
- 隱私頁 `public/privacy.html` 還沒有聯絡方式，也還沒有刪除帳號的功能，公開前要補。

### 其他決定

- 戰鬥過程存在 localStorage，重新整理會接著打。沒有每回合打 API：招式和數值本來就公開，算得出最佳解的人不必靠重來，每回合打 API 只會多吃額度。
- 存檔碼就是玩家憑證，可在其他裝置貼上找回。
- 建立玩家每 IP 每小時最多 20 次。API 或資料庫失敗時顯示「森林今天休息中」，但 Vercel 帳號被暫停時頁面本身也會消失。

## 部署現況（2026-11-01）

- Supabase 已建表並匯入 10,572 張牌；貼紙已在 `https://yi-niao-stickers.yi-niao.workers.dev/`，`STICKER_BASE` 已換；Vercel 的 Preview 和 Production 都設好變數，`e378195` 已上正式站 `bird-lab-three.vercel.app`。**備份的 GitHub Secrets 還沒設，排程會失敗；真實 Google 登入還沒測。**
- 預覽和正式站共用同一個資料庫。
- Vercel CLI 50.33 不讀 `VERCEL_TOKEN`，要傳 `--token`，並設 `VERCEL_PROJECT_ID`、`VERCEL_ORG_ID` 跳過 `vercel link`（否則卡在等登入）。預覽受 Vercel 登入保護，指令列要用 `vercel curl`。
- 音效在 `public/sound.js`，全部即時合成，右下角有靜音鍵。自動化只驗證有觸發、不爆音不無聲，音色好不好聽要人聽。

## 抽卡與授權（2026-11-01）

- 保底和補運在 `public/data.js`，設計依據在 `docs/gacha-research/ODDS.md`，模擬用 `node tools/gacha-odds-sim.js`。改參數要同步更新面板上的長期平均。
- 授權總表在 `public/credits.html`。改貼紙授權標示要重跑 `node tools/build-stickers.js` 和 `stickers/` 的 wrangler deploy。
- 背景音：`public/audio/countryside.mp3`（CC0，`tools/build-bgm.sh` 產生），🎵 開關，`?bgm=1` 給 Windows Lively 桌布用；Lively 上的自動播放還沒實測。
- 刪除資料目前靠信箱人工處理，沒有自助功能。
- 商業化前要處理：IUCN 資料、參考照片（約 6,300 張的參考照是 NC／ND 或保留所有權利）。原作者接受撤圖，但我們鎖定固定版本，撤圖不會自動同步。

## 上線步驟（第 1 步已做完，下面都還沒做）

使用者把 token 填進 `.env.local`（取得步驟在 `.env.example`），用 `npm run check-env` 驗證；`wrangler` 改用 `CLOUDFLARE_API_TOKEN`，不用 `wrangler login`。檔內的 `SUPABASE_*` 要組成 `DATABASE_URL` 才傳給 seed 或 Vercel，不要讓 `DATABASE_URL` 留在本機環境。備份用 Session pooler（5432），不是直連。

1. 使用者建 Supabase 專案（東京區，對應 `vercel.json` 的 `hnd1`）；`DATABASE_URL` 用連線池字串，`DATABASE_CA` 放 Supabase 的 CA 憑證。`DATABASE_URL=... DATABASE_CA=... npm run seed`。**還沒連過 Supabase**，併發測試跑在本機 Postgres 18。
2. 使用者執行 `wrangler login`。`node tools/build-stickers.js`（約 686 MB，目前 `stickers/dist` 只有 20 張測試），到 `stickers/` 執行 `npx wrangler deploy`。把 `public/game.js` 的 `STICKER_BASE` 換成部署後的網址（現在還是 jsDelivr），並確認線稿描得出來。
3. 使用者在 Google Cloud 建 OAuth 網頁用戶端 ID，把預覽和正式網址加進「已授權的 JavaScript 來源」，設 Vercel 的 `GOOGLE_CLIENT_ID`。設其他 Vercel 環境變數，開**預覽部署**跑完整流程。`vercel.json` 和 `.vercelignore` 還沒在 Vercel 上實際部署過。
4. 設 GitHub Secrets（`BACKUP_DATABASE_URL`、`SITE_URL`），手動跑一次 `.github/workflows/backup.yml` 並演練還原。工作流程也還沒跑過，repo 要保持私有。
5. 確定正式網址後，更新 `public/index.html` 的 `og:url`、`og:image`（現在寫 `bird-lab-three.vercel.app`）。
6. 朋友內測約兩週，看留存和用量。公開前先問貼紙原作者。問過使用者才能 push 到 `main`。

## 已知問題

- 還沒驗證好不好玩。每天 2 抽收完要 14 年多，分享會加快多少還不知道。
- 容量是估算，沒有壓測：約 3,000 DAU。Supabase 一週沒活動會暫停；`op=health` 每天會查一次資料庫，但是否算活動要實測。
- Vercel 超量最多要等 30 天，到 50% 就要處理。Hobby 限非商業使用。
- 分身可以繞過每人每日領取上限（換瀏覽器就是新玩家），靠 IP 限制減緩，沒有根治。
- 分享頁 OG 用同一張通用圖，CDN 快取一小時，剩餘份數可能落後。
- 解說沒逐條查證，簡轉繁是機器轉換，鳥名沒人工看。線稿是自動描的，飛行姿態的鳥比較怪。BOSS 只有 5 隻。

## 早期研究（109 張、卡面、怪度、動作圖的段落已過時，資料來源和授權仍有效）

## 資料來源：[removed]

[removed] ，11,064 種鳥的擬真 AI 貼紙與結構化資料。

| 內容 | 授權 | 要做的事 |
|---|---|---|
| AI 貼紙 | PolyForm Shield 1.0.0 | 授權文字明列遊戲可用，要附 `Required Notice: Copyright (c) 2026 [removed] ([removed]), [removed] |
| 照片去背貼紙（`kind: photo-cutout`） | 各照片自己的 CC 授權 | 逐張標作者與授權，見 `bosses.json`；BY-SA 的衍生要留意 |
| 量測、生態（AVONET） | CC BY 4.0 | 標示 Tobias et al. 2022 |
| 鳥名（IOC 15.2） | CC BY 3.0 | 標示 |
| 彙整資料 | MIT | 附授權 |

- **授權紅線**：貼紙不能用於和「[removed]」競爭的產品（觀鳥、識鳥、圖鑑類）。遊戲沒問題，但**不要把 BOSS 貼紙做成可查詢的鳥類圖鑑**。主站的圖鑑分頁也不要用這些貼紙。這是我對授權的閱讀，不是法律意見。
- **不要把 `species.json`（32MB）放進專案**。寫腳本抽出需要的欄位，輸出小檔。
- 貼紙約 1000px、每張約 60KB。建議縮到 512px；50 張預估 1～2MB（未實測）。

## 規則提案與驗證結果

### 稀有度（已驗證可分出合理分布）

`分數 = 怪度 × 2 + IUCN × 1.5`（LC 0、NT 1、VU 2、EN 3、CR 4），排序後依百分位切：

| 稀有度 | 張數 | 出率（提案） | 數值倍率 |
|---|---|---|---|
| UR | 3 | 1% | 1.4 |
| SSR | 7 | 5% | 1.25 |
| SR | 19 | 17% | 1.12 |
| R | 30 | 32% | 1.0 |
| N | 50 | 45% | 0.9 |

### 攻防（已驗證）

體重、嘴長、嘴高、跗蹠等取 log 正規化，大小鳥才不會差幾萬倍。完整公式在 `stats-proto.js`。

- 攻擊：體重 40%、嘴長 25%、嘴高 20%、腳長 15%，再依食性加分（吃脊椎動物 +14、水中掠食 +10⋯）
- 防禦：體重 60%、腳長 15%、尾長 10%、翅形 15%
- 怪度提供保底，小鳥才不會廢
- 結果：ATK 中位 68（p5–p95：42–99）、DEF 中位 66（45–91）。最高：鯨頭鸛 133/114；最低：長尾山雀 35/39。

### 每日抽卡（模擬過）

保底 50 抽出 SSR 以上。圖鑑收集的中位天數：

| 每天抽數 | 收 50% | 收 80% | 全收 |
|---|---|---|---|
| 1 | 76 | 179 | 609 |
| 2（建議：免費 1＋打贏 BOSS 1） | 38 | 90 | 319 |
| 3 | 26 | 61 | 213 |

全收太久：**需要重複牌兌換機制**（提案：重複牌換羽毛，羽毛可指定兌換）。這部分還沒模擬。

### BOSS 戰（模擬過，⚠️ 還沒平衡好）

提案：3 張牌、5 回合自動戰。BOSS 的攻防比例來自牠的量測值，**強度由星期決定**（週一弱、週日強），麻雀才能當週日 BOSS。重複牌每張 +4%，上限 +40%。

模擬的勝率（2 抽/天，上場最強 3 張）：

| 玩家第幾天 | 週一 | 週三 | 週五 | 週六 | 週日 |
|---|---|---|---|---|---|
| 1 | 100% | 98% | 82% | 50% | 19% |
| 7 | 100% | 100% | 100% | 96% | 70% |
| 14 | 100% | 100% | 100% | 100% | 89% |
| 30 以後 | 100% | 100% | 100% | 100% | ≥99% |

**問題：約一個月後就沒有挑戰了**，而第一版強度曲線又是週末幾乎打不贏。單純調倍率解決不了，因為隊伍只會變強。建議方向（擇一，先模擬再定）：

1. 改看「造成多少傷害」拿 1～3 星，三星門檻隨玩家牌力調整
2. 用限制代替數值：今日只能派非洲鳥、不能派肉食鳥、禁用 UR
3. 食性、棲地相剋，讓「挑對牌」比「牌強」重要

另外這個戰鬥沒有玩家操作。如果只看自動戰，每天的樂趣可能撐不久，這是目前最大的設計風險。**先做可玩原型驗證**，再投入 400 多張圖。

### 每日機制（提案）

用台北日期當亂數種子：同一天所有人遇到同一隻 BOSS。50 隻洗牌後輪完才重複。進度存 localStorage，沒有後端，所以改時間、改存檔都能作弊；只要沒有排行榜就不是問題。

## 50 隻 BOSS（已確認全部通過貼紙品質線）

城市常見、台灣與東亞（臺灣藍鵲、黑面琵鷺、帝雉、白頭翁、丹頂鶴、朱鹮）、猛禽、水鳥、熱帶明星都有，完整清單在 `bosses.json`。

- 很有名但**貼紙沒過品質線**，所以先排除：藍孔雀 q79、鴕鳥 q73、火雞 q73、鴯鶓 q74、鶴鴕 q70、虎皮鸚鵡 q76。若想收錄，先人工看圖。
- 其中 10 張是照片去背（9 張要標作者的 CC BY／BY-SA，1 張 CC0），其餘是 AI 貼紙。
- 我只親眼看過鯨頭鸛和麻雀兩張貼紙。其餘 48 張只看分數，**實作前要全部目視**。
- IOC 繁中名有些很怪（鞭笞鵎鵼、吐綬雞、麻雀〔樹麻雀〕），`bosses.json` 的 `zh` 不能直接上，要人工改成俗名。

## 動作圖（已試作）

- `doodle` 是一整片沒有分部位的 path，**不能靠骨架綁定做動作**，要重畫。
- 試作了鯨頭鸛、家麻雀各 4 個動作：攻擊、防禦、倒地、招牌。和原線稿風格相符，手法與之前相同，都是寫 SVG path，每張約 0.5～1KB。
- 招牌動作最好從該鳥的 `notes` 或 `caption` 取材（盯到當機、氣炸），這才是有趣的地方。
- 規模：109 × 4 = 436 張。**這只是兩隻的小樣本**，複雜的鳥（群鳥、孔雀、照片裡不只一隻）可能更難，也可能要改畫法。
- 建議分批：先做 10 隻垂直切片，確認好玩；攻擊、防禦、倒地可先用 CSS 動畫＋通用特效代替，只手繪招牌。之前的方法可沿用：每洲一個 agent、規格文件、`tools/shot.sh` 截圖逐張目視。
- 試作的紅色、藍色特效線是新增的樣式，和既有的 `.ink-layer` 分開。

## 資料注意事項

- **對應**：`stats-proto.js` 的 `ALIAS` 有 19 隻手動對應（家禽、只鑑定到屬、資料缺漏），數值是近似值。
- **手填**：鴞鸚鵡和黃嘴鵰鴞沒有 AVONET 資料，`OVERRIDE` 裡的體重和 IUCN 是我憑一般知識填的，**沒查證**。
- 雛鳥（鵜鶘雛鳥、國王企鵝雛鳥⋯）用成鳥數值，所以「沒穿衣服鳥」攻擊 101 偏高。可能要加幼鳥修正，或當笑點。
- 群鳥也是用單隻數值。
- IUCN 來自 Wikidata，可能落後。
- 既有 `notes` 大多沒逐條查證，舊的提醒仍適用。

## 專案的坑

- `js/credits.js` 的 `PUBLIC_MODE = true`：線上 109 隻，3 隻海鷗迷因隱藏。卡池要沿用這個過濾（`stats-proto.js` 已做）。
- `.vercelignore` 擋掉 `img/meme`、`img/ig`、`tools`、`docs`。新素材不要放到這些路徑。
- 素材網址帶 `?v=6`。改了記得一起更新。
- 改鳥資料後要跑 `sh wallpaper/sync.sh`，桌布才會同步。
- `tools/shot.sh` 需要 `python3 -m http.server 5297` 在 `bird-lab/` 開著。
- 全域 CSS 有 `.photo`、`.paper` 等通用 class，新遊戲的 class 請加前綴。桌布就撞過 `.photo`。
- 遊戲掛在 `index.html` 的遊戲區（`#g-pick`、`.game[data-game]`、`game:switch` 事件）或另開頁面，尚未決定。
