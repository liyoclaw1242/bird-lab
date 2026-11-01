(function () {
  const E = window.GachaEngine;
  const { HAND, burst, forestPage } = window.Scenery;
  const STICKER_BASE = "https://yi-niao-stickers.yi-niao.workers.dev/";
  const TOKEN_KEY = "gacha-token";
  const OFFSET_KEY = "gacha-dev-offset";
  const FIGHT_KEY = "gacha-fight";
  const { SHARE_CAPS, SHARE_DAYS, CLAIMS_PER_DAY } = window.GachaData;
  const HOLD = { player: 1600, super: 2000, hit: 650, boss: 1250, bossHit: 550 };
  const SLOT_POS = [[17, 48], [44, 24], [78, 37]];
  const MOVES = {
    meat: ["一口生吞", "俯衝亂啄", "用眼神殺死你"],
    mixed: ["亂翻亂啄", "順手牽羊", "邊跑邊吵"],
    plant: ["種子連發", "果核砸臉", "用力嗑瓜子"],
  };
  const SUPERS = ["畫風崩壞！", "線稿暴走！", "不管了！"];
  const BOSS_LINES = { peck: "隨便啄一下", smash: "牠認真了", rest: "喘……喘一下", armor: "縮起來裝死" };

  const app = document.getElementById("gc-app");
  document.getElementById("gc-woods").innerHTML = window.Scenery.backdrop();
  document.getElementById("gc-falling").innerHTML = window.Scenery.fallingLeaves();

  const esc = (text) => String(text ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const sticker = (c) => STICKER_BASE + c.file;
  const rarityTag = (r) => `<span class="gc-rar ${r}">${r}</span>`;
  const typeTag = (t) => `<span class="gc-type ${t}">${E.TYPES[t].label}</span>`;
  const weight = (g) => (g >= 1000 ? `${(g / 1000).toFixed(1)} 公斤` : `${Math.round(g)} 公克`);

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
    const resting = "森林今天休息中，晚點再來";
    const res = await fetch(`/api/gacha?op=${op}${query}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
      .catch(() => { throw Object.assign(new Error("連不上林子，檢查一下網路再試一次"), { code: "offline" }); });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !retried) {
      await ensurePlayer(true);
      return call(method, op, { body, query }, true);
    }
    if (!res.ok) throw Object.assign(new Error(data.message || resting), { code: data.error || "resting", detail: data });
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
      view = { ...view, busy: false, error: { message: error.message || "連線出了問題", retry } };
    }
    render();
  }

  function moveLeaves(fight, round) {
    return `<div class="gc-leaves">${fight.script.map((k, i) => {
      const state = round === undefined ? "" : i < round ? "past" : i === round ? "now" : "";
      return `<div class="gc-move ${state}"><b>${E.INTENTS[k].label}</b>${typeTag(fight.forms[i])}</div>`;
    }).join("")}</div>`;
  }

  const chain = `<p class="gc-chain">${typeTag("meat")} 剋 ${typeTag("mixed")} 剋 ${typeTag("plant")} 剋 ${typeTag("meat")}。剋對方時傷害 ×1.5，被剋 ×0.67，挨打也一樣。</p>`;

  const brand = `<a class="gc-brand" href="/" aria-label="一鳥在手"><img src="logo.svg" alt="" width="46" height="46"><span>一鳥在手</span></a>`;
  const nav = () => `${brand}<nav class="gc-nav" aria-label="分頁">${[["home", "今日林間"], ["forest", "百鳥在林"], ["hand", "一鳥在手"]].map(([id, label]) =>
    `<button class="gc-tab" data-go="${id}" ${view.screen === id ? 'aria-current="page"' : ""}>${label}</button>`).join("")}</nav>`;

  const errorBox = () => (view.error ? `<div class="gc-scrap" role="alert"><p class="gc-h">${esc(view.error.message)}</p><button class="gc-plank" data-do="retry">${esc(view.error.label || "再試一次")}</button></div>` : "");

  const miniTree = `<svg viewBox="0 0 60 64" aria-hidden="true"><path d="M26 62 L28 34 L32 34 L35 62 Z" fill="#3f3019"/><path d="M30 3 C47 3 57 14 54 26 C58 38 44 44 32 40 C20 45 4 39 7 27 C3 14 14 3 30 3 Z" fill="#2f4d1d" stroke="#1b2b10" stroke-width="2"/></svg>`;
  const LEAF_ICON = (color) => `<svg viewBox="-14 -18 28 38" aria-hidden="true"><path d="${window.Scenery.LEAF}" fill="${color}" stroke="#3d2b14" stroke-width="1.4"/></svg>`;

  function historyStrip() {
    const stars = Object.fromEntries(S.history.map((h) => [h.day, h.stars]));
    const color = { 0: "#8d7f60", 1: "#b8732a", 2: "#a9561f", 3: "#d99a1c" };
    const cells = Array.from({ length: 14 }, (_, i) => E.addDays(S.day, i - 13)).map((d) => {
      const s = stars[d];
      return `<span title="${d}">${LEAF_ICON(s === undefined ? "#d9ceae" : color[s])}<i>${s === undefined ? "" : s || "✕"}</i></span>`;
    }).join("");
    return `<div class="gc-scrap tilt-r"><p class="gc-h">落葉記錄兩週的星數，連勝 ${S.streak} 天</p><div class="gc-strip">${cells}</div></div>`;
  }

  function homeScreen() {
    const { fight, draws, result } = S;
    const complete = S.owned >= S.total;
    const shake = (kind, title, note, disabled) => `<button class="gc-shake" data-draw="${kind}" ${disabled ? "disabled" : ""}>${miniTree}<span>${title}<small>${note}</small></span></button>`;
    const fightBtn = result
      ? `<button class="gc-plank" disabled>今天打過了，得到 ${result.stars} 星，明天再來</button>`
      : hand.length === E.TEAM_SIZE
        ? `<button class="gc-plank hot" data-do="start">帶手上的 3 隻去挑戰</button>`
        : `<button class="gc-plank" data-go="hand">手上要有 3 隻才能打</button>`;
    return `${nav()}
      <section class="gc-clearing">
        <div class="gc-today-boss">
          <div class="gc-scrap gc-boss-note tilt"><span>今天林子裡來了</span><b>${esc(fight.boss.name)}本鳥</b><span>${S.day}</span></div>
          <img class="gc-perched" src="${fight.boss.img}" alt="${esc(fight.boss.name)}的貼紙">
        </div>
        <div class="gc-scrap tilt-r"><p class="gc-h">牠今天的五招</p>${moveLeaves(fight)}${chain}</div>
      </section>
      <div class="gc-trees" style="margin-top:12px">
        ${shake("free", complete ? "整座林子都收集完了" : draws.free ? "今天的樹搖過了" : "搖一棵樹", "每天一次，會掉下一隻你還沒遇過的鳥", draws.free || complete)}
        ${result?.stars > 0 && !complete ? shake("bonus", draws.bonus ? "獎勵的樹也搖過了" : "打贏了，再搖一棵", "打贏 BOSS 的獎勵", draws.bonus) : ""}
      </div>
      <div style="margin-top:12px">${fightBtn}</div>
      ${errorBox()}
      <div style="height:12px"></div>
      ${todayDraws()}
      ${historyStrip()}
      ${installBox()}
      ${accountBox()}
      ${S.dev ? `<div class="gc-scrap gc-dev"><p>測試用，只有本機開發才有</p><button class="gc-plank" data-do="next-day">跳到下一天</button><button class="gc-plank" data-do="new-player">換一位新玩家</button></div>` : ""}
      ${shakeStage()}${cardStage()}`;
  }

  function todayDraws() {
    if (!S.drawn.length) return "";
    const rows = S.drawn.map((d) => `<div class="gc-gift-row"><img src="${sticker(d.card)}" alt=""><span>${esc(d.card.zh)} ${rarityTag(d.card.rarity)}<small>${d.share ? `被領走 ${d.share.claimed} / ${d.share.cap} 份` : `最多 ${SHARE_CAPS[d.card.rarity]} 位朋友能領`}</small></span><button class="gc-plank" data-share="${d.kind}">分享</button></div>`).join("");
    return `<div class="gc-scrap"><p class="gc-h">今天搖到的鳥可以分給朋友</p>${rows}${view.card ? "" : shareBox()}</div>`;
  }

  function shareBox() {
    const link = view.shareLink;
    if (!link) return "";
    return `<div class="gc-share-box"><input readonly value="${esc(link.url)}" aria-label="分享連結"><button class="gc-plank hot" data-do="copy-link">${link.copied ? "複製好了" : "複製"}</button><small>${SHARE_DAYS} 天內有效，${link.cap} 份領完就沒了，你手上這隻不會少。</small></div>`;
  }

  function installBox() {
    if (matchMedia("(display-mode: standalone)").matches || navigator.standalone || store.get("gacha-install-hidden")) return "";
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (!installPrompt && !ios) return "";
    const action = installPrompt
      ? `<button class="gc-plank hot" data-do="install">放到桌面</button>`
      : `<p class="gc-sub">在 Safari 按「分享」，再選「加入主畫面」。</p>`;
    return `<div class="gc-scrap gc-install"><p class="gc-h">把林子放到手機桌面，每天點開就能搖</p>${action}<button class="gc-text-btn" data-do="hide-install">不用了</button></div>`;
  }

  function accountBox() {
    if (S.google) {
      return `<div class="gc-scrap gc-backup"><p class="gc-h">這片林子綁好 Google 了</p><p class="gc-sub">換裝置時登入同一個帳號，你的鳥都會在。</p><div class="gc-row"><button class="gc-plank" data-do="logout">登出這台裝置</button></div></div>`;
    }
    const ask = view.switchAsk;
    const google = !S.googleClientId ? "" : ask
      ? `<div class="gc-scrap gc-backup" role="alert"><p class="gc-h">這個 Google 帳號已經有一片林子了</p><p class="gc-sub">那邊有 ${ask.there} 隻，這台裝置目前有 ${ask.here} 隻。兩片林子不能合併，切換後這台裝置的 ${ask.here} 隻會留在原處，之後要靠存檔碼才找得回來。</p><div class="gc-row"><button class="gc-plank hot" data-do="confirm-switch">切換過去</button><button class="gc-plank" data-do="cancel-switch">留在這裡</button></div></div>`
      : `<div class="gc-scrap gc-backup"><p class="gc-h">用 Google 綁定你的鳥</p><p class="gc-sub">綁定後換手機也不會弄丟。我們只存帳號編號，不存姓名和 Email。</p><div id="gc-google" class="gc-google"></div></div>`;
    return google + backupBox();
  }

  // Google 按鈕是它自己畫的，每次重畫畫面後要重新掛上去
  let googleLoading = null;
  function mountGoogle() {
    const box = document.getElementById("gc-google");
    if (!box || !S?.googleClientId) return;
    googleLoading ||= new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.onload = () => {
        window.google.accounts.id.initialize({ client_id: S.googleClientId, callback: ({ credential }) => googleLogin(credential) });
        resolve();
      };
      script.onerror = () => { googleLoading = null; reject(new Error("Google 登入載入失敗")); };
      document.head.append(script);
    });
    googleLoading.then(() => {
      const current = document.getElementById("gc-google");
      if (current) window.google.accounts.id.renderButton(current, { theme: "outline", size: "large", text: "continue_with", locale: "zh-TW", width: Math.min(current.clientWidth || 280, 400) });
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
    return `<details class="gc-scrap gc-backup" ${open ? "open" : ""}><summary data-do="toggle-backup">換手機也要帶著這片林子</summary>
      <p class="gc-sub">存檔只放在這個瀏覽器。把存檔碼收好，換裝置時貼上就能找回。<b>不要給別人</b>，拿到的人就能用你的林子。</p>
      <div class="gc-row"><button class="gc-plank" data-do="copy-code">${view.codeCopied ? "複製好了" : "複製我的存檔碼"}</button></div>
      <label class="gc-restore">已經有存檔碼？<input id="gc-restore-code" autocomplete="off" spellcheck="false" placeholder="貼在這裡"></label>
      <div class="gc-row"><button class="gc-plank" data-do="restore">換成這片林子</button></div>
      ${view.restoreError ? `<p class="gc-bad" role="alert">${esc(view.restoreError)}</p>` : ""}
    </details>`;
  }

  function giftNotice() {
    const g = view.gift;
    if (!g) return "";
    const lines = {
      open: `朋友從林子裡分你這隻，還剩 ${g.left} / ${g.cap} 份，${esc(g.lastDay)} 前有效。`,
      mine: `這是你分享出去的，還剩 ${g.left} / ${g.cap} 份。`,
      owned: "這隻已經在你的林子裡了。",
    };
    return `<p class="gc-gift-note">${lines[g.status]}</p>`;
  }

  function giftAction(c) {
    const g = view.gift;
    if (g.status === "open") return `<div class="gc-row"><button class="gc-plank hot" data-do="claim">收進林子</button><button class="gc-plank" data-do="close-card">先不要</button></div><small class="gc-note-small">每人每天最多領 ${CLAIMS_PER_DAY} 隻</small>`;
    return `<div class="gc-row"><button class="gc-plank hot" data-do="close-card">知道了</button></div>`;
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

  function shakeStage() {
    if (!view.shaking) return "";
    return `<div class="gc-shaking"><svg class="gc-big-tree" viewBox="0 0 60 64" aria-hidden="true"><path d="M26 62 L28 34 L32 34 L35 62 Z" fill="#3f3019"/><path d="M30 3 C47 3 57 14 54 26 C58 38 44 44 32 40 C20 45 4 39 7 27 C3 14 14 3 30 3 Z" fill="#3c5e25" stroke="#1b2b10" stroke-width="1.5"/></svg>${burst()}</div>`;
  }

  function cardStage() {
    if (!view.card) return "";
    const c = view.card;
    const facts = c.facts.map((n) => `<li><b>${esc(n.t)}</b>${esc(n.d)}</li>`).join("");
    const art = c.credit
      ? `${c.credit.page ? `<a href="${esc(c.credit.page)}" target="_blank" rel="noopener">${esc(c.credit.artist)}</a>` : esc(c.credit.artist)} · ${esc(c.credit.license)}`
      : "[removed] · PolyForm Shield 1.0.0";
    const text = c.source ? ` ／ 趣聞：<a href="${esc(c.source)}" target="_blank" rel="noopener">來源</a> · CC BY-SA 4.0` : "";
    const inHand = hand.some((b) => b.id === c.id);
    const swap = view.swapping
      ? `<div class="gc-swap"><p>手上滿了，要放走哪一隻？</p><div class="gc-swap-grid">${hand.map((b) => `<button data-replace="${esc(b.id)}"><img src="${sticker(b)}" alt="">${esc(b.zh)} ${rarityTag(b.rarity)}</button>`).join("")}</div></div>`
      : "";
    const canShare = view.drew && view.drawKind;
    // 掉落動畫只播一次，之後按分享或複製重畫時不再重播
    const dropping = view.drew && !view.landed;
    view.landed = view.drew;
    const action = view.gift ? giftAction(c)
      : view.drew
      ? `<div class="gc-row">${canShare ? `<button class="gc-plank" data-share="${view.drawKind}">分給 ${SHARE_CAPS[c.rarity]} 位朋友</button>` : ""}<button class="gc-plank hot" data-do="close-card">讓牠飛進林子</button></div>${shareBox()}`
      : inHand
        ? `<div class="gc-row"><button class="gc-plank" data-release="${esc(c.id)}">放回林子</button><button class="gc-plank hot" data-do="close-card">關閉</button></div>`
        : `<div class="gc-row"><button class="gc-plank hot" data-take="${esc(c.id)}">放到手上</button><button class="gc-plank" data-do="close-card">關閉</button></div>`;
    return `<div class="gc-stage" role="dialog" aria-modal="true" aria-label="${esc(c.zh)}"><article class="gc-note-card aura-${c.rarity} ${dropping ? "dropping" : ""}">
      <span class="gc-stamp ${c.rarity}">${c.rarity}</span>
      ${giftNotice()}
      <img class="gc-card-bird" src="${sticker(c)}" alt="${esc(c.zh)}的貼紙">
      <p class="gc-credit">貼紙：${art}${text}</p>
      <b class="gc-name">${esc(c.zh)}</b><span class="gc-sci">${esc(c.sci)}</span>
      <div class="gc-statline"><span>攻 ${c.atk} ／ 防 ${c.def}</span>${typeTag(c.type)}</div>
      <ol class="gc-facts">${facts}</ol>
      ${swap}${view.swapping ? "" : action}
    </article></div>`;
  }

  function forestScreen() {
    const f = view.collection;
    if (!f) return `${nav()}${errorBox()}<div class="gc-center"><p class="gc-scrap">走進林子裡…</p></div>`;
    const scene = forestPage(f.page, f.cards.length);
    const inHand = new Set(hand.map((b) => b.id));
    const birds = f.cards.map((c, i) => {
      const p = scene.perches[i];
      return `<button class="gc-perched-bird ${c.rarity} ${inHand.has(c.id) ? "in-hand" : ""} ${i % 3 === 1 ? "flip" : ""}" style="left:${p.left.toFixed(1)}%;top:${p.top.toFixed(1)}%;width:${p.size.toFixed(1)}%" data-open="${esc(c.id)}" aria-label="看${esc(c.zh)}"><img src="${sticker(c)}" alt="" loading="lazy"></button>`;
    }).join("");
    return `${nav()}
      <div class="gc-scrap tilt"><h1 class="gc-title">百鳥在林</h1><p class="gc-sub">這片林子有 ${f.cards.length} 隻。你總共遇過 ${f.owned} 隻，世界上還有 ${(S.total - f.owned).toLocaleString("en-US")} 隻沒遇到。點一隻看看牠。</p></div>
      ${errorBox()}
      <div class="gc-forest">${scene.svg}${birds}</div>
      <div class="gc-pages">
        <button class="gc-plank" data-page="${f.page - 1}" ${f.page <= 0 ? "disabled" : ""}>走回去</button>
        <span class="gc-scrap" style="white-space:nowrap;padding:4px 10px">第 ${f.page + 1} / ${f.pages} 片</span>
        <button class="gc-plank" data-page="${f.page + 1}" ${f.page + 1 >= f.pages ? "disabled" : ""}>再往裡走</button>
      </div>${cardStage()}`;
  }

  function matchup(c, fight) {
    const forms = [...new Set(fight.forms)];
    return forms.map((form) => {
      const mul = E.typeMul(c.type, form);
      const cls = mul > 1 ? "gc-good" : mul < 1 ? "gc-bad" : "";
      return `對${E.TYPES[form].label} <span class="${cls}">${mul > 1 ? "有利" : mul < 1 ? "吃虧" : "普通"}</span>`;
    }).join("，");
  }

  function handScreen() {
    const slots = SLOT_POS.map(([left, top], i) => {
      const c = hand[i];
      const style = `left:${left}%;top:${top}%`;
      return c
        ? `<button class="gc-slot" style="${style}" data-open-hand="${i}" aria-label="看${esc(c.zh)}"><img src="${sticker(c)}" alt=""></button>`
        : `<button class="gc-slot empty" style="${style}" data-go="forest">去林子找</button>`;
    }).join("");
    const rows = hand.map((c) => `<div class="gc-team-row"><span>${esc(c.zh)} ${rarityTag(c.rarity)} ${typeTag(c.type)}</span><span>攻${c.atk} 防${c.def}</span><small style="grid-column:1/3">今天${matchup(c, S.fight)}</small></div>`).join("");
    const fightBtn = S.result ? `<button class="gc-plank" disabled>今天打過了，明天再來</button>`
      : hand.length === E.TEAM_SIZE ? `<button class="gc-plank hot" data-do="start">帶牠們去打${esc(S.fight.boss.name)}</button>`
      : `<button class="gc-plank" data-go="forest">還少 ${E.TEAM_SIZE - hand.length} 隻，去林子找</button>`;
    return `${nav()}
      <div class="gc-scrap tilt"><h1 class="gc-title">一鳥在手</h1><p class="gc-sub">百鳥在林，不如一鳥在手。手上最多站 ${E.TEAM_SIZE} 隻，牠們就是你今天的隊伍。</p></div>
      <div class="gc-hand">${HAND}${slots}</div>
      ${errorBox()}
      <div class="gc-scrap tilt-r">${rows ? `<div class="gc-team-list">${rows}</div>` : "<p class='gc-h'>手上空空的</p>"}</div>
      <div style="margin-top:12px">${fightBtn}</div>
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
      return `<div class="gc-cutin left rar-${a.card.rarity} ${a.signature ? "super" : ""}" style="--hold:${hold}ms">${window.Scenery.cutinLeaves(a.card.rarity)}${art}<div class="gc-cutin-text"><small>${rarityTag(a.card.rarity)} ${esc(a.card.zh)}${a.signature ? " 的招牌動作" : ""}</small><b>${esc(a.word)}</b><em>${Math.round(a.dealt)} 傷害</em></div></div>`;
    }
    if (a.phase === "boss") {
      const flip = view.bossFaceRight ? "" : "flip";
      return `<div class="gc-cutin right" style="--hold:${HOLD.boss}ms"><div class="gc-cutin-art ${flip}"><img src="${view.fight.boss.img}" alt=""></div><div class="gc-cutin-text"><small>${esc(view.fight.boss.name)}本鳥</small><b>${esc(BOSS_LINES[a.intent])}</b><em>反打 ${Math.round(a.taken)}</em></div></div>`;
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
      const info = down ? `<span class="gc-tired">倒地了</span>`
        : locked ? ""
        : !legal ? `<span class="gc-tired">喘口氣，下回合才能上</span>`
        : `<span class="gc-preview"><span class="dealt">打 ${Math.round(p.dealt)}</span>／<span class="taken">挨 ${Math.round(p.taken)}</span>${fatal ? `<span class="fatal">會倒地</span>` : ""}</span>`;
      return `<button class="gc-act rim-${c.rarity} ${down ? "down" : ""}" data-play="${i}" ${legal ? "" : "disabled"}><span class="gc-act-name">${esc(c.zh)}</span><img src="${sticker(c)}" alt=""><span class="gc-hp" style="display:block" aria-label="血量 ${pct}%"><i class="${pct < 35 ? "low" : ""}" style="width:${pct}%"></i></span>${rarityTag(c.rarity)} ${typeTag(c.type)}${info}</button>`;
    }).join("");
    const round = Math.min(state.round, E.ROUNDS - 1);
    return `<div class="gc-versus">
        <div class="gc-bar-side"><span class="gc-bar-name">你的三隻</span><div class="gc-bar ${hpPct < 35 ? "low" : ""}" aria-label="隊伍血量 ${hpPct}%"><i style="width:${hpPct}%"></i></div></div>
        <div class="gc-round">${round + 1}/${E.ROUNDS}</div>
        <div class="gc-bar-side right"><span class="gc-bar-name">${esc(fight.boss.name)}本鳥</span><div class="gc-bar boss" aria-label="BOSS 體力 ${bossPct}%"><i style="width:${bossPct}%"></i>${ticks}</div></div>
      </div>
      <div class="gc-arena">${float}
        <div class="gc-fighter left aura-${shown.rarity} ${myFlip} ${mine}"><span class="gc-fighter-tag">${rarityTag(shown.rarity)} ${esc(shown.zh)}</span><img src="${sticker(shown)}" alt="${esc(shown.zh)}"></div>
        <div class="gc-fighter right ${bossFlip} ${theirs}"><img src="${fight.boss.img}" alt="${esc(fight.boss.name)}"></div>
      </div>
      <div class="gc-scrap" style="padding:6px 8px">${moveLeaves(fight, round)}</div>
      <p class="gc-scrap gc-log" aria-live="polite">${esc(log)}</p>
      <button class="gc-sig" data-do="toggle-sig" aria-pressed="${signature}" ${state.signatureUsed || locked ? "disabled" : ""}>${state.signatureUsed ? "招牌動作用掉了" : signature ? "準備好了，下一隻傷害 ×2（再按取消）" : "用招牌動作（整場一次，傷害 ×2）"}</button>
      <div class="gc-actions">${cards}</div>
      ${errorBox()}
      ${cutIn()}`;
  }

  function resultScreen() {
    const r = view.result;
    const stars = "★".repeat(r.stars) + `<span>${"★".repeat(3 - r.stars)}</span>`;
    const words = ["這場輸了，牠根本沒在看你", "打贏了，但牠還能走", "打得不錯，牠開始懷疑鳥生", "完美！牠當機了"][r.stars];
    const pct = Math.round((r.score / r.best) * 100);
    return `<div class="gc-scrap gc-result" style="margin-top:18px">
        <img src="${view.fight.boss.img}" alt="${esc(view.fight.boss.name)}">
        <div class="gc-stars" aria-label="${r.stars} 星">${stars}</div>
        <p class="gc-h">${words}</p>
        <p class="gc-tip">傷害 ${Math.round(r.score)}，你現有的鳥今天最多能打 ${Math.round(r.best)}（${pct}%）。1 星要 ${E.STAR_CUTS[0] * 100}%，2 星 ${E.STAR_CUTS[1] * 100}%，3 星 ${E.STAR_CUTS[2] * 100}%。</p>
      </div>
      <div style="margin-top:12px"><button class="gc-plank hot" data-go="home">回林間${r.stars > 0 ? "，再搖一棵樹" : ""}</button></div>`;
  }

  function render() {
    const scroll = window.scrollY;
    const screens = { home: homeScreen, forest: forestScreen, hand: handScreen, fight: fightScreen, result: resultScreen };
    if (view.screen === "loading") {
      app.innerHTML = `<div class="gc-center">${view.error ? errorBox() : `<p class="gc-scrap">走進林子裡…</p>`}</div>`;
      return;
    }
    app.innerHTML = screens[view.screen]();
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
      const wait = new Promise((resolve) => setTimeout(resolve, 1000));
      Sound.play("rustle");
      view = { ...view, shaking: true };
      render();
      let result;
      try {
        [result] = await Promise.all([call("POST", "draw", { body: { kind } }), wait]);
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
      log: moves.length ? "剛才打到這裡，接著打。" : "看好牠下一招，再決定誰上。",
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
    const pool = signature ? SUPERS : MOVES[card.type];
    const word = pool[Math.floor(Math.random() * pool.length)];
    const moves = [...view.moves, { slot, signature }];
    const fainted = next.hp[slot] <= 0;
    view.moves = moves;
    saveFight();
    // 分數先動、血量等 BOSS 打回來才扣，血條才會跟著畫面走
    const midway = { ...next, hp: before.hp };
    runSteps([
      { ms: signature ? HOLD.super : HOLD.player, run: () => { Sound.play(signature ? "super" : "attack"); set({ active: slot, moves, signature: false, anim: { phase: "player", card, signature, word, dealt } }); } },
      { ms: HOLD.hit, run: () => { Sound.play(HIT_SOUND[card.rarity] || "hit"); set({ state: midway, anim: { phase: "hit", dealt }, log: `${card.zh}用「${word}」打了 ${Math.round(dealt)}。` }); } },
      { ms: HOLD.boss, run: () => { Sound.play("boss"); set({ anim: { phase: "boss", intent, taken } }); } },
      { ms: HOLD.bossHit, run: () => { Sound.play(fainted ? "faint" : "bossHit"); set({ state: next, anim: { phase: "bossHit", taken }, log: `${fight.boss.name}${E.INTENTS[intent].label}，反打 ${Math.round(taken)}${fainted ? `，${card.zh}倒地了` : ""}。` }); } },
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
    try { await navigator.clipboard.writeText(text); } catch { window.prompt("手動複製這段：", text); }
  }

  function shareDraw(kind) {
    return guarded(async () => {
      const link = await call("POST", "share", { body: { kind } });
      const url = `${location.origin}/s/${link.code}`;
      await refresh({ shareLink: { ...link, url, copied: false } });
      if (navigator.share) {
        await navigator.share({ title: "一鳥在手", text: "我在林子裡搖到一隻鳥，分你一隻，領完就沒了。", url }).catch(() => {});
      }
    }, () => shareDraw(kind));
  }

  const GIFT_ENDINGS = {
    missing: "找不到這條連結，可能貼錯了。",
    expired: "這條連結過期了，那隻鳥已經飛走。",
    gone: "來晚了，這隻已經被領完了。",
  };

  let pendingGift = new URLSearchParams(location.search).get("s");
  if (pendingGift) history.replaceState(null, "", location.pathname);

  async function loadGift() {
    const code = pendingGift;
    const g = await call("GET", "share", { query: `&code=${encodeURIComponent(code)}` });
    pendingGift = null;
    if (GIFT_ENDINGS[g.status]) {
      view = { ...view, error: { message: GIFT_ENDINGS[g.status], label: "知道了", retry: () => set({}) } };
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
    if (!res || !res.ok) return set({ backup: true, restoreError: "這段存檔碼不對，或暫時連不上林子。你目前的林子沒有變動。" });
    store.set(TOKEN_KEY, code);
    store.remove(FIGHT_KEY);
    return guarded(() => refresh({ screen: "home", backup: false, restoreError: null }));
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
  }
  boot();
})();
