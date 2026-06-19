'use strict';

// ── Constants ────────────────────────────────────────────────
const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const SUITS = [
  { code:'s', sym:'♠', cls:'black' },
  { code:'h', sym:'♥', cls:'red'   },
  { code:'d', sym:'♦', cls:'red'   },
  { code:'c', sym:'♣', cls:'black' },
];
const DISPLAY_RANK = { T: '10' };
const STREET_LABEL = { preflop:'Preflop', flop:'Flop', turn:'Turn', river:'River' };
const API_BASE = 'http://localhost:8000';
const VALID_COMM = new Set([0, 3, 4, 5]);

// ── State ────────────────────────────────────────────────────
const state = {
  holeCards:      [],
  communityCards: [],
  numPlayers:     4,
  numSims:        10000,
  mode:           'hole',
  equityData:     { preflop:null, flop:null, turn:null, river:null },
  loading:        false,
};

// ── DOM refs ─────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const DOM = {
  holeSlots:        [0,1].map(i => $(`holeSlot${i}`)),
  commSlots:        [0,1,2,3,4].map(i => $(`commSlot${i}`)),
  calcBtn:          $('calcBtn'),
  calcLabel:        $('calcLabel'),
  calcSpinner:      $('calcSpinner'),
  equityHero:       $('equityHero'),
  heroSub:          $('heroSub'),
  streetBadge:      $('streetBadge'),
  winPct:           $('winPct'),
  losePct:          $('losePct'),
  tiePct:           $('tiePct'),
  winBar:           $('winBar'),
  loseBar:          $('loseBar'),
  tieBar:           $('tieBar'),
  statusDot:        $('statusDot'),
  statusText:       $('statusText'),
  cardPicker:       $('cardPicker'),
  pickerHint:       $('pickerHint'),
  playersVal:       $('playersVal'),
  simsVal:          $('simsVal'),
  modeHoleBtn:      $('modeHoleBtn'),
  modeCommunityBtn: $('modeCommunityBtn'),
  stepPreflop:      $('stepPreflop'),
  stepFlop:         $('stepFlop'),
  stepTurn:         $('stepTurn'),
  stepRiver:        $('stepRiver'),
};

// ── Card Picker ──────────────────────────────────────────────
function buildPicker() {
  const grid = DOM.cardPicker;
  SUITS.forEach(suit => {
    RANKS.forEach(rank => {
      const card = rank + suit.code;
      const display = DISPLAY_RANK[rank] ?? rank;
      const btn = document.createElement('button');
      btn.className = `picker-card picker-card--${suit.cls}`;
      btn.dataset.card = card;
      btn.setAttribute('aria-label', display + suit.sym);
      btn.innerHTML = `<span class="pc-rank">${display}</span><span class="pc-suit">${suit.sym}</span>`;
      btn.addEventListener('click', () => onPickerClick(card, btn));
      grid.appendChild(btn);
    });
  });
}

function refreshPicker() {
  const selected = new Set([...state.holeCards, ...state.communityCards]);
  const holeFull  = state.holeCards.length >= 2;
  const commFull  = state.communityCards.length >= 5;
  const modeFull  = state.mode === 'hole' ? holeFull : commFull;

  DOM.cardPicker.querySelectorAll('.picker-card').forEach(btn => {
    const isSelected = selected.has(btn.dataset.card);
    btn.classList.toggle('pc--selected', isSelected);
    btn.classList.toggle('pc--disabled', !isSelected && modeFull);
  });
}

function onPickerClick(card, btnEl) {
  if (state.loading) return;
  const allUsed = new Set([...state.holeCards, ...state.communityCards]);
  if (allUsed.has(card)) return;

  if (state.mode === 'hole') {
    if (state.holeCards.length >= 2) return;
    const slotIdx = state.holeCards.length;
    state.holeCards.push(card);
    pulsePickerCard(btnEl, DOM.holeSlots[slotIdx]);
    renderHoleSlots();
    if (state.holeCards.length === 2) {
      setTimeout(() => { setMode('community'); triggerAutoCalc(); }, 150);
    }
  } else {
    const len = state.communityCards.length;
    if (len >= 5) return;
    state.communityCards.push(card);
    pulsePickerCard(btnEl, DOM.commSlots[len]);
    renderCommSlots();
    if (VALID_COMM.has(state.communityCards.length) && state.communityCards.length > 0) {
      setTimeout(triggerAutoCalc, 150);
    }
  }

  refreshPicker();
  updateCalcButton();
  updateHint();
  updateStreetIndicator();
}

// ── Slot rendering ───────────────────────────────────────────
function renderHoleSlots() {
  DOM.holeSlots.forEach((slot, i) => {
    state.holeCards[i] ? fillSlot(slot, state.holeCards[i]) : emptySlot(slot);
  });
}

