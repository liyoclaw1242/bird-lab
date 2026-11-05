#!/usr/bin/env python3
# 幫卡池的鳥找真實照片，取代 AI 貼紙：build-photos.py <species.json>... [--ids ids.json] [--sample N | --fraction 0.5] [--all]
# 來源：先用 Wikidata 物種條目的代表圖（P18），都在 Wikimedia Commons，授權只有 CC BY、CC BY-SA、CC0、公有領域，可以用在遊戲裡。
#       沒有合格的代表圖，再找 iNaturalist 研究級觀察（社群鑑定一致）裡授權 CC BY 或 CC0 的照片，票數多的優先。
# 篩選：只收照片格式；檔名、說明、分類裡出現手繪、標本、蛋、地圖這類字眼的不收，找不到合格照片的鳥由遊戲凍結。
# 輸出：照片縮成長邊 800px 的 WebP 放進 stickers/dist/photos/（和貼紙一起部署），
#       server/data/cards.json.gz 每張牌加上 photo（檔名、尺寸、作者、授權、原始頁面、分類是否對得上學名）。
# 照片只縮圖、轉檔，不裁切不去背、不左右翻轉，避免改到辨識特徵；外面加一圈紙框（拍立得那樣下緣較寬），
# 這樣在場景裡和貼紙一樣是一張圖，版面不用另外處理。可重跑，下載的原圖和查過的資料會從 stickers/.cache 讀。
# 依賴 Pillow。
import gzip, html, io, json, random, re, sys, time, urllib.parse, urllib.request
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
CARDS = ROOT / "server/data/cards.json.gz"
CACHE = ROOT / "stickers/.cache"
OUT = ROOT / "stickers/dist/photos"
UA = {"User-Agent": "yi-niao-bird-game/0.1 (https://bird-lab-three.vercel.app; liyoclaw1242@gmail.com)"}
LONG_SIDE = 760
PAPER = (251, 247, 236)
PHOTO_MIME = {"image/jpeg", "image/png", "image/tiff", "image/webp"}
# 代表圖有時是古典圖鑑的手繪、博物館標本、蛋或分布圖，這些不是活鳥的照片
NOT_PHOTO = re.compile(
    # 這些字出現在哪裡都算（檔名常把畫家名黏在學名後面，像 TyranniscusFrontalisKeulemans.jpg）
    r"illustrat|painting|drawing|lithograph|engraving|keulemans|naumann|specimen|museum|taxiderm|sculpture|skeleton|skull"
    # 畫家名後面接 's 或 ian 是鳥名（Gould's Sunbird、Gouldian Finch、Audubon's Shearwater），不算
    r"|(?:gould|audubon)(?![a-z'’])"
    # 短字要整個字相符，不然 orange 會被當成 range、honest 被當成 nest
    r"|\b(?:plates?|mounted|skins?|eggs?|nests?|maps?|range map|distribution map|stamps?|statue|art)\b", re.I)


def get(url, tries=4):
    for n in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return r.read()
        except Exception:
            if n == tries - 1:
                raise
            time.sleep(2 ** n * 2)


def api(base, params):
    return json.loads(get(base + "?" + urllib.parse.urlencode({**params, "format": "json", "formatversion": 2})))


def cached(name, fn):
    path = CACHE / name
    if path.exists():
        return json.loads(path.read_text("utf8"))
    data = fn()
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), "utf8")
    return data


def wikidata_images(qids):
    store = cached("p18.json", dict)
    todo = [q for q in qids if q not in store]
    for i in range(0, len(todo), 50):
        d = api("https://www.wikidata.org/w/api.php", {"action": "wbgetentities", "ids": "|".join(todo[i:i + 50]), "props": "claims"})
        for qid, e in d.get("entities", {}).items():
            store[qid] = [c["mainsnak"]["datavalue"]["value"] for c in e.get("claims", {}).get("P18", []) if c["mainsnak"].get("datavalue")]
        time.sleep(0.3)
    if todo:
        (CACHE / "p18.json").write_text(json.dumps(store, ensure_ascii=False), "utf8")
    return store


