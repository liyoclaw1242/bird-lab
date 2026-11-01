// 驗證 Google 登入回傳的 ID token（簽章、發行者、到期、aud），只取不會變動的帳號編號 sub。
let client;
async function verifyGoogle(credential, audience = process.env.GOOGLE_CLIENT_ID) {
  if (!audience) throw new Error("GOOGLE_CLIENT_ID 沒有設定");
  const { OAuth2Client } = require("google-auth-library");
  client ||= new OAuth2Client();
  const ticket = await client.verifyIdToken({ idToken: credential, audience });
  return ticket.getPayload().sub;
}
module.exports = { verifyGoogle };
