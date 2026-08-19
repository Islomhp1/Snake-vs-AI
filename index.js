/* ==========================================================================
   SNAKE vs AI — index.js
   Texnik topshiriqqa asosan: 25x25 maydon, WASD boshqaruv, 5 level tizimi,
   AI dialoglari, power-up'lar (Speed/Slow/Poison/Freeze/Teleport/Wall),
   Fake Score ("dark system"), va yo'nalishli tunnel Teleport mexanikasi.
   ========================================================================== */

(() => {
  "use strict";

  /* ------------------------------ CONFIG ------------------------------- */
  const GRID = 25;
  const CELL = 20;
  const BASE_INTERVAL = 140; // ms per grid-step at normal speed

  const SPEED_FACTOR = 0.45, SPEED_DURATION = 1500;
  const SLOW_FACTOR = 1.85, SLOW_DURATION = 2000;
  const FREEZE_DURATION = 2000;

  const WIN_SCORE = 30;
  const LEVEL_THRESHOLDS = [0, 6, 12, 18, 24]; // index -> level 1..5 start score

  // Baseline (Medium) tuning — scaled per-difficulty via DIFFICULTIES multipliers below.
  const FAKE_CHANCE_BY_LEVEL = { 1: 0.01, 2: 0.02, 3: 0.05, 4: 0.10, 5: 0.20 };

  const POWERUP_POOL_BY_LEVEL = {
    1: ["speed"],
    2: ["speed", "slow"],
    3: ["speed", "slow", "poison", "freeze"],
    4: ["speed", "slow", "poison", "freeze"],
    5: ["speed", "slow", "poison", "freeze"],
  };
  const POWERUP_INTERVAL_BY_LEVEL = { // seconds [min,max] between spawns, baseline
    1: [5, 9], 2: [4, 8], 3: [4, 7], 4: [3, 6], 5: [3, 5],
  };
  const MAX_ACTIVE_POWERUPS = 2;

  const TELEPORT_MIN_LEVEL = 4;
  const WALL_MIN_LEVEL = 4;
  const WALL_CHANCE_BY_LEVEL = { 4: 0.30, 5: 0.55 }; // baseline, scaled by wallChanceMult
  const WALL_CHECK_INTERVAL = [2200, 4200]; // ms
  const WALL_DURATION = [5000, 7000]; // ms
  const WALL_LEN = [2, 4];

  // 4 qiyinchilik darajasi. Level bo'yicha ochiladigan qobiliyatlar hammasida bir xil —
  // farq: qobiliyat/fake-score/wall chastotasi, va "aqlli AI kombo" qaysi leveldan yoqilishi.
  const DIFFICULTIES = {
    easy:       { label: "Oson",         powerupIntervalMult: 1.5,  fakeScoreMult: 0.5,  wallChanceMult: 0.6, smartAiFromLevel: null },
    medium:     { label: "O'rtacha",     powerupIntervalMult: 1,    fakeScoreMult: 1,    wallChanceMult: 1,   smartAiFromLevel: null },
    hard:       { label: "Qiyin",        powerupIntervalMult: 1,    fakeScoreMult: 1,    wallChanceMult: 1,   smartAiFromLevel: 5 },
    impossible: { label: "O'tib bo'lmas",powerupIntervalMult: 0.75, fakeScoreMult: 1.25, wallChanceMult: 1.4, smartAiFromLevel: 4 },
  };
  const SMART_COMBO_MIN_GAP_CELLS = 4;   // minimal masofa ilon-olma orasida, kombo uchun joy qolishi kerak
  const SMART_COMBO_MAX_GAP_CELLS = 10;
  const SMART_COMBO_CHANCE = { hard: 0.4, impossible: 0.65 };
  const SMART_COMBO_WALL_LEN = [2, 3];
  const SMART_COMBO_WALL_DURATION = [6000, 8000];

  const ICONS = { speed: "⚡", slow: "🐌", poison: "☠️", freeze: "🧊", wall: "🧱" };

  const AI_LINES = {
    1: ["Qani, ko'ramiz qancha yig'a olarkansan 😏", "Boshladingmi?", "Hali ham oson deb o'ylayapsanmi?"],
    2: ["Yomon emas... 😏", "Endi biroz qiziqroq bo'ladi.", "Hali rekord qo'yaman deb o'ylayapsanmi?"],
    3: ["Hmm... ancha uzoqqa kelding.", "Endi ehtiyot bo'l.", "Men ham jiddiylashyapman 🤖"],
    4: ["Hali taslim bo'lmadingmi? 😂", "Endi men ham o'ynayman.", "Rekordingni saqlab qolishing qiyin."],
    5: ["😈 Endi haqiqiy o'yin boshlandi.", "30 tagacha yetishingga yo'l qo'ymayman.", "Qani, oxirigacha bor!"],
  };
  const FAKE_SCORE_LINES = ["Ahahaha, ball olaman deb o'ylading mi?", "Bu safar yo'q 😏", "Deyarli... lekin yo'q."];
  const POISON_WARNING_LINE = "Nima bo'ldi, o'ynaging kelmay qoldimi? Unda yana bir ye 😂";
  const WALL_LINES = ["To'siqqa hushyor bo'l 🧱", "Bu yerdan o'tolmaysan 😏", "Yo'lingga to'siq qo'ydim 🤖"];
  const TELEPORT_LINES = ["Portalim yoqadimi? 🌀", "Qayerga borishingni ham men bilaman 😏"];
  const SMART_COMBO_LINES = [
    "Seni kutib turibman edi 😈",
    "Muzla! 🧊 Va endi yo'lingda devor bor...",
    "O'ylaysanmi hammasi shunchaki oson bo'ladi deb? 😏",
    "Qayerga ketayotganingni ko'rib turibman 🤖",
  ];
  const START_LINE = "Tayyor bo'lsang, boshlaymiz 😏";
  const GAMEOVER_LINES = ["Ha, aytdim-ku... juda oson emas deb 😏", "Yana urinib ko'r, ehtimol keyingi safar 😈", "Bu safar men g'olibman."];
  const WALL_DEATH_LINE = "Aytdim-ku, to'siqqa urilma deb 😈";
  const POISON_DEATH_LINE = "Aytdim-ku, endi bo'ldi deb... ye desam yeyveribsan 😂";
  const WIN_LINES = ["Yaxshi... bu safar sen yutding. Lekin keyingisida yo'q 😈", "Kutilmagan edi... tabriklayman.", "Hmm. Hurmat qozonding."];

  /* ------------------------------ DOM ----------------------------------- */
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const scoreVal = document.getElementById("scoreVal");
  const levelVal = document.getElementById("levelVal");
  const bestVal = document.getElementById("bestVal");
  const diffVal = document.getElementById("diffVal");
  const diffButtons = document.querySelectorAll(".diff-btn");
  const aiText = document.getElementById("aiText");
  const aiPanel = document.getElementById("aiPanel");
  const aiAvatar = document.getElementById("aiAvatar");
  const startOverlay = document.getElementById("startOverlay");
  const endOverlay = document.getElementById("endOverlay");
  const endTitle = document.getElementById("endTitle");
  const endMessage = document.getElementById("endMessage");
  const endScore = document.getElementById("endScore");
  const restartBtn = document.getElementById("restartBtn");
  const muteBtn = document.getElementById("muteBtn");

  /* ------------------------------ STATE ---------------------------------- */
  let snake, direction, pendingDirection, score, level, tickCount;
  let foodPos, activePowerUps, activeWalls;
  let freezeUntil, speedUntil, slowUntil;
  let poisonWarningGiven, lastAppleWasFake;
  let teleport;
  let nextPowerUpAt, nextWallCheckAt, nextChatterAt;
  let running = false, over = false, won = false;
  let sessionBest = 0;
  let muted = false, audioCtx = null;
  let lastTime = 0, accumulator = 0;
  let difficulty = "medium";
  let comboActive = false, wasAlignedForCombo = false;

  function resetState() {
    const cy = Math.floor(GRID / 2);
    snake = [ {x: 12, y: cy}, {x: 11, y: cy}, {x: 10, y: cy} ];
    direction = {x: 1, y: 0};
    pendingDirection = {x: 1, y: 0};
    score = 0;
    level = 1;
    tickCount = 0;
    activePowerUps = [];
    activeWalls = [];
    freezeUntil = 0; speedUntil = 0; slowUntil = 0;
    poisonWarningGiven = false;
    lastAppleWasFake = false;
    teleport = { tp1: null, tp2: null, phase: "none", transitStartTick: null,
                 pendingWarp: false, tp1SpawnTime: 0, tp2SpawnTime: 0, entryDir: null };
    nextPowerUpAt = null;
    nextWallCheckAt = performance.now() + rand(3000, 6000);
    nextChatterAt = performance.now() + rand(3500, 6000);
    comboActive = false;
    wasAlignedForCombo = false;
    foodPos = null;
    spawnFood();
    updateHUD();
    setAiLevelClass(1);
  }

  /* ------------------------------ UTIL ------------------------------------ */
  function rand(min, max) { return Math.random() * (max - min) + min; }
  function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
  function chebyshev(a, b) { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }
  function sameCell(a, b) { return a && b && a.x === b.x && a.y === b.y; }
  function now() { return performance.now(); }

  function isOccupied(x, y) {
    if (snake.some(s => s.x === x && s.y === y)) return true;
    if (foodPos && foodPos.x === x && foodPos.y === y) return true;
    if (activePowerUps.some(p => p.x === x && p.y === y)) return true;
    if (activeWalls.some(w => w.x === x && w.y === y)) return true;
    if (teleport.tp1 && teleport.tp1.x === x && teleport.tp1.y === y) return true;
    if (teleport.tp2 && teleport.tp2.x === x && teleport.tp2.y === y) return true;
    return false;
  }

  // Generic random free-cell finder with optional extra filter + fallback full scan.
  function findFreeCell(filterFn, { minDistFromHead = 0, edgeMargin = 0, attempts = 200 } = {}) {
    const head = snake[0];
    for (let i = 0; i < attempts; i++) {
      const x = randInt(edgeMargin, GRID - 1 - edgeMargin);
      const y = randInt(edgeMargin, GRID - 1 - edgeMargin);
      if (isOccupied(x, y)) continue;
      if (minDistFromHead && chebyshev({x, y}, head) < minDistFromHead) continue;
      if (filterFn && !filterFn(x, y)) continue;
      return {x, y};
    }
    // Fallback: full scan ignoring soft constraints (filterFn/minDist), keep edgeMargin off.
    const free = [];
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (!isOccupied(x, y)) free.push({x, y});
      }
    }
    if (free.length === 0) return null;
    return free[randInt(0, free.length - 1)];
  }

  /* ------------------------------ SPAWNING --------------------------------- */
  function spawnFood() {
    foodPos = findFreeCell(null, { minDistFromHead: 2 });
  }

  function scheduleNextPowerUp() {
    const pool = POWERUP_POOL_BY_LEVEL[level] || [];
    if (pool.length === 0) { nextPowerUpAt = null; return; }
    const range = POWERUP_INTERVAL_BY_LEVEL[level] || [8, 14];
    const mult = DIFFICULTIES[difficulty].powerupIntervalMult;
    nextPowerUpAt = now() + rand(range[0], range[1]) * 1000 * mult;
  }

  function maybeSpawnPowerUp() {
    const pool = POWERUP_POOL_BY_LEVEL[level] || [];
    if (pool.length === 0) return;
    if (nextPowerUpAt === null) { scheduleNextPowerUp(); return; }
    if (activePowerUps.length >= MAX_ACTIVE_POWERUPS) return;
    if (now() < nextPowerUpAt) return;
    const type = pool[randInt(0, pool.length - 1)];
    const cell = findFreeCell(null, { minDistFromHead: 2 });
    if (cell) activePowerUps.push({ type, x: cell.x, y: cell.y });
    scheduleNextPowerUp();
  }

  function activateTeleportSystem() {
    if (teleport.tp1 || teleport.phase !== "none") return;
    const cell = findFreeCell(null, { minDistFromHead: 4, edgeMargin: 2 });
    if (!cell) return;
    teleport.tp1 = cell;
    teleport.tp1SpawnTime = now();
    teleport.phase = "waiting";
  }

  function spawnTP2(dir) {
    const clearance = Math.min(3 + Math.floor(snake.length / 5), 8);
    const filter = (x, y) => {
      if (dir.x === 1 && x > GRID - 1 - clearance) return false;
      if (dir.x === -1 && x < clearance) return false;
      if (dir.y === 1 && y > GRID - 1 - clearance) return false;
      if (dir.y === -1 && y < clearance) return false;
      return true;
    };
    const cell = findFreeCell(filter, { edgeMargin: 2, minDistFromHead: 3 });
    teleport.tp2 = cell || findFreeCell(null, { edgeMargin: 1 });
    teleport.tp2SpawnTime = now();
  }

  function finalizeTeleportCycle() {
    teleport.tp1 = null;
    teleport.tp2 = null;
    teleport.phase = "none";
    teleport.transitStartTick = null;
    teleport.pendingWarp = false;
    teleport.entryDir = null;
    activateTeleportSystem();
  }

  function maybeTriggerWall() {
    if (level < WALL_MIN_LEVEL) return;
    if (now() < nextWallCheckAt) return;
    nextWallCheckAt = now() + rand(WALL_CHECK_INTERVAL[0], WALL_CHECK_INTERVAL[1]);
    if (activeWalls.length > 0) return;
    if (comboActive) return; // don't stack a random wall on top of a telegraphed AI combo
    const chance = Math.min(0.9, (WALL_CHANCE_BY_LEVEL[level] || 0.3) * DIFFICULTIES[difficulty].wallChanceMult);
    if (Math.random() > chance) return;
    spawnWall();
  }

  function spawnWall() {
    const horizontal = Math.random() < 0.5;
    const len = randInt(WALL_LEN[0], WALL_LEN[1]);
    for (let attempt = 0; attempt < 80; attempt++) {
      const start = findFreeCell(null, { minDistFromHead: 4, edgeMargin: 2 });
      if (!start) return;
      const cells = [];
      let valid = true;
      for (let i = 0; i < len; i++) {
        const x = start.x + (horizontal ? i : 0);
        const y = start.y + (horizontal ? 0 : i);
        if (x < 1 || x >= GRID - 1 || y < 1 || y >= GRID - 1 || isOccupied(x, y)) { valid = false; break; }
        cells.push({x, y});
      }
      if (valid && cells.length === len) {
        const expiresAt = now() + rand(WALL_DURATION[0], WALL_DURATION[1]);
        cells.forEach(c => activeWalls.push({ x: c.x, y: c.y, expiresAt }));
        speak(WALL_LINES[randInt(0, WALL_LINES.length - 1)]);
        beep("wall");
        return;
      }
    }
  }

  /* ------------------------------ SMART AI COMBO (Qiyin/O'tib bo'lmas) ------ */
  function smartAiEnabled() {
    const fromLevel = DIFFICULTIES[difficulty].smartAiFromLevel;
    return fromLevel !== null && level >= fromLevel;
  }

  function maybeTriggerSmartCombo() {
    if (!smartAiEnabled()) { wasAlignedForCombo = false; return; }
    if (comboActive || now() < freezeUntil) { wasAlignedForCombo = false; return; }
    if (!foodPos) return;
    const head = snake[0];
    const alignedX = direction.x !== 0 && head.y === foodPos.y && Math.sign(foodPos.x - head.x) === direction.x;
    const alignedY = direction.y !== 0 && head.x === foodPos.x && Math.sign(foodPos.y - head.y) === direction.y;
    const dist = alignedX ? Math.abs(foodPos.x - head.x) : (alignedY ? Math.abs(foodPos.y - head.y) : Infinity);
    const opportunity = (alignedX || alignedY) && dist >= SMART_COMBO_MIN_GAP_CELLS && dist <= SMART_COMBO_MAX_GAP_CELLS;

    if (opportunity && !wasAlignedForCombo) {
      const chance = SMART_COMBO_CHANCE[difficulty] || 0.4;
      if (Math.random() < chance) {
        triggerSmartCombo(dist, { x: alignedX ? direction.x : 0, y: alignedY ? direction.y : 0 });
      }
    }
    wasAlignedForCombo = opportunity;
  }

  function triggerSmartCombo(distToFood, dir) {
    comboActive = true;
    freezeUntil = now() + FREEZE_DURATION;
    speak(SMART_COMBO_LINES[randInt(0, SMART_COMBO_LINES.length - 1)], { instant: true });
    beep("wall");
    aiPanel.classList.remove("combo-flash");
    void aiPanel.offsetWidth;
    aiPanel.classList.add("combo-flash");

    const head = snake[0];
    const perp = dir.x !== 0 ? { x: 0, y: 1 } : { x: 1, y: 0 };
    let centerX = head.x + dir.x * (distToFood + 2);
    let centerY = head.y + dir.y * (distToFood + 2);
    centerX = Math.max(2, Math.min(GRID - 3, centerX));
    centerY = Math.max(2, Math.min(GRID - 3, centerY));
    const center = { x: centerX, y: centerY };
    const len = randInt(SMART_COMBO_WALL_LEN[0], SMART_COMBO_WALL_LEN[1]);
    const half = Math.floor(len / 2);
    const cells = [];
    for (let i = -half; i <= half && cells.length < len; i++) {
      const x = center.x + perp.x * i, y = center.y + perp.y * i;
      if (x < 1 || x >= GRID - 1 || y < 1 || y >= GRID - 1) continue;
      if (sameCell({x, y}, foodPos)) continue; // olma yeb bo'lmay qolmasin
      if (isOccupied(x, y)) continue;
      cells.push({x, y});
    }
    if (cells.length) {
      const expiresAt = now() + rand(SMART_COMBO_WALL_DURATION[0], SMART_COMBO_WALL_DURATION[1]);
      cells.forEach(c => activeWalls.push({ x: c.x, y: c.y, expiresAt, aiCombo: true }));
    }
    setTimeout(() => { comboActive = false; }, FREEZE_DURATION + 400);
  }

  /* ------------------------------ AI DIALOGUE ------------------------------ */
  let lastLine = "";
  let talkTimeout = null;
  function speak(text, { instant = false } = {}) {
    if (text === lastLine && !instant) return;
    lastLine = text;
    aiText.textContent = text;
    aiPanel.classList.remove("talking");
    void aiPanel.offsetWidth; // restart animation
    aiPanel.classList.add("talking");
    clearTimeout(talkTimeout);
    talkTimeout = setTimeout(() => aiPanel.classList.remove("talking"), 550);
    nextChatterAt = now() + rand(4500, 9500) - level * 300;
  }

  function chatterTick() {
    if (!running || over || won) return;
    if (now() < nextChatterAt) return;
    const pool = AI_LINES[level];
    speak(pool[randInt(0, pool.length - 1)]);
  }

  function setAiLevelClass(lvl) {
    aiPanel.classList.remove("lvl-1", "lvl-2", "lvl-3", "lvl-4", "lvl-5");
    aiPanel.classList.add("lvl-" + lvl);
  }

  /* ------------------------------ SOUND ------------------------------------ */
  function ensureAudio() {
    if (audioCtx) return;
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; }
  }
  function beep(type) {
    if (muted || !audioCtx) return;
    const map = {
      food: [660, 0.07], fake: [180, 0.15], poison: [140, 0.18],
      power: [880, 0.09], freeze: [520, 0.2], wall: [110, 0.22],
      teleport: [990, 0.12], gameover: [130, 0.4], win: [990, 0.35], level: [740, 0.15],
    };
    const [freq, dur] = map[type] || [440, 0.1];
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type === "poison" || type === "wall" || type === "gameover" ? "sawtooth" : "square";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(); osc.stop(audioCtx.currentTime + dur);
    } catch (e) { /* ignore */ }
  }

  /* ------------------------------ GAME EVENTS ------------------------------ */
  function handleFoodEaten() {
    let isFake;
    if (score === WIN_SCORE - 1) {
      isFake = false; // 29 -> 30 har doim haqiqiy: adolatli g'alaba kafolati
    } else if (lastAppleWasFake) {
      isFake = false; // ketma-ket 2 marta fake bo'lmasligi kerak
    } else {
      isFake = Math.random() < Math.min(0.9, (FAKE_CHANCE_BY_LEVEL[level] || 0) * DIFFICULTIES[difficulty].fakeScoreMult);
    }
    lastAppleWasFake = isFake;

    if (isFake) {
      speak(FAKE_SCORE_LINES[randInt(0, FAKE_SCORE_LINES.length - 1)], { instant: true });
      beep("fake");
    } else {
      score++;
      beep("food");
      updateHUD();
      if (score >= WIN_SCORE) { spawnFood(); triggerWin(); return; }
    }
    if (snake.length > 2) poisonWarningGiven = false;
    spawnFood();
    updateLevel();
  }

  function applyPowerUpEffect(type) {
    if (type === "speed") {
      speedUntil = now() + SPEED_DURATION; slowUntil = 0; beep("power");
    } else if (type === "slow") {
      slowUntil = now() + SLOW_DURATION; speedUntil = 0; beep("power");
    } else if (type === "freeze") {
      freezeUntil = now() + FREEZE_DURATION; beep("freeze");
    } else if (type === "poison") {
      handlePoisonEaten();
    }
  }

  function handlePoisonEaten() {
    if (snake.length <= 2) {
      if (!poisonWarningGiven) {
        poisonWarningGiven = true;
        speak(POISON_WARNING_LINE, { instant: true });
        beep("poison");
      } else {
        triggerGameOver("poison");
      }
      return;
    }
    let loss = Math.random() < 0.5 ? 1 : 2;
    loss = Math.min(loss, snake.length - 1);
    for (let i = 0; i < loss; i++) snake.pop();
    beep("poison");
  }

  function updateLevel() {
    let newLevel = 1;
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
      if (score >= LEVEL_THRESHOLDS[i]) { newLevel = i + 1; break; }
    }
    if (newLevel !== level) {
      level = newLevel;
      updateHUD();
      setAiLevelClass(level);
      speak(AI_LINES[level][randInt(0, AI_LINES[level].length - 1)], { instant: true });
      beep("level");
      if (level >= TELEPORT_MIN_LEVEL) activateTeleportSystem();
      scheduleNextPowerUp();
    }
  }

  function updateHUD() {
    scoreVal.textContent = score;
    levelVal.textContent = level;
    bestVal.textContent = Math.max(sessionBest, score);
    diffVal.textContent = DIFFICULTIES[difficulty].label;
  }

  /* ------------------------------ TICK (grid step) -------------------------- */
  function tick() {
    tickCount++;
    direction = pendingDirection;
    const head = snake[0];
    let newHead;

    if (teleport.pendingWarp) {
      newHead = { x: teleport.tp2.x, y: teleport.tp2.y };
      teleport.pendingWarp = false;
      teleport.transitStartTick = tickCount;
      beep("teleport");
    } else {
      newHead = { x: head.x + direction.x, y: head.y + direction.y };
    }

    // Wall (border) collision
    if (newHead.x < 0 || newHead.x >= GRID || newHead.y < 0 || newHead.y >= GRID) {
      return triggerGameOver("border");
    }
    // AI-built wall collision
    if (activeWalls.some(w => w.x === newHead.x && w.y === newHead.y)) {
      return triggerGameOver("aiwall");
    }

    const ateFood = sameCell(newHead, foodPos);
    const growing = ateFood;
    const bodyToCheck = growing ? snake : snake.slice(0, snake.length - 1);
    if (bodyToCheck.some(s => s.x === newHead.x && s.y === newHead.y)) {
      return triggerGameOver("self");
    }

    snake.unshift(newHead);
    if (!growing) snake.pop();

    // TP1 entry
    if (teleport.tp1 && teleport.phase === "waiting" && sameCell(newHead, teleport.tp1)) {
      teleport.phase = "transiting";
      teleport.entryDir = { ...direction };
      spawnTP2(direction);
      teleport.pendingWarp = true;
      if (Math.random() < 0.5) speak(TELEPORT_LINES[randInt(0, TELEPORT_LINES.length - 1)]);
    }
    // Finish teleport cycle once whole body (incl. tail) has passed through
    if (teleport.phase === "transiting" && teleport.transitStartTick !== null &&
        tickCount - teleport.transitStartTick >= snake.length) {
      finalizeTeleportCycle();
    }

    const eatenPU = activePowerUps.find(p => sameCell(p, newHead));
    if (eatenPU) {
      activePowerUps = activePowerUps.filter(p => p !== eatenPU);
      applyPowerUpEffect(eatenPU.type);
      if (over) return;
    }
    if (ateFood) handleFoodEaten();
  }

  /* ------------------------------ GAME OVER / WIN --------------------------- */
  function triggerGameOver(reason) {
    over = true; running = false;
    sessionBest = Math.max(sessionBest, score);
    updateHUD();
    let line;
    if (reason === "poison") line = POISON_DEATH_LINE;
    else if (reason === "aiwall") line = WALL_DEATH_LINE;
    else line = GAMEOVER_LINES[randInt(0, GAMEOVER_LINES.length - 1)];
    speak(line, { instant: true });
    beep("gameover");
    endTitle.textContent = "GAME OVER";
    endMessage.textContent = line;
    endScore.textContent = `Yig'ilgan score: ${score} / ${WIN_SCORE}`;
    endOverlay.classList.remove("hidden", "win");
  }

  function triggerWin() {
    won = true; running = false;
    sessionBest = Math.max(sessionBest, score);
    updateHUD();
    const line = WIN_LINES[randInt(0, WIN_LINES.length - 1)];
    speak(line, { instant: true });
    beep("win");
    endTitle.textContent = "G'ALABA!";
    endMessage.textContent = line;
    endScore.textContent = `30/30 haqiqiy score yig'ildi!`;
    endOverlay.classList.add("win");
    endOverlay.classList.remove("hidden");
  }

  /* ------------------------------ INPUT -------------------------------------- */
  const KEY_MAP = {
    w: {x: 0, y: -1}, a: {x: -1, y: 0}, s: {x: 0, y: 1}, d: {x: 1, y: 0},
    ArrowUp: {x: 0, y: -1}, ArrowLeft: {x: -1, y: 0}, ArrowDown: {x: 0, y: 1}, ArrowRight: {x: 1, y: 0},
  };
  window.addEventListener("keydown", (e) => {
    if ((e.key === " " || e.key === "Enter") && (over || won)) {
      restartBtn.click();
    }
    const dir = KEY_MAP[e.key];
    if (!dir) return;
    e.preventDefault();
    if (!running) return;
    if (dir.x === -direction.x && dir.y === -direction.y) return; // no instant reverse
    pendingDirection = dir;
  });

  /* ------------------------------ RENDER -------------------------------------- */
  function css(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }
  let COLORS = null;
  function loadColors() {
    COLORS = {
      boardBg: css("--board-bg"), gridLine: css("--grid-line"),
      snakeBody: css("--snake-body"), snakeHead: css("--snake-head"), snakeFrozen: css("--snake-frozen"),
      food: css("--food"), speed: css("--pu-speed"), slow: css("--pu-slow"),
      poison: css("--pu-poison"), freeze: css("--pu-freeze"), teleport: css("--pu-teleport"),
      wall: css("--pu-wall"), textMain: css("--text-main"),
    };
  }

  function drawGrid() {
    ctx.fillStyle = COLORS.boardBg;
    ctx.fillRect(0, 0, GRID * CELL, GRID * CELL);
    ctx.strokeStyle = COLORS.gridLine;
    ctx.lineWidth = 1;
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath(); ctx.moveTo(i * CELL + 0.5, 0); ctx.lineTo(i * CELL + 0.5, GRID * CELL); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * CELL + 0.5); ctx.lineTo(GRID * CELL, i * CELL + 0.5); ctx.stroke();
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawSnake() {
    const frozen = now() < freezeUntil;
    for (let i = snake.length - 1; i >= 0; i--) {
      const s = snake[i];
      const px = s.x * CELL, py = s.y * CELL;
      let fill = i === 0 ? COLORS.snakeHead : COLORS.snakeBody;
      if (frozen) fill = COLORS.snakeFrozen;
      // portal glow tint on the cell currently over tp1/tp2
      const onPortal = (teleport.tp1 && sameCell(s, teleport.tp1)) || (teleport.tp2 && sameCell(s, teleport.tp2));
      ctx.save();
      if (frozen) {
        ctx.shadowColor = COLORS.snakeFrozen;
        ctx.shadowBlur = 5;
      } else if (onPortal) {
        ctx.shadowColor = COLORS.teleport;
        ctx.shadowBlur = 8;
      }
      ctx.fillStyle = onPortal && !frozen ? COLORS.teleport : fill;
      roundRect(px + 1.5, py + 1.5, CELL - 3, CELL - 3, i === 0 ? 6 : 4);
      ctx.fill();
      ctx.restore();
      if (i === 0) {
        // simple eyes to show heading
        ctx.fillStyle = "#0a0a0c";
        const ex = px + CELL / 2 + direction.x * 4, ey = py + CELL / 2 + direction.y * 4;
        ctx.beginPath(); ctx.arc(ex - 3, ey - 3, 1.6, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(ex + 3, ey + 3, 1.6, 0, 7); ctx.fill();
      }
    }
  }

  function drawFood() {
    if (!foodPos) return;
    const px = foodPos.x * CELL + CELL / 2, py = foodPos.y * CELL + CELL / 2;
    ctx.save();
    ctx.shadowColor = COLORS.food; ctx.shadowBlur = 6;
    ctx.fillStyle = COLORS.food;
    ctx.beginPath(); ctx.arc(px, py, CELL * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawPowerUps() {
    activePowerUps.forEach(p => {
      const px = p.x * CELL + CELL / 2, py = p.y * CELL + CELL / 2;
      const color = COLORS[p.type];
      ctx.save();
      ctx.shadowColor = color; ctx.shadowBlur = 7;
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, CELL * 0.36, 0, Math.PI * 2); ctx.stroke();
      ctx.font = `${CELL * 0.8}px sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(ICONS[p.type], px, py + 1);
      ctx.restore();
    });
  }

  function drawWalls() {
    activeWalls.forEach(w => {
      const px = w.x * CELL, py = w.y * CELL;
      const remain = Math.max(0, w.expiresAt - now());
      const alpha = remain < 900 ? 0.4 + 0.5 * Math.abs(Math.sin(now() / 90)) : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = COLORS.wall;
      roundRect(px + 1, py + 1, CELL - 2, CELL - 2, 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px + 1, py + CELL / 2); ctx.lineTo(px + CELL - 1, py + CELL / 2); ctx.stroke();
      ctx.restore();
    });
  }

  let tp1OpenAnim = 0;
  function drawTeleport() {
    if (teleport.tp1) {
      const target = (teleport.phase === "waiting" && chebyshev(snake[0], teleport.tp1) <= 1) || teleport.phase === "transiting" ? 1 : 0;
      tp1OpenAnim += (target - tp1OpenAnim) * 0.18;
      drawPortal(teleport.tp1, 0.22 + tp1OpenAnim * 0.22, tp1OpenAnim > 0.15);
    } else {
      tp1OpenAnim = 0;
    }
    if (teleport.tp2) {
      const age = now() - teleport.tp2SpawnTime;
      const scale = Math.min(1, age / 450);
      drawPortal(teleport.tp2, 0.1 + scale * 0.34, scale > 0.5);
    }
  }
  function drawPortal(cell, radiusFactor, showCore) {
    const px = cell.x * CELL + CELL / 2, py = cell.y * CELL + CELL / 2;
    ctx.save();
    ctx.shadowColor = COLORS.teleport; ctx.shadowBlur = 10;
    ctx.strokeStyle = COLORS.teleport; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(px, py, CELL * radiusFactor, 0, Math.PI * 2); ctx.stroke();
    if (showCore) {
      ctx.shadowBlur = 4;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(px, py, CELL * 0.08, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function render() {
    if (!COLORS) loadColors();
    drawGrid();
    drawWalls();
    drawTeleport();
    drawFood();
    drawPowerUps();
    drawSnake();
  }

  /* ------------------------------ MAIN LOOP ------------------------------------ */
  function getInterval() {
    const t = now();
    if (t < speedUntil) return BASE_INTERVAL * SPEED_FACTOR;
    if (t < slowUntil) return BASE_INTERVAL * SLOW_FACTOR;
    return BASE_INTERVAL;
  }

  function loop(ts) {
    const dt = lastTime ? ts - lastTime : 0;
    lastTime = ts;
    if (running && !over && !won) {
      const frozen = now() < freezeUntil;
      if (!frozen) {
        accumulator += dt;
        const interval = getInterval();
        let guard = 0;
        while (accumulator >= interval && guard < 5) {
          accumulator -= interval;
          tick();
          guard++;
          if (over || won) break;
        }
      } else {
        accumulator = 0;
      }
      maybeSpawnPowerUp();
      maybeTriggerWall();
      maybeTriggerSmartCombo();
      chatterTick();
      activeWalls = activeWalls.filter(w => w.expiresAt > now());
    }
    render();
    requestAnimationFrame(loop);
  }

  /* ------------------------------ START / RESTART -------------------------------- */
  function startGame(chosenDifficulty) {
    if (chosenDifficulty) difficulty = chosenDifficulty;
    ensureAudio();
    resetState();
    running = true; over = false; won = false;
    startOverlay.classList.add("hidden");
    endOverlay.classList.add("hidden");
    speak(START_LINE, { instant: true });
  }

  diffButtons.forEach(btn => {
    btn.addEventListener("click", () => startGame(btn.dataset.diff));
  });
  restartBtn.addEventListener("click", () => {
    running = false; over = false; won = false;
    endOverlay.classList.add("hidden");
    startOverlay.classList.remove("hidden");
  });
  muteBtn.addEventListener("click", () => {
    muted = !muted;
    muteBtn.textContent = muted ? "🔇" : "🔊";
  });

  // Touch controls (mobile swipe) as a bonus convenience layer
  let touchStart = null;
  canvas.addEventListener("touchstart", (e) => { touchStart = e.touches[0]; }, { passive: true });
  canvas.addEventListener("touchend", (e) => {
    if (!touchStart || !running) return;
    const dx = e.changedTouches[0].clientX - touchStart.clientX;
    const dy = e.changedTouches[0].clientY - touchStart.clientY;
    let dir;
    if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? {x: 1, y: 0} : {x: -1, y: 0};
    else dir = dy > 0 ? {x: 0, y: 1} : {x: 0, y: -1};
    if (!(dir.x === -direction.x && dir.y === -direction.y)) pendingDirection = dir;
    touchStart = null;
  }, { passive: true });

  /* ------------------------------ INIT ------------------------------------------ */
  resetState();
  requestAnimationFrame(loop);
})();