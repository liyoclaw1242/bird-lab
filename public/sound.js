// 所有音效都用 Web Audio 即時合成，不必下載音檔，斷網也能響。
(function () {
  const MUTE_KEY = "gacha-muted";
  const BGM_KEY = "gacha-bgm";
  // 循環點對應 tools/build-bgm.sh 做出來的檔案，音量比音效低，當背景才不吵
  const BGM = { url: "audio/countryside.mp3", loopStart: 0.25, loop: 107.624014, volume: 0.32 };
  const read = (key = MUTE_KEY) => { try { return localStorage.getItem(key) === "1"; } catch { return false; } };
  const write = (value, key = MUTE_KEY) => { try { localStorage.setItem(key, value ? "1" : "0"); } catch { /* 無痕模式：這次開著的期間仍然有效 */ } };

  // 一個音：頻率可滑動，快速起音後指數衰減
  function tone(out, at, { f, to = f, d = 0.12, type = "sine", g = 0.3 }) {
    const { context: ctx } = out;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + d);
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(g, at + Math.min(0.012, d / 4));
    amp.gain.exponentialRampToValueAtTime(0.0001, at + d);
    osc.connect(amp).connect(out);
    osc.start(at);
    osc.stop(at + d + 0.02);
  }

  // 一段濾波噪音：樹葉沙沙、揮擊和撞擊的質感
  function noise(out, at, { f, to = f, d = 0.2, q = 1, type = "bandpass", g = 0.3, attack = 0.01 }) {
    const { context: ctx } = out;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * d), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    src.buffer = buffer;
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f, at);
    filter.frequency.exponentialRampToValueAtTime(to, at + d);
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(g, at + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + d);
    src.connect(filter).connect(amp).connect(out);
    src.start(at);
  }

  // 鳥叫：快速上下滑音，每次音高略有不同
  function chirp(out, at, base = 2600, g = 0.16) {
    const f = base * (0.92 + Math.random() * 0.16);
    tone(out, at, { f, to: f * 1.5, d: 0.05, g });
    tone(out, at + 0.05, { f: f * 1.5, to: f * 0.85, d: 0.07, g });
  }

  const notes = (out, at, list, step, opts) => list.forEach((f, i) => tone(out, at + i * step, { f, ...opts }));

  const SOUNDS = {
    tap: (o, t) => tone(o, t, { f: 720, to: 420, d: 0.06, type: "triangle", g: 0.2 }),
    chirp: (o, t) => chirp(o, t),
    // 搖樹：沙沙聲配上被吵醒的鳥
    rustle(o, t) {
      for (let i = 0; i < 5; i += 1) noise(o, t + i * 0.19, { f: 3200, to: 1500, d: 0.2, q: 0.7, g: 0.2, attack: 0.05 });
      chirp(o, t + 0.45, 3000, 0.1);
      chirp(o, t + 0.72, 2400, 0.1);
    },
    N(o, t) { noise(o, t, { f: 1800, to: 700, d: 0.18, g: 0.14 }); chirp(o, t + 0.08, 2000); },
    R(o, t) { chirp(o, t, 2400); chirp(o, t + 0.16, 3000); },
    SR(o, t) {
      notes(o, t, [880, 1109, 1319, 1760], 0.08, { d: 0.32, type: "triangle", g: 0.17 });
      chirp(o, t + 0.36, 3200);
    },
    SSR(o, t) {
      notes(o, t, [659, 784, 988, 1319, 1568], 0.09, { d: 0.45, type: "triangle", g: 0.18 });
      notes(o, t + 0.5, [2093, 2637, 3136], 0.07, { d: 0.5, g: 0.09 });
      chirp(o, t + 0.5, 3000);
      chirp(o, t + 0.68, 3500);
    },
    UR(o, t) {
      noise(o, t, { f: 400, to: 7000, d: 0.5, q: 0.8, g: 0.14, attack: 0.3 });
      notes(o, t + 0.35, [523, 659, 784, 1047, 1319, 1568, 2093], 0.075, { d: 0.65, type: "triangle", g: 0.17 });
      [1047, 1319, 1568, 2093].forEach((f) => tone(o, t + 0.92, { f, d: 1.3, type: "triangle", g: 0.09 }));
      notes(o, t + 1, [3136, 3951, 4699, 3951, 5274], 0.09, { d: 0.45, g: 0.05 });
      for (let i = 0; i < 4; i += 1) chirp(o, t + 1.05 + i * 0.16, 2500 + i * 400, 0.11);
    },
    // 進手牌像彈簧，放回去像滑音哨往下掉
    take: (o, t) => tone(o, t, { f: 220, to: 880, d: 0.16, type: "triangle", g: 0.26 }),
    release: (o, t) => tone(o, t, { f: 880, to: 220, d: 0.2, type: "triangle", g: 0.2 }),
    ding(o, t) { notes(o, t, [1319, 1760], 0.08, { d: 0.26, g: 0.15 }); },
    start(o, t) {
      notes(o, t, [392, 392, 523], 0.11, { d: 0.14, type: "square", g: 0.08 });
      tone(o, t + 0.33, { f: 784, d: 0.34, type: "square", g: 0.08 });
    },
    charge: (o, t) => tone(o, t, { f: 300, to: 1400, d: 0.24, type: "sawtooth", g: 0.18 }),
    attack: (o, t) => noise(o, t, { f: 700, to: 3800, d: 0.2, q: 1.4, g: 0.26, attack: 0.08 }),
    super(o, t) {
      noise(o, t, { f: 400, to: 5000, d: 0.45, q: 1.5, g: 0.28, attack: 0.25 });
      tone(o, t, { f: 300, to: 1600, d: 0.45, type: "sawtooth", g: 0.08 });
      tone(o, t + 0.42, { f: 1700, to: 900, d: 0.22, type: "sawtooth", g: 0.13 });
      chirp(o, t + 0.42, 3200, 0.13);
    },
    // 打中：高稀有度的鳥打起來更厚重，也多一聲亮音
    hit: (o, t) => {
      tone(o, t, { f: 240, to: 70, d: 0.14, g: 0.42 });
      noise(o, t, { f: 2200, to: 500, d: 0.09, q: 0.6, g: 0.3 });
    },
    hitSR(o, t) { SOUNDS.hit(o, t); tone(o, t + 0.03, { f: 1319, d: 0.2, type: "triangle", g: 0.1 }); },
    hitSSR(o, t) {
      SOUNDS.hit(o, t);
      tone(o, t, { f: 110, to: 50, d: 0.26, g: 0.3 });
      notes(o, t + 0.03, [1568, 2093], 0.05, { d: 0.26, type: "triangle", g: 0.11 });
    },
    hitUR(o, t) {
      SOUNDS.hitSSR(o, t);
      notes(o, t + 0.08, [2637, 3136, 3951], 0.05, { d: 0.32, g: 0.07 });
    },
    // BOSS：用鋸齒波加低頻，像一隻不太高興的大鳥
    boss(o, t) {
      tone(o, t, { f: 170, to: 95, d: 0.34, type: "sawtooth", g: 0.15 });
      tone(o, t + 0.02, { f: 178, to: 90, d: 0.34, type: "sawtooth", g: 0.11 });
    },
    bossHit(o, t) {
      tone(o, t, { f: 150, to: 45, d: 0.26, g: 0.45 });
      noise(o, t, { f: 900, to: 240, d: 0.2, q: 0.6, g: 0.28 });
    },
    faint: (o, t) => tone(o, t, { f: 1100, to: 130, d: 0.55, type: "triangle", g: 0.2 }),
    // 結算依星數：0 星是洩氣的滑音，星數越多越熱鬧
    stars0(o, t) { tone(o, t, { f: 392, to: 370, d: 0.2, type: "triangle", g: 0.18 }); tone(o, t + 0.22, { f: 370, to: 196, d: 0.55, type: "triangle", g: 0.18 }); },
    stars1(o, t) { notes(o, t, [523, 659, 784], 0.11, { d: 0.3, type: "triangle", g: 0.17 }); },
    stars2(o, t) { notes(o, t, [523, 659, 784, 1047], 0.11, { d: 0.42, type: "triangle", g: 0.17 }); chirp(o, t + 0.46, 2800); },
    stars3(o, t) {
      notes(o, t, [523, 659, 784, 1047, 784, 1047, 1319], 0.1, { d: 0.42, type: "triangle", g: 0.17 });
      [1047, 1319, 1568].forEach((f) => tone(o, t + 0.7, { f, d: 0.9, type: "triangle", g: 0.09 }));
      for (let i = 0; i < 3; i += 1) chirp(o, t + 0.75 + i * 0.17, 2700 + i * 400, 0.11);
    },
    error: (o, t) => tone(o, t, { f: 196, to: 150, d: 0.22, type: "square", g: 0.16 }),
  };

  let ctx = null;
  let bus = null;
  let muted = read();

  let bgmOn = new URLSearchParams(location.search).get("bgm") === "1" || read(BGM_KEY);
  let bgmGain = null;
  let bgmSource = null;
  let bgmBuffer = null;

  function openContext() {
    if (ctx) return true;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return false;
    ctx = new Context();
    bus = ctx.createDynamicsCompressor();
    bus.connect(ctx.destination);
    return true;
  }

  const bgmLevel = () => (bgmOn && !muted ? BGM.volume : 0);
  function fadeBgm() {
    if (bgmGain) bgmGain.gain.setTargetAtTime(bgmLevel(), ctx.currentTime, 0.6);
  }

  // 音檔只在打開背景音時才下載，大多數玩家不會多花流量
  async function startBgm() {
    if (bgmSource || !bgmOn || !openContext()) return;
    try {
      bgmBuffer ||= await ctx.decodeAudioData(await (await fetch(BGM.url)).arrayBuffer());
    } catch (error) {
      console.error("bgm", error);
      return;
    }
    if (bgmSource || !bgmOn) return;
    bgmGain ||= ctx.createGain();
    bgmGain.gain.value = 0;
    bgmGain.connect(ctx.destination);
    bgmSource = ctx.createBufferSource();
    bgmSource.buffer = bgmBuffer;
    bgmSource.loop = true;
    bgmSource.loopStart = BGM.loopStart;
    bgmSource.loopEnd = BGM.loopStart + BGM.loop;
    bgmSource.connect(bgmGain);
    bgmSource.start(0, BGM.loopStart);
    fadeBgm();
  }

  function stopBgm() {
    fadeBgm();
    const source = bgmSource;
    bgmSource = null;
    if (source) setTimeout(() => source.stop(), 2500);
  }

  // 瀏覽器要求使用者先操作過才能出聲，iOS 還必須在手勢當下喚醒
  function unlock() {
    if (!openContext()) return;
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    startBgm();
  }
  ["pointerdown", "touchend", "keydown"].forEach((name) => document.addEventListener(name, unlock, { capture: true, passive: true }));

  // 桌布環境可能永遠等不到點擊，所以有開背景音就先試著直接播；瀏覽器不允許時會等第一次操作
  if (bgmOn && openContext()) {
    ctx.resume().catch(() => {});
    startBgm();
  }

  function play(name) {
    if (muted || !ctx || !SOUNDS[name]) return;
    SOUNDS[name](bus, ctx.currentTime + 0.005);
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "gc-mute";
  function paint() {
    button.textContent = muted ? "🔇" : "🔊";
    button.setAttribute("aria-label", muted ? "開啟音效" : "關閉音效");
    button.setAttribute("aria-pressed", String(muted));
  }
  // 戰鬥動畫中點畫面會快轉，切換靜音不該影響戰鬥，所以不讓點擊傳到遊戲
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    muted = !muted;
    write(muted);
    paint();
    fadeBgm();
    play("chirp");
  });
  paint();
  document.body.append(button);

  const bgmButton = document.createElement("button");
  bgmButton.type = "button";
  bgmButton.className = "gc-mute gc-bgm";
  bgmButton.textContent = "🎵";
  function paintBgm() {
    bgmButton.classList.toggle("on", bgmOn);
    bgmButton.setAttribute("aria-label", bgmOn ? "關閉背景音" : "開啟背景音");
    bgmButton.setAttribute("aria-pressed", String(bgmOn));
  }
  bgmButton.addEventListener("click", (event) => {
    event.stopPropagation();
    bgmOn = !bgmOn;
    write(bgmOn, BGM_KEY);
    paintBgm();
    if (bgmOn) startBgm(); else stopBgm();
  });
  paintBgm();
  document.body.append(bgmButton);

  window.Sound = { play, names: Object.keys(SOUNDS), synth: (name, out, at) => SOUNDS[name](out, at), bgmPlaying: () => Boolean(bgmSource) && ctx.state === "running" };
})();
