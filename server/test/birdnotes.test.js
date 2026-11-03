const test = require("node:test");
const assert = require("node:assert");
const I18n = require("../../public/i18n.js");
const BirdNotes = require("../../public/birdnotes.js");
const { fixCard } = require("../../tools/gacha-fix-facts.js");
const { loadCards } = require("../setup.js");

const CJK = /[㐀-鿿]/;
const cards = loadCards();
const en = BirdNotes.create(I18n.create("en"));
const zh = BirdNotes.create(I18n.create("zh-Hant"));

test("每張牌都有中英文的分類、手感和主食", () => {
  for (const card of cards) {
    for (const notes of [en, zh]) {
      assert.ok(notes.taxon(card), card.id);
      assert.ok(notes.hand(card), card.id);
      assert.ok(notes.diet(card), card.id);
    }
    assert.ok(!CJK.test(en.taxon(card) + en.hand(card) + en.diet(card)), card.id);
  }
});

test("家麻雀的比例由體重算出", () => {
  const card = (massG) => ({ id: "x", massG, file: "stickers/Passeriformes/Passeridae/x.webp", facts: [] });
  assert.match(en.hand(card(26.5 * 223)), /as heavy as 220 house sparrows/);
  assert.match(en.hand(card(26.5 * 3)), /as heavy as 3 house sparrows/);
  assert.match(en.hand(card(30)), /one house sparrow/);
  assert.match(en.hand(card(2.6)), /about 10 of these/);
  assert.match(en.hand(cards.find((c) => c.id === BirdNotes.SPARROW.id)), /weighed against this one/);
  assert.strictEqual(cards.find((c) => c.id === BirdNotes.SPARROW.id).massG, BirdNotes.SPARROW.g);
});

test("卡池已套用修正：鳥名沒有替代字，解說沒有過時說法", () => {
  for (const card of cards) {
    assert.ok(!/\(共鳥\)|滅絕\?|\[/.test(card.zh), card.zh);
    const text = card.facts.map((f) => f.d).join("");
    assert.ok(!/什麼都吃|在水裡抓獵物|岩壁| 0% /.test(text), `${card.id}: ${text}`);
    assert.deepStrictEqual(fixCard(card), card, card.id);
  }
});

test("舊版牌面（資料庫還沒重新匯入）也翻得出英文", () => {
  const t = (d, title = "牠的數字") => I18n.translateFact({ t: title, d });
  assert.match(t("平均約 3 公克，比資料庫裡 0% 的鳥重。嘴長 18 公釐，腳（跗蹠）長 4 公釐。").d, /lightest 1%/);
  assert.match(t("平均約 2.6 公克，屬於資料庫裡最輕的 1%。嘴長 18 公釐，腳（跗蹠）長 4 公釐。").d, /^Averages about 2\.6 g, among the lightest 1%/);
  assert.strictEqual(t("主要待在森林，什麼都吃，有些族群會遷徙。", "牠怎麼過日子").d, "Lives mainly in forests and has a varied diet. Some populations migrate.");
  assert.strictEqual(t("在水裡抓獵物，會長途遷徙。", "牠怎麼過日子").d, "Catches animals in or near water. Migrates long distances.");
  assert.strictEqual(t("主要待在月球，吃種子。", "牠怎麼過日子"), null);
});
