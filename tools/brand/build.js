// 由 public/logo.svg 和 og.html 產生圖示與 OG 圖：node tools/brand/build.js（需要 Playwright）
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");

const pub = path.join(__dirname, "../../public");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.goto(`file://${path.join(__dirname, "og.html")}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(pub, "og.png") });
  for (const [size, name, solid] of [[32, "favicon-32.png"], [180, "apple-touch-icon.png", true], [192, "icon-192.png"], [512, "icon-512.png"], [512, "icon-maskable-512.png", true]]) {
    const icon = await browser.newPage({ viewport: { width: size, height: size } });
    await icon.goto(`file://${path.join(__dirname, "og.html")}`);
    // 手機桌面圖示會被裁切，透明處在 iOS 還會變黑，所以鋪滿底色並把 logo 縮進安全範圍
    await icon.evaluate(([s, full]) => {
      document.documentElement.style.background = document.body.style.background = full ? "#3f3019" : "transparent";
      const box = full ? s * 0.76 : s;
      document.body.innerHTML = `<img src="../../public/logo.svg" style="position:fixed;left:${(s - box) / 2}px;top:${(s - box) / 2}px;width:${box}px;height:${box}px">`;
    }, [size, solid]);
    await icon.waitForTimeout(150);
    await icon.screenshot({ path: path.join(pub, name), omitBackground: true });
    await icon.close();
  }
  await browser.close();
})();
