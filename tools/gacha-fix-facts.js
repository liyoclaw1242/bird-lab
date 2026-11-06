#!/usr/bin/env node
// 修正卡池裡的鳥名和模板解說：node tools/gacha-fix-facts.js
// 規則和 tools/gacha-primary-text.py 同步，重建卡面文字會得到一樣的結果。可重跑，已修過的不會再變。
// 改完要重跑 seed（npm run seed），線上資料庫的牌面才會更新。
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const FILE = path.join(__dirname, "../server/data/cards.json.gz");

// IOC 簡體名裡打不出的字用「(共鳥)」代替，其實是「䳍」（tinamou）；另有幾個名字帶了註記
function fixName(zh) {
  // 有些名字尾巴還黏著來源字型的私用區字元（U+E000–F8FF），畫面上會變方框，名字本身在前面已經完整
  return zh.replace(/[\uE000-\uF8FF]/g, "").trim().replace(/\(共鳥\)/g, "䳍").replace(/\s*滅絕\?$/, "").replace(/\[.*\]$/, "");
}

// 雜食（Omnivore）在 AVONET 的定義是沒有單一食物超過六成，「什麼都吃」講過頭了；
// 水中掠食者（Aquatic predator）包含在水邊翻泥找蟲的涉禽，不只是在水裡抓
const LIFE = { 什麼都吃: "食性很雜", 在水裡抓獵物: "在水裡或水邊捕食動物", 主要待在岩壁: "主要待在岩石地帶" };

function weight(g) {
  if (g >= 1000) return `${(g / 1000).toFixed(1)} 公斤`;
  return g < 10 ? `${g.toFixed(1)} 公克` : `${g.toFixed(0)} 公克`;
}

const NUMBERS = /^平均約 [\d.,]+ (?:公克|公斤)，(?:比資料庫裡 (\d+)% 的鳥重|屬於資料庫裡最輕的 1%)。/;

function fixFact(fact, card) {
  if (fact.t === "牠的數字") {
    const m = NUMBERS.exec(fact.d);
    if (!m) throw new Error(`${card.id}: ${fact.d}`);
    // 0% 讀起來像「誰都比牠重」，其實是最輕的那 1%
    const rank = m[1] === undefined || m[1] === "0" ? "屬於資料庫裡最輕的 1%" : `比資料庫裡 ${m[1]}% 的鳥重`;
    return { t: fact.t, d: `平均約 ${weight(card.massG)}，${rank}。${fact.d.slice(m[0].length)}` };
  }
  if (fact.t === "牠怎麼過日子") {
    return { t: fact.t, d: fact.d.replace(/。$/, "").split("，").map((p) => LIFE[p] || p).join("，") + "。" };
  }
  return fact;
}

function fixCard(card) {
  return { ...card, zh: fixName(card.zh), facts: card.facts.map((f) => fixFact(f, card)) };
}

if (require.main === module) {
  const cards = JSON.parse(zlib.gunzipSync(fs.readFileSync(FILE)).toString("utf8"));
  const fixed = cards.map(fixCard);
  const changed = fixed.filter((c, i) => JSON.stringify(c) !== JSON.stringify(cards[i])).length;
  fs.writeFileSync(FILE, zlib.gzipSync(JSON.stringify(fixed), { level: 9 }));
  console.log(`改了 ${changed} / ${cards.length} 張`);
}

module.exports = { fixCard, fixName };
