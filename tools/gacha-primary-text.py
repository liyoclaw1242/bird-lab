#!/usr/bin/env python3
# 從原始資料重建卡面文字，不經過任何第三方的彙整檔：
#   gacha-primary-text.py <Multiling IOC 15.2.xlsx> <AVONET Supplementary dataset 1.xlsx> <avilist_2025.rda>
# 來源（都可公開下載）：
#   鳥名、目、科：IOC World Bird List v15.2 多語版（worldbirdnames.org，CC BY 3.0）
#   體重、嘴長、跗蹠、棲地、遷徙、食性：AVONET（Tobias et al. 2022，figshare 16586228，CC BY 4.0），依序比對 eBird、BirdLife、BirdTree 三種分類的學名
#   保育等級、eBird 物種代碼、BirdLife 物種頁：AviList v2025（CRAN 套件 avilistr 內附，CC BY 4.0）
#   維基百科條目（中文、英文）：Wikidata 的 sitelinks（CC0），先用學名找到物種條目，只連有條目的語言
#   科的中文名：Wikidata 科級條目的中文標籤（CC0），優先臺灣正體，沒有再由簡體轉換
# 卡的 id、稀有度、攻防、食性屬性不動（那是遊戲數值）；只換名字、目科和模板解說。
# 輸出：更新 server/data/cards.json.gz，並寫 server/data/cardtext.json 給伺服器在回傳牌時覆蓋資料庫裡的舊文字，不必改正式資料庫。
# 原始資料裡對不到 AVONET 的鳥沒有可靠的數字，列進 unsourced，由伺服器凍結。
# 依賴 openpyxl、pyreadr、pandas、opencc-python-reimplemented。
import gzip, json, re, sys
from pathlib import Path
import openpyxl, pyreadr

from opencc import OpenCC

sys.path.insert(0, str(Path(__file__).resolve().parent))
from importlib import import_module
photos_tool = import_module("build-photos")

NICHE_ZH = {"Vertivore": "獵捕其他脊椎動物", "Aquatic predator": "在水裡或水邊捕食動物", "Scavenger": "吃腐肉", "Invertivore": "吃昆蟲這類無脊椎動物", "Omnivore": "食性很雜",
            "Granivore": "吃種子", "Frugivore": "吃果實", "Nectarivore": "吸花蜜", "Herbivore aquatic": "吃水生植物", "Herbivore terrestrial": "吃陸上的植物"}
HABITAT_ZH = {"Forest": "森林", "Shrubland": "灌叢", "Woodland": "疏林", "Grassland": "草原", "Wetland": "濕地", "Marine": "海上", "Rock": "岩石地帶",
              "Human Modified": "人類活動的環境", "Coastal": "海岸", "Riverine": "河邊", "Desert": "沙漠"}
MIGRATION_ZH = {"sedentary": "一年到頭大多待在同一區", "partially migratory": "有些族群會遷徙", "migratory": "會長途遷徙"}
# 無危和資料缺乏也要寫出來：只標受威脅的鳥，孩子會以為沒寫的就沒事，或以為「稀有」才值得注意
IUCN_ZH = {"LC": "無危", "DD": "資料缺乏", "NE": "未評估", "NT": "接近受脅", "VU": "易危", "EN": "瀕危", "CR": "極危", "EW": "野外滅絕", "EX": "已滅絕"}
to_hant = OpenCC("s2twp").convert


# IOC 簡體名裡打不出的字用「(共鳥)」代替，其實是「䳍」；少數名字帶了「滅絕?」或方括號註記
def fix_zh(name):
    # 尾巴黏著的私用區字元（U+E000–F8FF）是來源字型的殘留，畫面上會變方框
    name = re.sub("[\ue000-\uf8ff]", "", name).strip()
    name = name.replace("(共鳥)", "䳍")
    name = re.sub(r"\s*滅絕\?$", "", name)
    return re.sub(r"\[.*\]$", "", name)

ROOT = Path(__file__).resolve().parent.parent
CARDS = ROOT / "server/data/cards.json.gz"
MIGRATION = {1: "sedentary", 2: "partially migratory", 3: "migratory"}