function renderCommSlots() {
  DOM.commSlots.forEach((slot, i) => {
    state.communityCards[i] ? fillSlot(slot, state.communityCards[i]) : emptySlot(slot);
  });
}

function fillSlot(el, cardStr) {
  const suit = SUITS.find(s => s.code === cardStr[1]);
  const display = DISPLAY_RANK[cardStr[0]] ?? cardStr[0];
  el.classList.add('card-slot--filled');
  el.innerHTML = `
    <div class="slot-face slot-face--${suit.cls}">
      <span class="slot-rank">${display}</span>
      <span class="slot-suit">${suit.sym}</span>
    </div>`;
  gsap.fromTo(el, { rotateY: 90, opacity: 0 }, { rotateY: 0, opacity: 1, duration: 0.28, ease: 'power2.out' });
}

function emptySlot(el) {
  el.classList.remove('card-slot--filled');
  el.innerHTML = '<span class="slot-empty">?</span>';
}

// ── Slot click (remove) ──────────────────────────────────────
function onSlotClick(type, index) {
  if (state.loading) return;

  if (type === 'hole') {
    if (!state.holeCards[index]) return;
    state.holeCards.splice(index, 1);
    if (state.holeCards.length === 0) {
      state.communityCards = [];
      resetResults();
    }
  } else {
    if (!state.communityCards[index]) return;
    // Maintain valid states: remove from this index onward
    if (index < 3)      state.communityCards = [];
    else if (index === 3) state.communityCards = state.communityCards.slice(0, 3);
    else                  state.communityCards = state.communityCards.slice(0, 4);
  }

  renderHoleSlots();
  renderCommSlots();
  refreshPicker();
  updateCalcButton();
  updateHint();
  updateStreetIndicator();
}

// ── Mode ─────────────────────────────────────────────────────
function setMode(mode) {
  state.mode = mode;
  DOM.modeHoleBtn.classList.toggle('mode-pill--active', mode === 'hole');
  DOM.modeCommunityBtn.classList.toggle('mode-pill--active', mode === 'community');
  refreshPicker();
  updateHint();
}

// ── Controls ─────────────────────────────────────────────────
function onPlayersChange(val) {
  state.numPlayers = +val;
  DOM.playersVal.textContent = val;
  syncSliderGradient($('playersSlider'));
}

function onSimsChange(val) {
  state.numSims = +val;
  DOM.simsVal.textContent = (+val).toLocaleString();
  syncSliderGradient($('simsSlider'));
}

function syncSliderGradient(slider) {
  const pct = ((slider.value - slider.min) / (slider.max - slider.min) * 100).toFixed(1);
  slider.style.setProperty('--pct', `${pct}%`);
}

// ── Button & hint state ──────────────────────────────────────
function updateCalcButton() {
  const hc = state.holeCards.length;
  const cc = state.communityCards.length;
  const valid = hc === 2 && VALID_COMM.has(cc);

  DOM.calcBtn.disabled = !valid;

  if (hc < 2) {
    DOM.calcLabel.textContent = 'Select your hand first';
  } else if (cc === 0) {
    DOM.calcLabel.textContent = 'Recalculate Preflop';
  } else if (cc < 3) {
    DOM.calcLabel.textContent = `Add ${3 - cc} more card${3 - cc > 1 ? 's' : ''} to complete flop`;
    DOM.calcBtn.disabled = true;
  } else if (cc === 3) {
    DOM.calcLabel.textContent = 'Recalculate Flop';
  } else if (cc === 4) {
    DOM.calcLabel.textContent = 'Recalculate Turn';
  } else {
    DOM.calcLabel.textContent = 'Recalculate River';
  }
}

function updateHint() {
  const hc = state.holeCards.length;
  const cc = state.communityCards.length;

  if (state.mode === 'hole') {
    DOM.pickerHint.textContent = hc >= 2 ? 'Hand complete ✓' : `Select hole cards (${hc}/2)`;
  } else {
    if (cc >= 5)      DOM.pickerHint.textContent = 'Board complete ✓';
    else if (cc < 3)  DOM.pickerHint.textContent = `Building flop (${cc}/3)`;
    else if (cc === 3) DOM.pickerHint.textContent = 'Add turn card (optional)';
    else              DOM.pickerHint.textContent = 'Add river card (optional)';
  }
}

function updateStreetIndicator() {
  const cc = state.communityCards.length;
  const steps = [DOM.stepPreflop, DOM.stepFlop, DOM.stepTurn, DOM.stepRiver];
  const activeIdx = cc < 3 ? 0 : cc === 3 ? 1 : cc === 4 ? 2 : 3;

  steps.forEach((el, i) => {
    el.classList.remove('street-step--active', 'street-step--done');
    if (i < activeIdx)  el.classList.add('street-step--done');
    if (i === activeIdx) el.classList.add('street-step--active');
  });
}