def commons_info(titles):
    store = cached("commons.json", dict)
    todo = [t for t in dict.fromkeys(titles) if t not in store]
    for i in range(0, len(todo), 40):
        batch = todo[i:i + 40]
        params = {"action": "query", "titles": "|".join("File:" + t for t in batch), "prop": "imageinfo|categories",
                  "iiprop": "url|size|mime|extmetadata", "iiurlwidth": 1200, "clshow": "!hidden", "cllimit": "max"}
        pages = {}
        while True:
            d = api("https://commons.wikimedia.org/w/api.php", params)
            norm = {n["to"]: n["from"] for n in d.get("query", {}).get("normalized", [])}
            for p in d.get("query", {}).get("pages", []):
                key = norm.get(p["title"], p["title"])[5:]
                cur = pages.setdefault(key, {"cats": []})
                if p.get("imageinfo"):
                    cur["info"] = p["imageinfo"][0]
                cur["cats"] += [c["title"][9:] for c in p.get("categories", [])]
            if "continue" not in d:
                break
            params = {**params, **d["continue"]}
        for t in batch:
            store[t] = pages.get(t.replace("_", " "), pages.get(t, {"cats": []}))
        time.sleep(0.3)
    if todo:
        (CACHE / "commons.json").write_text(json.dumps(store, ensure_ascii=False), "utf8")
    return store


def plain(value):
    text = html.unescape(re.sub(r"<[^>]+>", " ", value or ""))
    return re.sub(r"\s+", " ", text).strip()


def judge(title, entry, sci):
    info = entry.get("info")
    if not info:
        return None, "missing"
    meta = info.get("extmetadata", {})
    if info.get("mime") not in PHOTO_MIME:
        return None, "not_photo_format"
    if min(info.get("width", 0), info.get("height", 0)) < 360:
        return None, "too_small"
    text = " ".join([title, plain(meta.get("ImageDescription", {}).get("value")), " ".join(entry["cats"])])
    if NOT_PHOTO.search(text):
        return None, "not_live_photo"
    license = plain(meta.get("LicenseShortName", {}).get("value"))
    if not re.match(r"(CC BY|CC0|Public domain|PD)", license, re.I) or re.search(r"NC|ND", license):
        return None, "license"
    artist = plain(meta.get("Artist", {}).get("value")) or plain(meta.get("Credit", {}).get("value")) or "Unknown"
    # 有些作者欄只放了 Flickr 個人頁的網址
    flickr = re.match(r"https?://(?:www\.)?flickr\.com/(?:photos|people)/([^/\s]+)", artist)
    if flickr:
        artist = f"{flickr.group(1)} (Flickr)"
    # 分類或檔名裡有這隻鳥的學名，代表 Commons 上有人把照片歸到這個物種，比較可信
    genus_species = sci.lower()
    matched = any(c.lower().startswith(genus_species) for c in entry["cats"]) or genus_species in title.lower().replace("_", " ")
    # 沒歸到這個物種的照片可能是棲地風景或別種鳥（試跑時看到兩張只有風景），不收，改找 iNaturalist
    if not matched:
        return None, "taxon_unverified"
    return {"title": title, "url": info.get("thumburl") or info["url"], "page": info.get("descriptionurl"),
            "artist": artist[:120], "license": license, "licenseUrl": plain(meta.get("LicenseUrl", {}).get("value")) or None,
            "taxonMatch": matched}, "ok"


def framed(img):
    side = round(max(img.size) * 0.035)
    return ImageOps.expand(img, border=(side, side, side, round(side * 2.6)), fill=PAPER)


INAT_LICENSE = {"cc-by": ("CC BY", "https://creativecommons.org/licenses/by/4.0/"), "cc0": ("CC0", "https://creativecommons.org/publicdomain/zero/1.0/")}


def inat_candidates(taxa):
    store = cached("inat.json", dict)
    todo = [t for t in dict.fromkeys(taxa) if str(t) not in store]
    for n, taxon in enumerate(todo):
        d = api("https://api.inaturalist.org/v1/observations", {"taxon_id": taxon, "quality_grade": "research", "photo_license": "cc-by,cc0",
                                                                 "captive": "false", "order_by": "votes", "per_page": 6})
        store[str(taxon)] = [{"obs": o["id"], "taxon": (o.get("taxon") or {}).get("id"), "photos": [
            {"id": ph["id"], "url": ph["url"], "license": ph.get("license_code"), "attribution": ph.get("attribution"), "dims": ph.get("original_dimensions")}
            for ph in o.get("photos", [])]} for o in d.get("results", [])]
        # iNaturalist 請 API 使用者每秒不超過 1 次
        time.sleep(1.1)
        if n % 50 == 49:
            (CACHE / "inat.json").write_text(json.dumps(store, ensure_ascii=False), "utf8")
    if todo:
        (CACHE / "inat.json").write_text(json.dumps(store, ensure_ascii=False), "utf8")
    return store


