// 雨夜樹屋桌布：所有圖都由程式畫在低解析度畫布上，再整數倍放大，像素才會銳利。
// 不動的部分畫一次存起來，每幀只畫會動的部分。所有週期都能整除 LOOP，所以畫面每 120 秒完全接回起點。
// 網址參數：?t=秒 定格在某個時間點，?boss=鳥的 id 指定陽台上的鳥。
(function () {
  const W = 480;
  const H = 270;
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const GROUND = 240;

  const LOOP = 120;
  const TAU = Math.PI * 2;
  const FRAME_MS = 1000 / 30;

  const canvas = document.getElementById("scene");
  const screen = canvas.getContext("2d");
  let g = screen;
  let fullW = W;
  let fullH = H;
  let OX = 0;
  let OY = 0;

  function layer(draw) {
    const c = document.createElement("canvas");
    c.width = fullW;
    c.height = fullH;
    const previous = g;
    g = c.getContext("2d");
    draw();
    g = previous;
    return c;
  }

  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  }
  const rect = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const px = (x, y, c) => rect(x, y, 1, 1, c);
  const bayer = (x, y) => BAYER[((y % 4) + 4) % 4][((x % 4) + 4) % 4] / 16;
  const mix = (a, b, t) => {
    const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [x, y] = [p(a), p(b)];
    return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",")})`;
  };
  function glow(x, y, r, color, alpha) {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${color},${alpha})`);
    grad.addColorStop(0.4, `rgba(${color},${alpha * 0.35})`);
    grad.addColorStop(1, `rgba(${color},0)`);
    g.save();
    g.globalCompositeOperation = "lighter";
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
    g.restore();
  }
  function line(x0, y0, x1, y1, c, width = 1) {
    const n = Math.max(1, Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i += 1) rect(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), width, width, c);
  }
  function sprite(rows, colors, x, y, flip = false) {
    rows.forEach((row, j) => [...row].forEach((ch, i) => {
      if (colors[ch]) px(flip ? x + row.length - 1 - i : x + i, y + j, colors[ch]);
    }));
  }

  function sky() {
    const stops = ["#07111f", "#0a1a2c", "#10293a", "#1a3d4c", "#27525c"];
    for (let y = 0; y < fullH; y += 1) {
      const p = Math.min(0.999, (y / fullH) * 1.05) * (stops.length - 1);
      const i = Math.floor(p);
      const f = p - i;
      for (let x = 0; x < fullW; x += 1) px(x, y, bayer(x, y) < f ? stops[i + 1] : stops[i]);
    }
  }

  // 遠方的樹影：越遠越淡，融進霧裡
  function forest() {
    [[0.9, "#1d4250", 1, 22], [0.65, "#14323f", 2, 34], [0.42, "#0d2431", 3, 50]].forEach(([, c, seed, gap], layer) => {
      const r = rng(seed * 97);
      for (let x = -30; x < fullW + 30; x += gap + Math.floor(r() * gap)) {
        const w = 7 + layer * 5 + Math.floor(r() * (5 + layer * 4));
        const lean = (r() - 0.5) * 0.04;
        for (let y = 0; y < fullH; y += 1) rect(Math.round(x + y * lean), y, w, 1, c);
        // 分枝
        const r2 = rng(x + seed);
        for (let n = 0; n < 4 + layer; n += 1) {
          const by = 18 + Math.floor(r2() * 130);
          const dir = r2() < 0.5 ? -1 : 1;
          const len = 10 + Math.floor(r2() * 24);
          line(x + (dir > 0 ? w : 0), by, x + (dir > 0 ? w : 0) + dir * len, by - Math.floor(len * 0.6), c, layer > 1 ? 2 : 1);
        }
      }
      // 樹冠
      const top = rng(seed * 11);
      for (let x = -10; x < fullW + 10; x += 6) {
        const h = 12 + layer * 8 + Math.round(Math.sin(x * 0.05 + seed) * 7 + top() * 6);
        rect(x, 0, 6, h, c);
      }
      // 樹與樹之間的霧
      const mist = 150 + layer * 26;
      for (let y = mist; y < mist + 70; y += 1) {
        const level = 0.2 * Math.sin(((y - mist) / 70) * Math.PI);
        for (let x = 0; x < fullW; x += 1) if (bayer(x, y) < level) px(x, y, "#2d5a63");
      }
    });
  }

  function ground() {
    const y0 = GROUND + OY;
    for (let y = y0; y < fullH; y += 1) rect(0, y, fullW, 1, y < y0 + 4 ? "#183a36" : "#0d1f26");
    for (let x = 0; x < fullW; x += 1) {
      if (Math.sin(x * 2.1) + Math.sin(x * 0.63) > 0.7) rect(x, y0 - 2, 1, 2, "#27594b");
      if (x % 3 === 0) px(x, y0, "#2c6352");
      if (Math.sin(x * 5.3) > 0.94) rect(x, y0 - 4, 1, 4, "#1f4a40");
    }
  }

  let shimmer = [];
  function puddle(cx, cy, w, h, warm) {
    for (let j = 0; j < h; j += 1) {
      const half = Math.round(w * Math.sqrt(1 - ((j - h / 2) / (h / 2 + 0.5)) ** 2));
      for (let i = -half; i <= half; i += 1) {
        const base = bayer(cx + i, cy + j) < 0.25 ? "#1f4c5a" : "#143744";
        let c = base;
        // 水面倒映的暖光，邊緣被雨打散
        const d = warm.reduce((m, [wx, wr]) => Math.max(m, 1 - Math.abs(cx + i - wx) / wr), 0);
        if (d > 0 && j % 2 === 0) shimmer.push({ x: cx + i, y: cy + j, d, i, j });
        px(cx + i, cy + j, c);
      }
    }
  }

  const CX = 240;
  function trunkHalf(y) {
    const flare = y > 186 ? ((y - 186) ** 2) * 0.03 : 0;
    return 74 + flare + Math.sin(y * 0.05) * 3 + Math.sin(y * 0.17) * 1.2;
  }

  function trunk() {
    for (let y = -OY; y < GROUND + 4; y += 1) {
      const half = trunkHalf(y);
      const l = Math.round(CX - half);
      const r = Math.round(CX + half * 0.96);
      for (let x = l; x < r; x += 1) {
        const f = (x - l) / (r - l);
        const wave = Math.sin(x * 0.42 + Math.sin(y * 0.045 + x * 0.07) * 2.4);
        let c = wave > 0.55 ? "#3b2c30" : wave > -0.25 ? "#2b2029" : "#1d1620";
        if (f < 0.06) c = wave > 0 ? "#4b7083" : "#2f4a5c"; // 冷光打在左側
        else if (f < 0.13 && bayer(x, y) < 0.5) c = "#2d3a4a";
        else if (f > 0.93) c = "#120e16";
        px(x, y, c);
      }
    }
    // 青苔
    const m = rng(19);
    for (let n = 0; n < 150; n += 1) {
      const y = 170 + Math.floor(m() * 70);
      const half = trunkHalf(y);
      const x = Math.round(CX - half + m() * (y > 225 ? half * 2 : 16));
      rect(x, y, 1 + Math.floor(m() * 3), 1, m() < 0.6 ? "#2c6352" : "#3f8a68");
    }
  }

  // 剖開的房間：不規則的樹皮裂口，裡面才是暖光
  function roomShell(x, y, w, h, wall, seed) {
    const r = rng(seed);
    const lean = (j) => Math.round(Math.sin(j * 0.33 + seed) * 2 + r() * 1.4);
    const edges = [];
    for (let j = -3; j < h + 3; j += 1) edges.push([lean(j), lean(j + 7)]);
    edges.forEach(([a, b], k) => {
      const j = k - 3;
      rect(x - 4 + a, y + j, w + 8 - a - b, 1, "#5e3c26");
      px(x - 4 + a, y + j, "#2a1a16");
      px(x + w + 3 - b, y + j, "#2a1a16");
      if (j >= 0 && j < h) rect(x, y + j, w, 1, wall);
    });
    rect(x - 4, y - 3, w + 8, 2, "#5e3c26");
    for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) {
      const f = j / h + (bayer(x + i, y + j) - 0.5) * 0.3;
      if (f < 0.2) px(x + i, y + j, "#6e3a1a");
      else if (f > 0.8) px(x + i, y + j, "#c87528");
    }
    // 地板
    rect(x - 4, y + h, w + 8, 4, "#3a2318");
    for (let i = 0; i < w + 8; i += 7) px(x - 4 + i, y + h + 1, "#22140f");
    rect(x, y + h - 1, w, 1, "#ffb24a");
  }

  const BIRD = [
    ".....ccccccc......",
    "...ccccccccccc....",
    "..cccccccccccccc..",
    "..cggggggehggggkkk",
    "..wgggggggggggkk..",
    ".wwwggggggggggg...",
    ".wwwwwggggggnnb...",
    "wwdwwwwwgbbbnbb...",
    "wwwdwwdwwbbbbbbb..",
    "twwwdwwwwbbbbbbb..",
    "ttwwwdwwdwbbbbb...",
    "tttwwwwwwwbbbb....",
    "tt..wwwwwbbbb.....",
    ".......l...l......",
    "......ll..ll......",
  ];
  const SPARROW = { c: "#84482a", g: "#e2d7c0", e: "#141018", h: "#ffffff", k: "#2c2230", n: "#262029", b: "#d8c9a8", w: "#a06f42", d: "#62402a", t: "#6a4428", l: "#d0957a" };
  const MAGPIE = { c: "#1a2b52", g: "#22386a", e: "#ffd84a", h: "#ffffff", k: "#e8402f", n: "#22386a", b: "#5cb0ea", w: "#3a86cc", d: "#1f5a9c", t: "#3a86cc", l: "#e8402f" };
  const OWL = [
    "..h..........h..",
    "..hhh......hhh..",
    ".ffffffffffffff.",
    ".fwwwwfffwwwwff.",
    "ffwwEEwkkwEEwwff",
    "ffwwEEwkkwEEwwff",
    "fffwwwfkkfwwwfff",
    "ffffffffffffffff",
    "fbbsbbsbbsbbsbbf",
    "dbsbbsbbsbbsbbbd",
    "dbbsbbsbbsbbsbbd",
    "ddbsbbsbbsbbsbdd",
    ".ddbbsbbsbbsbdd.",
    "..dddddddddddd..",
    "....oo....oo....",
  ];
  const OWL_C = { lid: "#c9a878", h: "#4a3320", f: "#7a5636", w: "#ecdcbc", E: "#17111a", k: "#e8a23a", b: "#d9c49a", s: "#8a6a44", d: "#5a3f28", o: "#e8a23a" };

  function hearthRoom() {
    const x = 182;
    const y = 174;
    const w = 116;
    const h = 56;
    roomShell(x, y, w, h, "#9a5522", 3);
    // 木板牆紋
    for (let j = y + 3; j < y + h; j += 8) rect(x, j, w, 1, "#7a431b");
    // 石砌壁爐
    const fx = x + 82;
    rect(fx - 3, y + 8, 34, h - 8, "#5a5260");
    for (let j = 0; j < h - 8; j += 4) for (let i = (j % 8 ? 0 : 4); i < 34; i += 8) { rect(fx - 3 + i, y + 8 + j, 7, 1, "#6f6775"); rect(fx - 3 + i + 7, y + 8 + j, 1, 4, "#3e3744"); }
    rect(fx - 6, y + 22, 40, 3, "#3a2318");
    rect(fx - 6, y + 22, 40, 1, "#7a5636");
    rect(fx + 3, y + 28, 22, h - 28, "#1b0f12");
    rect(fx + 6, y + h - 4, 16, 2, "#4a2a1a");
    rect(fx + 8, y + h - 2, 13, 2, "#2c1b16");
    // 壁爐上的小東西
    rect(fx, y + 17, 4, 5, "#c0584a"); rect(fx + 8, y + 15, 3, 7, "#d9c49a"); rect(fx + 8, y + 13, 1, 2, "#ffe28a"); rect(fx + 18, y + 16, 7, 6, "#3f6b7a");
    // 掛畫：一隻鳥
    rect(x + 8, y + 9, 15, 13, "#3a2318"); rect(x + 10, y + 11, 11, 9, "#d9c49a");
    sprite(["..##...", ".###>..", "#####..", ".###..."], { "#": "#3f6b7a", ">": "#d0502a" }, x + 12, y + 13);
    // 地毯、椅子、茶几
    for (let i = 8; i < 72; i += 1) { rect(x + i, y + h - 2, 1, 2, i % 6 < 3 ? "#8a2f2a" : "#b8843a"); }
    rect(x + 40, y + h - 18, 18, 2, "#4a2a1a"); rect(x + 43, y + h - 16, 2, 14, "#3a2318"); rect(x + 53, y + h - 16, 2, 14, "#3a2318");
    sprite([".###..", "#####.", "#####.", ".###.."], { "#": "#e7dcc5" }, x + 44, y + h - 22);
    rect(x + 46, y + h - 22, 2, 1, "#c0584a");
    rect(x + 5, y + h - 20, 26, 18, "#7a2f32");
    rect(x + 3, y + h - 28, 6, 26, "#5e2228");
    rect(x + 5, y + h - 21, 26, 2, "#a8484a");
    rect(x + 29, y + h - 14, 4, 12, "#5e2228");
  }

  function libraryRoom() {
    const x = 192;
    const y = 104;
    const w = 96;
    const h = 56;
    roomShell(x, y, w, h, "#8a4d20", 7);
    // 整面書牆
    const r = rng(53);
    const colors = ["#a83f32", "#2f6f7a", "#d09a3a", "#5a7a3a", "#7a4a8a", "#c8b48a", "#3a4f8a"];
    for (let s = 0; s < 3; s += 1) {
      const sy = y + 5 + s * 15;
      rect(x + 4, sy + 11, 54, 2, "#3a2318");
      rect(x + 4, sy, 54, 11, "#4a2a18");
      let bx = x + 5;
      while (bx < x + 56) {
        const bw = 2 + Math.floor(r() * 2);
        const bh = 6 + Math.floor(r() * 5);
        if (r() < 0.86) { rect(bx, sy + 11 - bh, bw, bh, colors[Math.floor(r() * colors.length)]); px(bx, sy + 11 - bh + 1, "#f0e4c8"); }
        bx += bw + (r() < 0.2 ? 1 : 0);
      }
    }
    rect(x + 2, y + 4, 3, 48, "#3a2318"); rect(x + 57, y + 4, 3, 48, "#3a2318");
    // 窗
    const wx = x + 66;
    rect(wx, y + 8, 22, 20, "#2a1a16");
    rect(wx + 2, y + 10, 18, 16, "#16334a");
    rect(wx + 10, y + 10, 2, 16, "#2a1a16"); rect(wx + 2, y + 17, 18, 2, "#2a1a16");
    // 吊燈
    rect(x + 62, y, 1, 13, "#2a1a16");
    sprite(["..###..", ".#####.", "#######"], { "#": "#3a2318" }, x + 59, y + 12);
    rect(x + 60, y + 15, 5, 2, "#fff0b0");
    // 貓頭鷹和書桌
    rect(x + 62, y + h - 14, 30, 3, "#4a2a18");
    rect(x + 62, y + h - 14, 30, 1, "#7a5636");
    rect(x + 65, y + h - 11, 2, 11, "#3a2318"); rect(x + 87, y + h - 11, 2, 11, "#3a2318");
    // 通往下層的梯子
    const lx = x + 8;
    for (let j = y + h - 4; j < y + h + 20; j += 1) { px(lx, j, "#d09a3a"); px(lx + 6, j, "#d09a3a"); if (j % 4 === 0) rect(lx, j, 7, 1, "#a8742c"); }
  }

  function attic() {
    const cx = 240;
    const cy = 62;
    for (let j = -19; j <= 19; j += 1) for (let i = -19; i <= 19; i += 1) {
      const d = i * i + j * j;
      if (d > 361) continue;
      if (d > 256) px(cx + i, cy + j, "#5e3c26");
      else px(cx + i, cy + j, j / 16 + (bayer(cx + i, cy + j) - 0.5) * 0.4 < 0 ? "#ffcf6e" : "#ffa53c");
    }
    rect(cx - 16, cy, 32, 2, "#2a1a16"); rect(cx - 1, cy - 16, 2, 32, "#2a1a16");
  }

  function balcony() {
    const y = 146;
    const x0 = 308;
    const x1 = 392;
    // 樑和支撐
    line(x0, y + 26, x1 - 26, y + 4, "#1d1620", 2);
    rect(x0, y, x1 - x0, 4, "#4a2f22");
    rect(x0, y + 4, x1 - x0, 1, "#1d1620");
    for (let x = x0; x < x1; x += 7) px(x, y + 1, "#22140f");
    for (let x = x0 + 10; x <= x1; x += 13) rect(x, y - 13, 2, 13, "#2b1d1c");
    rect(x0 + 8, y - 15, x1 - x0 - 8, 2, "#4a2f22");
    // 爐盆
    const fx = 360;
    rect(fx - 8, y - 7, 16, 2, "#2c2230");
    rect(fx - 6, y - 5, 12, 2, "#3b3346");
    rect(fx - 1, y - 3, 2, 3, "#2c2230");
    rect(fx - 5, y, 10, 1, "#2c2230");
    // 從樹幹伸出的煙囪管
    rect(310, 88, 26, 5, "#3b3346");
    rect(310, 88, 26, 1, "#6f6775");
    rect(330, 60, 6, 33, "#3b3346");
    rect(330, 60, 1, 33, "#6f6775");
    rect(328, 57, 10, 3, "#2c2230");
  }

  // 主枝：從樹幹往外長，越遠越細
  function bough(x0, y0, x1, y1, thick, seed) {
    const r = rng(seed);
    const n = Math.abs(x1 - x0);
    const dir = x1 > x0 ? 1 : -1;
    for (let i = 0; i <= n; i += 1) {
      const f = i / n;
      const x = x0 + dir * i;
      const y = Math.round(y0 + (y1 - y0) * f - Math.sin(f * Math.PI) * 9);
      const w = Math.max(1, Math.round(thick * (1 - f * 0.85)));
      rect(x, y, 1, w, i % 5 === 0 ? "#3b2c30" : "#241b26");
      if (w > 2) px(x, y, r() < 0.5 ? "#4b7083" : "#2f4a5c");
      if (w > 2 && i % 9 === 0 && r() < 0.6) rect(x, y - 1, 3, 1, "#3f8a68");
    }
  }
  const boughY = (x0, y0, x1, y1, x) => { const f = (x - x0) / (x1 - x0); return Math.round(y0 + (y1 - y0) * f - Math.sin(f * Math.PI) * 9); };

  function birdhouse(x, y, color, roof) {
    sprite([
      ".....rr.....",
      "....rrrr....",
      "...rrrrrr...",
      "..rrrrrrrr..",
      ".rrrrrrrrrr.",
      "rrrrrrrrrrrr",
    ], { r: roof }, x - 6, y);
    rect(x - 5, y + 6, 10, 12, color);
    rect(x - 5, y + 6, 1, 12, mix(color, "#8fb0c4", 0.45));
    rect(x + 4, y + 6, 1, 12, "#1d1620");
    glow(x, y + 10, 20, "255,150,50", 0.28);
    sprite([".###.", "#####", "#####", ".###."], { "#": "#ff9a32" }, x - 2, y + 8);
    px(x - 1, y + 9, "#ffd27a");
    rect(x - 2, y + 15, 5, 1, "#3a2318");
  }

  function canopy() {
    const r = rng(61);
    const reach = (x) => 34 + Math.sin(x * 0.03) * 9 + Math.sin(x * 0.11) * 4 - Math.abs(x - 240) * 0.05;
    for (let x = -OX; x < fullW - OX; x += 1) {
      const h = Math.round(reach(x));
      rect(x, -OY, 1, h + OY, "#0d2328");
      for (let n = 0; n < 2; n += 1) {
        const y = Math.floor(r() * h);
        if (r() < 0.5) px(x, y, r() < 0.4 ? "#2c5c50" : "#173a38");
      }
      if (x % 2) px(x, h, "#173a38");
      if (x % 7 === 0) rect(x, h, 1, 3, "#0d2328");
    }
  }

  function mushrooms() {
    [[126, GROUND - 7, 1], [136, GROUND - 5, 0], [146, GROUND - 8, 1], [356, GROUND - 6, 1], [364, GROUND - 4, 0]].forEach(([x, y, big]) => {
      glow(x, y, big ? 14 : 9, "70,220,220", 0.5);
      sprite(big ? [".###.", "#####", "..w..", "..w.."] : [".#.", "###", ".w."], { "#": "#6ff0e6", w: "#cdeee8" }, x - (big ? 2 : 1), y);
    });
  }

  // 預先做好的光暈，每幀只調透明度，不必重建漸層
  const glowCache = new Map();
  function glowSprite(r, color) {
    const key = `${r}|${color}`;
    if (!glowCache.has(key)) {
      const c = document.createElement("canvas");
      c.width = r * 2;
      c.height = r * 2;
      const x = c.getContext("2d");
      const grad = x.createRadialGradient(r, r, 0, r, r, r);
      grad.addColorStop(0, `rgba(${color},1)`);
      grad.addColorStop(0.4, `rgba(${color},.35)`);
      grad.addColorStop(1, `rgba(${color},0)`);
      x.fillStyle = grad;
      x.fillRect(0, 0, r * 2, r * 2);
      glowCache.set(key, c);
    }
    return glowCache.get(key);
  }
  function softGlow(x, y, r, color, alpha) {
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = alpha;
    g.drawImage(glowSprite(r, color), Math.round(x - r), Math.round(y - r));
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
  }

  // 週期會被湊成 LOOP 的整數分之一，頭尾才接得起來
  const osc = (t, hz, phase = 0) => Math.sin((TAU * Math.round(hz * LOOP) * t) / LOOP + phase);
  const pulse = (t, period, width, phase = 0) => (t + phase) % period < width;
  const hash = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };

  const closedEyes = new Map();
  function birdAt(rows, colors, x, y, { flip = false, closed = false, bob = 0, headRows = 6 } = {}) {
    let palette = colors;
    if (closed) {
      if (!closedEyes.has(colors)) closedEyes.set(colors, { ...colors, e: colors.lid || colors.g, h: colors.lid || colors.g, E: colors.lid });
      palette = closedEyes.get(colors);
    }
    sprite(rows.slice(0, headRows), palette, x, y + bob, flip);
    sprite(rows.slice(headRows), palette, x, y + headRows, flip);
  }

  function flame(cx, base, half, tall, t, seed) {
    for (let col = -half; col <= half; col += 1) {
      const env = 1 - (col / (half + 1)) ** 2;
      const lick = 0.68 + 0.2 * osc(t, 1.7 + hash(col, seed), col * 1.3) + 0.12 * osc(t, 3.1, col * 2.1 + seed);
      const height = Math.round(tall * env * lick);
      if (height < 1) continue;
      rect(cx + col, base - height, 1, height, "#f0641e");
      const mid = Math.round(height * 0.72);
      rect(cx + col, base - mid, 1, mid, "#ffb02e");
      const core = Math.round(height * 0.4 * env);
      if (core > 0) rect(cx + col, base - core, 1, core, "#fff0a0");
    }
  }

  function particles(list, t) {
    for (let i = 0; i < list.length; i += 1) {
      const p = list[i];
      p.draw((p.phase + (p.laps * t) / LOOP) % 1);
    }
  }

  let rainFar = [];
  let rainNear = [];
  let sparkList = [];
  let smokeList = [];
  let fogTile = null;
  let bgLayer = null;
  let roomLayer = null;
  let vignette = null;

  function makeRain() {
    const r = rng(200);
    const count = Math.floor((fullW * fullH) / 300);
    rainFar = [];
    rainNear = [];
    for (let i = 0; i < count; i += 1) {
      const depth = r();
      const near = depth > 0.8;
      const mid = depth > 0.4;
      const speed = near ? 280 : mid ? 200 : 130;
      const drop = { x: r() * fullW, y: r() * fullH, laps: Math.round((speed * LOOP) / fullH), len: near ? 7 : mid ? 4 : 2, alpha: near ? 0.8 : mid ? 0.42 : 0.22, color: near ? "#bcd8e8" : "#7fa6bd" };
      (near ? rainNear : rainFar).push(drop);
    }
    rainFar.sort((a, b) => a.alpha - b.alpha);
  }

  function drawRain(list, t) {
    let alpha = -1;
    let color = "";
    for (let i = 0; i < list.length; i += 1) {
      const d = list[i];
      if (d.alpha !== alpha) { alpha = d.alpha; g.globalAlpha = alpha; }
      if (d.color !== color) { color = d.color; g.fillStyle = color; }
      const y = (d.y + (d.laps * fullH * t) / LOOP) % fullH;
      const x = (d.x - y * 0.07 + fullW) % fullW;
      g.fillRect(Math.round(x), Math.round(y), 1, d.len);
    }
    g.globalAlpha = 1;
  }

  const SPLASH_SURFACES = [[-200, W + 200, GROUND - 1, 60, "#a8c9d9"], [308, 392, 145, 8, "#cfe2ec"]];
  function splashes(t) {
    SPLASH_SURFACES.forEach(([x0, x1, y, count, color], s) => {
      for (let i = 0; i < count; i += 1) {
        const laps = 40 + (i % 5) * 12;
        const v = hash(i, s + 3) + (laps * t) / LOOP;
        const cycle = Math.floor(v);
        const f = v - cycle;
        if (f > 0.3) continue;
        const x = Math.floor(x0 + hash(i, cycle % laps) * (x1 - x0));
        px(x - 1, y, color); px(x + 1, y, color);
        if (f < 0.14) px(x, y - 1, "#e4f2f8");
      }
    });
  }

  function puddleRings(t) {
    const rings = [[112, 252, 54], [360, 256, 74], [225, 262, 46]];
    rings.forEach(([cx, cy, w], s) => {
      for (let i = 0; i < 9; i += 1) {
        const laps = 30 + (i % 4) * 10;
        const v = hash(i, s + 9) + (laps * t) / LOOP;
        const cycle = Math.floor(v);
        const f = v - cycle;
        if (f > 0.55) continue;
        const x = Math.round(cx + (hash(i + 3, cycle % laps) - 0.5) * w * 1.5);
        const y = Math.round(cy + (hash(i + 7, cycle % laps) - 0.5) * 3);
        const rad = 1 + Math.floor(f * 8);
        g.globalAlpha = 0.65 * (1 - f / 0.55);
        rect(x - rad, y, 1, 1, "#9cc6d6"); rect(x + rad, y, 1, 1, "#9cc6d6");
        if (rad > 2) { rect(x - rad + 1, y - 1, rad * 2 - 2, 1, "#6f9eb0"); rect(x - rad + 1, y + 1, rad * 2 - 2, 1, "#6f9eb0"); }
      }
    });
    g.globalAlpha = 1;
    for (let n = 0; n < shimmer.length; n += 1) {
      const p = shimmer[n];
      const ripple = Math.sin(p.i * 0.5 + p.j * 2.7 + (TAU * 40 * t) / LOOP) + Math.sin(p.i * 0.17 + p.j + (TAU * 23 * t) / LOOP);
      if (ripple > 1.1 - p.d * 1.6) px(p.x, p.y, p.d > 0.65 && ripple > 0.9 ? "#e8983c" : "#8a5a2c");
    }
  }

  const LANTERNS = [[354, 92, "#e98a3e", 0], [434, 78, "#e9c04e", 1.4], [100, 68, "#d96a5a", 2.6], [158, 72, "#e9c04e", 4.2]];
  function lanterns(t) {
    LANTERNS.forEach(([x, y, c, ph]) => {
      const sway = Math.round(osc(t, 0.2, ph) * 1.4);
      const lx = x + sway;
      const top = x > 240 ? boughY(300, 74, 452, 52, x) : boughY(176, 58, 70, 38, x);
      line(x, top, lx, y, "#141018");
      sprite([".#####.", "#######", "#######", ".#####."], { "#": c }, lx - 3, y);
      rect(lx - 3, y + 1, 7, 1, "#fff0b0");
      softGlow(lx, y + 2, 16, "255,170,90", 0.46 + osc(t, 0.5, ph) * 0.05 + osc(t, 1.3, ph) * 0.03);
    });
  }

  function mushroomPulse(t) {
    [[126, 233, 14], [136, 235, 9], [146, 232, 14], [356, 234, 14], [364, 236, 9]].forEach(([x, y, r], i) => {
      softGlow(x, y, r, "70,220,220", 0.26 + osc(t, 0.05, i * 1.3) * 0.16);
    });
  }

  function makeParticles() {
    const r = rng(101);
    sparkList = [];
    for (let i = 0; i < 18; i += 1) {
      const a = r();
      const b = r() * 6;
      sparkList.push({ phase: r(), laps: 12 + Math.floor(r() * 24), draw(f) {
        const drift = Math.sin(f * 7 + b) * (3 + f * 13) + a * 4 - 2;
        px(Math.round(360 + drift), Math.round(133 - f * 74), f < 0.5 ? "#ffd27a" : f < 0.8 ? "#ff8a30" : "#a84a24");
      } });
    }
    smokeList = [];
    for (let i = 0; i < 24; i += 1) {
      smokeList.push({ phase: i / 24, laps: 6, draw(f) {
        const y = 54 - f * 60;
        const x = 333 + Math.sin(f * 6 + 1) * (2 + f * 8) + f * 16;
        const size = Math.round(2 + f * 5);
        g.globalAlpha = 0.32 * (1 - f);
        rect(Math.round(x), Math.round(y), size, size, "#a9bdc9");
        g.globalAlpha = 1;
      } });
    }
  }

  // 緩慢飄過地面的霧。圖樣的週期等於圖寬，平移一整圈才接得起來
  function makeFog() {
    const w = fullW;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = 44;
    const x = c.getContext("2d");
    x.fillStyle = "#3f7380";
    const k1 = Math.max(1, Math.round(w / 90));
    const k2 = Math.max(1, Math.round(w / 37));
    for (let j = 0; j < 44; j += 1) for (let i = 0; i < w; i += 1) {
      const wave = 0.5 + 0.32 * Math.sin((TAU * k1 * i) / w) + 0.18 * Math.sin((TAU * k2 * i) / w + 1.7);
      const level = wave * Math.sin((j / 44) * Math.PI) * 0.42;
      if (bayer(i, j) < level) x.fillRect(i, j, 1, 1);
    }
    return c;
  }
  function drawFog(t) {
    const off = -Math.round((((2 * t) / LOOP) % 1) * fullW);
    g.globalAlpha = 0.55;
    g.drawImage(fogTile, off, OY + 200);
    g.drawImage(fogTile, off + fullW, OY + 200);
    g.globalAlpha = 1;
  }

  // 陽台上的鳥依日期輪替，和遊戲當天的 BOSS 一致
  const BOSS_LOOKS = {
    passer: { colors: SPARROW },
    urocissa: { colors: MAGPIE },
    platalea: { colors: { c: "#e8ecec", g: "#f4f6f4", e: "#141018", h: "#ffffff", k: "#191c24", n: "#f4f6f4", b: "#ffffff", w: "#d8dedc", d: "#aab4b4", t: "#c8d0d0", l: "#26262e", lid: "#f4f6f4" }, bill: { x: 17, y: 3, rows: ["kkkkkk", "kkkkkkk", "....kkk"], k: "#191c24" } },
    syrmaticus: { colors: { c: "#1c2650", g: "#d8382c", e: "#141018", h: "#ffffff", k: "#d8c8a8", n: "#2c3a7c", b: "#2c3a7c", w: "#3c4c9a", d: "#14184a", t: "#14184a", l: "#6a7a8a", lid: "#d8382c" }, tail: "#e6eef5" },
    balaeniceps: { colors: { c: "#6d7f8e", g: "#8c9ca8", e: "#f2e68a", h: "#141018", k: "#b49a64", n: "#8c9ca8", b: "#a4b2bc", w: "#6d7f8e", d: "#4b5a68", t: "#4b5a68", l: "#2c3238", lid: "#6d7f8e" }, bill: { x: 15, y: 2, rows: ["kkkkk.", "kkkkkk", "kkkkkk", "kkkkk.", "..kk.."], k: "#b49a64" } },
  };
  function todaysBoss() {
    const wanted = new URLSearchParams(location.search).get("boss");
    if (BOSS_LOOKS[wanted]) return wanted;
    try { return window.GachaEngine.bossOfDay(window.GachaData.BOSSES, window.GachaEngine.taipeiDate(new Date())).id; } catch { return "passer"; }
  }

  function bossBird(t, id) {
    const look = BOSS_LOOKS[id] || BOSS_LOOKS.passer;
    const shaking = pulse(t, 30, 1.2, 8);
    const x = 326 + (shaking ? (Math.floor(t * 12) % 2 ? 1 : -1) : 0);
    const y = 131;
    const bob = pulse(t, 6, 3, 1) ? 1 : 0;
    if (look.tail) for (let i = 0; i < 16; i += 1) px(x - i, y + 9 + Math.floor(i / 5), i % 3 < 2 ? look.tail : "#14184a");
    birdAt(BIRD, look.colors, x, y, { closed: pulse(t, 5, 0.18, 2), bob });
    if (look.bill) sprite(look.bill.rows, { k: look.bill.k }, x + look.bill.x, y + look.bill.y + bob);
    if (shaking) for (let i = 0; i < 6; i += 1) px(x + 9 + Math.round(Math.cos(i + t * 9) * (10 + (i % 3) * 3)), y + 6 + Math.round(Math.sin(i + t * 9) * 6), "#bcd8e8");
  }

  // 淋雨飛回家的鳥：t 40 到 58 秒飛到左邊的鳥屋，鑽進去後探頭一陣子
  function homecoming(t) {
    const hole = { x: 68, y: 110 };
    if (t >= 40 && t < 58) {
      const f = (t - 40) / 18;
      const x = -OX - 16 + f * (hole.x + OX + 14);
      const y = hole.y - 40 + f * 40 - Math.sin(f * Math.PI) * 26 + Math.round(osc(t, 2) * 2);
      const up = Math.floor(t * 8) % 2 === 0;
      sprite(up ? ["#.....#.", "##...##.", ".######>", "..####.."] : ["........", ".######>", "##.##.##", "#.....#."], { "#": "#b9cdd6", ">": "#ff9a3c" }, Math.round(x), Math.round(y));
    }
    if (t >= 58 && t < 82) {
      softGlow(hole.x, hole.y, 18, "255,170,70", 0.3);
      sprite([".cc.", "cekk", ".cc."], { c: "#4a3320", e: "#ffffff", k: "#d9772a" }, hole.x - 1, hole.y - 1);
    }
  }

  function roomLife(t) {
    const hx = 182;
    const hy = 174;
    const fireX = 182 + 82 + 14;
    const base = hy + 56 - 4;
    const flick = 1 + osc(t, 1.1) * 0.06 + osc(t, 2.3, 1) * 0.04;
    softGlow(fireX, base - 4, 62, "255,130,40", 0.46 * flick);
    flame(fireX, base, 8, 16, t, 3);
    softGlow(fireX, base - 3, 18, "255,220,120", 0.55 * flick);
    // 椅子上打盹的麻雀，偶爾睜眼
    birdAt(BIRD, SPARROW, hx + 11, hy + 22, { closed: !pulse(t, 40, 3, 11), bob: pulse(t, 8, 4, 0) ? 1 : 0 });
    if (!pulse(t, 40, 6, 11)) {
      const f = (t % 8) / 8;
      g.globalAlpha = f < 0.8 ? 0.8 : 0;
      sprite(["###", "..#", ".#.", "###"], { "#": "#fff0c8" }, hx + 28 + Math.round(f * 7), hy + 18 - Math.round(f * 12));
      g.globalAlpha = 1;
    }
    // 爐火前的麻雀，偶爾回頭看房間
    birdAt(BIRD, SPARROW, hx + 58, hy + 40, { flip: pulse(t, 60, 7, 30), closed: pulse(t, 6, 0.18, 3), bob: pulse(t, 4, 2, 0) ? 1 : 0 });
    // 茶杯的蒸氣
    for (let i = 0; i < 5; i += 1) {
      const f = (i / 5 + (8 * t) / LOOP) % 1;
      g.globalAlpha = 0.5 * (1 - f);
      px(hx + 47 + Math.round(Math.sin(f * 7 + i) * 1.6), hy + 33 - Math.round(f * 13), "#fff0d8");
    }
    g.globalAlpha = 1;
    // 書房
    const lx = 192;
    const ly = 104;
    softGlow(lx + 62, ly + 17, 44, "255,190,90", 0.58 + osc(t, 0.7) * 0.04 + osc(t, 1.9, 2) * 0.025);
    birdAt(OWL, OWL_C, lx + 68, ly + 27, { closed: pulse(t, 7, 0.2, 0) || pulse(t, 7, 0.2, 6.5), bob: pulse(t, 15, 5, 2) ? 1 : 0, headRows: 8 });
    sprite(["fffffffffffff", ".wwwwwkwwwww.", ".wwwwwkwwwww."], { f: "#8a2f2a", w: "#f4ecd8", k: "#8a6a44" }, lx + 69, ly + 38);
    if (t % 20 < 0.8) { const step = Math.floor((t % 20) / 0.2); rect(lx + 72 + step * 2, ly + 35 - (step % 2), 2, 4, "#fff8e8"); }
    // 窗外的雨
    for (let i = 0; i < 7; i += 1) {
      const f = (hash(i, 5) + ((70 + i * 10) * t) / LOOP) % 1;
      const x = lx + 68 + Math.floor(hash(i, 8) * 18);
      if (x !== lx + 76 && x !== lx + 77) rect(x, ly + 10 + Math.floor(f * 14), 1, 2, "#6f9ab0");
    }
  }

  function buildLayers() {
    glowCache.clear();
    shimmer = [];
    bgLayer = layer(() => {
      sky();
      forest();
      ground();
      g.save();
      g.translate(OX, OY);
      glow(240, 150, 230, "40,110,130", 0.22);
      puddle(112, GROUND + 12, 54, 9, [[150, 12]]);
      puddle(360, GROUND + 16, 74, 8, [[346, 18], [392, 9]]);
      puddle(225, GROUND + 22, 46, 5, [[230, 24]]);
      trunk();
      const L = [176, 116, 34, 96];
      const R = [300, 74, 452, 52];
      const L2 = [176, 58, 70, 38];
      bough(...L, 11, 4);
      bough(...L2, 8, 6);
      bough(...R, 10, 9);
      line(120, boughY(...L, 120), 104, boughY(...L, 120) - 22, "#241b26", 2);
      line(90, boughY(...L2, 90) + 1, 76, boughY(...L2, 90) + 16, "#241b26");
      attic();
      balcony();
      [132, 68].forEach((x) => rect(x, boughY(...L, x), 1, 7, "#141018"));
      birdhouse(132, boughY(...L, 132) + 7, "#5a7f8c", "#2a3c4a");
      birdhouse(68, boughY(...L, 68) + 7, "#a06a4a", "#3a2a30");
      rect(404, boughY(...R, 404), 1, 9, "#141018");
      birdhouse(404, boughY(...R, 404) + 9, "#7a8a5a", "#2e3a2c");
      canopy();
      mushrooms();
      g.restore();
    });
    // 房間蓋在雨的上面：雨不會穿進室內
    roomLayer = layer(() => {
      g.save();
      g.translate(OX, OY);
      libraryRoom();
      hearthRoom();
      g.restore();
    });
    vignette = layer(() => {
      const v = g.createRadialGradient(fullW / 2, fullH / 2, fullH * 0.42, fullW / 2, fullH / 2, fullW * 0.7);
      v.addColorStop(0, "rgba(255,255,255,1)");
      v.addColorStop(1, "rgba(105,125,160,1)");
      g.fillStyle = v;
      g.fillRect(0, 0, fullW, fullH);
    });
    fogTile = makeFog();
    makeRain();
    makeParticles();
  }

  let bossId = todaysBoss();
  const ATTIC_BIRD = ["...###....", "...####>>.", "..#####...", ".#######..", "########..", "########..", ".######...", "..#...#..."];
  function render(t) {
    g = screen;
    g.drawImage(bgLayer, 0, 0);
    g.save();
    g.translate(OX, OY);
    softGlow(240, 62, 36, "255,160,60", 0.38 + osc(t, 0.4) * 0.03);
    sprite(ATTIC_BIRD, { "#": "#6a2f12", ">": "#6a2f12" }, 240 + Math.round(osc(t, 1 / 60) * 8), 70);
    rect(239, 46, 2, 32, "#2a1a16");
    lanterns(t);
    mushroomPulse(t);
    const flick = 1 + osc(t, 1.3) * 0.07 + osc(t, 2.7, 1) * 0.04;
    softGlow(360, 130, 62, "255,120,40", 0.5 * flick);
    bossBird(t, bossId);
    flame(360, 139, 5, 13, t, 7);
    softGlow(360, 133, 18, "255,215,110", 0.55 * flick);
    particles(sparkList, t);
    particles(smokeList, t);
    puddleRings(t);
    homecoming(t);
    g.restore();
    drawFog(t);
    drawRain(rainFar, t);
    g.save();
    g.translate(OX, OY);
    splashes(t);
    g.restore();
    drawRain(rainNear, t);
    g.drawImage(roomLayer, 0, 0);
    g.save();
    g.translate(OX, OY);
    roomLife(t);
    g.restore();
    g.globalCompositeOperation = "multiply";
    g.drawImage(vignette, 0, 0);
    g.globalCompositeOperation = "source-over";
  }

  function setup() {
    const scale = Math.max(1, Math.round((innerHeight * devicePixelRatio) / H));
    fullW = Math.ceil((innerWidth * devicePixelRatio) / scale);
    fullH = Math.ceil((innerHeight * devicePixelRatio) / scale);
    canvas.width = fullW;
    canvas.height = fullH;
    screen.imageSmoothingEnabled = false;
    OX = Math.floor((fullW - W) / 2);
    OY = Math.floor((fullH - H) / 2);
    buildLayers();
  }

  setup();
  let resizeTimer = null;
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(setup, 200);
  });

  const params = new URLSearchParams(location.search);
  const frozen = params.has("t") ? Number(params.get("t")) : NaN;
  if (Number.isFinite(frozen)) {
    render(frozen);
  } else {
    let last = 0;
    let lastBossCheck = 0;
    const tick = (now) => {
      requestAnimationFrame(tick);
      if (now - last < FRAME_MS - 2) return;
      last = now;
      if (now - lastBossCheck > 60000) { lastBossCheck = now; bossId = todaysBoss(); }
      render((Date.now() / 1000) % LOOP);
    };
    requestAnimationFrame(tick);
  }
  if (params.has("test")) window.wallpaperTest = { render, LOOP };
})();
