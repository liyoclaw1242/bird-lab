// 分享連結 /s/:code 的頁面：爬蟲讀 meta 做預覽，真人立刻轉進遊戲領鳥。
const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function sharePage(code, preview, origin = "") {
  const safe = /^[a-z0-9]{1,20}$/i.test(code) ? code : "";
  const live = preview?.status === "open";
  const title = live ? `朋友分你一隻${preview.card.rarity}「${preview.card.zh}」｜一鳥在手` : "一鳥在手｜百鳥在林，不如一鳥在手";
  const description = live ? `還剩 ${preview.left} 份，領完就沒了。` : "每天搖一棵樹，遇見一隻真實世界的鳥，再帶三隻去打看起來超正常的 BOSS。";
  const target = safe ? `/?s=${safe}` : "/";
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta name="robots" content="noindex">
<meta property="og:site_name" content="一鳥在手"><meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(origin)}/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=${esc(target)}"><script>location.replace(${JSON.stringify(target)})</script></head>
<body><a href="${esc(target)}">走進林子</a></body></html>`;
}

module.exports = { sharePage };
