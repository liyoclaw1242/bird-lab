// 多語系。瀏覽器和測試共用：新增語言就在 DICT 加一份，缺的字會退回繁體中文。
// 字串可含信任的 HTML，動態內容由呼叫端先跳脫再傳入。
(function (root) {
  const KEY = "gacha-lang";
  const FALLBACK = "zh-Hant";
  const DICT = {
    "zh-Hant": {
      "app.name": "一鳥在手",
      "app.title": "一鳥在手｜百鳥在林，不如一鳥在手",
      "lang.switch": "English",
      "footer.links": `<a href="privacy.html">隱私說明</a> · <a href="credits.html">資料來源與授權</a>`,
      "footer.license": `貼紙依 <a href="https://polyformproject.org/licenses/shield/1.0.0">PolyForm Shield 1.0.0</a> 使用，是插畫不是鑑定依據。線稿由貼紙輪廓自動產生。其他素材的作者、授權和更動說明請見資料來源與授權。`,
      "sound.mute": "關閉音效", "sound.unmute": "開啟音效", "bgm.off": "關閉背景音", "bgm.on": "開啟背景音",
      "type.meat": "吃肉", "type.mixed": "雜食", "type.plant": "吃素",
      "intent.peck": "普通啄", "intent.smash": "全力一擊", "intent.rest": "喘氣", "intent.armor": "縮起來",
      "line.peck": "隨便啄一下", "line.smash": "牠認真了", "line.rest": "喘……喘一下", "line.armor": "縮起來裝死",
      "move.meat": ["一口生吞", "俯衝亂啄", "用眼神殺死你"],
      "move.mixed": ["亂翻亂啄", "順手牽羊", "邊跑邊吵"],
      "move.plant": ["種子連發", "果核砸臉", "用力嗑瓜子"],
      "move.super": ["畫風崩壞！", "線稿暴走！", "不管了！"],
      "banner.SR": "銀葉飄下", "banner.SSR": "金葉落下！", "banner.UR": "七彩落葉！",
      "boss.passer": "麻雀", "boss.urocissa": "臺灣藍鵲", "boss.platalea": "黑面琵鷺", "boss.syrmaticus": "帝雉", "boss.balaeniceps": "鯨頭鸛",
      "boss.self": "{name}本鳥",
      "nav.label": "分頁", "nav.home": "今日林間", "nav.forest": "百鳥在林", "nav.hand": "一鳥在手",
      "chain": "{meat} 剋 {mixed} 剋 {plant} 剋 {meat}。剋對方時傷害 ×1.5，被剋 ×0.67，挨打也一樣。",
      "retry": "再試一次", "loading": "走進林子裡…", "copied": "複製好了", "copy": "複製", "close": "關閉", "gotIt": "知道了",
      "err.resting": "森林今天休息中，晚點再來", "err.offline": "連不上林子，檢查一下網路再試一次", "err.generic": "連線出了問題", "err.googleLoad": "Google 登入載入失敗",
      "err.restore": "這段存檔碼不對，或暫時連不上林子。你目前的林子沒有變動。",
      "history": "落葉記錄兩週的星數，連勝 {n} 天",
      "home.foughtStars": "今天打過了，得到 {n} 星，明天再來", "home.challenge": "帶手上的 3 隻去挑戰", "home.needThree": "手上要有 3 隻才能打",
      "home.bossToday": "今天林子裡來了", "home.stickerAlt": "{name}的貼紙", "home.fiveMoves": "牠今天的五招",
      "draw.complete": "整座林子都收集完了", "draw.done": "今天的樹搖過了", "draw.free": "搖一棵樹", "draw.freeNote": "每天一次，會掉下一隻你還沒遇過的鳥",
      "draw.bonusDone": "獎勵的樹也搖過了", "draw.bonus": "打贏了，再搖一棵", "draw.bonusNote": "打贏 BOSS 的獎勵",
      "dev.note": "測試用，只有本機開發才有", "dev.nextDay": "跳到下一天", "dev.newPlayer": "換一位新玩家",
      "share.claimed": "被領走 {claimed} / {cap} 份", "share.max": "最多 {n} 位朋友能領", "share.button": "分享", "share.today": "今天搖到的鳥可以分給朋友",
      "share.linkLabel": "分享連結", "share.note": "{days} 天內有效，{cap} 份領完就沒了，你手上這隻不會少。", "share.text": "我在林子裡搖到一隻鳥，分你一隻，領完就沒了。",
      "install.button": "放到桌面", "install.ios": "在 Safari 按「分享」，再選「加入主畫面」。", "install.title": "把林子放到手機桌面，每天點開就能搖", "install.hide": "不用了",
      "account.bound": "這片林子綁好 Google 了", "account.boundNote": "換裝置時登入同一個帳號，你的鳥都會在。", "account.logout": "登出這台裝置",
      "account.switchTitle": "這個 Google 帳號已經有一片林子了",
      "account.switchNote": "那邊有 {there} 隻，這台裝置目前有 {here} 隻。兩片林子不能合併，切換後這台裝置的 {here} 隻會留在原處，之後要靠存檔碼才找得回來。",
      "account.switch": "切換過去", "account.stay": "留在這裡", "account.bind": "用 Google 綁定你的鳥", "account.bindNote": "綁定後換手機也不會弄丟。我們只存帳號編號，不存姓名和 Email。",
      "backup.title": "換手機也要帶著這片林子", "backup.note": "存檔只放在這個瀏覽器。把存檔碼收好，換裝置時貼上就能找回。<b>不要給別人</b>，拿到的人就能用你的林子。",
      "backup.copy": "複製我的存檔碼", "backup.have": "已經有存檔碼？", "backup.paste": "貼在這裡", "backup.restore": "換成這片林子", "backup.manual": "手動複製這段：",
      "gift.open": "朋友從林子裡分你這隻，還剩 {left} / {cap} 份，{day} 前有效。", "gift.mine": "這是你分享出去的，還剩 {left} / {cap} 份。", "gift.owned": "這隻已經在你的林子裡了。",
      "gift.claim": "收進林子", "gift.skip": "先不要", "gift.limit": "每人每天最多領 {n} 隻",
      "gift.missing": "找不到這條連結，可能貼錯了。", "gift.expired": "這條連結過期了，那隻鳥已經飛走。", "gift.gone": "來晚了，這隻已經被領完了。",
      "odds.base": "基礎 {p}", "odds.next": "這一抽 {p}", "odds.summary": "再 <b>{ssr}</b> 抽內必得 SSR 以上，<b>{ur}</b> 抽內必得 UR",
      "odds.pity": "保底：連續 {ssr} 抽沒有 SSR 以上、或 {ur} 抽沒有 UR，機率開始上升。朋友分的鳥不算進保底。",
      "odds.catchUp": "補運：林子裡的鳥比平均普通時，SR 以上機率最多提高到 {max} 倍，要抽滿 {min} 次才開始，也不會低於基礎機率。目前 {boost} 倍。",
      "odds.average": "含保底的長期平均約為 UR 2.2%、SSR 6.9%（模擬值）。抽到的鳥不會重複。",
      "card.bgRemoved": "，已去背", "card.wikiSource": "維基來源", "card.storyLabel": " ／ 趣聞：", "card.storyConverted": "，已轉繁體", "card.sticker": "貼紙：",
      "card.swap": "手上滿了，要放走哪一隻？", "card.shareTo": "分給 {n} 位朋友", "card.fly": "讓牠飛進林子", "card.release": "放回林子", "card.take": "放到手上", "card.stats": "攻 {atk} ／ 防 {def}", "card.view": "看{name}",
      "forest.note": "這片林子有 {here} 隻。你總共遇過 {owned} 隻，世界上還有 {left} 隻沒遇到。點一隻看看牠。",
      "forest.inHand": "在手上", "forest.back": "走回去", "forest.next": "再往裡走", "forest.page": "第 {page} / {pages} 片", "forest.list": "這一片有誰",
      "match.vs": "對{type} {verdict}", "match.good": "有利", "match.bad": "吃虧", "match.even": "普通", "match.sep": "，",
      "hand.find": "去林子找", "hand.stats": "攻{atk} 防{def}", "hand.today": "今天{text}", "hand.fought": "今天打過了，明天再來", "hand.go": "帶牠們去打{name}", "hand.short": "還少 {n} 隻，去林子找",
      "hand.note": "百鳥在林，不如一鳥在手。手上最多站 {n} 隻，牠們就是你今天的隊伍。", "hand.empty": "手上空空的",
      "fight.signatureOf": " 的招牌動作", "fight.damage": "{n} 傷害", "fight.counter": "反打 {n}", "fight.down": "倒地了", "fight.tired": "喘口氣，下回合才能上",
      "fight.deal": "打 {n}", "fight.take": "挨 {n}", "fight.sep": "／", "fight.fatal": "會倒地", "fight.hp": "血量 {n}%", "fight.team": "你的三隻", "fight.teamHp": "隊伍血量 {n}%", "fight.bossHp": "BOSS 體力 {n}%",
      "sig.used": "招牌動作用掉了", "sig.ready": "準備好了，下一隻傷害 ×2（再按取消）", "sig.use": "用招牌動作（整場一次，傷害 ×2）",
      "fight.resume": "剛才打到這裡，接著打。", "fight.start": "看好牠下一招，再決定誰上。", "fight.logHit": "{name}用「{word}」打了 {n}。",
      "fight.logBoss": "{boss}{intent}，反打 {n}。", "fight.logBossDown": "{boss}{intent}，反打 {n}，{name}倒地了。",
      "result.words": ["這場輸了，牠根本沒在看你", "打贏了，但牠還能走", "打得不錯，牠開始懷疑鳥生", "完美！牠當機了"],
      "result.stars": "{n} 星",
      "result.tip": "傷害 {score}，你現有的鳥今天最多能打 {best}（{pct}%）。1 星要 {a}%，2 星 {b}%，3 星 {c}%。",
      "result.home": "回林間", "result.homeMore": "回林間，再搖一棵樹",
    },
    en: {
      "app.name": "A Bird in the Hand",
      "app.title": "A Bird in the Hand",
      "lang.switch": "繁體中文",
      "footer.links": `<a href="privacy-en.html">Privacy</a> · <a href="credits-en.html">Sources and licenses</a>`,
      "footer.license": `Stickers are used under <a href="https://polyformproject.org/licenses/shield/1.0.0">PolyForm Shield 1.0.0</a>. They are illustrations, not identification references. Line art is generated automatically from sticker outlines. See Sources and licenses for other credits, licenses and changes.`,
      "sound.mute": "Mute sound", "sound.unmute": "Unmute sound", "bgm.off": "Turn off ambience", "bgm.on": "Turn on ambience",
      "type.meat": "Meat", "type.mixed": "Mixed", "type.plant": "Plant",
      "intent.peck": "Peck", "intent.smash": "Smash", "intent.rest": "Pant", "intent.armor": "Tuck",
      "line.peck": "A lazy little peck", "line.smash": "It's serious now", "line.rest": "Huff… puff…", "line.armor": "Playing dead",
      "move.meat": ["Swallow Whole", "Dive Peck", "Death Stare"],
      "move.mixed": ["Rummage Peck", "Sticky Beak", "Run and Squawk"],
      "move.plant": ["Seed Barrage", "Pit to the Face", "Angry Seed Crunch"],
      "move.super": ["Art Style Meltdown!", "Line Art Rampage!", "Whatever, Go!"],
      "banner.SR": "Silver leaves fall", "banner.SSR": "Golden leaves!", "banner.UR": "Rainbow leaves!",
      "boss.passer": "Sparrow", "boss.urocissa": "Taiwan Blue Magpie", "boss.platalea": "Black-faced Spoonbill", "boss.syrmaticus": "Mikado Pheasant", "boss.balaeniceps": "Shoebill",
      "boss.self": "{name}, In the Flesh",
      "nav.label": "Sections", "nav.home": "Today", "nav.forest": "The Bush", "nav.hand": "In Hand",
      "chain": "{meat} beats {mixed} beats {plant} beats {meat}. With the advantage, damage is ×1.5; at a disadvantage, ×0.67. The same applies when you're hit.",
      "retry": "Try again", "loading": "Walking into the woods…", "copied": "Copied", "copy": "Copy", "close": "Close", "gotIt": "Got it",
      "err.resting": "The woods are resting. Come back later.", "err.offline": "Can't reach the woods. Check your connection and try again.", "err.generic": "Something went wrong with the connection.", "err.googleLoad": "Couldn't load Google sign-in.",
      "err.restore": "That save code didn't work, or the woods can't be reached right now. Your current woods haven't changed.",
      "err.already_bound": "These woods are linked to another Google account. Log out first.", "err.bad_credential": "Google sign-in didn't work. Try again.", "err.bad_kind": "That kind of draw doesn't exist.",
      "err.bad_moves": "That fight record isn't valid.", "err.bad_team": "A team needs exactly 3 different birds.", "err.bad_token": "Couldn't find this player.", "err.claim_limit": "You've reached today's claim limit. Come back tomorrow.",
      "err.complete": "You've collected every bird in the woods.", "err.expired": "This link has expired.", "err.gone": "This bird has already been claimed by everyone.", "err.illegal_move": "That move isn't allowed this round.",
      "err.login_race": "Sign-in collided with another request. Try again.", "err.mine": "You shared this bird yourself.", "err.missing": "Couldn't find this link.", "err.needs_switch": "This Google account already has its own woods.",
      "err.no_draw": "You haven't drawn this card today.", "err.no_token": "No player credentials.", "err.not_owned": "Your team has a bird you don't own.", "err.not_won": "Beat today's BOSS to earn the bonus draw.",
      "err.owned": "This bird is already in your woods.", "err.pool_empty": "The card pool isn't ready yet.", "err.too_many_players": "Too many new players this hour. Try again later.",
      "history": "Falling leaves track two weeks of stars. Win streak: {n}",
      "home.foughtStars": "Already fought today: {n} ★. Come back tomorrow", "home.challenge": "Take your 3 birds to fight", "home.needThree": "You need 3 birds in hand to fight",
      "home.bossToday": "In the woods today", "home.stickerAlt": "{name} sticker", "home.fiveMoves": "Its five moves today",
      "draw.complete": "You've collected the whole woods", "draw.done": "Today's tree has been shaken", "draw.free": "Shake a tree", "draw.freeNote": "Once a day. A bird you haven't met will fall out",
      "draw.bonusDone": "Bonus tree shaken too", "draw.bonus": "You won! Shake another", "draw.bonusNote": "Reward for beating the BOSS",
      "dev.note": "Testing only, local development", "dev.nextDay": "Skip to next day", "dev.newPlayer": "Switch to a new player",
      "share.claimed": "{claimed} / {cap} claimed", "share.max": "Up to {n} friends can claim", "share.button": "Share", "share.today": "Share today's birds with friends",
      "share.linkLabel": "Share link", "share.note": "Valid for {days} days, {cap} copies only. You keep your own bird.", "share.text": "I shook a bird out of a tree and saved you one. Grab it before they're gone.",
      "install.button": "Add to home screen", "install.ios": "In Safari, tap Share, then Add to Home Screen.", "install.title": "Put the woods on your phone and shake a tree every day", "install.hide": "No thanks",
      "account.bound": "These woods are linked to Google", "account.boundNote": "Sign in with the same account on any device and your birds will be there.", "account.logout": "Log out on this device",
      "account.switchTitle": "This Google account already has its own woods",
      "account.switchNote": "That one has {there} birds and this device has {here}. Woods can't be merged. If you switch, the {here} birds on this device stay behind and you'll need the save code to get them back.",
      "account.switch": "Switch over", "account.stay": "Stay here", "account.bind": "Link your birds to Google", "account.bindNote": "Keep your birds when you change phones. We only store an account ID, never your name or email.",
      "backup.title": "Take these woods to a new phone", "backup.note": "Your save lives only in this browser. Keep your save code somewhere safe and paste it on a new device to get it back. <b>Don't share it</b>: anyone who has it can use your woods.",
      "backup.copy": "Copy my save code", "backup.have": "Already have a save code?", "backup.paste": "Paste it here", "backup.restore": "Switch to these woods", "backup.manual": "Copy this manually:",
      "gift.open": "A friend saved you this bird. {left} / {cap} left, valid until {day}.", "gift.mine": "You shared this one. {left} / {cap} left.", "gift.owned": "This bird is already in your woods.",
      "gift.claim": "Add to my woods", "gift.skip": "Not now", "gift.limit": "Limit: {n} birds per person per day",
      "gift.missing": "Couldn't find this link. It may have been pasted wrong.", "gift.expired": "This link has expired and the bird has flown away.", "gift.gone": "Too late, this bird has already been claimed by everyone.",
      "odds.base": "Base {p}", "odds.next": "Next draw {p}", "odds.summary": "SSR or better within <b>{ssr}</b> draws, UR within <b>{ur}</b>",
      "odds.pity": "Pity: odds start rising after {ssr} draws without SSR or better, or {ur} draws without UR. Birds from friends don't count.",
      "odds.catchUp": "Catch-up: when your birds are more common than average, odds for SR and above rise up to ×{max}. It starts after {min} draws and never falls below base odds. Currently ×{boost}.",
      "odds.average": "Long-term averages with pity are about UR 2.2% and SSR 6.9% (simulated). You never draw a duplicate.",
      "card.bgRemoved": ", background removed", "card.wikiSource": "Wikipedia source", "card.storyLabel": " / Notes: ", "card.storyConverted": "", "card.sticker": "Sticker: ",
      "card.swap": "Your hand is full. Which bird goes?", "card.shareTo": "Share with {n} friends", "card.fly": "Let it fly into the woods", "card.release": "Back to the woods", "card.take": "Take in hand", "card.stats": "ATK {atk} / DEF {def}", "card.view": "View {name}",
      "forest.note": "{here} birds in this patch. You've met {owned} in all, with {left} still out there. Tap one to take a look.",
      "forest.inHand": "In hand", "forest.back": "Go back", "forest.next": "Go deeper", "forest.page": "Patch {page} / {pages}", "forest.list": "Who's in this patch",
      "match.vs": "vs {type}: {verdict}", "match.good": "strong", "match.bad": "weak", "match.even": "even", "match.sep": ", ",
      "hand.find": "Find in woods", "hand.stats": "ATK {atk} DEF {def}", "hand.today": "Today: {text}", "hand.fought": "Already fought today. Come back tomorrow", "hand.go": "Take them to fight {name}", "hand.short": "{n} more needed. Go find them",
      "hand.note": "A bird in the hand is worth two in the bush. You can hold up to {n}, and they're your team for today.", "hand.empty": "Your hand is empty",
      "fight.signatureOf": "'s signature move", "fight.damage": "{n} damage", "fight.counter": "Counter {n}", "fight.down": "Fainted", "fight.tired": "Catching its breath. Back next round",
      "fight.deal": "Deal {n}", "fight.take": "Take {n}", "fight.sep": " ", "fight.fatal": "Will faint", "fight.hp": "HP {n}%", "fight.team": "Your three", "fight.teamHp": "Team HP {n}%", "fight.bossHp": "BOSS stamina {n}%",
      "sig.used": "Signature move used", "sig.ready": "Ready! Next bird deals ×2 (tap to cancel)", "sig.use": "Use signature move (once per fight, ×2 damage)",
      "fight.resume": "Picking up where you left off.", "fight.start": "Watch its next move, then choose who goes.", "fight.logHit": "{name} used {word} for {n}.",
      "fight.logBoss": "{boss} used {intent} and countered for {n}.", "fight.logBossDown": "{boss} used {intent} and countered for {n}. {name} fainted.",
      "result.words": ["You lost. It wasn't even looking at you", "You won, but it can still walk", "Nice fight. It's questioning its life as a bird", "Perfect! It has crashed"],
      "result.stars": "{n} stars",
      "result.tip": "Damage {score}. Your current birds could deal at most {best} today ({pct}%). 1 star takes {a}%, 2 stars {b}%, 3 stars {c}%.",
      "result.home": "Back to the woods", "result.homeMore": "Back to the woods and shake another tree",
    },
  };

  // 卡片解說的三種模板可以機械翻譯。其餘是人工趣聞，還沒有英文版，先不顯示
  const FACT_TITLES = { 牠的數字: "By the numbers", 牠怎麼過日子: "How it lives", 保育狀況: "Conservation" };
  const PHRASES = {
    主要待在森林: "Lives mainly in forests", 主要待在灌叢: "Lives mainly in shrubland", 主要待在疏林: "Lives mainly in open woodland", 主要待在草原: "Lives mainly in grassland",
    主要待在濕地: "Lives mainly in wetlands", 主要待在海上: "Lives mainly at sea", 主要待在岩壁: "Lives mainly on rocky cliffs", 主要待在人類活動的環境: "Lives mainly around people",
    主要待在海岸: "Lives mainly on coasts", 主要待在河邊: "Lives mainly along rivers", 主要待在沙漠: "Lives mainly in deserts",
    吃昆蟲這類無脊椎動物: "eats insects and other invertebrates", 什麼都吃: "eats almost anything", 吃果實: "eats fruit", 在水裡抓獵物: "hunts prey in water", 吃種子: "eats seeds", 吸花蜜: "drinks nectar",
    獵捕其他脊椎動物: "hunts other vertebrates", 吃陸上的植物: "eats land plants", 吃水生植物: "eats aquatic plants", 吃腐肉: "eats carrion",
    一年到頭大多待在同一區: "stays in the same area most of the year", 會長途遷徙: "migrates long distances", 有些族群會遷徙: "some populations migrate",
  };
  const IUCN = { 接近受脅: "Near Threatened", 易危: "Vulnerable", 瀕危: "Endangered", 極危: "Critically Endangered", 野外滅絕: "Extinct in the Wild", 已滅絕: "Extinct" };
  const NUMBERS = /^平均約 ([\d.,]+) (公克|公斤)，比資料庫裡 (\d+)% 的鳥重。嘴長 ([\d.,]+) 公釐，腳（跗蹠）長 ([\d.,]+) 公釐。(部分數值是從近親推估的。)?$/;

  function translateFact({ t, d }) {
    if (t === "牠的數字") {
      const m = NUMBERS.exec(d);
      if (!m) return null;
      const unit = m[2] === "公斤" ? "kg" : "g";
      return { t: FACT_TITLES[t], d: `Averages about ${m[1]} ${unit}, heavier than ${m[3]}% of birds in the database. Bill ${m[4]} mm, leg (tarsus) ${m[5]} mm.${m[6] ? " Some values are estimated from close relatives." : ""}` };
    }
    if (t === "牠怎麼過日子") {
      const parts = d.replace(/。$/, "").split("，").map((p) => PHRASES[p]);
      if (parts.some((p) => !p)) return null;
      const text = parts.join(", ");
      return { t: FACT_TITLES[t], d: `${text[0].toUpperCase()}${text.slice(1)}.` };
    }
    if (t === "保育狀況") {
      const status = IUCN[/「(.+)」/.exec(d)?.[1]];
      return status ? { t: FACT_TITLES[t], d: `Listed as ${status} on the IUCN Red List. This data may lag the latest assessment.` } : null;
    }
    return null;
  }

  function create(lang) {
    const table = DICT[lang] || DICT[FALLBACK];
    const raw = (key) => table[key] ?? DICT[FALLBACK][key] ?? key;
    const t = (key, vars = {}) => String(raw(key)).replace(/\{(\w+)\}/g, (all, name) => (name in vars ? vars[name] : all));
    const english = lang === "en";
    return {
      lang,
      t,
      list: raw,
      name: (card) => (english ? card.en || card.sci : card.zh),
      facts: (card) => (english ? card.facts.map(translateFact).filter(Boolean) : card.facts),
      serverError: (code, message) => (english ? (table[`err.${code}`] || table["err.resting"]) : message),
      google: english ? "en" : "zh-TW",
      number: (n) => Number(n).toLocaleString("en-US"),
    };
  }

  function detect(env) {
    const asked = new URLSearchParams(env.location?.search || "").get("lang");
    if (DICT[asked]) { try { env.localStorage.setItem(KEY, asked); } catch { /* 無痕模式：這次仍然有效 */ } return asked; }
    let saved = null;
    try { saved = env.localStorage.getItem(KEY); } catch { /* 無痕模式 */ }
    if (DICT[saved]) return saved;
    const first = (env.navigator?.languages || [env.navigator?.language || ""])[0] || "";
    return /^zh/i.test(first) ? FALLBACK : "en";
  }

  const api = { DICT, FALLBACK, create, detect, translateFact };
  if (typeof module !== "undefined") { module.exports = api; return; }

  const lang = detect(root);
  Object.assign(api, create(lang));
  root.I18n = api;
  document.documentElement.lang = lang;
  document.title = api.t("app.title");
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.innerHTML = api.t(el.dataset.i18n); });
  // 切換鈕在每次重畫的頁首裡，所以掛在 document 上
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".gc-lang")) return;
    const next = lang === "en" ? FALLBACK : "en";
    try { root.localStorage.setItem(KEY, next); } catch { /* 無痕模式 */ }
    const url = new URL(root.location.href);
    url.searchParams.set("lang", next);
    root.location.replace(url);
  });
})(typeof window !== "undefined" ? window : globalThis);
