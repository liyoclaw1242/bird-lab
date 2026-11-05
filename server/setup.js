// 建表和匯入卡池。只在部署步驟和本機執行，不會打包進線上函式。
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const migrate = (db) => db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));

const loadCards = () => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, "data/cards.json.gz"))).toString("utf8"));
// 測試用：拿掉照片，整個卡池都可抽，測試結果才不受照片涵蓋率影響（照片凍結規則有專門的測試）
const withoutPhotos = (cards) => cards.map(({ photo, ...card }) => card);

async function seed(db, cards = loadCards(), batch = 500) {
  for (let i = 0; i < cards.length; i += batch) {
    const rows = cards.slice(i, i + batch);
    await db.query(
      `INSERT INTO cards (id, rarity, type, atk, def, data)
       SELECT * FROM jsonb_to_recordset($1::jsonb) AS r(id TEXT, rarity TEXT, type TEXT, atk INT, def INT, data JSONB)
       ON CONFLICT (id) DO UPDATE SET rarity = EXCLUDED.rarity, type = EXCLUDED.type, atk = EXCLUDED.atk, def = EXCLUDED.def, data = EXCLUDED.data`,
      [JSON.stringify(rows.map((c) => ({ id: c.id, rarity: c.rarity, type: c.type, atk: c.atk, def: c.def, data: c })))],
    );
  }
  return cards.length;
}

module.exports = { migrate, seed, loadCards, withoutPhotos };
