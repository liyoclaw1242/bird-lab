(function () {
  const E = window.GachaEngine;
  const { HAND, burst, forestPage, forestWide } = window.Scenery;
  const STICKER_BASE = "https://yi-niao-stickers.yi-niao.workers.dev/";
  const TOKEN_KEY = "gacha-token";
  const OFFSET_KEY = "gacha-dev-offset";
  const FIGHT_KEY = "gacha-fight";
  const D = window.GachaData;
  const { SHARE_CAPS, SHARE_DAYS, CLAIMS_PER_DAY } = D;
  const HOLD = { player: 1600, super: 2000, hit: 650, boss: 1250, bossHit: 550 };
  const SLOT_POS = [[17, 48], [44, 24], [78, 37]];
  const { t } = I18n;
  const birdName = I18n.name;
  const bossName = (boss) => t(`boss.${boss.id}`);
  const bossSelf = (boss) => t("boss.self", { name: bossName(boss) });

  const app = document.getElementById("gc-app");
  document.getElementById("gc-woods").innerHTML = window.Scenery.backdrop();
  document.getElementById("gc-falling").innerHTML = window.Scenery.fallingLeaves();

  const esc = (text) => String(text ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const sticker = (c) => STICKER_BASE + c.file;
  const rarityTag = (r) => `<span class="gc-rar ${r}">${r}</span>`;
  const typeTag = (type) => `<span class="gc-type ${type}">${t(`type.${type}`)}</span>`;

  // 貼紙從 Cloudflare 來，第一次看到要等一下：先站一隻紙底的潦草鳥，圖到了再淡入。
  // 載過的網址記下來，重畫畫面時直接標成 ready，不會再閃一次
  const loaded = new Set();
  const absUrl = (src) => new URL(src, location.href).href;
  const pic = (src, alt = "", attrs = "") => `<img class="gc-pic${loaded.has(absUrl(src)) ? " ready" : ""}" src="${esc(src)}" alt="${esc(alt)}" decoding="async" ${attrs}>`;
  document.addEventListener("load", (event) => {
    const el = event.target;
    if (el.tagName === "IMG" && el.classList.contains("gc-pic")) { loaded.add(el.currentSrc || el.src); el.classList.add("landed"); }
  }, true);
  document.addEventListener("error", (event) => {
    const el = event.target;
    if (el.tagName === "IMG" && el.classList.contains("gc-pic")) el.classList.add("failed");
  }, true);
  // 下一個畫面會用到的貼紙先悄悄載好：手上的三隻進戰鬥、抽到的鳥掉下來時都不必再等
  const warming = new Map();
  function preload(src) {
    const url = absUrl(src);
    if (loaded.has(url)) return Promise.resolve(true);
    if (!warming.has(url)) {
      warming.set(url, new Promise((resolve) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => { loaded.add(url); warming.delete(url); resolve(true); };
        img.onerror = () => { warming.delete(url); resolve(false); };
        img.src = url;
      }));
    }
    return warming.get(url);
  }
  const warm = (cards) => cards.forEach((c) => preload(sticker(c)));
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // 林子跟著玩家的時鐘換色：清晨偏粉、黃昏偏橘、夜裡偏藍，只是淡淡一層。?tod= 可以強制指定，方便看效果
  const TOD_ASK = new URLSearchParams(location.search).get("tod");
  function tint() {
    const h = new Date().getHours();
    document.documentElement.dataset.tod = TOD_ASK || (h < 5 ? "night" : h < 8 ? "dawn" : h < 16 ? "day" : h < 19 ? "dusk" : "night");
  }
  tint();
  setInterval(tint, 10 * 60 * 1000);
  document.documentElement.style.setProperty("--gc-bird", window.Scenery.BIRD_URL);

  const memory = {};
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return memory[key] ?? null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { memory[key] = value; } },
    remove(key) { try { localStorage.removeItem(key); } catch { delete memory[key]; } },
  };

  async function call(method, op, { body, query = "" } = {}, retried = false) {
    const token = store.get(TOKEN_KEY);
    const headers = { "content-type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    const offset = store.get(OFFSET_KEY);
    if (offset) headers["x-dev-offset"] = offset;
    const res = await fetch(`/api/gacha?op=${op}${query}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
      .catch(() => { throw Object.assign(new Error(t("err.offline")), { code: "offline" }); });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !retried) {
      await ensurePlayer(true);
      return call(method, op, { body, query }, true);
    }
    if (!res.ok) throw Object.assign(new Error(data.error ? I18n.serverError(data.error, data.message) : t("err.resting")), { code: data.error || "resting", detail: data });
    return data;
  }

  async function ensurePlayer(force = false) {
    if (!force && store.get(TOKEN_KEY)) return;
    store.remove(TOKEN_KEY);
    const { token } = await call("POST", "player", {}, true);
    store.set(TOKEN_KEY, token);
  }

  let S = null;
  let installPrompt = null;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    if (view.screen === "home") render();
  });
  window.addEventListener("appinstalled", () => { installPrompt = null; if (view.screen === "home") render(); });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch((error) => console.error(error));
  let view = { screen: "loading" };
  let hand = [];

  const set = (patch) => { view = { ...view, ...patch }; render(); };

  async function refresh(patch = {}) {
    S = await call("GET", "state");
    hand = S.team.slice();
    view = { ...view, ...patch };
    render();
    warm([...hand, ...S.drawn.map((d) => d.card)]);
  }

  // 網路失敗都走這裡，畫面留下能重試的按鈕，不會卡死
  async function guarded(work, retry) {
    if (view.busy) return;
    view = { ...view, busy: true, error: null };
    render();
    try {
      await work();
      view = { ...view, busy: false };
    } catch (error) {
      console.error(error);
      Sound.play("error");
      view = { ...view, busy: false, error: { message: error.message || t("err.generic"), retry } };
    }
    render();
  }

  function moveLeaves(fight, round) {
    return `<div class="gc-leaves">${fight.script.map((k, i) => {
      const state = round === undefined ? "" : i < round ? "past" : i === round ? "now" : "";
      return `<div class="gc-move ${state}"><b>${t(`intent.${k}`)}</b>${typeTag(fight.forms[i])}</div>`;
    }).join("")}</div>`;
  }

  const chain = `<p class="gc-chain">${t("chain", { meat: typeTag("meat"), mixed: typeTag("mixed"), plant: typeTag("plant") })}</p>`;

  const brand = `<a class="gc-brand" href="/" aria-label="${t("app.name")}"><img src="logo.svg" alt="" width="46" height="46"><span>${t("app.name")}</span></a>`;
  const nav = () => `<header class="gc-header">${brand}<nav class="gc-nav" aria-label="${t("nav.label")}">${["home", "forest", "hand"].map((id) =>
    `<button class="gc-tab" data-go="${id}" ${view.screen === id ? 'aria-current="page"' : ""}>${t(`nav.${id}`)}</button>`).join("")}</nav><button type="button" class="gc-lang"><span aria-hidden="true">🌐</span> ${t("lang.switch")}</button></header>`;

  const errorBox = () => (view.error ? `<div class="gc-scrap" role="alert"><p class="gc-h">${esc(view.error.message)}</p><button class="gc-plank" data-do="retry">${esc(view.error.label || t("retry"))}</button></div>` : "");
  // 載入中：一隻潦草鳥在紙上跳，不只是一行字
  const loadingBox = () => `<div class="gc-scrap gc-loading" role="status">${window.Scenery.birdSvg("hop")}<p>${t("loading")}</p></div>`;

  const miniTree = `<svg viewBox="0 0 60 64" aria-hidden="true"><path d="M26 62 L28 34 L32 34 L35 62 Z" fill="#3f3019"/><path d="M30 3 C47 3 57 14 54 26 C58 38 44 44 32 40 C20 45 4 39 7 27 C3 14 14 3 30 3 Z" fill="#2f4d1d" stroke="#1b2b10" stroke-width="2"/></svg>`;
  const LEAF_ICON = (color) => `<svg viewBox="-14 -18 28 38" aria-hidden="true"><path d="${window.Scenery.LEAF}" fill="${color}" stroke="#3d2b14" stroke-width="1.4"/></svg>`;

  function historyStrip() {
    const stars = Object.fromEntries(S.history.map((h) => [h.day, h.stars]));
    const color = { 0: "#8d7f60", 1: "#b8732a", 2: "#a9561f", 3: "#d99a1c" };
    const cells = Array.from({ length: 14 }, (_, i) => E.addDays(S.day, i - 13)).map((d) => {
      const s = stars[d];
      return `<span title="${d}">${LEAF_ICON(s === undefined ? "#d9ceae" : color[s])}<i>${s === undefined ? "" : s || "✕"}</i></span>`;
    }).join("");
    return `<div class="gc-scrap tilt-r"><p class="gc-h">${t("history", { n: S.streak })}</p><div class="gc-strip">${cells}</div></div>`;
  }

  function homeScreen() {
    const { fight, draws, result } = S;
    const complete = S.owned >= S.total;
    const shake = (kind, title, note, disabled) => `<button class="gc-shake" data-draw="${kind}" ${disabled ? "disabled" : ""}>${miniTree}<span>${title}<small>${note}</small></span></button>`;
    const fightBtn = result
      ? `<button class="gc-plank" disabled>${t("home.foughtStars", { n: result.stars })}</button>`
      : hand.length === E.TEAM_SIZE
        ? `<button class="gc-plank hot" data-do="start">${t("home.challenge")}</button>`
        : `<button class="gc-plank" data-go="hand">${t("home.needThree")}</button>`;
    return `${nav()}
      <div class="gc-columns"><div class="gc-col-main">
      <section class="gc-clearing">
        <div class="gc-today-boss">
          <div class="gc-scrap gc-boss-note tilt"><span>${t("home.bossToday")}</span><b>${esc(bossSelf(fight.boss))}</b><span>${S.day}</span></div>
          <img class="gc-perched" src="${fight.boss.img}" alt="${esc(t("home.stickerAlt", { name: bossName(fight.boss) }))}" fetchpriority="high">
        </div>
        <div class="gc-scrap tilt-r"><p class="gc-h">${t("home.fiveMoves")}</p>${moveLeaves(fight)}${chain}</div>
      </section>
      </div><div class="gc-col-side">
      <div class="gc-trees">
        ${shake("free", complete ? t("draw.complete") : draws.free ? t("draw.done") : t("draw.free"), t("draw.freeNote"), draws.free || complete)}
        ${result?.stars > 0 && !complete ? shake("bonus", draws.bonus ? t("draw.bonusDone") : t("draw.bonus"), t("draw.bonusNote"), draws.bonus) : ""}
      </div>
      <div style="margin-top:12px">${fightBtn}</div>
      ${handCard()}
      ${errorBox()}
      <div style="height:12px"></div>
      ${todayDraws()}
      ${S.owned < S.total ? oddsBox() : ""}
      ${historyStrip()}
      ${installBox()}
      ${accountBox()}
      ${S.dev ? `<div class="gc-scrap gc-dev"><p>${t("dev.note")}</p><button class="gc-plank" data-do="next-day">${t("dev.nextDay")}</button><button class="gc-plank" data-do="new-player">${t("dev.newPlayer")}</button></div>` : ""}
      </div></div>
      ${shakeStage()}${cardStage()}`;
  }

  // 桌機的側欄多一張「今天帶的三隻」：出發前就看得到誰對今天的 BOSS 有利，不用先跑去手上那頁
  function handCard() {
    const rows = hand.map((c, i) => `<button class="gc-mini-row" data-open-hand="${i}">${pic(sticker(c))}<span>${esc(birdName(c))} ${rarityTag(c.rarity)} ${typeTag(c.type)}<small>${t("hand.today", { text: matchup(c, S.fight) })}</small></span></button>`).join("");
    const body = rows ? `<div class="gc-mini-list">${rows}</div>` : `<div class="gc-empty">${window.Scenery.birdSvg()}<p class="gc-sub">${t("home.handEmpty")}</p></div>`;
    return `<div class="gc-scrap gc-desk-only gc-hand-card"><p class="gc-h">${t("home.handTitle")}</p>${body}<button class="gc-text-btn" data-go="hand">${t("home.handEdit")}</button></div>`;
  }

  function todayDraws() {
    if (!S.drawn.length) return "";
    const rows = S.drawn.map((d) => `<div class="gc-gift-row">${pic(sticker(d.card))}<span>${esc(birdName(d.card))} ${rarityTag(d.card.rarity)}<small>${d.share ? t("share.claimed", d.share) : t("share.max", { n: SHARE_CAPS[d.card.rarity] })}</small></span><button class="gc-plank" data-share="${d.kind}">${t("share.button")}</button></div>`).join("");
    return `<div class="gc-scrap"><p class="gc-h">${t("share.today")}</p>${rows}${view.card ? "" : shareBox()}</div>`;
  }

  function shareBox() {
    const link = view.shareLink;
    if (!link) return "";
    return `<div class="gc-share-box"><input readonly value="${esc(link.url)}" aria-label="${t("share.linkLabel")}"><button class="gc-plank hot" data-do="copy-link">${link.copied ? t("copied") : t("copy")}</button><small>${t("share.note", { days: SHARE_DAYS, cap: link.cap })}</small></div>`;
  }

  function installBox() {
    if (matchMedia("(display-mode: standalone)").matches || navigator.standalone || store.get("gacha-install-hidden")) return "";
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (!installPrompt && !ios) return "";
    const action = installPrompt
      ? `<button class="gc-plank hot" data-do="install">${t("install.button")}</button>`
      : `<p class="gc-sub">${t("install.ios")}</p>`;
    return `<div class="gc-scrap gc-install"><p class="gc-h">${t("install.title")}</p>${action}<button class="gc-text-btn" data-do="hide-install">${t("install.hide")}</button></div>`;
  }

  function accountBox() {
    if (S.google) {
      return `<div class="gc-scrap gc-backup"><p class="gc-h">${t("account.bound")}</p><p class="gc-sub">${t("account.boundNote")}</p><div class="gc-row"><button class="gc-plank" data-do="logout">${t("account.logout")}</button></div></div>`;
    }
    const ask = view.switchAsk;
    const google = !S.googleClientId ? "" : ask
      ? `<div class="gc-scrap gc-backup" role="alert"><p class="gc-h">${t("account.switchTitle")}</p><p class="gc-sub">${t("account.switchNote", ask)}</p><div class="gc-row"><button class="gc-plank hot" data-do="confirm-switch">${t("account.switch")}</button><button class="gc-plank" data-do="cancel-switch">${t("account.stay")}</button></div></div>`
      : `<div class="gc-scrap gc-backup"><p class="gc-h">${t("account.bind")}</p><p class="gc-sub">${t("account.bindNote")}</p><div id="gc-google" class="gc-google"></div></div>`;
    return google + backupBox();
  }

  // Google 按鈕是它自己畫的，每次重畫畫面後要重新掛上去
  let googleLoading = null;
  function mountGoogle() {
    const box = document.getElementById("gc-google");
    if (!box || !S?.googleClientId) return;
    googleLoading ||= new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://accounts.google.com/gsi/client?hl=${I18n.google}`;
      script.onload = () => {
        // 整頁跳轉：不靠彈出視窗，瀏覽器封鎖彈窗時也能登入。回來的憑證由 boot 接手
        window.google.accounts.id.initialize({ client_id: S.googleClientId, ux_mode: "redirect", login_uri: `${location.origin}/auth/google` });
        resolve();
      };
      script.onerror = () => { googleLoading = null; reject(new Error(t("err.googleLoad"))); };
      document.head.append(script);
    });
    googleLoading.then(() => {
      const current = document.getElementById("gc-google");
      if (current) window.google.accounts.id.renderButton(current, { theme: "outline", size: "large", text: "continue_with", locale: I18n.google, width: Math.min(current.clientWidth || 280, 400) });
    }).catch((error) => { box.textContent = error.message; });
  }

  function googleLogin(credential, confirm = false) {
    return guarded(async () => {
      try {
        const result = await call("POST", "login", { body: { credential, confirm } });
        store.set(TOKEN_KEY, result.token);
        if (result.switched) store.remove(FIGHT_KEY);
        await refresh({ screen: "home", switchAsk: null, backup: false, card: null });
      } catch (error) {
        if (error.code !== "needs_switch") throw error;
        view = { ...view, switchAsk: { credential, here: error.detail.here, there: error.detail.there } };
      }
    }, () => googleLogin(credential, confirm));
  }

  function logout() {
    return guarded(async () => {
      await call("POST", "logout");
      store.remove(TOKEN_KEY);
      store.remove(FIGHT_KEY);
      await ensurePlayer();
      await refresh({ screen: "home" });
    }, logout);
  }

  function backupBox() {
    const open = view.backup;
    return `<details class="gc-scrap gc-backup" ${open ? "open" : ""}><summary data-do="toggle-backup">${t("backup.title")}</summary>
      <p class="gc-sub">${t("backup.note")}</p>
      <div class="gc-row"><button class="gc-plank" data-do="copy-code">${view.codeCopied ? t("copied") : t("backup.copy")}</button></div>
      <label class="gc-restore">${t("backup.have")}<input id="gc-restore-code" autocomplete="off" spellcheck="false" placeholder="${t("backup.paste")}"></label>
      <div class="gc-row"><button class="gc-plank" data-do="restore">${t("backup.restore")}</button></div>
      ${view.restoreError ? `<p class="gc-bad" role="alert">${esc(view.restoreError)}</p>` : ""}
    </details>`;
  }

  function giftNotice() {
    const g = view.gift;
    if (!g) return "";
    const lines = {
      open: t("gift.open", { left: g.left, cap: g.cap, day: esc(g.lastDay) }),
      mine: t("gift.mine", g),
      owned: t("gift.owned"),
    };
    return `<p class="gc-gift-note">${lines[g.status]}</p>`;
  }

  function giftAction(c) {
    const g = view.gift;
    if (g.status === "open") return `<div class="gc-row"><button class="gc-plank hot" data-do="claim">${t("gift.claim")}</button><button class="gc-plank" data-do="close-card">${t("gift.skip")}</button></div><small class="gc-note-small">${t("gift.limit", { n: CLAIMS_PER_DAY })}</small>`;
    return `<div class="gc-row"><button class="gc-plank hot" data-do="close-card">${t("gotIt")}</button></div>`;
  }

  function playRarityFx(rarity) {
    Sound.play(rarity);
    const { html, ms } = window.Scenery.rarityFx(rarity);
    const holder = document.createElement("div");
    holder.innerHTML = html;
    const fx = holder.firstElementChild;
    document.body.append(fx);
    setTimeout(() => fx.remove(), ms + 400);
  }

  // 搖樹：結果一到，view.shaking 就從 true 變成稀有度，葉子先換色當預告
  function shakeStage() {
    if (!view.shaking) return "";
    const told = typeof view.shaking === "string" ? `rar-${view.shaking}` : "";
    return `<div class="gc-shaking ${told}"><div class="gc-shake-glow"></div>${window.Scenery.shakeTree()}${burst()}</div>`;
  }

  // 機率寫在遊戲裡而不是藏在別頁：有保底和補運時，玩家要看得到自己這一抽的實際機率
  function oddsBox() {
    const o = S.odds;
    const pct = (p) => { const v = p * 100; return `${v >= 10 || Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)}%`; };
    const rows = D.TIERS.map((tier) => `<li>${rarityTag(tier)} <span>${t("odds.base", { p: pct(D.RATES[tier]) })}</span><b>${t("odds.next", { p: pct(o.next[tier]) })}</b></li>`).join("");
    return `<details class="gc-scrap gc-odds"><summary>${t("odds.summary", { ssr: o.ssrIn, ur: o.urIn })}</summary>
      <ul>${rows}</ul>
      <p>${t("odds.pity", { ssr: D.PITY.SSR.soft, ur: D.PITY.UR.soft })}</p>
      <p>${t("odds.catchUp", { max: D.CATCH_UP.max, min: D.CATCH_UP.minDraws, boost: o.boost.toFixed(2) })}</p>
      <p>${t("odds.average")}</p></details>`;
  }

  const STORY_FACTS = ["第一印象", "你可能不知道"];
  // 部分照片來源只記錄「CC BY」沒有版本，連到照片頁才看得到實際條款，這裡不猜版本
  function licenseUrl(name) {
    if (name.startsWith("PolyForm")) return "https://polyformproject.org/licenses/shield/1.0.0";
    if (name.startsWith("CC0")) return "https://creativecommons.org/publicdomain/zero/1.0/";
    const m = /^CC (BY(?:-SA)?) ([\d.]+)(?: (\w+))?$/.exec(name);
    return m ? `https://creativecommons.org/licenses/${m[1].toLowerCase()}/${m[2]}/${m[3] ? `${m[3]}/` : ""}` : null;
  }
  function licenseLink(name) {
    const url = licenseUrl(name);
    return url ? `<a href="${url}" target="_blank" rel="noopener">${esc(name)}</a>` : esc(name);
  }

  function cardStage() {
    if (!view.card) return "";
    const c = view.card;
    const facts = I18n.facts(c).map((n) => `<li><b>${esc(n.t)}</b>${esc(n.d)}</li>`).join("");
    const art = c.credit
      ? `${c.credit.page ? `<a href="${esc(c.credit.page)}" target="_blank" rel="noopener">${esc(c.credit.artist)}</a>` : esc(c.credit.artist)} · ${licenseLink(c.credit.license)}${t("card.bgRemoved")}`
      : `[removed] · ${licenseLink("PolyForm Shield 1.0.0")}`;
    // 趣聞的授權跟著文字走，少數牌沒有記錄參考條目，一樣要標示
    const hasStory = I18n.facts(c).some((n) => STORY_FACTS.includes(n.t));
    const text = hasStory
      ? `${t("card.storyLabel")}<a href="[removed]" target="_blank" rel="noopener">[removed]</a>${c.source ? `、<a href="${esc(c.source)}" target="_blank" rel="noopener">${t("card.wikiSource")}</a>` : ""} · ${licenseLink("CC BY-SA 4.0")}${t("card.storyConverted")}`
      : "";
    const inHand = hand.some((b) => b.id === c.id);
    const swap = view.swapping
      ? `<div class="gc-swap"><p>${t("card.swap")}</p><div class="gc-swap-grid">${hand.map((b) => `<button data-replace="${esc(b.id)}">${pic(sticker(b))}${esc(birdName(b))} ${rarityTag(b.rarity)}</button>`).join("")}</div></div>`
      : "";
    const canShare = view.drew && view.drawKind;
    // 掉落動畫只播一次，之後按分享或複製重畫時不再重播
    const dropping = view.drew && !view.landed;
    view.landed = view.drew;
    const action = view.gift ? giftAction(c)
      : view.drew
      ? `<div class="gc-row">${canShare ? `<button class="gc-plank" data-share="${view.drawKind}">${t("card.shareTo", { n: SHARE_CAPS[c.rarity] })}</button>` : ""}<button class="gc-plank hot" data-do="close-card">${t("card.fly")}</button></div>${shareBox()}`
      : inHand
        ? `<div class="gc-row"><button class="gc-plank" data-release="${esc(c.id)}">${t("card.release")}</button><button class="gc-plank hot" data-do="close-card">${t("close")}</button></div>`
        : `<div class="gc-row"><button class="gc-plank hot" data-take="${esc(c.id)}">${t("card.take")}</button><button class="gc-plank" data-do="close-card">${t("close")}</button></div>`;
    return `<div class="gc-stage" role="dialog" aria-modal="true" aria-label="${esc(birdName(c))}"><article class="gc-note-card aura-${c.rarity} ${dropping ? "dropping" : ""}">
      <span class="gc-stamp ${c.rarity}">${c.rarity}</span>
      ${giftNotice()}
      ${pic(sticker(c), t("home.stickerAlt", { name: birdName(c) }), 'fetchpriority="high"').replace('class="gc-pic', 'class="gc-card-bird gc-pic')}
      <p class="gc-credit">${t("card.sticker")}${art}${text}</p>
      <b class="gc-name">${esc(birdName(c))}</b><span class="gc-sci">${esc(c.sci)}</span>
      <div class="gc-statline"><span>${t("card.stats", c)}</span>${typeTag(c.type)}</div>
      <ol class="gc-facts">${facts}</ol>
      ${swap}${view.swapping ? "" : action}
    </article></div>`;
  }

  function forestScreen() {
    const f = view.collection;
    if (!f) return `${nav()}${errorBox()}<div class="gc-center">${view.error ? "" : loadingBox()}</div>`;
    // 直版和橫版的林子都畫好，CSS 依寬度只顯示一張；鳥的按鈕只有一組，兩種位置都寫在變數裡
    const scene = forestPage(f.page, f.cards.length);
    const wide = forestWide(f.page, f.cards.length);
    const inHand = new Set(hand.map((b) => b.id));
    const pct = (n) => `${n.toFixed(1)}%`;
    const birds = f.cards.map((c, i) => {
      const p = scene.perches[i], q = wide.perches[i];
      const pos = `--l:${pct(p.left)};--t:${pct(p.top)};--w:${pct(p.size)};--lw:${pct(q.left)};--tw:${pct(q.top)};--ww:${pct(q.size)}`;
      return `<button class="gc-perched-bird ${c.rarity} ${inHand.has(c.id) ? "in-hand" : ""} ${i % 3 === 1 ? "flip" : ""}" style="${pos}" data-open="${esc(c.id)}" data-tag="${esc(t("forest.inHand"))}" aria-label="${esc(t("card.view", { name: birdName(c) }))}">${pic(sticker(c))}</button>`;
    }).join("");
    // 桌機的側欄多一份名單：鳥多了以後，用名字找比在樹上找快
    const roster = f.cards.length ? `<div class="gc-scrap gc-desk-only"><p class="gc-h">${t("forest.list")}</p><div class="gc-roster">${f.cards.map((c) =>
      `<button data-open="${esc(c.id)}">${pic(sticker(c), "", 'loading="lazy"')}<span>${esc(birdName(c))} ${rarityTag(c.rarity)} ${typeTag(c.type)}${inHand.has(c.id) ? ` <span class="gc-stamp-mini">${t("forest.inHand")}</span>` : ""}</span><small>${t("hand.stats", c)}</small></button>`).join("")}</div></div>` : "";
    return `${nav()}
      <div class="gc-columns"><div class="gc-col-main">
      <div class="gc-forest">${scene.svg}${wide.svg}${birds}</div>
      </div><div class="gc-col-side">
      <div class="gc-scrap tilt"><h1 class="gc-title">${t("nav.forest")}</h1><p class="gc-sub">${t("forest.note", { here: f.cards.length, owned: f.owned, left: I18n.number(S.total - f.owned) })}</p></div>
      ${errorBox()}
      <div class="gc-pages">
        <button class="gc-plank" data-page="${f.page - 1}" ${f.page <= 0 ? "disabled" : ""}>${t("forest.back")}</button>
        <span class="gc-scrap" style="white-space:nowrap;padding:4px 10px">${t("forest.page", { page: f.page + 1, pages: f.pages })}</span>
        <button class="gc-plank" data-page="${f.page + 1}" ${f.page + 1 >= f.pages ? "disabled" : ""}>${t("forest.next")}</button>
      </div>
      ${roster}
      </div></div>${cardStage()}`;
  }

  function matchup(c, fight) {
    const forms = [...new Set(fight.forms)];
    return forms.map((form) => {
      const mul = E.typeMul(c.type, form);
      const cls = mul > 1 ? "gc-good" : mul < 1 ? "gc-bad" : "";
      return t("match.vs", { type: t(`type.${form}`), verdict: `<span class="${cls}">${t(mul > 1 ? "match.good" : mul < 1 ? "match.bad" : "match.even")}</span>` });
    }).join(t("match.sep"));
  }

  function handScreen() {
    const slots = SLOT_POS.map(([left, top], i) => {
      const c = hand[i];
      const style = `left:${left}%;top:${top}%`;
      return c
        ? `<button class="gc-slot" style="${style}" data-open-hand="${i}" aria-label="${esc(t("card.view", { name: birdName(c) }))}">${pic(sticker(c))}</button>`
        : `<button class="gc-slot empty" style="${style}" data-go="forest">${t("hand.find")}</button>`;
    }).join("");
    const rows = hand.map((c) => `<div class="gc-team-row"><span>${esc(birdName(c))} ${rarityTag(c.rarity)} ${typeTag(c.type)}</span><span>${t("hand.stats", c)}</span><small style="grid-column:1/3">${t("hand.today", { text: matchup(c, S.fight) })}</small></div>`).join("");
    const fightBtn = S.result ? `<button class="gc-plank" disabled>${t("hand.fought")}</button>`
      : hand.length === E.TEAM_SIZE ? `<button class="gc-plank hot" data-do="start">${t("hand.go", { name: esc(bossName(S.fight.boss)) })}</button>`
      : `<button class="gc-plank" data-go="forest">${t("hand.short", { n: E.TEAM_SIZE - hand.length })}</button>`;
    return `${nav()}
      <div class="gc-columns"><div class="gc-col-main">
      <div class="gc-hand">${HAND}${slots}</div>
      </div><div class="gc-col-side">
      <div class="gc-scrap tilt"><h1 class="gc-title">${t("nav.hand")}</h1><p class="gc-sub">${t("hand.note", { n: E.TEAM_SIZE })}</p></div>
      ${errorBox()}
      <div class="gc-scrap tilt-r">${rows ? `<div class="gc-team-list">${rows}</div>` : `<div class="gc-empty">${window.Scenery.birdSvg()}<p class="gc-h">${t("hand.empty")}</p></div>`}</div>
      <div class="gc-scrap gc-desk-only"><p class="gc-h">${esc(bossSelf(S.fight.boss))}</p><p class="gc-sub">${t("home.fiveMoves")}</p>${moveLeaves(S.fight)}${chain}</div>
      <div style="margin-top:12px">${fightBtn}</div>
      </div></div>
      ${cardStage()}`;
  }

  function doodleSvg(d) {
    return `<svg viewBox="0 0 300 300" aria-hidden="true"><g class="gc-doodle" filter="url(#wobble)">${d.svg}</g></svg>`;
  }

  function cutIn() {
    const a = view.anim;
    if (!a) return "";
    if (a.phase === "player") {
      const d = view.doodles[a.card.id];
      const art = d ? `<div class="gc-cutin-art ${d.faceRight ? "" : "flip"}">${doodleSvg(d)}</div>` : `<div class="gc-cutin-art"><img src="${sticker(a.card)}" alt=""></div>`;
      const hold = a.signature ? HOLD.super : HOLD.player;
      return `<div class="gc-cutin left rar-${a.card.rarity} ${a.signature ? "super" : ""}" style="--hold:${hold}ms">${window.Scenery.cutinLeaves(a.card.rarity)}${art}<div class="gc-cutin-text"><small>${rarityTag(a.card.rarity)} ${esc(birdName(a.card))}${a.signature ? t("fight.signatureOf") : ""}</small><b>${esc(a.word)}</b><em>${t("fight.damage", { n: Math.round(a.dealt) })}</em></div></div>`;
    }
    if (a.phase === "boss") {
      const flip = view.bossFaceRight ? "" : "flip";
      return `<div class="gc-cutin right" style="--hold:${HOLD.boss}ms"><div class="gc-cutin-art ${flip}"><img src="${view.fight.boss.img}" alt=""></div><div class="gc-cutin-text"><small>${esc(bossSelf(view.fight.boss))}</small><b>${esc(t(`line.${a.intent}`))}</b><em>${t("fight.counter", { n: Math.round(a.taken) })}</em></div></div>`;
    }
    return "";
  }

  function fightScreen() {
    const { fight, team, state, signature, log, anim, active, best } = view;
    const over = E.isOver(state);
    const locked = !!anim || over;
    const totalHp = team.reduce((sum, c) => sum + c.def * E.HP_PER_DEF, 0);
    const hpPct = Math.round((state.hp.reduce((a, b) => a + b, 0) / totalHp) * 100);
    const bossPct = Math.max(0, Math.round((1 - state.score / best) * 100));
    const ticks = E.STAR_CUTS.map((cut) => `<u style="right:${((1 - cut) * 100).toFixed(0)}%"></u>`).join("");
    const shown = team[active ?? 0];
    const myFlip = view.doodles[shown.id] && !view.doodles[shown.id].faceRight ? "flip" : "";
    const bossFlip = view.bossFaceRight ? "flip" : "";
    const mine = anim?.phase === "hit" ? "lunge" : anim?.phase === "bossHit" ? "struck" : "";
    const theirs = anim?.phase === "hit" ? "struck" : anim?.phase === "bossHit" ? "lunge" : "";
    const float = anim?.phase === "hit" ? `<div class="gc-float right rar-${shown.rarity}">-${Math.round(anim.dealt)}</div>` : anim?.phase === "bossHit" ? `<div class="gc-float left">-${Math.round(anim.taken)}</div>` : "";
    const cards = team.map((c, i) => {
      const legal = !locked && E.legalSlots(state).includes(i);
      const down = state.hp[i] <= 0;
      const pct = Math.round((state.hp[i] / (c.def * E.HP_PER_DEF)) * 100);
      const p = legal && E.preview(fight, team, state, i, signature);
      const fatal = legal && p.taken >= state.hp[i];
      const info = down ? `<span class="gc-tired">${t("fight.down")}</span>`
        : locked ? ""
        : !legal ? `<span class="gc-tired">${t("fight.tired")}</span>`
        : `<span class="gc-preview"><span class="dealt">${t("fight.deal", { n: Math.round(p.dealt) })}</span>${t("fight.sep")}<span class="taken">${t("fight.take", { n: Math.round(p.taken) })}</span>${fatal ? `<span class="fatal">${t("fight.fatal")}</span>` : ""}</span>`;
      return `<button class="gc-act rim-${c.rarity} ${down ? "down" : ""}" data-play="${i}" ${legal ? "" : "disabled"}><span class="gc-act-name">${esc(birdName(c))}</span>${pic(sticker(c))}<span class="gc-hp" style="display:block" aria-label="${t("fight.hp", { n: pct })}"><i class="${pct < 35 ? "low" : ""}" style="width:${pct}%"></i></span>${rarityTag(c.rarity)} ${typeTag(c.type)}${info}</button>`;
    }).join("");
    const round = Math.min(state.round, E.ROUNDS - 1);
    // 手機上下一欄；桌機左邊擂台、右邊出招
    return `<div class="gc-columns"><div class="gc-col-main">
      <div class="gc-versus">
        <div class="gc-bar-side"><span class="gc-bar-name">${t("fight.team")}</span><div class="gc-bar ${hpPct < 35 ? "low" : ""}" aria-label="${t("fight.teamHp", { n: hpPct })}"><i style="width:${hpPct}%"></i></div></div>
        <div class="gc-round">${round + 1}/${E.ROUNDS}</div>
        <div class="gc-bar-side right"><span class="gc-bar-name">${esc(bossSelf(fight.boss))}</span><div class="gc-bar boss" aria-label="${t("fight.bossHp", { n: bossPct })}"><i style="width:${bossPct}%"></i>${ticks}</div></div>
      </div>
      <div class="gc-arena">${float}
        <div class="gc-fighter left aura-${shown.rarity} ${myFlip} ${mine}"><span class="gc-fighter-tag">${rarityTag(shown.rarity)} ${esc(birdName(shown))}</span>${pic(sticker(shown), birdName(shown))}</div>
        <div class="gc-fighter right ${bossFlip} ${theirs}"><img src="${fight.boss.img}" alt="${esc(bossName(fight.boss))}"></div>
      </div>
      </div><div class="gc-col-side">
      <div class="gc-scrap" style="padding:6px 8px">${moveLeaves(fight, round)}</div>
      <p class="gc-scrap gc-log" aria-live="polite">${esc(log)}</p>
      <button class="gc-sig" data-do="toggle-sig" aria-pressed="${signature}" ${state.signatureUsed || locked ? "disabled" : ""}>${state.signatureUsed ? t("sig.used") : signature ? t("sig.ready") : t("sig.use")}</button>
      <div class="gc-actions">${cards}</div>
      ${errorBox()}
      </div></div>
      ${cutIn()}`;
  }

  function resultScreen() {
    const r = view.result;
    // 亮的星一顆顆蹦出來，和音效的節奏一致
    const stars = Array.from({ length: r.stars }, (_, i) => `<i style="--i:${i}">★</i>`).join("") + `<span>${"★".repeat(3 - r.stars)}</span>`;
    const words = I18n.list("result.words")[r.stars];
    const pct = Math.round((r.score / r.best) * 100);
    return `<div class="gc-scrap gc-result" style="margin-top:18px">
        <img src="${view.fight.boss.img}" alt="${esc(bossName(view.fight.boss))}">
        <div class="gc-stars" aria-label="${t("result.stars", { n: r.stars })}">${stars}</div>
        <p class="gc-h">${words}</p>
        <p class="gc-tip">${t("result.tip", { score: Math.round(r.score), best: Math.round(r.best), pct, a: E.STAR_CUTS[0] * 100, b: E.STAR_CUTS[1] * 100, c: E.STAR_CUTS[2] * 100 })}</p>
      </div>
      <div style="margin-top:12px"><button class="gc-plank hot" data-go="home">${t(r.stars > 0 ? "result.homeMore" : "result.home")}</button></div>`;
  }

  function render() {
    const scroll = window.scrollY;
    const screens = { home: homeScreen, forest: forestScreen, hand: handScreen, fight: fightScreen, result: resultScreen };
    if (view.screen === "loading") {
      app.innerHTML = `<div class="gc-center">${view.error ? errorBox() : loadingBox()}</div>`;
      return;
    }
    app.dataset.screen = view.screen;
    app.innerHTML = screens[view.screen]();
    // 瀏覽器快取裡已經有的圖，重畫時就直接算到位，不會先閃出佔位鳥；反過來，記得載過但快取已經沒了的，就退回佔位鳥
    app.querySelectorAll("img.gc-pic").forEach((img) => {
      const url = img.currentSrc || img.src;
      if (img.complete && img.naturalWidth) { loaded.add(url); img.classList.add("ready"); }
      else if (img.classList.contains("ready")) { loaded.delete(url); img.classList.remove("ready"); }
    });
    mountGoogle();
    window.scrollTo(0, scroll);
  }

  async function openForest(page = 0) {
    set({ screen: "forest", collection: view.screen === "forest" ? view.collection : null, card: null, swapping: false });
    await guarded(async () => {
      view.collection = await call("GET", "collection", { query: `&page=${page}` });
    }, () => openForest(page));
    if (page !== 0) window.scrollTo(0, 0);
  }

  function draw(kind) {
    return guarded(async () => {
      const shaken = wait(1000);
      Sound.play("rustle");
      view = { ...view, shaking: true };
      render();
      let result;
      try {
        result = await call("POST", "draw", { body: { kind } });
        // 結果一到先讓葉子換色：金葉、七彩葉是稀有的預告。直接改 class，不重畫，漸變才接得上
        view.shaking = result.card.rarity;
        document.querySelector(".gc-shaking")?.classList.add(`rar-${result.card.rarity}`);
        // 貼紙載好才讓卡片掉下來，不然卡片上會先是一個空框。快取裡有的話不會比以前慢，最多多等 3 秒
        await Promise.all([shaken, wait(450), Promise.race([preload(sticker(result.card)), wait(3000)])]);
      } finally {
        view = { ...view, shaking: false };
      }
      await refresh({ card: result.card, drew: true, landed: false, drawKind: kind, shareLink: null });
      playRarityFx(result.card.rarity);
    }, () => draw(kind));
  }

  async function saveHand(next) {
    hand = next;
    render();
    if (hand.length === E.TEAM_SIZE) {
      await guarded(() => call("POST", "team", { body: { team: hand.map((c) => c.id) } }), () => saveHand(next));
    }
  }

  // 戰鬥過程存在這台裝置，重新整理或關掉分頁都會接著打，不能重來。
  // 招式和數值本來就公開，算得出最佳解的人不必靠重來，所以不必每回合都打一次 API
  function saveFight() {
    store.set(FIGHT_KEY, JSON.stringify({ day: S.day, team: view.team, moves: view.moves }));
  }
  const loadFight = () => { try { return JSON.parse(store.get(FIGHT_KEY)); } catch { return null; } };

  async function enterFight(team, moves) {
    const traced = await Promise.all(team.map((c) => window.Doodle.get(sticker(c), c.id)));
    const bossTrace = await window.Doodle.get(new URL(S.fight.boss.img, location.href).href, S.fight.boss.id);
    const state = moves.reduce((s, m) => E.step(S.fight, team, s, m.slot, m.signature), E.startState(team));
    view = {
      screen: "fight", fight: S.fight, best: S.best, team, state, moves, signature: false,
      active: moves.length ? moves[moves.length - 1].slot : 0,
      log: moves.length ? t("fight.resume") : t("fight.start"),
      anim: null, doodles: Object.fromEntries(team.map((c, i) => [c.id, traced[i]])),
      bossFaceRight: bossTrace ? bossTrace.faceRight : false,
    };
    saveFight();
  }

  async function startFight() {
    if (hand.length !== E.TEAM_SIZE || S.result) return;
    await guarded(async () => {
      await refresh();
      if (S.result) return;
      await enterFight(hand.slice(), []);
      Sound.play("start");
    }, startFight);
    window.scrollTo(0, 0);
  }

  let animTimer = null;
  let animSteps = [];
  function runSteps(steps) {
    animSteps = steps;
    nextStep();
  }
  function nextStep() {
    clearTimeout(animTimer);
    const step = animSteps.shift();
    if (!step) return;
    step.run();
    if (step.ms) animTimer = setTimeout(nextStep, step.ms);
  }

  const HIT_SOUND = { SR: "hitSR", SSR: "hitSSR", UR: "hitUR" };

  function play(slot) {
    const { fight, team, state, signature, anim } = view;
    if (anim || E.isOver(state) || !E.legalSlots(state).includes(slot)) return;
    const card = team[slot];
    const before = state;
    const { dealt, taken } = E.preview(fight, team, before, slot, signature);
    const next = E.step(fight, team, before, slot, signature);
    const intent = fight.script[before.round];
    const pool = I18n.list(signature ? "move.super" : `move.${card.type}`);
    const word = pool[Math.floor(Math.random() * pool.length)];
    const moves = [...view.moves, { slot, signature }];
    const fainted = next.hp[slot] <= 0;
    view.moves = moves;
    saveFight();
    // 分數先動、血量等 BOSS 打回來才扣，血條才會跟著畫面走
    const midway = { ...next, hp: before.hp };
    runSteps([
      { ms: signature ? HOLD.super : HOLD.player, run: () => { Sound.play(signature ? "super" : "attack"); set({ active: slot, moves, signature: false, anim: { phase: "player", card, signature, word, dealt } }); } },
      { ms: HOLD.hit, run: () => { Sound.play(HIT_SOUND[card.rarity] || "hit"); set({ state: midway, anim: { phase: "hit", dealt }, log: t("fight.logHit", { name: birdName(card), word, n: Math.round(dealt) }) }); } },
      { ms: HOLD.boss, run: () => { Sound.play("boss"); set({ anim: { phase: "boss", intent, taken } }); } },
      { ms: HOLD.bossHit, run: () => { Sound.play(fainted ? "faint" : "bossHit"); set({ state: next, anim: { phase: "bossHit", taken }, log: t(fainted ? "fight.logBossDown" : "fight.logBoss", { boss: bossName(fight.boss), intent: t(`intent.${intent}`), n: Math.round(taken), name: birdName(card) }) }); } },
      { run: () => { set({ anim: null }); if (E.isOver(next)) submit(); } },
    ]);
  }

  function submit() {
    const { team, moves, fight } = view;
    return guarded(async () => {
      const result = await call("POST", "fight", { body: { team: team.map((c) => c.id), moves } });
      store.remove(FIGHT_KEY);
      await refresh({ screen: "result", result, fight, anim: null });
      Sound.play(`stars${result.stars}`);
    }, submit);
  }

  function clickSound(d) {
    if (d.draw || d.play !== undefined || d.do === "start" || d.do === "claim") return null;
    if (d.release) return "release";
    if (d.take || d.replace) return hand.length >= E.TEAM_SIZE && !d.replace ? "tap" : "take";
    if (d.do === "toggle-sig") return view.signature ? "tap" : "charge";
    if (d.do === "copy-link" || d.do === "copy-code") return "ding";
    if (d.open || d.openHand !== undefined) return "chirp";
    return "tap";
  }

  document.addEventListener("click", (event) => {
    if (view.anim && animSteps.length) { nextStep(); return; }
    const el = event.target.closest("button");
    if (!el || el.disabled) return;
    const d = el.dataset;
    Sound.play(clickSound(d));
    if (d.go) {
      if (d.go === "forest") return openForest(0);
      set({ screen: d.go, card: null, swapping: false, drew: false, drawKind: null, shareLink: null, gift: null, error: null });
      if (d.go === "home" && pendingGift) openGift();
      return;
    }
    if (d.share) return shareDraw(d.share);
    if (d.draw) return draw(d.draw);
    if (d.page !== undefined) return openForest(+d.page);
    if (d.open) return set({ card: view.collection.cards.find((c) => c.id === d.open), drew: false, swapping: false });
    if (d.openHand !== undefined) return set({ card: hand[+d.openHand], drew: false, swapping: false });
    if (d.play !== undefined) return play(+d.play);
    if (d.release) {
      set({ card: null });
      return saveHand(hand.filter((c) => c.id !== d.release));
    }
    if (d.take) {
      const card = view.card;
      if (hand.length >= E.TEAM_SIZE) return set({ swapping: true });
      set({ card: null });
      return saveHand([...hand, card]);
    }
    if (d.replace) {
      const card = view.card;
      set({ card: null, swapping: false });
      return saveHand(hand.map((c) => (c.id === d.replace ? card : c)));
    }
    ({
      retry: () => { const retry = view.error?.retry; view = { ...view, error: null }; retry?.(); },
      "close-card": () => set({ card: null, drew: false, drawKind: null, swapping: false, gift: null, shareLink: null }),
      claim: claimGift,
      "copy-link": async () => {
        await copyText(view.shareLink.url);
        set({ shareLink: { ...view.shareLink, copied: true } });
      },
      "copy-code": async () => {
        await copyText(store.get(TOKEN_KEY));
        set({ codeCopied: true, backup: true });
      },
      "toggle-backup": () => { view.backup = !view.backup; },
      restore: restorePlayer,
      logout,
      "confirm-switch": () => googleLogin(view.switchAsk.credential, true),
      "cancel-switch": () => set({ switchAsk: null }),
      install: async () => {
        const prompt = installPrompt;
        installPrompt = null;
        await prompt?.prompt();
        render();
      },
      "hide-install": () => { store.set("gacha-install-hidden", "1"); render(); },
      start: startFight,
      "toggle-sig": () => set({ signature: !view.signature }),
      "next-day": () => {
        store.set(OFFSET_KEY, String(Number(store.get(OFFSET_KEY) || 0) + 1));
        guarded(() => refresh(), () => refresh());
        window.scrollTo(0, 0);
      },
      "new-player": () => guarded(async () => {
        store.remove(OFFSET_KEY);
        await ensurePlayer(true);
        await refresh();
      }),
    })[d.do]?.();
  });

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); } catch { window.prompt(t("backup.manual"), text); }
  }

  function shareDraw(kind) {
    return guarded(async () => {
      const link = await call("POST", "share", { body: { kind } });
      const url = `${location.origin}/s/${link.code}`;
      await refresh({ shareLink: { ...link, url, copied: false } });
      if (navigator.share) {
        await navigator.share({ title: t("app.name"), text: t("share.text"), url }).catch(() => {});
      }
    }, () => shareDraw(kind));
  }

  const GIFT_ENDINGS = ["missing", "expired", "gone"];

  let pendingGift = new URLSearchParams(location.search).get("s");
  if (pendingGift) history.replaceState(null, "", location.pathname);

  async function loadGift() {
    const code = pendingGift;
    const g = await call("GET", "share", { query: `&code=${encodeURIComponent(code)}` });
    pendingGift = null;
    if (GIFT_ENDINGS.includes(g.status)) {
      view = { ...view, error: { message: t(`gift.${g.status}`), label: t("gotIt"), retry: () => set({}) } };
      return;
    }
    view = { ...view, card: g.card, gift: { ...g, code }, drew: false, swapping: false };
  }
  const openGift = () => guarded(loadGift, openGift);

  function claimGift() {
    const { code } = view.gift;
    return guarded(async () => {
      const result = await call("POST", "claim", { body: { code } });
      await refresh({ card: result.card, drew: true, landed: false, drawKind: null, gift: null, shareLink: null });
      playRarityFx(result.card.rarity);
    }, claimGift);
  }

  async function restorePlayer() {
    const code = document.getElementById("gc-restore-code").value.trim().toLowerCase();
    const res = /^[a-f0-9]{64}$/.test(code)
      ? await fetch("/api/gacha?op=state", { headers: { authorization: `Bearer ${code}` } }).catch(() => null)
      : null;
    if (!res || !res.ok) return set({ backup: true, restoreError: t("err.restore") });
    store.set(TOKEN_KEY, code);
    store.remove(FIGHT_KEY);
    return guarded(() => refresh({ screen: "home", backup: false, restoreError: null }));
  }

  function takeGoogleCredential() {
    try {
      const credential = sessionStorage.getItem("gacha-google-credential");
      sessionStorage.removeItem("gacha-google-credential");
      return credential;
    } catch { return null; }
  }

  async function boot() {
    await guarded(async () => {
      await ensurePlayer();
      await refresh({ screen: "home" });
      const saved = loadFight();
      if (saved && saved.day === S.day && !S.result) {
        await enterFight(saved.team, saved.moves);
        if (E.isOver(view.state)) submit();
      } else {
        store.remove(FIGHT_KEY);
        if (pendingGift) await loadGift();
      }
    }, boot);
    // 要等上面跑完才登入：guarded 忙碌時會直接跳過。啟動失敗就留著憑證，等重試
    const credential = view.error ? null : takeGoogleCredential();
    if (credential) await googleLogin(credential);
  }
  boot();
})();