// ── Clear / Reset ────────────────────────────────────────────
function clearHoleCards() {
  state.holeCards = [];
  state.communityCards = [];
  renderHoleSlots();
  renderCommSlots();
  resetResults();
  refreshPicker();
  updateCalcButton();
  updateHint();
  updateStreetIndicator();
}

function clearCommunityCards() {
  state.communityCards = [];
  renderCommSlots();
  refreshPicker();
  updateCalcButton();
  updateHint();
  updateStreetIndicator();
}

function resetAll() {
  state.holeCards = [];
  state.communityCards = [];
  state.numPlayers = 4;
  state.numSims = 10000;
  state.equityData = { preflop:null, flop:null, turn:null, river:null };

  const pSlider = $('playersSlider');
  const sSlider = $('simsSlider');
  pSlider.value = 4;
  sSlider.value = 10000;
  DOM.playersVal.textContent = '4';
  DOM.simsVal.textContent = '10,000';
  syncSliderGradient(pSlider);
  syncSliderGradient(sSlider);

  renderHoleSlots();
  renderCommSlots();
  resetResults();
  setMode('hole');
  refreshPicker();
  updateCalcButton();
  updateHint();
  updateStreetIndicator();
  resetChart();
}

function resetResults() {
  DOM.equityHero.textContent = '—';
  DOM.heroSub.textContent = 'Select your hand to begin';
  DOM.streetBadge.classList.add('hidden');
  ['winPct','losePct','tiePct'].forEach(id => $(id).textContent = '—');
  gsap.to([DOM.winBar, DOM.loseBar, DOM.tieBar], { width: '0%', duration: 0.4 });
}

// ── API ──────────────────────────────────────────────────────
async function fetchEquity() {
  if (state.loading) return;
  const { holeCards, communityCards, numPlayers, numSims } = state;
  if (holeCards.length !== 2 || !VALID_COMM.has(communityCards.length)) return;

  const endpoint = '/equity';
  setLoading(true);

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hole_cards:        holeCards,
        community_cards:   communityCards,
        num_players:       numPlayers,
        num_simulations:   numSims,
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.equityData[data.street] = data;
    animateResults(data);
    updateChart();
    updateStreetIndicator();
    setStatus('success', 'Done');
  } catch (err) {
    setStatus('error', 'Error');
    showToast(`API error — is the backend running?\n${err.message}`);
  } finally {
    setLoading(false);
  }
}

function triggerAutoCalc() {
  if (state.holeCards.length === 2 && VALID_COMM.has(state.communityCards.length)) {
    fetchEquity();
  }
}

// ── Results animation ────────────────────────────────────────
function animateResults(data) {
  const win  = +(data.win  * 100).toFixed(1);
  const lose = +(data.lose * 100).toFixed(1);
  const tie  = +(data.tie  * 100).toFixed(1);

  // Hero number count-up
  countUp(DOM.equityHero, win, '%');
  DOM.heroSub.textContent = `${state.numSims.toLocaleString()} simulations · ${STREET_LABEL[data.street] ?? data.street}`;

  // Street badge
  DOM.streetBadge.textContent = STREET_LABEL[data.street] ?? data.street;
  DOM.streetBadge.classList.remove('hidden');
  gsap.fromTo(DOM.streetBadge,
    { scale: 0.6, opacity: 0 },
    { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(2)' }
  );

  // Bars (GSAP handles width)
  gsap.to(DOM.winBar,  { width: `${win}%`,  duration: 0.9, ease: 'power3.out' });
  gsap.to(DOM.loseBar, { width: `${lose}%`, duration: 0.9, ease: 'power3.out', delay: 0.06 });
  gsap.to(DOM.tieBar,  { width: `${tie}%`,  duration: 0.9, ease: 'power3.out', delay: 0.12 });

  countUp(DOM.winPct,  win,  '%');
  countUp(DOM.losePct, lose, '%');
  countUp(DOM.tiePct,  tie,  '%');

  // Panel flash
  gsap.fromTo('#heroPanel',
    { opacity: 0.5, y: 8 },
    { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }
  );
}

function countUp(el, target, suffix = '') {
  gsap.to({ v: 0 }, {
    v: target,
    duration: 0.85,
    ease: 'power2.out',
    onUpdate() { el.textContent = this.targets()[0].v.toFixed(1) + suffix; },
  });
}

// ── Card slot GSAP animation ─────────────────────────────────
function pulsePickerCard(btnEl, slotEl) {
  gsap.to(btnEl, { scale: 0.82, duration: 0.1, yoyo: true, repeat: 1, ease: 'power2.inOut' });
  gsap.fromTo(slotEl,
    { scale: 0.8, opacity: 0.4 },
    { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.8)' }
  );
}

// ── Loading / Status ─────────────────────────────────────────
function setLoading(on) {
  state.loading = on;
  DOM.calcBtn.disabled = on;
  DOM.calcSpinner.classList.toggle('hidden', !on);
  if (on) {
    DOM.calcLabel.textContent = 'Calculating…';
    setStatus('calculating', 'Running…');
  } else {
    updateCalcButton();
  }
}

function setStatus(type, text) {
  DOM.statusDot.className = `status-dot status-dot--${type}`;
  DOM.statusText.textContent = text;
  if (type === 'success') {
    setTimeout(() => {
      DOM.statusDot.className = 'status-dot status-dot--idle';
      DOM.statusText.textContent = 'Ready';
    }, 2500);
  }
}

function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  $('toastContainer').appendChild(el);
  gsap.fromTo(el, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3 });
  setTimeout(() => {
    gsap.to(el, { y: -10, opacity: 0, duration: 0.3, onComplete: () => el.remove() });
  }, 5000);
}