def rows(ws):
    it = ws.iter_rows(values_only=True)
    hdr = next(it)
    for r in it:
        yield dict(zip(hdr, r))


def weight(g):
    # 和 tools/gacha-fix-facts.js 的 toFixed 一樣四捨五入（Python 的格式化是銀行家捨入，470.5 會變 470）
    from decimal import Decimal, ROUND_HALF_UP
    q = lambda x, places: str(Decimal(x).quantize(Decimal(places), rounding=ROUND_HALF_UP))
    if g >= 1000:
        return f"{q(g / 1000, '0.1')} 公斤"
    return f"{q(g, '0.1')} 公克" if g < 10 else f"{q(g, '1')} 公克"


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def family_names_zh(families):
    # 科的學名 → Wikidata 的科級條目（P105 = 科）→ 中文標籤。存在 stickers/.cache/families-zh.json
    store = photos_tool.cached("families-zh.json", dict)
    todo = [f for f in dict.fromkeys(families) if f not in store]
    if todo:
        values = " ".join(json.dumps(f) for f in todo)
        query = ("SELECT ?name ?label (LANG(?label) AS ?lang) WHERE { VALUES ?name { " + values + " } "
                 "?item wdt:P225 ?name; wdt:P105 wd:Q35409; rdfs:label ?label. "
                 "FILTER(LANG(?label) IN (\"zh-tw\", \"zh-hant\", \"zh-hk\", \"zh\", \"zh-hans\", \"zh-cn\")) }")
        import urllib.parse
        d = json.loads(photos_tool.get("https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": query, "format": "json"})))
        found = {}
        for b in d["results"]["bindings"]:
            found.setdefault(b["name"]["value"], {})[b["lang"]["value"]] = b["label"]["value"]
        rank = ("zh-tw", "zh-hant", "zh-hk", "zh", "zh-hans", "zh-cn")
        for f in todo:
            labels = found.get(f, {})
            lang = next((l for l in rank if l in labels), None)
            name = labels[lang] if lang else None
            if name and lang not in ("zh-tw", "zh-hant", "zh-hk"):
                name = to_hant(name)
            store[f] = name if name and name.endswith("科") else None
        (photos_tool.CACHE / "families-zh.json").write_text(json.dumps(store, ensure_ascii=False), "utf8")
    return store


WIKIDATA_IUCN = {"Q211005": "LC", "Q719675": "NT", "Q278113": "VU", "Q11394": "EN", "Q219127": "CR", "Q239509": "EW", "Q237350": "EX", "Q3245245": "DD"}


def iucn_from_wikidata(names):
    # AviList 沒有等級或寫「未評估」（多半是分類剛調整，BirdLife 還沒對新的種重新評估）時，改用 Wikidata 的 IUCN 保育狀態（P141）
    items = photos_tool.wikidata_items(names)
    store = photos_tool.cached("iucn-wikidata.json", dict)
    qids = sorted({q for n in names for q in items.get(n, [])} - set(store))
    import urllib.parse
    for i in range(0, len(qids), 300):
        values = " ".join(f"wd:{q}" for q in qids[i:i + 300])
        query = f"SELECT ?item ?status WHERE {{ VALUES ?item {{ {values} }} OPTIONAL {{ ?item wdt:P141 ?status }} }}"
        d = json.loads(photos_tool.get("https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": query, "format": "json"})))
        for b in d["results"]["bindings"]:
            q = b["item"]["value"].rsplit("/", 1)[1]
            st = WIKIDATA_IUCN.get(b.get("status", {}).get("value", "").rsplit("/", 1)[-1])
            if st or q not in store:
                store[q] = st
    (photos_tool.CACHE / "iucn-wikidata.json").write_text(json.dumps(store, ensure_ascii=False), "utf8")
    return {n: next((store.get(q) for q in items.get(n, []) if store.get(q)), None) for n in names}


