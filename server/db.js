// 有 DATABASE_URL 就連正式的 Postgres（Supabase 連線池），否則用行程內的 PGlite，本機開發和測試跑的是同一套 SQL。
function wrapPostgres(url, ca = process.env.DATABASE_CA) {
  const { Pool } = require("pg");
  // 有 CA 就驗證憑證；沒有就照連線字串的設定，驗不過會直接連不上，不會默默改成不驗證
  const connection = ca
    ? { connectionString: url.replace(/[?&]sslmode=[^&]*/, ""), ssl: { ca, rejectUnauthorized: true } }
    : { connectionString: url };
  const pool = new Pool({ ...connection, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 8000 });
  pool.on("error", (error) => console.error("db pool", error.message));
  return {
    query: (sql, params) => pool.query(sql, params),
    exec: (sql) => pool.query(sql),
    close: () => pool.end(),
    async tx(work) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await work({ query: (sql, params) => client.query(sql, params) });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

async function openLocal(dataDir) {
  // 套件名放變數裡，線上函式打包時才不會把只有本機用的 PGlite 帶進去
  const local = "@electric-sql/pglite";
  const { PGlite } = await import(local);
  const db = new PGlite(dataDir);
  await db.waitReady;
  return {
    query: (sql, params) => db.query(sql, params),
    exec: (sql) => db.exec(sql),
    close: () => db.close(),
    tx: (work) => db.transaction((t) => work({ query: (sql, params) => t.query(sql, params) })),
  };
}

const open = ({ url = process.env.DATABASE_URL, dataDir } = {}) => (url ? Promise.resolve(wrapPostgres(url)) : openLocal(dataDir));

module.exports = { open };
