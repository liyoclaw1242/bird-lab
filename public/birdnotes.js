// 牌上的小知識：分類、手感（用麻雀當秤砣）、數值怎麼來。只用卡池裡已有的資料推算，不另外加說法。
// 瀏覽器和測試共用，要在 i18n.js 之後載入。
(function (root) {
  const { DIETS } = typeof module !== "undefined" ? require("./i18n.js") : root.I18n;
  // 目的學名來自貼紙路徑（IOC 分類）。中文目名用通行譯名，括號裡的白話和英文說明這一目有誰，
  // 白話裡的鳥名都對得上卡池裡的中文名；目名本身就說得清楚的，中文就不加括號
  const ORDERS = {
    Passeriformes: ["雀形目", "鳴禽等會停在枝頭的鳥", "songbirds and other perching birds"],
    Apodiformes: ["雨燕目", "雨燕和蜂鳥", "swifts and hummingbirds"],
    Piciformes: ["鴷形目", "啄木鳥、巨嘴鳥和牠們的親戚", "woodpeckers, toucans and relatives"],
    Psittaciformes: ["鸚形目", "鸚鵡", "parrots"],
    Charadriiformes: ["鴴形目", "鴴、鷸、鷗和海雀", "shorebirds, gulls and auks"],
    Columbiformes: ["鴿形目", "鳩鴿", "pigeons and doves"],
    Galliformes: ["雞形目", "雉、鶉和雞的親戚", "pheasants, quails and other landfowl"],
    Strigiformes: ["鴞形目", "貓頭鷹", "owls"],
    Accipitriformes: ["鷹形目", "鷹、鵰、鳶和兀鷲", "hawks, eagles, kites and vultures"],
    Coraciiformes: ["佛法僧目", "翠鳥、蜂虎和佛法僧", "kingfishers, bee-eaters and rollers"],
    Anseriformes: ["雁形目", "雁鴨和天鵝", "ducks, geese and swans"],
    Gruiformes: ["鶴形目", "鶴和秧雞", "cranes, rails and relatives"],
    Cuculiformes: ["鵑形目", "杜鵑", "cuckoos"],
    Procellariiformes: ["鸌形目", "信天翁、鸌和海燕", "albatrosses, petrels and shearwaters"],
    Pelecaniformes: ["鵜形目", "鵜鶘、鷺和鹮", "pelicans, herons and ibises"],
    Caprimulgiformes: ["夜鷹目", null, "nightjars"],
    Bucerotiformes: ["犀鳥目", "犀鳥和戴勝", "hornbills and hoopoes"],
    Falconiformes: ["隼形目", "隼", "falcons and caracaras"],
    Suliformes: ["鰹鳥目", "鰹鳥、鸕鷀和軍艦鳥", "gannets, cormorants and frigatebirds"],
    Tinamiformes: ["䳍形目", null, "tinamous"],
    Trogoniformes: ["咬鵑目", null, "trogons"],
    Otidiformes: ["鴇形目", null, "bustards"],
    Ciconiiformes: ["鸛形目", null, "storks"],
    Podicipediformes: ["鸊鷉目", null, "grebes"],
    Sphenisciformes: ["企鵝目", null, "penguins"],
    Podargiformes: ["蟆口鴟目", null, "frogmouths"],
    Pterocliformes: ["沙雞目", null, "sandgrouse"],
    Musophagiformes: ["蕉鵑目", null, "turacos"],
    Aegotheliformes: ["裸鼻鴟目", null, "owlet-nightjars"],
    Nyctibiiformes: ["林鴟目", null, "potoos"],
    Phoenicopteriformes: ["紅鸛目", "紅鶴", "flamingos"],
    Coliiformes: ["鼠鳥目", null, "mousebirds"],
    Gaviiformes: ["潛鳥目", null, "loons"],
    Apterygiformes: ["鷸鴕目", "奇異鳥", "kiwis"],
    Casuariiformes: ["鶴鴕目", "鶴鴕和鴯鶓", "cassowaries and emus"],
    Phaethontiformes: ["鸏形目", "熱帶鳥", "tropicbirds"],
    Mesitornithiformes: ["擬鶉目", null, "mesites"],
    Struthioniformes: ["鴕鳥目", null, "ostriches"],
    Rheiformes: ["美洲鴕目", null, "rheas"],
    Eurypygiformes: ["日鳽目", "鷺鶴和日鳽", "kagu and sunbittern"],
    Cariamiformes: ["叫鶴目", null, "seriemas"],
    Steatornithiformes: ["油鴟目", null, "oilbird"],
    Opisthocomiformes: ["麝雉目", null, "hoatzin"],
    Leptosomiformes: ["鵑鴗目", null, "cuckoo-roller"],
  };
  // 臺灣街頭常見的「麻雀」是樹麻雀（Passer montanus），不是家麻雀；體重取同一份 AVONET 量測
  const SPARROW = { id: "Passer_montanus", g: 21.4 };

  const taxonomy = (card) => {
    // 新資料直接帶 order、family（取自 IOC）；舊牌從檔案路徑「stickers/目/科/學名」拆
    const [, pathOrder, pathFamily] = String(card.file || "").split("/");
    const order = card.order || pathOrder;
    const family = card.family || pathFamily;
    return { order, family };
  };

  // 兩位有效數字就好：「約 220 隻麻雀」比「223 隻」更像估計
  const round2 = (n) => {
    if (n < 10) return Math.round(n);
    const step = 10 ** (Math.floor(Math.log10(n)) - 1);
    return Math.round(n / step) * step;
  };

  function create(i18n) {
    const english = i18n.lang === "en";

    function taxon(card) {
      const { order, family } = taxonomy(card);
      const o = ORDERS[order];
      if (!o || !/^[A-Z][a-z]+idae$/.test(family || "")) return null;
      const name = english ? `${order} (${o[2]})` : `${o[0]}${o[1] ? `（${o[1]}）` : ""}`;
      // 科有中文名（取自 Wikidata）就寫中文，學名放括號；沒有才只寫學名
      const zhName = (typeof window !== "undefined" && window.FamilyTraits?.[family]?.name) || card.familyZh;
      const fam = english ? family : zhName ? `${zhName}（${family}）` : `${family} 科`;
      return i18n.t("notes.taxon", { order: name, family: fam });
    }

    // 以麻雀為單位講體重：比公克數好想像，數字都由卡池的量測算出
    function hand(card) {
      const g = Number(card.massG);
      if (!(g > 0)) return null;
      const vars = { g: SPARROW.g };
      if (card.id === SPARROW.id) return i18n.t("notes.handSelf", vars);
      const r = g / SPARROW.g;
      if (r >= 1.5) return i18n.t("notes.handMany", { ...vars, n: i18n.number(round2(r)) });
      if (r > 1 / 1.5) return i18n.t("notes.handSame", vars);
      return i18n.t("notes.handFew", { ...vars, n: i18n.number(round2(1 / r)) });
    }

    // 從「牠怎麼過日子」找出主食那一句，屬性就是由它決定的
    function diet(card) {
      const life = (card.facts || []).find((f) => f.t === "牠怎麼過日子");
      const part = life && life.d.replace(/。$/, "").split("，").find((p) => DIETS[p]);
      if (!part) return null;
      return english ? DIETS[part] : part;
    }

    return { taxon, hand, diet };
  }

  const api = { ORDERS, SPARROW, create, taxonomy };
  if (typeof module !== "undefined") { module.exports = api; return; }
  root.BirdNotes = Object.assign(api, create(root.I18n));
})(typeof window !== "undefined" ? window : globalThis);