def inat_taxa(names):
    # 原作者資料大多沒有 iNaturalist 編號，用學名完全相符的現行物種去查
    store = cached("inat-taxa.json", dict)
    todo = [n for n in dict.fromkeys(names) if n not in store]
    for n, name in enumerate(todo):
        d = api("https://api.inaturalist.org/v1/taxa", {"q": name, "rank": "species", "is_active": "true", "per_page": 10})
        hit = next((t for t in d.get("results", []) if t.get("name", "").lower() == name.lower() and t.get("iconic_taxon_name") == "Aves"), None)
        store[name] = hit["id"] if hit else None
        time.sleep(1.1)
        if n % 50 == 49:
            (CACHE / "inat-taxa.json").write_text(json.dumps(store, ensure_ascii=False), "utf8")
    if todo:
        (CACHE / "inat-taxa.json").write_text(json.dumps(store, ensure_ascii=False), "utf8")
    return store


def judge_inat(observations, taxon):
    for o in observations:
        # 研究級但鑑定到亞種時 taxon 會不同；只收和這個物種同一個或其下的鑑定，這裡保守只收同一個
        if o["taxon"] != taxon:
            continue
        for ph in o["photos"]:
            if ph["license"] not in INAT_LICENSE:
                continue
            dims = ph.get("dims") or {}
            if min(dims.get("width", 0), dims.get("height", 0)) < 360:
                continue
            m = re.match(r"\(c\)\s*(.+?),\s*(?:some|no) rights", ph.get("attribution") or "") or re.match(r"(.+?),\s*no rights", ph.get("attribution") or "")
            license, url = INAT_LICENSE[ph["license"]]
            return {"url": ph["url"].replace("/square.", "/large."), "page": f"https://www.inaturalist.org/photos/{ph['id']}",
                    "artist": (m.group(1) if m else "iNaturalist user")[:120], "license": license, "licenseUrl": url,
                    "taxonMatch": True, "source": "inaturalist"}
    return None


def save_photo(card_id, url):
    # sources.json 記每張原圖是從哪個網址抓的；換了來源（例如從 iNaturalist 換成 Commons）就重抓，不會配錯署名
    raw = CACHE / "photos-raw" / f"{card_id}.jpg"
    log = CACHE / "photos-raw" / "sources.json"
    sources = json.loads(log.read_text("utf8")) if log.exists() else {}
    if not raw.exists() or sources.get(card_id) != url:
        raw.parent.mkdir(parents=True, exist_ok=True)
        img = Image.open(io.BytesIO(get(url)))
        # 有些相機照片靠 EXIF 記方向，先轉正再存
        img = ImageOps.exif_transpose(img).convert("RGB")
        img.thumbnail((LONG_SIDE, LONG_SIDE), Image.LANCZOS)
        img.save(raw, "JPEG", quality=92)
        sources[card_id] = url
        log.write_text(json.dumps(sources, ensure_ascii=False), "utf8")
        time.sleep(0.2)
    with Image.open(raw) as img:
        size = img.size
        OUT.mkdir(parents=True, exist_ok=True)
        framed(img).save(OUT / f"{card_id}.webp", "WEBP", quality=80, method=6)
    return size


