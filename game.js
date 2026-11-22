/* =========================================================
   Pixel Flap - retro pixel-art game (plain JavaScript)
   The game is drawn on a tiny 180x320 canvas and scaled up 2x by CSS
   (image-rendering: pixelated), so every "pixel" is a crisp square.
   All art is made in code: no image files needed.

   Sections (cool!):
     1. CONFIG & palette
     2. Telegram layer
     3. Storage (best score)
     4. Sound (8-bit style beeps)
     5. Pixel art (sprites, background, hills)
     6. Game state
     7. Update
     8. Draw
     9. UI wiring
    10. Main loop & boot
   ========================================================= */
(() => {
  'use strict';

  /* ---------- 1. CONFIG & palette ---------- */
  const CONFIG = {
    W: 180, H: 320, GROUND: 40,           // game-pixel units

    GRAVITY: 0.21,
    FLAP: -3.6,
    SPEED_START: 1.2,
    SPEED_MAX: 2.0,
    SPEED_PER_POINT: 0.02,

    GAP_START: 78,
    GAP_MIN: 64,
    GAP_SHRINK: 0.6,
    PIPE_W: 28,
    PIPE_SPACING: 112,
    CAP_H: 6,                             // pipe "lip" height

    BIRD_X: 46,
    BIRD_R: 5,                            // collision radius (sprite is 14x10)

    // Replace with YOUR bot/app link (see README step 6).
    SHARE_LINK: 'https://t.me/YourBotName/yourapp',
  };
  const { W, H, GROUND, PIPE_W, CAP_H } = CONFIG;
  const FLOOR = H - GROUND;

  // Dusk palette: a 6-band sunset sky, purple hills, clay-orange pipes.
  const PAL = {
    ink: '#1b1b3a',
    sky: ['#2b1b5a', '#4b2a7a', '#7a3a8a', '#b4488a', '#e8638a', '#ff9e6a'],
    sun: '#ffd27a',
    hillFar: '#3d2470',
    hillNear: '#2a1850',
    cloud: '#f6b6d0', cloudHi: '#ffe2ee',
    pipe: '#d2693a', pipeHi: '#f09a64', pipeSh: '#a24a26',
    groundTop: '#e0a060', groundBody: '#b36a45', mortar: '#7a4030',
  };

  const $ = (id) => document.getElementById(id);

  /* ---------- 2. Telegram layer ---------- */
  const tg = window.Telegram && window.Telegram.WebApp;

  function tgSupports(version) {
    try { return !!tg && tg.isVersionAtLeast(version); } catch (e) { return false; }
  }

  if (tg) {
    tg.ready();
    tg.expand();
    if (tgSupports('7.7')) tg.disableVerticalSwipes();
    try { tg.setHeaderColor(PAL.sky[0]); tg.setBackgroundColor(PAL.sky[0]); } catch (e) {}
  }

  const haptic = {
    flap()  { try { tg && tg.HapticFeedback.impactOccurred('light'); } catch (e) {} },
    score() { try { tg && tg.HapticFeedback.selectionChanged(); } catch (e) {} },
    hit()   { try { tg && tg.HapticFeedback.notificationOccurred('error'); } catch (e) {} },
  };

  const user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
  // initDataUnsafe is fine for showing a name; never trust it for scores/payments.
  if (user) $('player').textContent = 'HI ' + String(user.first_name).toUpperCase().slice(0, 10);

  function shareScore(score) {
    const text = mode === 'daily'
      ? `I scored ${score} in today's Pixel Flap daily challenge (${utcDay()})! Same pipes for everyone. Can you beat me?`
      : `I scored ${score} in Pixel Flap! Can you beat me?`;
    const url = 'https://t.me/share/url?url=' + encodeURIComponent(CONFIG.SHARE_LINK) +
                '&text=' + encodeURIComponent(text);
    if (tg && tg.openTelegramLink) tg.openTelegramLink(url);
    else window.open(url, '_blank');
  }

  /* ---------- 3. Storage ---------- */
  const useCloud = tgSupports('6.9') && !!(tg && tg.CloudStorage);
  let best = 0;

  // Tiny key/value helper: Telegram CloudStorage when available, else localStorage.
  const store = {
    get(key, cb) {
      if (useCloud) tg.CloudStorage.getItem(key, (err, v) => cb(err ? null : v));
      else { let v = null; try { v = localStorage.getItem(key); } catch (e) {} cb(v); }
    },
    set(key, value) {
      if (useCloud) tg.CloudStorage.setItem(key, value);
      else { try { localStorage.setItem(key, value); } catch (e) {} }
    },
  };

  function loadBest(done) {
    store.get('best', (v) => {
      best = parseInt(v, 10) || 0;
      store.get('daily', (raw) => {
        try { if (raw) daily = Object.assign(daily, JSON.parse(raw)); } catch (e) {}
        done();
      });
    });
  }
  function saveBest() { store.set('best', String(best)); }

  /* ---------- 3b. Daily challenge ---------- */
  // Everyone gets the same pipe layout on the same UTC day, so scores are comparable.
  // Saved as one small JSON value: { date: last day played, best: that day's best,
  //                                  streak: consecutive days played, last: last day played }
  let daily = { date: '', best: 0, streak: 0, last: '' };

  function utcDay(offsetDays) {
    const d = new Date(Date.now() + (offsetDays || 0) * 86400000);
    return d.toISOString().slice(0, 10);                        // 'YYYY-MM-DD'
  }
  function dailyBestToday() { return daily.date === utcDay() ? daily.best : 0; }
  function dailyStreakShown() {
    // The streak is still alive if you played today or yesterday.
    return (daily.last === utcDay() || daily.last === utcDay(-1)) ? daily.streak : 0;
  }
  function timeToReset() {
    const now = new Date();
    const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    const mins = Math.max(0, Math.floor((next - now.getTime()) / 60000));
    return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
  }
  function hashString(str) {                                    // string -> 32-bit seed
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function seededRandom(seed) {                                 // mulberry32 PRNG
    return function () {
      seed = (seed + 0x6D2B79F5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function recordDaily(finalScore) {
    const today = utcDay();
    if (daily.date !== today) { daily.date = today; daily.best = 0; }
    if (daily.last !== today) {
      daily.streak = (daily.last === utcDay(-1)) ? daily.streak + 1 : 1;
      daily.last = today;
    }
    const improved = finalScore > daily.best;
    if (improved) daily.best = finalScore;
    store.set('daily', JSON.stringify(daily));
    return improved;
  }

  /* ---------- 4. Sound (square-wave chiptune beeps) ---------- */
  let audioCtx = null;
  let muted = false;
  try { muted = localStorage.getItem('muted') === '1'; } catch (e) {}

  function beep(freq, duration, type, volume, slideTo) {
    if (muted) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
      gain.gain.setValueAtTime(volume || 0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(t); osc.stop(t + duration);
    } catch (e) {}
  }
  const sfx = {
    flap()  { beep(330, 0.10, 'square', 0.04, 660); },          // quick rising chirp
    score() { beep(988, 0.07, 'square', 0.05); setTimeout(() => beep(1319, 0.12, 'square', 0.05), 70); },
    hit()   { beep(220, 0.30, 'sawtooth', 0.07, 55); },          // falling crunch
  };

  /* ---------- 5. Pixel art ---------- */
  // Make a hidden canvas to pre-draw art once (fast to blit every frame).
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    return { c, g };
  }

  // --- Bird sprite: 14x10, one letter per pixel ---
  // k=outline b=body d=wing c=belly w=eye-white e=pupil o/r=beak
  const BIRD_GRID = [
    '....kkkkkk....',
    '..kkbbbbbbkk..',
    '.kbbbbbbwwwwk.',
    'kbbbbbbbwwekk.',
    'kbbbbbbbbbbook',
    'kbbbbbbbbbkrrk',
    'kbbbbcccccbk..',
    '.kbbbcccccbk..',
    '..kkbbbbbkk...',
    '....kkkkkk....',
  ];
  const BIRD_PAL = {
    k: PAL.ink, b: '#4aa3df', d: '#2a6fb0', c: '#ffe9b0',
    w: '#fff4d6', e: PAL.ink, o: '#ff9e2c', r: '#d96a1a',
  };
  // Wing rectangles [x, y, w, h] for each animation frame: up / middle / down
  const WING_FRAMES = [[2, 3, 5, 2], [2, 4, 5, 3], [2, 5, 5, 3]];

  const birdSprites = WING_FRAMES.map((wing) => {
    const { c, g } = makeCanvas(14, 10);
    BIRD_GRID.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.') continue;
        g.fillStyle = BIRD_PAL[ch];
        g.fillRect(x, y, 1, 1);
      }
    });
    g.fillStyle = BIRD_PAL.d;
    g.fillRect(wing[0], wing[1], wing[2], wing[3]);
    g.fillStyle = PAL.ink;                         // wing outline underline
    g.fillRect(wing[0], wing[1] + wing[3], wing[2], 1);
    return c;
  });

  // --- Static background: sky bands, stars, sun ---
  const bg = makeCanvas(W, H);
  (function buildBackground() {
    const g = bg.g;
    const bandH = Math.ceil(FLOOR / PAL.sky.length);
    PAL.sky.forEach((col, i) => { g.fillStyle = col; g.fillRect(0, i * bandH, W, bandH); });

    // Dither the seam between bands (checkerboard row) for a retro look
    for (let i = 1; i < PAL.sky.length; i++) {
      const y = i * bandH;
      g.fillStyle = PAL.sky[i - 1];
      for (let x = (i % 2); x < W; x += 2) g.fillRect(x, y, 1, 1);
      g.fillStyle = PAL.sky[i];
      for (let x = ((i + 1) % 2); x < W; x += 2) g.fillRect(x, y - 1, 1, 1);
    }

    // Stars from a tiny seeded generator, so they never change between loads
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    g.fillStyle = '#fff';
    for (let i = 0; i < 28; i++) g.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * 120), 1, 1);

    // Sun: filled circle built from horizontal runs
    const cx = 128, cy = 200, r = 20;
    g.fillStyle = PAL.sun;
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.floor(Math.sqrt(r * r - dy * dy));
      g.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
    }
  })();

  // --- Tileable hill strips (width W so they loop seamlessly) ---
  function makeHills(color, heightFn) {
    const { c, g } = makeCanvas(W, 80);
    g.fillStyle = color;
    for (let x = 0; x < W; x++) {
      const h = Math.max(1, Math.min(80, Math.round(heightFn(x))));
      g.fillRect(x, 80 - h, 1, h);
    }
    return c;
  }
  const TAU = Math.PI * 2;
  const hillsFar  = makeHills(PAL.hillFar,  (x) => 34 + 12 * Math.sin(TAU * x / W + 1) + 6 * Math.sin(TAU * 3 * x / W));
  const hillsNear = makeHills(PAL.hillNear, (x) => 16 + 6 * Math.sin(TAU * 2 * x / W + 2) + 3 * Math.sin(TAU * 5 * x / W));

  /* ---------- 6. Game state ---------- */
  let state = 'ready';                       // ready | play | over | paused
  let bird, pipes, score, speed, gap, sinceSpawn, overAt, scroll = 0, tick = 0, flash = 0, clouds = [], newBest = false;
  let mode = 'endless';                      // endless | daily
  let pipeRandom = Math.random;              // swapped for a seeded generator in daily mode

  function setState(s) { state = s; document.body.dataset.state = s; }

  function makeClouds() {
    clouds = [];
    for (let i = 0; i < 4; i++) {
      clouds.push({ x: Math.random() * W, y: 24 + Math.random() * 110, v: 0.1 + Math.random() * 0.15 });
    }
  }

  function reset() {
    bird = { x: CONFIG.BIRD_X, y: FLOOR / 2, vy: 0, r: CONFIG.BIRD_R };
    pipes = [];
    score = 0;
    speed = CONFIG.SPEED_START;
    gap = CONFIG.GAP_START;
    sinceSpawn = CONFIG.PIPE_SPACING - 60;   // first pipe arrives soon after starting
    // Daily mode re-seeds on every attempt, so each retry sees the identical pipes.
    pipeRandom = mode === 'daily' ? seededRandom(hashString('pixelflap-' + utcDay())) : Math.random;
    newBest = false;
    flash = 0;
    $('score').textContent = '0';
    setState('ready');
  }

  function start() {
    if (state === 'ready') setState('play');
    flap();
  }

  function flap() {
    if (state !== 'play') return;
    bird.vy = CONFIG.FLAP;
    haptic.flap(); sfx.flap();
  }

  function medalFor(s) {
    if (s >= 40) return { cls: 'gold',   label: 'GOLD' };
    if (s >= 20) return { cls: 'silver', label: 'SILVER' };
    if (s >= 10) return { cls: 'bronze', label: 'BRONZE' };
    return { cls: '', label: '' };
  }

  function die() {
    if (state !== 'play') return;
    setState('over');
    overAt = Date.now();
    flash = 8;                                // white screen flash
    haptic.hit(); sfx.hit();

    let shownBest;
    if (mode === 'daily') {
      newBest = recordDaily(score) && score > 0;
      shownBest = daily.best;
      $('go-mode').textContent = 'DAILY ' + utcDay() + '  STREAK ' + daily.streak;
    } else {
      if (score > best) { best = score; newBest = true; saveBest(); }
      shownBest = best;
      $('go-mode').textContent = '';
    }

    const m = medalFor(score);
    $('go-title').textContent = newBest ? 'NEW BEST!' : 'GAME OVER';
    $('go-score').textContent = score;
    $('go-best').textContent = shownBest;
    const badge = $('go-medal');
    badge.className = 'badge ' + m.cls;
    badge.textContent = m.label;

    // Briefly disable buttons so a panicked tap doesn't skip the result screen.
    ['btn-retry', 'btn-share'].forEach((id) => { $(id).disabled = true; });
    setTimeout(() => { ['btn-retry', 'btn-share'].forEach((id) => { $(id).disabled = false; }); }, 500);
  }

  /* ---------- 7. Update ---------- */
  function circleHitsRect(rx, ry, rw, rh) {
    const cx = Math.max(rx, Math.min(bird.x, rx + rw));
    const cy = Math.max(ry, Math.min(bird.y, ry + rh));
    const dx = bird.x - cx, dy = bird.y - cy;
    return dx * dx + dy * dy < bird.r * bird.r;
  }

  function update() {
    tick++;
    if (flash > 0) flash--;
    if (state === 'paused') return;

    clouds.forEach((c) => { c.x -= c.v; if (c.x < -24) c.x = W + 4; });

    if (state === 'ready') {
      scroll += speed;
      bird.y = FLOOR / 2 + Math.sin(tick / 10) * 3;     // gentle hover
      return;
    }

    // Bird physics (keeps running after death so it falls to the ground)
    if (state === 'play' || bird.y < FLOOR - bird.r) {
      bird.vy += CONFIG.GRAVITY;
      bird.y += bird.vy;
    }
    if (state === 'over') { if (bird.y > FLOOR - bird.r) bird.y = FLOOR - bird.r; return; }

    scroll += speed;
    if (bird.y < bird.r) { bird.y = bird.r; bird.vy = 0; }        // ceiling

    // Spawn pipes by distance travelled
    sinceSpawn += speed;
    if (sinceSpawn >= CONFIG.PIPE_SPACING) {
      sinceSpawn = 0;
      const minTop = 36, maxTop = FLOOR - gap - 36;
      pipes.push({ x: W + 2, top: Math.round(minTop + pipeRandom() * (maxTop - minTop)), gap: Math.round(gap), scored: false });
    }

    for (let i = pipes.length - 1; i >= 0; i--) {
      const p = pipes[i];
      p.x -= speed;

      if (!p.scored && p.x + PIPE_W < bird.x) {
        p.scored = true;
        score++;
        $('score').textContent = score;
        haptic.score(); sfx.score();
        speed = Math.min(CONFIG.SPEED_MAX, CONFIG.SPEED_START + score * CONFIG.SPEED_PER_POINT);
        gap = Math.max(CONFIG.GAP_MIN, CONFIG.GAP_START - score * CONFIG.GAP_SHRINK);
      }
      if (p.x + PIPE_W + 4 < 0) { pipes.splice(i, 1); continue; }

      // Pipe body + the wider lip on each end
      const bottomY = p.top + p.gap;
      if (circleHitsRect(p.x, 0, PIPE_W, p.top) ||
          circleHitsRect(p.x, bottomY, PIPE_W, H) ||
          circleHitsRect(p.x - 2, p.top - CAP_H, PIPE_W + 4, CAP_H) ||
          circleHitsRect(p.x - 2, bottomY, PIPE_W + 4, CAP_H)) { die(); return; }
    }

    if (bird.y + bird.r >= FLOOR) { bird.y = FLOOR - bird.r; die(); }
  }

  /* ---------- 8. Draw ---------- */
  function drawCloud(x, y) {
    x = Math.round(x); y = Math.round(y);
    ctx.fillStyle = PAL.cloud;
    ctx.fillRect(x + 4, y, 10, 3);
    ctx.fillRect(x, y + 3, 20, 4);
    ctx.fillRect(x + 8, y - 3, 8, 3);
    ctx.fillStyle = PAL.cloudHi;                      // highlight on top edges
    ctx.fillRect(x + 5, y, 8, 1);
    ctx.fillRect(x + 9, y - 3, 6, 1);
  }

  function drawPipePart(x, y, w, h) {
    ctx.fillStyle = PAL.ink;   ctx.fillRect(x, y, w, h);                 // outline
    ctx.fillStyle = PAL.pipe;  ctx.fillRect(x + 1, y, w - 2, h);         // body
    ctx.fillStyle = PAL.pipeHi; ctx.fillRect(x + 3, y, 3, h);            // light stripe
    ctx.fillStyle = PAL.pipeSh; ctx.fillRect(x + w - 7, y, 5, h);        // shadow stripe
  }

  function drawPipe(p) {
    const x = Math.round(p.x);
    const bottomY = p.top + p.gap;
    // top pipe: body then lip at its open end
    drawPipePart(x, -1, PIPE_W, p.top - CAP_H + 1);
    drawPipePart(x - 2, p.top - CAP_H, PIPE_W + 4, CAP_H);
    // bottom pipe: lip then body
    drawPipePart(x - 2, bottomY, PIPE_W + 4, CAP_H);
    drawPipePart(x, bottomY + CAP_H, PIPE_W, H);
  }

  function drawGround() {
    ctx.fillStyle = PAL.ink;        ctx.fillRect(0, FLOOR, W, 1);
    ctx.fillStyle = PAL.groundTop;  ctx.fillRect(0, FLOOR + 1, W, 2);
    ctx.fillStyle = PAL.groundBody; ctx.fillRect(0, FLOOR + 3, W, H - FLOOR - 3);
    ctx.fillStyle = PAL.mortar;
    const off = Math.floor(scroll) % 16;
    for (let row = 0, y = FLOOR + 3; y < H; row++, y += 8) {
      ctx.fillRect(0, y, W, 1);                                // horizontal brick line
      const shift = (row % 2) * 8;                             // stagger every other row
      for (let x = -off + shift - 16; x < W; x += 16) ctx.fillRect(x, y, 1, 8);
    }
  }

  function wingFrame() {
    if (state === 'over') return 2;
    if (state === 'play' && bird.vy > 1.5) return 2;           // falling: wings down
    return [0, 1, 2, 1][Math.floor(tick / 5) % 4];             // flapping cycle
  }

  function draw() {
    ctx.drawImage(bg.c, 0, 0);

    // Two hill layers scrolling at different speeds (parallax)
    const farOff = Math.floor(scroll * 0.25) % W;
    const nearOff = Math.floor(scroll * 0.5) % W;
    ctx.drawImage(hillsFar, -farOff, FLOOR - 80);
    ctx.drawImage(hillsFar, W - farOff, FLOOR - 80);
    ctx.drawImage(hillsNear, -nearOff, FLOOR - 80);
    ctx.drawImage(hillsNear, W - nearOff, FLOOR - 80);

    clouds.forEach((c) => drawCloud(c.x, c.y));
    pipes.forEach(drawPipe);
    drawGround();

    ctx.drawImage(birdSprites[wingFrame()], Math.round(bird.x - 7), Math.round(bird.y - 5));

    if (flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (flash / 8) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* ---------- 9. UI wiring ---------- */
  const canvas = $('c');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const stage = $('stage');

  function resize() {
    const vw = window.innerWidth;
    const vh = (tg && tg.viewportHeight) || window.innerHeight;
    // The stage is 360x640 CSS px (= 2x the 180x320 canvas); fit it to the screen.
    const s = Math.min(vw / 360, vh / 640);
    stage.style.transform = `scale(${s})`;
  }
  window.addEventListener('resize', resize);
  if (tg) tg.onEvent('viewportChanged', resize);
  resize();

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (state === 'ready') start();
    else flap();
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      if (state === 'ready') start();
      else if (state === 'play') flap();
      else if (state === 'over' && Date.now() - overAt > 500) { reset(); start(); }
    }
  });

  function playMode(m) { mode = m; reset(); start(); }
  $('btn-play').addEventListener('click', () => playMode('endless'));
  $('btn-daily').addEventListener('click', () => playMode('daily'));
  $('btn-menu').addEventListener('click', () => { mode = 'endless'; reset(); });   // back to the menu
  $('btn-retry').addEventListener('click', () => { reset(); start(); });
  $('btn-share').addEventListener('click', () => shareScore(score));
  $('btn-resume').addEventListener('click', () => setState('play'));

  function refreshSoundButton() { $('btn-sound').classList.toggle('off', muted); }
  $('btn-sound').addEventListener('click', () => {
    muted = !muted;
    try { localStorage.setItem('muted', muted ? '1' : '0'); } catch (e) {}
    refreshSoundButton();
  });
  refreshSoundButton();

  // Auto-pause when the Mini App is hidden / the user switches apps
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'play') setState('paused');
  });

  /* ---------- 10. Main loop & boot ---------- */
  // Fixed 60 updates/second so speed is identical on 60Hz and 120Hz phones.
  const STEP = 1000 / 60;
  let last = performance.now(), acc = 0;

  function loop(now) {
    acc += Math.min(now - last, 100);
    last = now;
    while (acc >= STEP) { update(); acc -= STEP; }
    draw();
    requestAnimationFrame(loop);
  }

  makeClouds();
  reset();
  loadBest(() => {
    refreshMenu();
    $('loading').classList.add('hide');
  });
  function refreshMenu() {
    $('menu-best').textContent = best;
    $('daily-best').textContent = dailyBestToday();
    $('daily-streak').textContent = dailyStreakShown();
    $('daily-reset').textContent = timeToReset();
  }
  new MutationObserver(refreshMenu)
    .observe(document.body, { attributes: true, attributeFilter: ['data-state'] });
  setInterval(refreshMenu, 30000);          // keep the countdown fresh if the menu stays open

  requestAnimationFrame(loop);
})();
