// 程式畫的林子：背景、落葉、收藏用的樹、一隻手。亂數有種子，同一頁每次都長一樣。
(function () {
  function seeded(text) {
    let h = 2166136261;
    for (const ch of String(text)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
    return () => {
      h = (h + 0x6d2b79f5) | 0;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const LEAF_COLORS = ["#c8842c", "#a9561f", "#d6a73c", "#7f8a2e", "#8d3f1c", "#b8732a"];
  const LEAF = "M0 -14 C9 -8 10 4 0 14 C-10 4 -9 -8 0 -14 Z M0 -12 L0 18";

  function trunk(x, base, top, width, rand, color) {
    const lean = (rand() - 0.5) * 50;
    const mid = (base + top) / 2;
    return `<path d="M${x - width} ${base} C${x - width * 0.7} ${mid} ${x + lean - width * 0.5} ${mid} ${x + lean - width * 0.35} ${top}
      L${x + lean + width * 0.35} ${top} C${x + lean + width * 0.5} ${mid} ${x + width * 0.7} ${mid} ${x + width} ${base} Z" fill="${color}"/>`;
  }

  function branch(x, y, dir, len, rand, color, width) {
    const ex = x + dir * len, ey = y - 30 - rand() * 50;
    const twig = `M${x + (dir * len) / 2} ${y - 14} q${dir * 16} ${-22 - rand() * 18} ${dir * (24 + rand() * 22)} ${-30 - rand() * 18}`;
    return `<path d="M${x} ${y} Q${x + (dir * len) / 2} ${y - 6} ${ex} ${ey}" stroke="${color}" stroke-width="${width}" fill="none" stroke-linecap="round"/>
      <path d="${twig}" stroke="${color}" stroke-width="${width * 0.4}" fill="none" stroke-linecap="round"/>`;
  }

  function blob(x, y, r, rand, color) {
    let d = "";
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2, rr = r * (0.75 + rand() * 0.45);
      const px = x + Math.cos(a) * rr * 1.25, py = y + Math.sin(a) * rr * 0.8;
      d += `${i ? "L" : "M"}${px.toFixed(0)} ${py.toFixed(0)} `;
    }
    return `<path d="${d}Z" fill="${color}" stroke="${color}" stroke-width="${(r * 0.3).toFixed(0)}" stroke-linejoin="round"/>`;
  }

  function fern(x, y, rand, color) {
    let s = "";
    const n = 5 + Math.floor(rand() * 4);
    for (let i = 0; i < n; i++) {
      const dx = (i - n / 2) * 11 + (rand() - 0.5) * 8, h = 24 + rand() * 36;
      s += `<path d="M${x} ${y} q${dx * 0.4} ${-h * 0.8} ${dx} ${-h}" stroke="${color}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    }
    return s;
  }

  // 樹冠上亂撒葉子和亂塗的線，看起來才不像幾塊平平的色塊
  function foliage(rand, count, maxY) {
    let s = "";
    for (let i = 0; i < count; i++) {
      const x = rand() * 1200, y = rand() * rand() * maxY - 8;
      const color = ["#2f4d1d", "#3f6126", "#5c7f34", "#7f9a45", "#a39a35"][Math.floor(rand() * 5)];
      s += `<path d="${LEAF}" transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) rotate(${(rand() * 360).toFixed(0)}) scale(${(0.7 + rand() * 0.9).toFixed(2)})" fill="${color}" stroke="#1f3013" stroke-width="1"/>`;
    }
    for (let i = 0; i < 26; i++) {
      let d = `M${(rand() * 1200).toFixed(0)} ${(rand() * maxY * 0.6).toFixed(0)}`;
      for (let k = 0; k < 7; k++) d += ` l${(rand() * 26 - 6).toFixed(0)} ${(rand() * 26 - 13).toFixed(0)}`;
      s += `<path d="${d}" stroke="#1f3013" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    return s;
  }

  function vines(rand) {
    let s = "";
    for (let i = 0; i < 12; i++) {
      const x = rand() * 1200, h = 90 + rand() * 230;
      s += `<path d="M${x.toFixed(0)} 10 q${(rand() * 50 - 25).toFixed(0)} ${(h / 2).toFixed(0)} ${(rand() * 30 - 15).toFixed(0)} ${h.toFixed(0)}" stroke="#2c4019" stroke-width="2.4" fill="none"/>`;
      for (let k = 0; k < 5; k++) {
        s += `<path d="${LEAF}" transform="translate(${(x + rand() * 22 - 11).toFixed(0)} ${(20 + (k / 5) * h).toFixed(0)}) rotate(${(120 + rand() * 120).toFixed(0)}) scale(.55)" fill="#4f7030" stroke="#1f3013" stroke-width="1"/>`;
      }
    }
    return s;
  }

  function mushroom(x, y, rand) {
    const r = 7 + rand() * 7;
    return `<path d="M${x - r * 0.3} ${y} L${x - r * 0.2} ${y - r} L${x + r * 0.2} ${y - r} L${x + r * 0.3} ${y} Z" fill="#efe3c5" stroke="#2b2316" stroke-width="1.4"/><path d="M${x - r} ${y - r} C${x - r} ${y - r * 2.1} ${x + r} ${y - r * 2.1} ${x + r} ${y - r} Z" fill="#a9451d" stroke="#2b2316" stroke-width="1.4"/>`;
  }

  function backdrop() {
    const rand = seeded("gacha-woods");
    let far = "", mid = "", near = "", ground = "";
    for (let i = 0; i < 16; i++) {
      const x = i * 80 + rand() * 60;
      far += trunk(x, 700, -20, 8 + rand() * 10, rand, "#a7b39a");
    }
    for (let i = 0; i < 10; i++) far += blob(rand() * 1200, 60 + rand() * 160, 70 + rand() * 60, rand, "#b4c29a");
    for (let i = 0; i < 8; i++) {
      const x = 40 + i * 155 + rand() * 60;
      mid += trunk(x, 730, -20, 15 + rand() * 12, rand, "#6e6a49");
      mid += branch(x, 200 + rand() * 260, rand() < 0.5 ? -1 : 1, 70 + rand() * 90, rand, "#6e6a49", 9);
    }
    for (let i = 0; i < 12; i++) mid += blob(rand() * 1200, 10 + rand() * 120, 70 + rand() * 70, rand, "#6f8a4a");
    for (const x of [-10, 1195]) {
      near += trunk(x, 840, -20, 56, rand, "#3f3423");
      for (let i = 0; i < 18; i++) {
        const y = rand() * 800, off = (rand() - 0.5) * 60;
        near += `<path d="M${x + off} ${y} q${(rand() - 0.5) * 16} 20 ${(rand() - 0.5) * 10} ${30 + rand() * 40}" stroke="#2b2316" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
      }
      near += branch(x, 130 + rand() * 80, x < 0 ? 1 : -1, 210, rand, "#3f3423", 16);
    }
    for (let i = 0; i < 12; i++) near += blob(rand() * 1200, rand() * 50 - 20, 70 + rand() * 60, rand, "#44602f");
    near += foliage(rand, 170, 190) + vines(rand);

    ground += `<path d="M0 690 C150 660 280 705 430 680 C600 650 760 700 930 672 C1040 655 1130 684 1200 668 L1200 800 L0 800 Z" fill="#7c6a3d"/>`;
    ground += `<path d="M0 730 C200 700 330 750 560 722 C760 700 980 750 1200 716 L1200 800 L0 800 Z" fill="#5b4c2b"/>`;
    for (let i = 0; i < 16; i++) ground += fern(rand() * 1200, 680 + rand() * 90, rand, rand() < 0.5 ? "#55702f" : "#3f5a26");
    for (let i = 0; i < 16; i++) {
      const x = rand() * 1200, y = 695 + rand() * 95, a = rand() * 70 - 35, l = 30 + rand() * 70;
      ground += `<path d="M${x} ${y} l${l} ${a * 0.4} m${-l * 0.5} ${a * 0.2} l${(rand() - 0.5) * 20} ${-10 - rand() * 14}" stroke="#2f2616" stroke-width="${2 + rand() * 2.5}" fill="none" stroke-linecap="round"/>`;
    }
    for (let i = 0; i < 14; i++) ground += mushroom(rand() * 1200, 700 + rand() * 90, rand);
    for (let i = 0; i < 9; i++) ground += blob(rand() * 1200, 705 + rand() * 80, 12 + rand() * 18, rand, "#7a7566");
    for (let i = 0; i < 90; i++) {
      const x = rand() * 1200, y = 690 + rand() * 105, color = LEAF_COLORS[Math.floor(rand() * LEAF_COLORS.length)];
      ground += `<path d="${LEAF}" transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) rotate(${(rand() * 360).toFixed(0)}) scale(${(0.5 + rand() * 0.6).toFixed(2)} ${(0.3 + rand() * 0.3).toFixed(2)})" fill="${color}" stroke="#3d2b14" stroke-width="1"/>`;
    }
    return `<svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs><linearGradient id="gc-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9e2bd"/><stop offset=".55" stop-color="#ece6c4"/><stop offset="1" stop-color="#b7a877"/></linearGradient></defs>
      <rect width="1200" height="800" fill="url(#gc-sky)"/><g opacity=".55">${far}</g><g opacity=".82">${mid}</g>${ground}${near}</svg>`;
  }

  function fallingLeaves(count = 12) {
    const rand = seeded("gacha-leaves");
    let html = "";
    for (let i = 0; i < count; i++) {
      const color = LEAF_COLORS[Math.floor(rand() * LEAF_COLORS.length)];
      const style = `left:${(rand() * 100).toFixed(1)}%;--drift:${((rand() - 0.5) * 34).toFixed(0)}vw;--spin:${(240 + rand() * 500).toFixed(0)}deg;animation-duration:${(11 + rand() * 13).toFixed(1)}s;animation-delay:${(-rand() * 22).toFixed(1)}s`;
      html += `<svg class="gc-leaf" style="${style}" viewBox="-14 -18 28 38" aria-hidden="true"><path d="${LEAF}" fill="${color}" stroke="#3d2b14" stroke-width="1.2"/></svg>`;
    }
    return html;
  }

  // 搖樹時掉的葉子：一直循環到卡片掉下來為止，每片時間錯開才不會一波一波的
  function burst(count = 22) {
    let html = "";
    for (let i = 0; i < count; i++) {
      const color = LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)];
      const style = `--x:${((Math.random() - 0.5) * 360).toFixed(0)}px;--y:${(80 + Math.random() * 320).toFixed(0)}px;--r:${(Math.random() * 720).toFixed(0)}deg;animation-delay:${(-Math.random() * 1.4).toFixed(2)}s;animation-duration:${(1.1 + Math.random() * 0.5).toFixed(2)}s`;
      html += `<svg class="gc-burst" style="${style}" viewBox="-14 -18 28 38" aria-hidden="true"><path d="${LEAF}" fill="${color}" stroke="#3d2b14" stroke-width="1.2"/></svg>`;
    }
    return html;
  }

  // 搖的那棵樹：三層樹冠加幾片葉子，比按鈕上的小圖示有份量，但仍是幾十筆而已
  function shakeTree() {
    const rand = seeded("shake-tree");
    let art = `<path d="M54 142 L57 92 L67 92 L70 142 Z" fill="#3f3019"/>
      <path d="M60 134 q1 -12 -2 -26 M65 128 q2 -10 1 -22" stroke="#2b2316" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M61 96 Q46 88 34 76 M63 94 Q80 82 90 68" stroke="#3f3019" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    art += blob(62, 56, 44, rand, "#2f4d1d") + blob(40, 66, 30, rand, "#3c5e25") + blob(86, 64, 30, rand, "#3c5e25") + blob(62, 40, 30, rand, "#5c7f34") + blob(50, 54, 20, rand, "#7f9a45");
    for (let i = 0; i < 16; i++) {
      const a = rand() * Math.PI * 2, r = 22 + rand() * 26;
      art += `<path d="${LEAF}" transform="translate(${(62 + Math.cos(a) * r * 1.2).toFixed(0)} ${(56 + Math.sin(a) * r * 0.8).toFixed(0)}) rotate(${(rand() * 360).toFixed(0)}) scale(.55)" fill="${["#7f9a45", "#a39a35", "#5c7f34"][i % 3]}" stroke="#1f3013" stroke-width="1.4"/>`;
    }
    return `<svg class="gc-big-tree" viewBox="0 0 124 144" aria-hidden="true">${art}</svg>`;
  }

  // 貼紙還沒載入時先站著的潦草鳥，也當作載入中和空手的小圖
  const BIRD = `<g fill="none" stroke="#2b2316" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <path d="M26 60 C22 46 36 36 52 38 C66 40 74 50 72 62 C70 74 58 80 44 78 C32 76 28 70 26 60 Z" fill="#f4ecd6"/>
    <path d="M26 60 L10 50 L17 61 L8 70 L29 67"/><path d="M40 57 q10 -9 21 -1 q-10 9 -21 1"/>
    <path d="M50 34 C50 24 60 20 68 24 C74 27 76 34 72 40 C66 46 52 44 50 34 Z" fill="#f4ecd6"/>
    <path d="M74 31 L88 34 L74 39 Z" fill="#f4ecd6"/><circle cx="64" cy="31" r="2.6" fill="#2b2316" stroke="none"/>
    <path d="M44 78 L42 90 M36 90 L48 90 M56 77 L58 90 M51 90 L64 90"/></g>`;
  const birdSvg = (cls = "") => `<svg class="gc-bird-doodle ${cls}" viewBox="0 0 100 100" aria-hidden="true">${BIRD}</svg>`;
  const BIRD_URL = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" opacity=".55">${BIRD}</svg>`)}")`;

  // 收藏的一片林子：每頁的樹和停棲位置都不同，但版面固定不會互相擋死
  const FOREST_W = 400, FOREST_H = 780;
  function forestPage(page, count) {
    const rand = seeded(`forest-${page}`);
    const trunks = [120 + rand() * 30, 270 + rand() * 30];
    const rows = [205, 365, 525, 720];
    const cols = [64, 200, 336];
    let perches = [];
    rows.forEach((y) => cols.forEach((x) => perches.push({
      x: x + (rand() - 0.5) * 34,
      y: y + (rand() - 0.5) * 34,
      size: y > 700 ? 92 : 80 + rand() * 18,
    })));
    perches = perches.map((p) => [rand(), p]).sort((a, b) => a[0] - b[0]).map(([, p]) => p).slice(0, count);

    let art = `<path d="M0 ${FOREST_H - 76} C90 ${FOREST_H - 100} 170 ${FOREST_H - 60} 260 ${FOREST_H - 88} C320 ${FOREST_H - 100} 370 ${FOREST_H - 72} 400 ${FOREST_H - 84} L400 ${FOREST_H} L0 ${FOREST_H} Z" fill="#6b5a32"/>`;
    for (const x of trunks) {
      art += trunk(x, FOREST_H - 60, -10, 21 + rand() * 7, rand, "#4e3f28");
      for (let i = 0; i < 12; i++) {
        const y = 40 + rand() * (FOREST_H - 120), off = (rand() - 0.5) * 18;
        art += `<path d="M${x + off} ${y} q${(rand() - 0.5) * 8} 12 ${(rand() - 0.5) * 6} ${16 + rand() * 24}" stroke="#2b2316" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
      }
    }
    for (const p of perches) {
      if (p.y > 680) continue;
      const near = trunks.reduce((a, b) => (Math.abs(b - p.x) < Math.abs(a - p.x) ? b : a));
      const dir = p.x >= near ? 1 : -1, tip = p.x + dir * 34;
      art += `<path d="M${near} ${p.y + 42} Q${(near + tip) / 2} ${p.y + 16} ${tip} ${p.y - 4}" stroke="#4e3f28" stroke-width="9" fill="none" stroke-linecap="round"/>`;
      art += `<path d="M${(near + tip) / 2} ${p.y + 20} q${dir * 8} ${-22} ${dir * 24} ${-30}" stroke="#4e3f28" stroke-width="3" fill="none" stroke-linecap="round"/>`;
      art += `<path d="${LEAF}" transform="translate(${tip + dir * 6} ${p.y - 10}) rotate(${dir * 60}) scale(.8)" fill="#6f8a3a" stroke="#34451c" stroke-width="1.2"/>`;
    }
    for (let i = 0; i < 11; i++) art += blob(30 + rand() * 340, 62 + rand() * 40, 24 + rand() * 20, rand, i % 2 ? "#5e7c3c" : "#44602f");
    for (let i = 0; i < 46; i++) {
      art += `<path d="${LEAF}" transform="translate(${(14 + rand() * 372).toFixed(0)} ${(36 + rand() * 90).toFixed(0)}) rotate(${(rand() * 360).toFixed(0)}) scale(${(0.5 + rand() * 0.5).toFixed(2)})" fill="${["#2f4d1d", "#5c7f34", "#7f9a45", "#a39a35"][Math.floor(rand() * 4)]}" stroke="#1f3013" stroke-width="1"/>`;
    }
    for (let i = 0; i < 3; i++) art += mushroom(30 + rand() * 340, FOREST_H - 26 - rand() * 40, rand);
    for (let i = 0; i < 7; i++) art += fern(rand() * 400, FOREST_H - 18 - rand() * 50, rand, "#3f5a26");
    for (let i = 0; i < 26; i++) {
      art += `<path d="${LEAF}" transform="translate(${(rand() * 400).toFixed(0)} ${(FOREST_H - 66 + rand() * 62).toFixed(0)}) rotate(${(rand() * 360).toFixed(0)}) scale(.6 .34)" fill="${LEAF_COLORS[Math.floor(rand() * LEAF_COLORS.length)]}" stroke="#3d2b14" stroke-width="1"/>`;
    }
    const svg = `<svg class="gc-forest-art" viewBox="0 0 ${FOREST_W} ${FOREST_H}" aria-hidden="true">${art}</svg>`;
    return {
      svg,
      perches: perches.map((p) => ({ left: (p.x / FOREST_W) * 100, top: (p.y / FOREST_H) * 100, size: (p.size / FOREST_W) * 100 })),
    };
  }

  // 桌機用的橫版林子：同一頁的鳥換成三棵樹、兩排樹枝加一排地面。版面由 CSS 依寬度切換，鳥的按鈕共用
  const WIDE_W = 800, WIDE_H = 600;
  function forestWide(page, count) {
    const rand = seeded(`forest-wide-${page}`);
    const trunks = [190 + rand() * 24, 392 + rand() * 24, 596 + rand() * 24];
    const cols = [95, 300, 500, 705];
    let perches = [];
    for (const y of [175, 345]) cols.forEach((x) => perches.push({ x: x + (rand() - 0.5) * 34, y: y + (rand() - 0.5) * 34, size: 118 + rand() * 22 }));
    const ground = [120, 330, 540, 720].map((x) => ({ x: x + (rand() - 0.5) * 40, y: 586 + (rand() - 0.5) * 10, size: 140 }));
    // 樹枝先排滿才輪到地面，鳥少的那一頁不會只有一隻站在地上
    const shuffle = (list) => list.map((p) => [rand(), p]).sort((a, b) => a[0] - b[0]).map(([, p]) => p);
    perches = [...shuffle(perches), ...shuffle(ground)].slice(0, count);

    let art = `<path d="M0 ${WIDE_H - 72} C130 ${WIDE_H - 96} 260 ${WIDE_H - 58} 400 ${WIDE_H - 84} C540 ${WIDE_H - 104} 660 ${WIDE_H - 60} 800 ${WIDE_H - 80} L800 ${WIDE_H} L0 ${WIDE_H} Z" fill="#6b5a32"/>`;
    for (const x of trunks) {
      art += trunk(x, WIDE_H - 50, 90, 22 + rand() * 8, rand, "#4e3f28");
      for (let i = 0; i < 12; i++) {
        const y = 40 + rand() * (WIDE_H - 110), off = (rand() - 0.5) * 18;
        art += `<path d="M${x + off} ${y} q${(rand() - 0.5) * 8} 12 ${(rand() - 0.5) * 6} ${16 + rand() * 24}" stroke="#2b2316" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
      }
    }
    for (const p of perches) {
      if (p.y > 520) continue;
      const near = trunks.reduce((a, b) => (Math.abs(b - p.x) < Math.abs(a - p.x) ? b : a));
      const dir = p.x >= near ? 1 : -1, tip = p.x + dir * 34;
      art += `<path d="M${near} ${p.y + 42} Q${(near + tip) / 2} ${p.y + 16} ${tip} ${p.y - 4}" stroke="#4e3f28" stroke-width="9" fill="none" stroke-linecap="round"/>`;
      art += `<path d="M${(near + tip) / 2} ${p.y + 20} q${dir * 8} ${-22} ${dir * 24} ${-30}" stroke="#4e3f28" stroke-width="3" fill="none" stroke-linecap="round"/>`;
      art += `<path d="${LEAF}" transform="translate(${tip + dir * 6} ${p.y - 10}) rotate(${dir * 60}) scale(.8)" fill="#6f8a3a" stroke="#34451c" stroke-width="1.2"/>`;
    }
    // 每棵樹一團圓圓的樹冠：先畫外框再疊同色的圓蓋掉內側的線，看起來像一朵描邊的雲
    for (const x of trunks) {
      const puffs = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + rand() * 0.4;
        puffs.push([x + Math.cos(a) * (62 + rand() * 18), 104 + Math.sin(a) * (30 + rand() * 8), 32 + rand() * 12]);
      }
      puffs.push([x, 100, 56]);
      art += puffs.map(([cx, cy, r]) => `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(r + 2.5).toFixed(0)}" fill="#22361a"/>`).join("");
      art += puffs.map(([cx, cy, r], i) => `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="${i % 3 ? "#4f6f33" : "#5e7c3c"}"/>`).join("");
      for (let i = 0; i < 26; i++) {
        const a = rand() * Math.PI * 2, d = Math.sqrt(rand());
        art += `<path d="${LEAF}" transform="translate(${(x + Math.cos(a) * d * 90).toFixed(0)} ${(102 + Math.sin(a) * d * 40).toFixed(0)}) rotate(${(rand() * 360).toFixed(0)}) scale(${(0.5 + rand() * 0.4).toFixed(2)})" fill="${["#2f4d1d", "#6f8f3a", "#8aa64a", "#a39a35"][Math.floor(rand() * 4)]}" stroke="#1f3013" stroke-width="1"/>`;
      }
    }
    for (let i = 0; i < 6; i++) art += mushroom(30 + rand() * 740, WIDE_H - 24 - rand() * 40, rand);
    for (let i = 0; i < 14; i++) art += fern(rand() * 800, WIDE_H - 16 - rand() * 50, rand, "#3f5a26");
    for (let i = 0; i < 50; i++) {
      art += `<path d="${LEAF}" transform="translate(${(rand() * 800).toFixed(0)} ${(WIDE_H - 62 + rand() * 58).toFixed(0)}) rotate(${(rand() * 360).toFixed(0)}) scale(.6 .34)" fill="${LEAF_COLORS[Math.floor(rand() * LEAF_COLORS.length)]}" stroke="#3d2b14" stroke-width="1"/>`;
    }
    const svg = `<svg class="gc-forest-art gc-forest-wide" viewBox="0 0 ${WIDE_W} ${WIDE_H}" aria-hidden="true">${art}</svg>`;
    return {
      svg,
      perches: perches.map((p) => ({ left: (p.x / WIDE_W) * 100, top: (p.y / WIDE_H) * 100, size: (p.size / WIDE_W) * 100 })),
    };
  }

  // 手掌朝上，三隻鳥站在手指和掌心
  // 一鳥在手：本來該嚇跑鳥的稻草人，帽子和兩隻手臂上各站了一隻，表情已經放棄了。
  // 鳥站的位置對應 game.js 的 SLOT_POS：左手臂 (14%, 58.5%)、帽頂 (50%, 22.5%)、右手臂 (86%, 57%)
  const STRAW = (x, y, dir, n = 6) => {
    let d = "";
    for (let i = 0; i < n; i++) {
      const dy = (i - (n - 1) / 2) * 5, len = 14 + ((i * 7) % 9);
      d += `M${x} ${y + dy} l${dir[0] * len} ${dir[1] * len + dy * 0.5} `;
    }
    return `<path d="${d}" stroke="#d9b24a" stroke-width="3" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#8a6a1e" stroke-width="1" fill="none" stroke-linecap="round" opacity=".6"/>`;
  };
  const HAND = `<svg class="gc-hand-art" viewBox="0 0 400 430" aria-hidden="true"><g filter="url(#wobble)" stroke="#2b2316" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">
    <path d="M110 430 C130 404 170 396 200 396 C232 396 272 404 292 430 Z" fill="#6b5a32"/>
    <path d="M140 414 l-6 -16 M150 410 l2 -18 M252 412 l6 -16 M262 416 l12 -12" stroke="#3f5a26" stroke-width="3"/>
    <path d="M192 204 L190 418 L210 418 L208 204 Z" fill="#8a6a3a"/>
    <path d="M42 250 L358 238 L358 250 L42 262 Z" fill="#8a6a3a"/>
    ${STRAW(62, 252, [-1, 0.15])}${STRAW(338, 246, [1, -0.1])}
    <path d="M150 230 L64 238 L64 268 L150 280 Z M250 230 L336 232 L336 262 L250 280 Z" fill="#b8553a"/>
    <path d="M148 226 L252 226 L264 350 L136 350 Z" fill="#b8553a"/>
    <path d="M168 228 L162 348 M232 228 L240 348 M140 290 L260 290 M92 236 L92 270 M120 233 L120 276 M308 233 L308 270 M280 232 L280 276" stroke="#8d3a26" stroke-width="3" opacity=".8"/>
    <path d="M200 228 L200 348 M138 318 L262 318" stroke="#e39a68" stroke-width="2.5" opacity=".7"/>
    <rect x="206" y="266" width="26" height="24" fill="#6f8a3a" stroke-width="3"/>
    <path d="M210 270 l4 4 M222 270 l4 4 M210 282 l4 4 M222 282 l4 4" stroke-width="1.6"/>
    <path d="M136 334 L264 334" stroke="#c9a55a" stroke-width="6"/>
    ${STRAW(150, 352, [-0.4, 1], 5)}${STRAW(200, 352, [0, 1], 5)}${STRAW(250, 352, [0.4, 1], 5)}${STRAW(200, 226, [0, -0.2], 3)}
    <circle cx="200" cy="182" r="46" fill="#d8bf8a"/>
    <path d="M168 150 l6 4 M228 150 l-6 4 M160 196 l6 -2 M240 196 l-6 -2 M184 222 l4 -6 M216 222 l-4 -6" stroke="#a88a52" stroke-width="2"/>
    <path d="M174 166 L192 160 M226 166 L208 160" stroke-width="3.5"/>
    <path d="M176 178 q8 7 16 0 M208 178 q8 7 16 0" stroke-width="3.5" fill="none"/>
    <path d="M184 204 h32 M190 199 v10 M200 199 v10 M210 199 v10" stroke-width="2.5"/>
    <path d="M240 160 q-6 10 0 14 q6 -4 0 -14 Z" fill="#9fd3ef" stroke-width="2"/>
    <ellipse cx="200" cy="138" rx="80" ry="13" fill="#d9b25a"/>
    <path d="M160 136 C160 104 168 96 200 96 C232 96 240 104 240 136 Z" fill="#d9b25a"/>
    <path d="M161 122 L239 122 L240 132 L160 132 Z" fill="#8d3a26" stroke-width="3"/>
    <path d="M214 102 l12 2 l-2 12 l-12 -2 Z" fill="#b8553a" stroke-width="2"/>
    </g></svg>`;

  // 抽到鳥時落下的葉子，越稀有葉子越多、越亮
  const RARITY_FX = {
    N: { count: 10, ms: 1800, colors: ["#8a6a3a", "#a58a55", "#6f5a35"] },
    R: { count: 18, ms: 2200, colors: ["#5c9a35", "#7fb545", "#3f7f35"] },
    SR: { count: 30, ms: 2800, colors: ["#bfe3f2", "#7fbfe0", "#e8f2f5", "#4f9fd0"], banner: true },
    SSR: { count: 46, ms: 3600, colors: ["#ffd84a", "#f2b01e", "#fff0a0", "#d99a1c"], banner: true },
    UR: { count: 70, ms: 4600, colors: ["#ff4d4d", "#ff9a2e", "#ffe14a", "#4fd65c", "#3fb8f2", "#6a6af0", "#d65cf0"], banner: true },
  };

  function rarityFx(rarity) {
    const fx = RARITY_FX[rarity] || RARITY_FX.N;
    let leaves = "";
    for (let i = 0; i < fx.count; i += 1) {
      const color = fx.colors[i % fx.colors.length];
      const size = 16 + Math.random() * 20;
      const style = `left:${(Math.random() * 100).toFixed(1)}%;width:${size.toFixed(0)}px;height:${(size * 1.35).toFixed(0)}px;animation-delay:${(Math.random() * (fx.ms * 0.4)).toFixed(0)}ms;animation-duration:${(fx.ms * (0.5 + Math.random() * 0.2)).toFixed(0)}ms;--drift:${(Math.random() * 160 - 80).toFixed(0)}px;--spin:${(Math.random() * 900 - 450).toFixed(0)}deg`;
      leaves += `<svg class="gc-fx-leaf" style="${style}" viewBox="-14 -18 28 38"><path d="${LEAF}" fill="${color}" stroke="rgba(40,28,10,.55)" stroke-width="1"/></svg>`;
    }
    const banner = fx.banner ? `<div class="gc-fx-banner">${I18n.t(`banner.${rarity}`)}</div>` : "";
    return { html: `<div class="gc-fx ${rarity}" aria-hidden="true"><div class="gc-fx-glow"></div>${leaves}${banner}</div>`, ms: fx.ms };
  }

  // 高稀有度的鳥出招時，提示帶裡會飛過對應顏色的葉子
  function cutinLeaves(rarity) {
    const count = { SR: 8, SSR: 14, UR: 22 }[rarity];
    if (!count) return "";
    const { colors } = RARITY_FX[rarity];
    let leaves = "";
    for (let i = 0; i < count; i += 1) {
      const size = 14 + Math.random() * 16;
      const style = `top:${(Math.random() * 100).toFixed(0)}%;width:${size.toFixed(0)}px;height:${(size * 1.35).toFixed(0)}px;animation-delay:${(Math.random() * 500).toFixed(0)}ms;animation-duration:${(700 + Math.random() * 700).toFixed(0)}ms;--spin:${(Math.random() * 720 - 360).toFixed(0)}deg`;
      leaves += `<svg class="gc-cutin-leaf" style="${style}" viewBox="-14 -18 28 38"><path d="${LEAF}" fill="${colors[i % colors.length]}" stroke="rgba(40,28,10,.5)" stroke-width="1"/></svg>`;
    }
    return `<div class="gc-cutin-fx" aria-hidden="true">${leaves}</div>`;
  }

  window.Scenery = { cutinLeaves, backdrop, fallingLeaves, burst, shakeTree, birdSvg, BIRD_URL, forestPage, forestWide, HAND, LEAF, rarityFx };
})();