def wiki_titles(names):
    # 學名 → Wikidata 物種條目 → 中文、英文維基的條目名稱。查過的存在 stickers/.cache/sitelinks.json
    items = photos_tool.wikidata_items(names)
    store = photos_tool.cached("sitelinks.json", dict)
    todo = sorted({q for n in names for q in items.get(n, [])} - set(store))
    for i in range(0, len(todo), 50):
        d = photos_tool.api("https://www.wikidata.org/w/api.php", {"action": "wbgetentities", "ids": "|".join(todo[i:i + 50]), "props": "sitelinks", "sitefilter": "zhwiki|enwiki"})
        for qid, e in d.get("entities", {}).items():
            links = e.get("sitelinks", {})
            store[qid] = {k[:2]: v["title"] for k, v in links.items() if k in ("zhwiki", "enwiki")}
        if i % 1000 == 0:
            (photos_tool.CACHE / "sitelinks.json").write_text(json.dumps(store, ensure_ascii=False), "utf8")
    (photos_tool.CACHE / "sitelinks.json").write_text(json.dumps(store, ensure_ascii=False), "utf8")
    out = {}
    for n in names:
        merged = {}
        for q in items.get(n, []):
            for lang, title in store.get(q, {}).items():
                merged.setdefault(lang, title)
        out[n] = merged
    return out


