// 檢查 .env.local 的 token 能不能用，只印結果，不印任何值：npm run check-env
const fs = require("fs");
const env = process.env;

const authed = (url, token) => fetch(url, { headers: { authorization: `Bearer ${token}` } });

const checks = {
  async "Supabase token"() {
    const res = await authed("https://api.supabase.com/v1/organizations", env.SUPABASE_ACCESS_TOKEN);
    return res.ok || `HTTP ${res.status}`;
  },
  async "Supabase 專案"() {
    const res = await authed(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}`, env.SUPABASE_ACCESS_TOKEN);
    if (!res.ok) return `HTTP ${res.status}`;
    const { region } = await res.json();
    return region === "ap-northeast-1" || `區域是 ${region}，應該選東京 (ap-northeast-1)`;
  },
  "Supabase 資料庫密碼": () => Boolean(env.SUPABASE_DB_PASSWORD) || "未填",
  "Supabase CA 憑證": () => fs.existsSync(".env.supabase-ca.crt") || "找不到 .env.supabase-ca.crt",
  async "Vercel token"() {
    const res = await authed("https://api.vercel.com/v2/user", env.VERCEL_TOKEN);
    return res.ok || `HTTP ${res.status}`;
  },
  async Cloudflare() {
    const url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/tokens/verify`;
    const res = await authed(url, env.CLOUDFLARE_API_TOKEN);
    return res.ok || `HTTP ${res.status}，token 或帳號 ID 不對`;
  },
  "Google Client ID": () => /\.apps\.googleusercontent\.com$/.test(env.GOOGLE_CLIENT_ID || "") || "格式不對或未填",
};

const required = {
  "Supabase token": ["SUPABASE_ACCESS_TOKEN"],
  "Supabase 專案": ["SUPABASE_ACCESS_TOKEN", "SUPABASE_PROJECT_REF"],
  "Vercel token": ["VERCEL_TOKEN"],
  Cloudflare: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
};

(async () => {
  let failed = false;
  for (const [name, check] of Object.entries(checks)) {
    const missing = (required[name] || []).filter((key) => !env[key]);
    let outcome = `未填 ${missing.join("、")}`;
    if (!missing.length) outcome = await Promise.resolve().then(check).catch((error) => error.message);
    failed ||= outcome !== true;
    console.log(`${outcome === true ? "ok  " : "FAIL"} ${name}${outcome === true ? "" : `：${outcome}`}`);
  }
  process.exitCode = failed ? 1 : 0;
})();
