// 在瀏覽器裡把貼紙輪廓描成潦草線稿，1 萬多隻不用預先產生、也不用存檔。
(function () {
  const SIZE = 110;
  const cache = new Map();

  function seeded(text) {
    let h = 2166136261;
    for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
    return () => {
      h = (h + 0x6d2b79f5) | 0;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  function largestMask(alpha, w, h) {
    const seen = new Uint8Array(w * h);
    let best = [];
    for (let start = 0; start < w * h; start++) {
      if (seen[start] || alpha[start] <= 128) continue;
      const cells = [], stack = [start];
      seen[start] = 1;
      while (stack.length) {
        const at = stack.pop();
        cells.push(at);
        const x = at % w;
        for (const next of [x > 0 ? at - 1 : -1, x < w - 1 ? at + 1 : -1, at - w, at + w]) {
          if (next >= 0 && next < w * h && !seen[next] && alpha[next] > 128) {
            seen[next] = 1;
            stack.push(next);
          }
        }
      }
      if (cells.length > best.length) best = cells;
    }
    const mask = new Uint8Array(w * h);
    for (const at of best) mask[at] = 1;
    return { mask, cells: best };
  }

  function contour(mask, w, h) {
    const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x];
    const first = mask.indexOf(1);
    const sx = first % w, sy = Math.floor(first / w);
    const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    const points = [];
    let x = sx, y = sy, d = 6;
    for (let guard = 0; guard < 4 * w * h; guard++) {
      points.push([x, y]);
      let moved = false;
      for (let i = 0; i < 8; i++) {
        const nd = (d + i) % 8;
        const nx = x + dirs[nd][0], ny = y + dirs[nd][1];
        if (on(nx, ny)) { x = nx; y = ny; d = (nd + 6) % 8; moved = true; break; }
      }
      if (!moved || (x === sx && y === sy)) break;
    }
    return points;
  }

  function simplify(points, eps) {
    if (points.length < 3) return points;
    const [x1, y1] = points[0], [x2, y2] = points[points.length - 1];
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    let far = 0, at = 0;
    points.forEach(([px, py], i) => {
      const dist = Math.abs((x2 - x1) * (y1 - py) - (x1 - px) * (y2 - y1)) / len;
      if (dist > far) { far = dist; at = i; }
    });
    if (far <= eps) return [points[0], points[points.length - 1]];
    return [...simplify(points.slice(0, at + 1), eps).slice(0, -1), ...simplify(points.slice(at), eps)];
  }

  // 每格到輪廓邊緣的距離（棋盤距離），數字越大代表身體越厚
  function thickness(mask, w, h) {
    const d = new Uint16Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const at = y * w + x;
      if (mask[at]) d[at] = 1 + Math.min(y ? d[at - w] : 0, x ? d[at - 1] : 0);
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      const at = y * w + x;
      if (mask[at]) d[at] = Math.min(d[at], 1 + Math.min(y < h - 1 ? d[at + w] : 0, x < w - 1 ? d[at + 1] : 0));
    }
    return d;
  }

  function draw(img, seed) {
    const scale0 = Math.min(SIZE / img.naturalWidth, SIZE / img.naturalHeight);
    const w = Math.max(8, Math.round(img.naturalWidth * scale0)), h = Math.max(8, Math.round(img.naturalHeight * scale0));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const pixels = ctx.getImageData(0, 0, w, h).data;
    const alpha = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) alpha[i] = pixels[i * 4 + 3];
    const { mask, cells } = largestMask(alpha, w, h);
    if (cells.length < 30) throw new Error("輪廓太小");

    const outline = contour(mask, w, h);
    const half = outline.length >> 1;
    const pts = [...simplify(outline.slice(0, half + 1), 2.2).slice(0, -1), ...simplify(outline.slice(half), 2.2).slice(0, -1)];

    let x0 = w, x1 = 0, y0 = h, y1 = 0, cxSum = 0, cySum = 0;
    for (const at of cells) {
      const x = at % w, y = Math.floor(at / w);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      cxSum += x; cySum += y;
    }
    const cx = cxSum / cells.length, cy = cySum / cells.length;
    const scale = 256 / Math.max(x1 - x0, y1 - y0, 1);
    const ox = 150 - ((x0 + x1) / 2) * scale, oy = 150 - ((y0 + y1) / 2) * scale;

    // 頭是高處夠厚的一團，翹起來的尾巴和冠羽太薄會被濾掉；再用它和重心的左右關係判斷臉朝哪邊
    const depth = thickness(mask, w, h);
    const minDepth = Math.max(3, Math.round(Math.max(x1 - x0, y1 - y0) * 0.055));
    const thick = cells.filter((at) => depth[at] >= minDepth);
    const headCells = thick.length ? thick : cells;
    const top = Math.floor(headCells.reduce((lowest, at) => Math.min(lowest, at), Infinity) / w);
    const band = top + Math.max(2, minDepth);
    let hx = 0, hy = 0, hn = 0;
    for (const at of headCells) {
      const y = Math.floor(at / w);
      if (y <= band) { hx += at % w; hy += y; hn++; }
    }
    hx /= hn; hy /= hn;

    const rand = seeded(seed);
    const jitter = (spread) => pts.map(([x, y]) => [x * scale + ox + (rand() * 2 - 1) * spread, y * scale + oy + (rand() * 2 - 1) * spread]);
    const line = (list) => "M" + list.map(([a, b]) => `${a.toFixed(0)} ${b.toFixed(0)}`).join(" ");
    const body = line(jitter(4)) + " Z";
    const again = jitter(9);
    const from = Math.floor(rand() * again.length);
    const redo = line([...again, ...again].slice(from, from + Math.max(3, again.length >> 1)));
    let hatch = "M";
    for (let i = -3; i <= 3; i++) {
      hatch += `${i > -3 ? " L" : ""}${((cx + i * 3.2) * scale + ox + (rand() * 16 - 8)).toFixed(0)} ${((cy + (i % 2 ? 5 : -5)) * scale + oy).toFixed(0)}`;
    }
    const ex = hx * scale + ox, ey = (hy + 2) * scale + oy;
    const big = 13 + rand() * 5, small = 6 + rand() * 3;
    const side = rand() < 0.5 ? -1 : 1;
    const look = [[-1, -1], [2, 3], [4, -2], [-3, 3]][Math.floor(rand() * 4)];
    const eye2 = ex + side * (big + small - 2);
    const svg = `<path d="${body}" class="fill"/><path d="${redo}"/><path d="${hatch}"/>`
      + `<circle cx="${ex.toFixed(0)}" cy="${ey.toFixed(0)}" r="${big.toFixed(0)}" class="fill"/><circle cx="${(ex + (look[0] * big) / 8).toFixed(0)}" cy="${(ey + (look[1] * big) / 8).toFixed(0)}" r="4.5" class="dot"/>`
      + `<circle cx="${eye2.toFixed(0)}" cy="${(ey - 3).toFixed(0)}" r="${small.toFixed(0)}" class="fill"/><circle cx="${eye2.toFixed(0)}" cy="${(ey - 3).toFixed(0)}" r="2.2" class="dot"/>`;
    return { svg, faceRight: hx > cx };
  }

  // 同一隻只描一次；失敗時回傳 null，畫面改用貼紙，不擋住戰鬥
  window.Doodle = {
    get(url, seed) {
      if (!cache.has(url)) cache.set(url, loadImage(url).then((img) => draw(img, seed)).catch(() => null));
      return cache.get(url);
    },
  };
})();