def main():
    ml_path, avonet_path, avilist_path = sys.argv[1:4]
    ioc = {r["IOC_15.2"].strip(): r for r in rows(openpyxl.load_workbook(ml_path, read_only=True)["List"]) if r.get("IOC_15.2")}
    wb = openpyxl.load_workbook(avonet_path, read_only=True)
    avonet = []
    for sheet, key in (("AVONET2_eBird", "Species2"), ("AVONET1_BirdLife", "Species1"), ("AVONET3_BirdTree", "Species3")):
        avonet.append({r[key].strip(): r for r in rows(wb[sheet]) if r.get(key)})
    al = list(pyreadr.read_r(avilist_path).values())[0]
    species_rows = list(al[al.Taxon_rank == "species"].itertuples())
    iucn = {r.Scientific_name: r.IUCN_Red_List_Category for r in species_rows if isinstance(r.IUCN_Red_List_Category, str)}
    # 「想知道更多」的外部連結：eBird 代碼和 BirdLife 物種頁網址都是 AviList 的欄位
    ebird = {r.Scientific_name: r.Species_code_Cornell_Lab for r in species_rows if isinstance(r.Species_code_Cornell_Lab, str)}
    birdlife = {r.Scientific_name: r.BirdLife_DataZone_URL for r in species_rows if isinstance(r.BirdLife_DataZone_URL, str)}
    # 臺灣：AviList 的分布描述有寫到 Taiwan 就算看得到；除了 Taiwan 沒有其他地名的算特有種（結果 31 種，和臺灣特有種數量一致）
    # 分布描述常只寫「東亞」，所以只標「看得到」，沒標的不代表臺灣沒有
    ranges = {r.Scientific_name: r.Range for r in species_rows if isinstance(r.Range, str)}
    def taiwan(sci):
        rng = ranges.get(sci, "")
        if not re.search(r"\bTaiwan\b", rng):
            return None
        return "endemic" if not set(re.findall(r"\b[A-Z][a-zA-Z]+", rng)) - {"Taiwan"} else "yes"

    cards = json.loads(gzip.decompress(CARDS.read_bytes()).decode("utf8"))
    wiki = wiki_titles([c["sci"] for c in cards])
    no_status = [c["sci"] for c in cards if re.match(r"[A-Z]{2}", iucn.get(c["sci"], "") or "") is None or iucn.get(c["sci"], "").startswith("NE")]
    fallback = iucn_from_wikidata(no_status)
    families_zh = family_names_zh(sorted({ioc[c["sci"]]["Family"] for c in cards}))
    traits = {}
    for c in cards:
        a = next((m[c["sci"]] for m in avonet if c["sci"] in m), None)
        if a and num(a["Mass"]) and num(a["Beak.Length_Culmen"]) and num(a["Tarsus.Length"]):
            traits[c["id"]] = a
    # 「比資料庫裡 N% 的鳥重」：在有原始量測的牌之間排名
    masses = sorted(num(a["Mass"]) for a in traits.values())
    def heavier_than(m):
        lo = sum(1 for x in masses if x < m)
        return min(99, int(lo / max(1, len(masses) - 1) * 100))

    text, unsourced = {}, []
    for c in cards:
        r = ioc[c["sci"]]
        zh_t, zh_s = (r.get("Chinese (Traditional)") or "").strip(), (r.get("Chinese") or "").strip()
        zh = fix_zh(zh_t.split("〔")[0]) if zh_t else fix_zh(to_hant(zh_s)) if zh_s else r["English"]
        entry = {"zh": zh, "en": r["English"], "order": r["Order"].capitalize(), "family": r["Family"], "familyZh": families_zh.get(r["Family"])}
        a = traits.get(c["id"])
        if not a:
            unsourced.append(c["id"])
            entry["facts"] = []
            entry["massG"] = None
        else:
            m = round(num(a["Mass"]), 1)
            entry["massG"] = m
            rank = heavier_than(m)
            # 排名在後半的改說「比幾成的鳥輕」：「比 8% 的鳥重」孩子會以為很重
            rank_text = "屬於資料庫裡最輕的 1%" if rank <= 0 else f"比資料庫裡 {rank}% 的鳥重" if rank >= 50 else f"比資料庫裡 {100 - rank}% 的鳥輕"
            numbers = f"平均約 {weight(m)}，{rank_text}。嘴長 {num(a['Beak.Length_Culmen']):.0f} 公釐，腳（跗蹠）長 {num(a['Tarsus.Length']):.0f} 公釐。"
            if str(a.get("Inference")).upper() == "YES":
                numbers += "部分數值是從近親推估的。"
            facts = [{"t": "牠的數字", "d": numbers}]
            life = []
            if a.get("Habitat") in HABITAT_ZH:
                life.append(f"主要待在{HABITAT_ZH[a['Habitat']]}")
            if a.get("Trophic.Niche") in NICHE_ZH:
                life.append(NICHE_ZH[a["Trophic.Niche"]])
            mig = MIGRATION.get(int(num(a.get("Migration")) or 0))
            if mig:
                life.append(MIGRATION_ZH[mig])
            if life:
                facts.append({"t": "牠怎麼過日子", "d": "，".join(life) + "。"})
            entry["facts"] = facts
        m = re.match(r"[A-Z]{2}", iucn.get(c["sci"], ""))
        entry["iucn"] = m.group(0) if m else None
        if entry["iucn"] in (None, "NE") and fallback.get(c["sci"]):
            entry["iucn"] = fallback[c["sci"]]
            entry["iucnSource"] = "wikidata"
        if entry["iucn"] in IUCN_ZH:
            entry["facts"].append({"t": "保育狀況", "d": f"IUCN 紅色名錄列為「{IUCN_ZH[entry['iucn']]}」，資料可能落後最新評估。"})
        # BirdLife 只存網址最後的編號，前端再接回 https://datazone.birdlife.org/species/factsheet/
        bl = re.search(r"/factsheet/(\d+)", birdlife.get(c["sci"], ""))
        links = {"ebird": ebird.get(c["sci"]), "birdlife": bl.group(1) if bl else None, "wiki": wiki.get(c["sci"]) or None}
        entry["links"] = {k: v for k, v in links.items() if v}
        entry["taiwan"] = taiwan(c["sci"])
        text[c["id"]] = entry
        c.update(entry)
    with gzip.open(CARDS, "wt", encoding="utf8") as f:
        json.dump(cards, f, ensure_ascii=False, separators=(",", ":"))
    out = ROOT / "server/data/cardtext.json"
    out.write_text(json.dumps({"cards": text, "unsourced": unsourced}, ensure_ascii=False, separators=(",", ":")), "utf8")
    print(json.dumps({"cards": len(text), "unsourced": unsourced, "noIucn": sum(1 for e in text.values() if not e["iucn"]), "bytes": out.stat().st_size}, ensure_ascii=False))


if __name__ == "__main__":
    main()
