#!/usr/bin/env python3
# 幫每種鳥挑一段 xeno-canto 的叫聲錄音：build-calls.py [--taiwan] [--limit N]
# 需要 xeno-canto API key：環境變數 XENO_CANTO_API_KEY，或 .env.local 裡的同名一行（只讀這一個值，不印出）。
# key 只在這裡用；網站播放時直接連 xeno-canto 的錄音檔，key 不會出現在網站上。
# 挑選：A 級優先（沒有再用 B、C 級），鳴唱或叫聲，避開驚叫、雛鳥、手持或用回放誘叫錄到的；長度 5 秒到 2 分鐘；
#      臺灣有的鳥優先挑在臺灣錄的。結果寫進 server/data/calls.json，伺服器回傳牌時補上 call 欄位。
# 查詢結果存在 stickers/.cache/xc.json，中斷後重跑會接著做。xeno-canto 請求每秒一次。
import gzip, json, os, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "stickers/.cache/xc.json"
UA = {"User-Agent": "yi-niao-bird-game/0.1 (https://bird-lab-three.vercel.app; liyoclaw1242@gmail.com)"}
BAD_TYPE = re.compile(r"alarm|distress|stress|juvenile|nestling|begging|in hand|chick|imitation", re.I)


def api_key():
    key = os.environ.get("XENO_CANTO_API_KEY")
    if not key and (ROOT / ".env.local").exists():
        m = re.search(r"^XENO_CANTO_API_KEY=(.+)$", (ROOT / ".env.local").read_text("utf8"), re.M)
        key = m and m.group(1).strip().strip("\"'")
    if not key:
        sys.exit("找不到 XENO_CANTO_API_KEY")
    return key


def search(key, sci):
    q = f'sp:"{sci}"'
    url = "https://xeno-canto.org/api/3/recordings?" + urllib.parse.urlencode({"query": q, "key": key, "per_page": 100})
    for n in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return json.loads(r.read()).get("recordings", [])
        except Exception:
            time.sleep(3 * (n + 1))
    return None


def seconds(length):
    parts = [int(p) for p in str(length).split(":") if p.isdigit()]
    return sum(p * 60 ** i for i, p in enumerate(reversed(parts)))


def pick(recs, prefer_taiwan):
    # 一次查回所有錄音，在程式裡依品質 A、B、C 挑，每種鳥只要一次請求
    for quality in ("A", "B", "C"):
        found = pick_from([r for r in recs if r.get("q") == quality], prefer_taiwan)
        if found:
            return found
    return None


def pick_from(recs, prefer_taiwan):
    good = [r for r in recs if not BAD_TYPE.search(r.get("type", "")) and 5 <= seconds(r.get("length")) <= 120
            and str(r.get("playback-used", "no")).lower() != "yes" and r.get("file")]
    if not good:
        return None
    def score(r):
        t = r.get("type", "").lower()
        return (prefer_taiwan and r.get("cnt") == "Taiwan", "song" in t, "call" in t, -abs(seconds(r.get("length")) - 30))
    return max(good, key=score)


def main():
    key = api_key()
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None
    # --taiwan：只做臺灣看得到的鳥和 BOSS（約 470 種，半小時內），其他鳥卡上仍有 xeno-canto 物種頁的連結
    taiwan_only = "--taiwan" in sys.argv
    cards = json.loads(gzip.decompress((ROOT / "server/data/cards.json.gz").read_bytes()).decode("utf8"))
    text = json.loads((ROOT / "server/data/cardtext.json").read_text("utf8"))["cards"]
    photos = json.loads((ROOT / "server/data/photos.json").read_text("utf8"))["photos"]
    store = json.loads(CACHE.read_text("utf8")) if CACHE.exists() else {}
    # 臺灣的鳥和 BOSS 先做，再做有照片（抽得到）的鳥
    bosses = {"Passer_montanus", "Urocissa_caerulea", "Platalea_minor", "Syrmaticus_mikado", "Balaeniceps_rex"}
    order = sorted(cards, key=lambda c: (c["id"] not in bosses, not text.get(c["id"], {}).get("taiwan"), c["id"] not in photos, c["id"]))
    done = 0
    for c in order:
        if limit is not None and done >= limit:
            break
        if c["id"] in store:
            continue
        if taiwan_only and c["id"] not in bosses and not text.get(c["id"], {}).get("taiwan"):
            break
        recs = search(key, c["sci"])
        time.sleep(1)
        if recs is None:
            continue
        found = pick(recs, bool(text.get(c["id"], {}).get("taiwan")))
        store[c["id"]] = {"xc": found["id"], "rec": found.get("rec"), "lic": found.get("lic"), "type": found.get("type"),
                          "cnt": found.get("cnt"), "length": found.get("length")} if found else None
        done += 1
        if done % 25 == 0:
            CACHE.write_text(json.dumps(store, ensure_ascii=False), "utf8")
            print(f"{done} 種，有錄音 {sum(1 for v in store.values() if v)}", flush=True)
    CACHE.write_text(json.dumps(store, ensure_ascii=False), "utf8")
    calls = {k: v for k, v in store.items() if v}
    (ROOT / "server/data/calls.json").write_text(json.dumps(calls, ensure_ascii=False, separators=(",", ":")), "utf8")
    print(json.dumps({"queried": len(store), "withCall": len(calls)}))


if __name__ == "__main__":
    main()