// ── Chart.js ─────────────────────────────────────────────────
let chart = null;

function initChart() {
  const ctx = $('equityChart').getContext('2d');

  const winGradient = ctx.createLinearGradient(0, 0, 0, 220);
  winGradient.addColorStop(0, 'rgba(34,197,94,0.28)');
  winGradient.addColorStop(1, 'rgba(34,197,94,0)');

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Preflop', 'Flop', 'Turn', 'River'],
      datasets: [
        {
          label: 'Win',
          data: [null, null, null, null],
          borderColor: '#22c55e',
          backgroundColor: winGradient,
          borderWidth: 2.5,
          pointBackgroundColor: '#22c55e',
          pointBorderColor: '#0d1a0e',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
          tension: 0.4,
          fill: true,
          spanGaps: false,
        },
        {
          label: 'Lose',
          data: [null, null, null, null],
          borderColor: '#ef4444',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointBackgroundColor: '#ef4444',
          pointBorderColor: '#0d1a0e',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
          tension: 0.4,
          fill: false,
          spanGaps: false,
        },
        {
          label: 'Tie',
          data: [null, null, null, null],
          borderColor: '#f59e0b',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [5, 4],
          pointBackgroundColor: '#f59e0b',
          pointBorderColor: '#0d1a0e',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          tension: 0.4,
          fill: false,
          spanGaps: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#9ca3af',
            padding: 18,
            usePointStyle: true,
            pointStyleWidth: 9,
            font: { size: 11, family: 'Inter' },
          },
        },
        tooltip: {
          backgroundColor: '#0d1a0e',
          borderColor: '#1a2e1c',
          borderWidth: 1,
          titleColor: '#c9a84c',
          bodyColor: '#d1d5db',
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            title: items => STREET_LABEL[items[0].label.toLowerCase()] ?? items[0].label,
            label: ctx => {
              const v = ctx.parsed.y;
              return v != null ? ` ${ctx.dataset.label}: ${v.toFixed(1)}%` : '';
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: '#1a2e1c' },
          border: { display: false },
          ticks: { color: '#6b7280', font: { size: 11, family: 'Inter' } },
        },
        y: {
          min: 0, max: 100,
          grid: { color: '#1a2e1c' },
          border: { display: false },
          ticks: {
            color: '#6b7280',
            font: { size: 11, family: 'Inter' },
            callback: v => `${v}%`,
            maxTicksLimit: 6,
          },
        },
      },
      animation: { duration: 700, easing: 'easeInOutQuart' },
    },
  });
}

function updateChart() {
  if (!chart) return;
  const order = ['preflop', 'flop', 'turn', 'river'];
  order.forEach((street, i) => {
    const d = state.equityData[street];
    chart.data.datasets[0].data[i] = d ? +(d.win  * 100).toFixed(1) : null;
    chart.data.datasets[1].data[i] = d ? +(d.lose * 100).toFixed(1) : null;
    chart.data.datasets[2].data[i] = d ? +(d.tie  * 100).toFixed(1) : null;
  });
  chart.update();
}

function resetChart() {
  if (!chart) return;
  chart.data.datasets.forEach(ds => (ds.data = [null, null, null, null]));
  chart.update();
}

// ── Init ─────────────────────────────────────────────────────
function init() {
  buildPicker();
  initChart();
  syncSliderGradient($('playersSlider'));
  syncSliderGradient($('simsSlider'));
  updateCalcButton();
  updateHint();
  updateStreetIndicator();

  // Entrance animations
  gsap.from('header', { y: -24, opacity: 0, duration: 0.55, ease: 'power3.out' });
  gsap.from('main > div', {
    y: 28, opacity: 0, duration: 0.55, stagger: 0.12,
    ease: 'power3.out', delay: 0.12,
  });
  gsap.from('section', { y: 28, opacity: 0, duration: 0.55, ease: 'power3.out', delay: 0.3 });
}

document.addEventListener('DOMContentLoaded', init);
