const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const I18n = require("../../public/i18n.js");
const { loadCards } = require("../setup.js");

const CJK = /[㐀-鿿]/;
const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("英文和中文的字串鍵、變數一致，英文沒有留下中文", () => {
  const zh = I18n.DICT["zh-Hant"];
  const en = I18n.DICT.en;
  for (const key of Object.keys(zh)) {
    assert.ok(key in en, `英文缺 ${key}`);
    assert.deepStrictEqual(placeholders(en[key]), placeholders(zh[key]), key);
    if (Array.isArray(zh[key])) assert.strictEqual(en[key].length, zh[key].length, key);
  }
  for (const [key, value] of Object.entries(en)) {
    if (key !== "lang.switch") assert.ok(!CJK.test(JSON.stringify(value)), key);
  }
});

test("畫面用到的每個固定字串鍵都存在", () => {
  const dir = path.join(__dirname, "../../public");
  const source = ["game.js", "sound.js", "scenery.js"].map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
  const keys = [...source.matchAll(/\b(?:t|I18n\.t|I18n\.list)\("([\w.]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length > 80);
  for (const key of keys) assert.ok(key in I18n.DICT["zh-Hant"], key);
  assert.ok(!CJK.test(source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "").replace(/\["第一印象", "你可能不知道"\]/, "").replace(/"輪廓太小"/, "")), "畫面程式還留有中文");
});

test("每張牌的模板解說都能翻成英文，人工趣聞不顯示", () => {
  const en = I18n.create("en");
  const zh = I18n.create("zh-Hant");
  for (const card of loadCards()) {
    const templated = card.facts.filter((f) => ["牠的數字", "牠怎麼過日子", "保育狀況"].includes(f.t));
    const facts = en.facts(card);
    assert.strictEqual(facts.length, templated.length, card.id);
    for (const f of facts) assert.ok(!CJK.test(f.t + f.d), `${card.id}: ${f.d}`);
    assert.ok(en.name(card) && !CJK.test(en.name(card)), card.id);
    assert.strictEqual(zh.facts(card), card.facts);
  }
});

test("語言偵測：網址 > 已存設定 > 瀏覽器，缺字退回繁中", () => {
  const env = (search, saved, languages) => ({ location: { search }, localStorage: { getItem: () => saved, setItem() {} }, navigator: { languages } });
  assert.strictEqual(I18n.detect(env("?lang=en", "zh-Hant", ["zh-TW"])), "en");
  assert.strictEqual(I18n.detect(env("", "en", ["zh-TW"])), "en");
  assert.strictEqual(I18n.detect(env("", null, ["zh-CN"])), "zh-Hant");
  assert.strictEqual(I18n.detect(env("", null, ["fr-FR"])), "en");
  assert.strictEqual(I18n.detect(env("?lang=<x>", "bad", ["ja"])), "en");
  const blocked = { location: { search: "" }, localStorage: { getItem() { throw new Error("blocked"); } }, navigator: { language: "zh-TW" } };
  assert.strictEqual(I18n.detect(blocked), "zh-Hant");
  assert.strictEqual(I18n.create("xx").t("retry"), "再試一次");
  assert.strictEqual(I18n.create("en").serverError("claim_limit", "中文"), I18n.DICT.en["err.claim_limit"]);
  assert.strictEqual(I18n.create("en").serverError("unknown_code", "中文"), I18n.DICT.en["err.resting"]);
  assert.strictEqual(I18n.create("zh-Hant").serverError("gone", "中文"), "中文");
});

test("伺服器的每個錯誤碼都有英文", () => {
  const source = fs.readFileSync(path.join(__dirname, "../game.js"), "utf8");
  for (const [, code] of source.matchAll(/GameError\(\d+, "(\w+)"/g)) assert.ok(`err.${code}` in I18n.DICT.en, code);
});
