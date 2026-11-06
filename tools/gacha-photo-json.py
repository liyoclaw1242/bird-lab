#!/usr/bin/env python3
# 從 server/data/cards.json.gz 抽出照片資料給伺服器用：gacha-photo-json.py
# 輸出 server/data/photos.json：{"photos": {牌 id: 照片}, "frozen": [沒照片的牌 id]}。
# 伺服器直接讀這個檔決定誰有照片、誰凍結，換照片不必再到正式資料庫寫 SQL。
import gzip, json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIELDS = ("file", "artist", "license", "licenseUrl", "page", "source", "cropped")
cards = json.loads(gzip.decompress((ROOT / "server/data/cards.json.gz").read_bytes()).decode("utf8"))
photos = {c["id"]: {k: c["photo"].get(k) for k in FIELDS if c["photo"].get(k) is not None and c["photo"].get(k) is not False} for c in cards if c.get("photo")}
frozen = sorted(c["id"] for c in cards if not c.get("photo"))
out = ROOT / "server/data/photos.json"
out.write_text(json.dumps({"photos": photos, "frozen": frozen}, ensure_ascii=False, separators=(",", ":")), "utf8")
print(json.dumps({"photos": len(photos), "frozen": len(frozen), "bytes": out.stat().st_size}))
