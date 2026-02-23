(function () {
  'use strict';

  // --- Punch vocabulary: abbreviations for generation, full names for display ---
  const PUNCHES = ['J', 'C', 'LH', 'RH', 'LU', 'RU', 'Jb', 'Cb'];
  const PUNCH_LABELS = {
    J: 'Jab',
    C: 'Cross',
    LH: 'Lead hook',
    RH: 'Rear hook',
    LU: 'Lead uppercut',
    RU: 'Rear uppercut',
    Jb: 'Body jab',
    Cb: 'Body cross'
  };

  // --- State (initial values synced from DOM in init) ---
  let state = {
    currentRound: 1,
    totalRounds: 12,
    roundSeconds: 180,
    restSeconds: 60,
    phase: 'idle', // 'round' | 'rest' | 'idle'
    remainingSeconds: 180,
    intervalId: null,
    hasStarted: false
  };

  // --- DOM refs ---
  const roundCounterEl = document.getElementById('roundCounter');
  const phaseLabelEl = document.getElementById('phaseLabel');
  const countdownEl = document.getElementById('countdown');
  const drillComboEl = document.getElementById('drillCombo');
  const newComboBtn = document.getElementById('newComboBtn');
  const roundLengthSelect = document.getElementById('roundLength');
  const restLengthSelect = document.getElementById('restLength');
  const totalRoundsSelect = document.getElementById('totalRounds');
  const startBtn = document.getElementById('startBtn');
  const pauseBtn = document.getElementById('pauseBtn');
  const resetBtn = document.getElementById('resetBtn');
  const workoutCompleteEl = document.getElementById('workoutComplete');
  const timerSection = document.querySelector('.timer-section');

  // --- Helpers ---
  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function getRoundSeconds() {
    return parseInt(roundLengthSelect.value, 10);
  }

  function getRestSeconds() {
    return parseInt(restLengthSelect.value, 10);
  }

  function getTotalRounds() {
    return parseInt(totalRoundsSelect.value, 10);
  }

  function triggerCue() {
    try {
      if (navigator.vibrate) navigator.vibrate(200);
    } catch (_) {}
  }

  let audioContext = null;

  function unlockAudio() {
    if (audioContext) return;
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (_) {}
  }

  function ensureAudio() {
    if (!audioContext) unlockAudio();
    if (audioContext && audioContext.state === 'suspended') audioContext.resume();
    return audioContext;
  }

  // Boxing bell: metallic sound via inharmonic partials (fundamental + overtones that decay faster).
  // Ratios approximate a real strike – higher partials ring out and fade quickly.
  function playBoxingBell(fundamentalHz, durationSeconds, startTime) {
    const ctx = audioContext;
    if (!ctx) return;
    const t = startTime != null ? startTime : ctx.currentTime;
    const partials = [
      { ratio: 1, gain: 0.35, decay: 1 },
      { ratio: 2.56, gain: 0.2, decay: 0.35 },
      { ratio: 5.4, gain: 0.12, decay: 0.15 },
      { ratio: 8.9, gain: 0.06, decay: 0.06 }
    ];
    partials.forEach(function (p) {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.frequency.value = fundamentalHz * p.ratio;
      osc.type = 'sine';
      const decay = durationSeconds * p.decay;
      gainNode.gain.setValueAtTime(p.gain, t);
      gainNode.gain.exponentialRampToValueAtTime(0.001, t + decay);
      osc.start(t);
      osc.stop(t + decay);
    });
  }

  function playStartBell() {
    try {
      if (!ensureAudio()) return;
      playBoxingBell(520, 0.55);
    } catch (_) {}
  }

  function playTenSecondBell() {
    try {
      if (!ensureAudio()) return;
      const ctx = audioContext;
      const t = ctx.currentTime;
      playBoxingBell(680, 0.2, t);
      playBoxingBell(680, 0.2, t + 0.22);
    } catch (_) {}
  }

  function playEndBell() {
    try {
      if (!ensureAudio()) return;
      playBoxingBell(380, 0.7);
    } catch (_) {}
  }

  function notifyPhaseEnd() {
    triggerCue();
    playEndBell();
  }

  // --- Combo generator: classic heavy-bag combinations that flow naturally ---
  // (1-2 = J-C, 3 = LH, 4 = RH, 5 = LU, 6 = RU; b = body. No random soup – only real patterns.)
  const COMBO_LIBRARY = [
    ['J', 'C'],
    ['J', 'J', 'C'],
    ['J', 'C', 'J'],
    ['J', 'C', 'LH'],
    ['J', 'C', 'RH'],
    ['J', 'C', 'LU'],
    ['J', 'C', 'RU'],
    ['J', 'LH', 'C'],
    ['J', 'C', 'LH', 'C'],
    ['J', 'C', 'LH', 'RH'],
    ['J', 'C', 'RH', 'LH'],
    ['J', 'J', 'C', 'LH'],
    ['J', 'C', 'LH', 'RU'],
    ['J', 'C', 'LU', 'RH'],
    ['J', 'C', 'RU', 'LH'],
    ['C', 'LH', 'C'],
    ['C', 'LH', 'RH'],
    ['J', 'C', 'Cb'],
    ['J', 'J', 'Cb'],
    ['J', 'Cb', 'C'],
    ['J', 'C', 'LH', 'Cb'],
    ['J', 'C', 'Jb', 'C'],
    ['Jb', 'C', 'LH'],
    ['J', 'J', 'C', 'LH', 'C'],
    ['J', 'C', 'LH', 'RH', 'C'],
    ['J', 'C', 'LH', 'C', 'Cb']
  ];

  let lastComboIndex = -1;

  function randomCombo(avoidImmediateRepeat) {
    let comboIndex = Math.floor(Math.random() * COMBO_LIBRARY.length);
    if (avoidImmediateRepeat && COMBO_LIBRARY.length > 1 && comboIndex === lastComboIndex) {
      comboIndex = (comboIndex + 1 + Math.floor(Math.random() * (COMBO_LIBRARY.length - 1))) % COMBO_LIBRARY.length;
    }
    lastComboIndex = comboIndex;
    const combo = COMBO_LIBRARY[comboIndex];
    return combo.map(function (abbr) { return PUNCH_LABELS[abbr] || abbr; }).join(' → ');
  }

  function setDrillCombo(text) {
    drillComboEl.textContent = text;
  }

  // --- UI updates ---
  function updateRoundDisplay() {
    const total = state.hasStarted ? getTotalRounds() : state.totalRounds;
    roundCounterEl.textContent = 'Round ' + state.currentRound + ' of ' + total;
  }

  function updateCountdownDisplay() {
    countdownEl.textContent = formatTime(state.remainingSeconds);
  }

  function updatePhaseDisplay() {
    if (state.phase === 'round') {
      phaseLabelEl.textContent = 'Round';
      timerSection.classList.remove('is-rest');
    } else if (state.phase === 'rest') {
      phaseLabelEl.textContent = 'Rest';
      timerSection.classList.add('is-rest');
    } else {
      phaseLabelEl.textContent = 'Round';
      timerSection.classList.remove('is-rest');
    }
  }

  function showWorkoutComplete(show) {
    workoutCompleteEl.hidden = !show;
  }

  function setControlsRunning(running) {
    startBtn.disabled = running;
    pauseBtn.disabled = !running;
    roundLengthSelect.disabled = running;
    restLengthSelect.disabled = running;
    totalRoundsSelect.disabled = running;
  }

  function setControlsIdle() {
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    roundLengthSelect.disabled = false;
    restLengthSelect.disabled = false;
    totalRoundsSelect.disabled = false;
  }

  // --- Timer tick ---
  function tick() {
    state.remainingSeconds--;
    updateCountdownDisplay();

    if (state.remainingSeconds === 10) {
      playTenSecondBell();
    }

    if (state.remainingSeconds <= 0) {
      if (state.phase === 'round') {
        notifyPhaseEnd();
        state.phase = 'rest';
        state.remainingSeconds = getRestSeconds();
        updatePhaseDisplay();
        updateCountdownDisplay();
      } else {
        notifyPhaseEnd();
        state.currentRound++;
        updateRoundDisplay();
        if (state.currentRound > getTotalRounds()) {
          stopTimer();
          showWorkoutComplete(true);
          return;
        }
        state.phase = 'round';
        state.remainingSeconds = getRoundSeconds();
        setDrillCombo(randomCombo(true));
        updatePhaseDisplay();
        updateCountdownDisplay();
        playStartBell();
      }
    }
  }

  function startTimer() {
    if (state.intervalId) return;
    unlockAudio();
    showWorkoutComplete(false);
    state.hasStarted = true;
    state.totalRounds = getTotalRounds();
    state.roundSeconds = getRoundSeconds();
    state.restSeconds = getRestSeconds();

    if (state.phase === 'idle') {
      state.phase = 'round';
      state.remainingSeconds = state.roundSeconds;
      state.currentRound = 1;
      setDrillCombo(randomCombo(true));
      updateRoundDisplay();
    }

    updatePhaseDisplay();
    updateCountdownDisplay();
    setControlsRunning(true);
    state.intervalId = setInterval(tick, 1000);
    playStartBell();
  }

  function pauseTimer() {
    if (!state.intervalId) return;
    clearInterval(state.intervalId);
    state.intervalId = null;
    setControlsIdle();
  }

  function stopTimer() {
    if (state.intervalId) {
      clearInterval(state.intervalId);
      state.intervalId = null;
    }
    setControlsIdle();
  }

  function resetTimer() {
    pauseTimer();
    showWorkoutComplete(false);
    state.hasStarted = false;
    state.currentRound = 1;
    state.totalRounds = getTotalRounds();
    state.roundSeconds = getRoundSeconds();
    state.restSeconds = getRestSeconds();
    state.phase = 'idle';
    state.remainingSeconds = state.roundSeconds;
    updateRoundDisplay();
    updatePhaseDisplay();
    updateCountdownDisplay();
  }

  // --- Config sync (when not running) ---
  function onConfigChange() {
    if (state.intervalId) return;
    state.totalRounds = getTotalRounds();
    state.roundSeconds = getRoundSeconds();
    state.restSeconds = getRestSeconds();
    if (state.phase === 'idle') {
      state.remainingSeconds = state.roundSeconds;
      updateCountdownDisplay();
    }
    updateRoundDisplay();
  }

  roundLengthSelect.addEventListener('change', onConfigChange);
  restLengthSelect.addEventListener('change', onConfigChange);
  totalRoundsSelect.addEventListener('change', onConfigChange);

  // --- Event listeners ---
  startBtn.addEventListener('click', startTimer);
  pauseBtn.addEventListener('click', pauseTimer);
  resetBtn.addEventListener('click', resetTimer);
  newComboBtn.addEventListener('click', function () {
    setDrillCombo(randomCombo(true));
  });

  // --- Init ---
  state.totalRounds = getTotalRounds();
  state.roundSeconds = getRoundSeconds();
  state.restSeconds = getRestSeconds();
  state.remainingSeconds = state.roundSeconds;
  setDrillCombo(randomCombo());
  updateRoundDisplay();
  updatePhaseDisplay();
  updateCountdownDisplay();
})();