def main():
    args = sys.argv[1:]
    sources = [a for a in args if a.endswith(".json") and not a.startswith("--")]
    opt = {args[i]: args[i + 1] if i + 1 < len(args) else None for i in range(len(args)) if args[i].startswith("--")}
    species = {}
    for src in sources:
        if src == opt.get("--ids"):
            continue
        for r in json.loads(Path(src).read_text("utf8"))["species"]:
            species.setdefault(r["id"], r)
    cards = json.loads(gzip.decompress(CARDS.read_bytes()).decode("utf8"))
    if "--all" in opt:
        targets = cards
    else:
        want = set(json.loads(Path(opt["--ids"]).read_text("utf8"))) if opt.get("--ids") else set()
        rng = random.Random(7)
        for tier in ("UR", "SSR", "SR", "R", "N"):
            pool = sorted(c["id"] for c in cards if c["rarity"] == tier)
            n = round(len(pool) * float(opt["--fraction"])) if opt.get("--fraction") else int(opt.get("--sample") or 0) // 5
            want |= set(rng.sample(pool, min(len(pool), n)))
        targets = [c for c in cards if c["id"] in want]

    qid_of = {}
    for c in targets:
        w = ((species.get(c["id"]) or {}).get("ids") or {}).get("wikidata")
        qid_of[c["id"]] = w if isinstance(w, list) else [w] if w else []
    p18 = wikidata_images(sorted({q for qs in qid_of.values() for q in qs}))
    titles = {c["id"]: [t for q in qid_of[c["id"]] for t in p18.get(q, [])] for c in targets}
    info = commons_info([t for ts in titles.values() for t in ts])
    picks = {}
    for c in targets:
        for t in titles[c["id"]]:
            pick, why = judge(t, info.get(t, {"cats": []}), c["sci"])
            if pick:
                picks[c["id"]] = {**pick, "source": "commons"}
                break
    taxon_of = {c["id"]: ((species.get(c["id"]) or {}).get("ids") or {}).get("inaturalist") for c in targets}
    by_name = inat_taxa([c["sci"] for c in targets if c["id"] not in picks and not taxon_of[c["id"]]])
    for c in targets:
        taxon_of[c["id"]] = taxon_of[c["id"]] or by_name.get(c["sci"])
    inat = inat_candidates([taxon_of[c["id"]] for c in targets if c["id"] not in picks and taxon_of[c["id"]]])

    stats, rejects = {}, []
    by_id = {c["id"]: c for c in cards}
    for c in targets:
        chosen, reasons = picks.get(c["id"]), []
        if not chosen:
            reasons = [judge(t, info.get(t, {"cats": []}), c["sci"])[1] for t in titles[c["id"]]]
            taxon = taxon_of[c["id"]]
            chosen = taxon and judge_inat(inat.get(str(taxon), []), taxon)
        if not chosen:
            why = reasons[0] if reasons else "no_image"
            stats[why] = stats.get(why, 0) + 1
            rejects.append({"id": c["id"], "zh": c["zh"], "why": why, "titles": titles[c["id"]], "inat": taxon_of[c["id"]]})
            by_id[c["id"]].pop("photo", None)
            continue
        w, h = save_photo(c["id"], chosen["url"])
        by_id[c["id"]]["photo"] = {"file": f"photos/{c['id']}.webp", "w": w, "h": h, "artist": chosen["artist"], "license": chosen["license"],
                                   "licenseUrl": chosen["licenseUrl"], "page": chosen["page"], "taxonMatch": chosen["taxonMatch"], "source": chosen["source"]}
        stats["ok"] = stats.get("ok", 0) + 1
        stats[chosen["source"]] = stats.get(chosen["source"], 0) + 1
        stats["taxonMatch"] = stats.get("taxonMatch", 0) + chosen["taxonMatch"]
    with gzip.open(CARDS, "wt", encoding="utf8") as f:
        json.dump(cards, f, ensure_ascii=False, separators=(",", ":"))
    # 照片站的設定：開放跨網域讀取，同一網址內容不變（換照片時前端網址的 ?v= 會加一）
    dist = OUT.parent
    (dist / "_headers").write_text("/*\n  Access-Control-Allow-Origin: *\n  Cache-Control: public, max-age=31536000, immutable\n  X-Robots-Tag: noindex\n  Link: </NOTICE.txt>; rel=\"license\"\n", "utf8")
    (dist / "NOTICE.txt").write_text("Bird photos from Wikimedia Commons and iNaturalist, used under their CC BY, CC BY-SA, CC0 or public-domain terms.\n"
                                     "Changes: resized, converted to WebP, paper frame added. Photographer and license for each photo: https://bird-lab-three.vercel.app/ (shown on each card) and the source page linked there.\n", "utf8")
    (CACHE / "photo-rejects.json").write_text(json.dumps(rejects, ensure_ascii=False, indent=1), "utf8")
    print(json.dumps({"targets": len(targets), **stats, "withPhoto": sum("photo" in c for c in cards)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
