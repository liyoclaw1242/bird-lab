// 桌布的聲音：雨和爐火由程式合成，不用下載；音樂是音檔，只在打開時才載入。
// 瀏覽器要求先操作過才能出聲，所以有開就先試著播，被擋的話等第一次點擊。?sound=1、?music=1 可預設打開。
(function () {
  const RATE = 44100;
  const AMBIENCE_VOLUME = 0.5;
  const MUSIC_VOLUME = 0.7;
  const CROSSFADE = 5;
  // 音樂的位置先留著：放進 public/audio/ 再把路徑加到這裡，🎵 按鈕就會出現。用生成音樂時記得在授權頁標示。
  const TRACKS = [];
  const params = new URLSearchParams(location.search);

  const read = (key, wanted) => { if (params.has(wanted)) return params.get(wanted) !== "0"; try { return localStorage.getItem(key) === "1"; } catch { return false; } };
  const write = (key, on) => { try { localStorage.setItem(key, on ? "1" : "0"); } catch { /* 無痕模式：這次開著的期間仍然有效 */ } };

  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  }

  // 頭尾交叉淡化，低頻噪音循環時才不會有爆音。回傳的長度比輸入短 fade
  function seamless(input, fade) {
    const n = input.length - fade;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i += 1) out[i] = input[i];
    for (let i = 0; i < fade; i += 1) {
      const f = i / fade;
      out[i] = input[i] * Math.sqrt(f) + input[n + i] * Math.sqrt(1 - f);
    }
    return out;
  }

  // 水滴和木柴爆裂是帶衰減的短音，超出結尾就繞回開頭，循環時不會被切斷
  function addTick(out, at, hz, decay, gain, r) {
    const phase = r() * 6.28;
    const length = Math.floor((RATE * 5) / decay);
    for (let i = 0; i < length; i += 1) {
      const t = i / RATE;
      out[(at + i) % out.length] += Math.sin(6.283 * hz * t + phase) * Math.exp(-t * decay) * gain;
    }
  }

  function rainChannel(seed, seconds) {
    const r = rng(seed);
    const fade = RATE;
    const raw = new Float32Array(RATE * seconds + fade);
    let low = 0;
    let mid = 0;
    for (let i = 0; i < raw.length; i += 1) {
      const white = r() * 2 - 1;
      low += (white - low) * 0.012;
      mid += (white - mid) * 0.16;
      raw[i] = (white - mid) * 0.16 + (mid - low) * 0.42 + low * 1.5;
    }
    const out = seamless(raw, fade);
    for (let n = 0; n < seconds * 9; n += 1) addTick(out, Math.floor(r() * out.length), 700 + r() * 2600, 90 + r() * 170, 0.035 + r() * r() * 0.12, r);
    return out;
  }

  function fireChannel(seed, seconds) {
    const r = rng(seed);
    const fade = RATE;
    const raw = new Float32Array(RATE * seconds + fade);
    let low = 0;
    let wander = 0;
    let swell = 0.6;
    for (let i = 0; i < raw.length; i += 1) {
      const white = r() * 2 - 1;
      low += (white - low) * 0.006;
      wander += (white - wander) * 0.0004;
      swell = 0.62 + Math.max(-0.4, Math.min(0.4, wander * 16));
      raw[i] = low * 3.4 * swell;
    }
    const out = seamless(raw, fade);
    for (let n = 0; n < seconds * 7; n += 1) addTick(out, Math.floor(r() * out.length), 1200 + r() * 3600, 220 + r() * 500, 0.03 + r() * r() * 0.22, r);
    for (let n = 0; n < seconds * 0.5; n += 1) addTick(out, Math.floor(r() * out.length), 500 + r() * 900, 70 + r() * 80, 0.2 + r() * 0.22, r);
    return out;
  }

  function buildBuffer(ctx, make, seconds, seed) {
    const left = make(seed, seconds);
    const right = make(seed + 1, seconds);
    const buffer = ctx.createBuffer(2, left.length, RATE);
    buffer.copyToChannel(left, 0);
    buffer.copyToChannel(right, 1);
    return buffer;
  }

  let ctx = null;
  let ambienceGain = null;
  let ambienceBuilt = false;
  let ambienceOn = read("wallpaper-ambience", "sound");
  let musicOn = read("wallpaper-music", "music");

  function buildAmbience() {
    if (ambienceBuilt) return;
    ambienceBuilt = true;
    ambienceGain = ctx.createGain();
    ambienceGain.gain.value = 0;
    ambienceGain.connect(ctx.destination);
    // 長度不同，兩段疊起來要很久才會完全重複
    [[rainChannel, 11, 5, 0.18], [fireChannel, 13, 9, 0.5]].forEach(([make, seconds, seed, volume]) => {
      const source = ctx.createBufferSource();
      source.buffer = buildBuffer(ctx, make, seconds, seed);
      source.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = volume;
      source.connect(gain).connect(ambienceGain);
      source.start();
    });
  }

  function applyAmbience() {
    if (!ambienceOn && !ctx) return;
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ambienceOn) buildAmbience();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    if (ambienceGain) ambienceGain.gain.setTargetAtTime(ambienceOn ? AMBIENCE_VOLUME : 0, ctx.currentTime, 0.6);
  }

  // 音樂用兩個 audio 元素接力，下一首在結尾前開始淡入
  const decks = [new Audio(), new Audio()];
  let active = 0;
  let trackIndex = Math.floor(Math.random() * Math.max(1, TRACKS.length));
  let fadeTimer = null;
  decks.forEach((deck) => { deck.preload = "none"; deck.volume = 0; });

  function fadeTo(deck, target, seconds) {
    const start = deck.volume;
    const began = performance.now();
    const step = () => {
      const f = Math.min(1, (performance.now() - began) / (seconds * 1000));
      deck.volume = start + (target - start) * f;
      if (f < 1) deck.fadeHandle = setTimeout(step, 100);
      else if (target === 0) deck.pause();
    };
    clearTimeout(deck.fadeHandle);
    step();
  }

  function playNext() {
    if (!TRACKS.length) return;
    const previous = decks[active];
    active = 1 - active;
    const deck = decks[active];
    trackIndex = (trackIndex + 1) % TRACKS.length;
    deck.src = TRACKS[trackIndex];
    deck.currentTime = 0;
    deck.play().catch(() => {});
    fadeTo(deck, MUSIC_VOLUME, CROSSFADE);
    if (!previous.paused) fadeTo(previous, 0, CROSSFADE);
  }

  function watchMusic() {
    clearInterval(fadeTimer);
    if (!musicOn) return;
    fadeTimer = setInterval(() => {
      const deck = decks[active];
      if (!deck.paused && deck.duration && deck.duration - deck.currentTime < CROSSFADE + 0.5) playNext();
      else if (deck.ended) playNext();
    }, 500);
  }

  function applyMusic() {
    if (!TRACKS.length) return;
    const deck = decks[active];
    if (musicOn) {
      if (!deck.src) playNext();
      else { deck.play().catch(() => {}); fadeTo(deck, MUSIC_VOLUME, 2); }
    } else {
      decks.forEach((d) => { if (!d.paused) fadeTo(d, 0, 2); });
    }
    watchMusic();
  }

  const apply = () => { applyAmbience(); applyMusic(); };

  // 控制列平常隱藏，動滑鼠才出現，桌布畫面才乾淨
  const bar = document.createElement("div");
  bar.className = "wp-controls";
  const makeButton = (icon, label, isOn, toggle) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = icon;
    const paint = () => {
      button.classList.toggle("on", isOn());
      button.setAttribute("aria-pressed", String(isOn()));
      button.setAttribute("aria-label", label);
      button.title = label;
    };
    button.addEventListener("click", () => { toggle(); paint(); apply(); });
    paint();
    bar.append(button);
    return button;
  };
  makeButton("🌧️", "雨聲和爐火聲", () => ambienceOn, () => { ambienceOn = !ambienceOn; write("wallpaper-ambience", ambienceOn); });
  if (TRACKS.length) makeButton("🎵", "Lofi 音樂", () => musicOn, () => { musicOn = !musicOn; write("wallpaper-music", musicOn); });
  document.body.append(bar);

  let hideTimer = null;
  const wake = () => {
    document.body.classList.add("awake");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => document.body.classList.remove("awake"), 3000);
  };
  ["mousemove", "pointerdown", "keydown"].forEach((name) => addEventListener(name, wake));

  const unlock = () => apply();
  ["pointerdown", "keydown"].forEach((name) => addEventListener(name, unlock));
  if (ambienceOn || musicOn) apply();

  if (params.has("test")) window.wallpaperSoundTest = { rainChannel, fireChannel, decks, state: () => ({ ambienceOn, musicOn, ctx: ctx?.state ?? null, built: ambienceBuilt, gain: ambienceGain?.gain.value ?? null, bar: getComputedStyle(bar).opacity }) };
})();
