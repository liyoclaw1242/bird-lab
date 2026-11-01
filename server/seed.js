// 建表並匯入卡池，重跑不會產生重複資料：DATABASE_URL=... node server/seed.js
const { open } = require("./db.js");
const { migrate, seed } = require("./setup.js");

(async () => {
  const db = await open({ dataDir: process.env.GACHA_DATA_DIR });
  await migrate(db);
  console.log(`匯入 ${await seed(db)} 張牌`);
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
