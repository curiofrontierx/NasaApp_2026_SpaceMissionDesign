// Design Configuration: player hardware choices, validated and persisted in localStorage.
const STORAGE_KEY = 'cfx.design.v1';
// BUDGET comes from agencyBudget(); OPTIONS, LABELS and DEFAULTS come from assets/parts.js.
const SIM_PAGE = 'simulation.html'; // simulation page (built by a teammate)

// Shared budget with simulation.html: the agency's current funds from its saved game (mbm.sim.save),
// else the starting funds from the game setup (mbm.config), else SHARED_START_FUNDS.
// The same money pays for the satellite parts here and for launches/operations in the simulation,
// so the shared starting budget is set higher than the simulation's own default ($1,500,000).
const SHARED_START_FUNDS = 3000000;
// Write the starting funds into the simulation's game setup (documented in simulation/HANDOFF.md),
// keeping any other settings a teammate page saved. Only fills it in if no amount is set yet.
(function shareStartFunds() {
  try {
    const c = JSON.parse(localStorage.getItem('mbm.config') || '{}') || {};
    if (typeof c.startFunds !== 'number') localStorage.setItem('mbm.config', JSON.stringify({ ...c, startFunds: SHARED_START_FUNDS }));
  } catch { /* storage blocked */ }
})();
function agencyBudget() {
  try {
    const s = JSON.parse(localStorage.getItem('mbm.sim.save'));
    if (s && typeof s.funds === 'number' && !s.ended) return { amount: Math.max(0, Math.round(s.funds)), source: 'game' };
  } catch { /* no game yet */ }
  try {
    const c = JSON.parse(localStorage.getItem('mbm.config'));
    if (c && typeof c.startFunds === 'number') return { amount: c.startFunds, source: 'config' };
  } catch { /* no setup */ }
  return { amount: SHARED_START_FUNDS, source: 'default' };
}
const BUDGET_INFO = agencyBudget();
const BUDGET = BUDGET_INFO.amount;
const BUDGET_SOURCE_TEXT = { game: 'Agency funds from your simulation game', config: 'Starting funds from the game setup', default: 'Starting agency funds' };

const $ = id => document.getElementById(id);
const find = (key, id) => OPTIONS[key].find(o => o.id === id);
const money = n => '$' + n.toLocaleString('en-US');

for (const key of Object.keys(OPTIONS)) {
  $(key).innerHTML = OPTIONS[key]
    .map(o => `<option value="${o.id}">${o.name}${o.cost ? ` (${money(o.cost)})` : ''}</option>`).join('');
  $(key).addEventListener('change', update);
  $(key).dataset.noteCat = key; // hover note for the chosen part (assets/part-notes.js)
}
$('missionName').addEventListener('input', update);

function readForm() {
  const cfg = { missionName: $('missionName').value.trim() || DEFAULTS.missionName };
  for (const key of Object.keys(OPTIONS)) cfg[key] = $(key).value;
  return cfg;
}

function applyForm(cfg) {
  const c = { ...DEFAULTS, ...cfg };
  for (const key of Object.keys(OPTIONS)) $(key).value = find(key, c[key]) ? c[key] : DEFAULTS[key];
  $('missionName').value = String(c.missionName).slice(0, 40);
  update();
}

function selectedParts(cfg) {
  return Object.keys(OPTIONS).map(key => ({ cat: key, label: LABELS[key], ...find(key, cfg[key]) }));
}

// Part combinations the catalog says cannot work. Returns a message, or '' if the design is fine.
function incompatibility(cfg) {
  const laser = ['cubelct', 'scot80'].includes(cfg.transmitter);
  if (cfg.battery === 'nicd' && (['lwir', 'lidar'].includes(cfg.detector) || laser)) {
    const what = ['lwir', 'lidar'].includes(cfg.detector) ? find('detector', cfg.detector).name : find('transmitter', cfg.transmitter).name;
    return `⚠ Vintage NiCd Pack can't power the ${what}: the satellite will fail at launch. Pick a bigger battery, a lower-power detector (NIR, SWIR, MWIR or Zoom), or a radio transmitter instead of a laser.`;
  }
  return '';
}

function update() {
  $('compat').textContent = incompatibility(readForm());
  renderRatings(readForm(), $('ratings'));
  renderSatellite(readForm(), $('satDiagram'));
  const parts = selectedParts(readForm());
  const cost = parts.reduce((sum, p) => sum + p.cost, 0);
  // Budget is shown only in the top-right pill (always visible in the top bar).
  $('topBudget').textContent = cost > BUDGET ? `−${money(cost - BUDGET)}` : money(BUDGET - cost);
  $('topBudget').className = `mono ${cost > BUDGET ? 'bad' : 'ok'}`;
  $('topBudgetPill').title = `${BUDGET_SOURCE_TEXT[BUDGET_INFO.source]}: ${money(BUDGET)} · parts ${money(cost)} · left ${money(BUDGET - cost)}`;
}

function toast(msg) { $('toast').textContent = msg; setTimeout(() => { $('toast').textContent = ''; }, 3000); }

// ---------- launch weather (live NASA GIBS, via assets/nasa-weather.js) ----------
let weatherRec = null, weatherReq = 0;

function showWeather(rec) {
  const w = rec.weather, j = rec.judge;
  $('wSrc').textContent = w.source;
  $('wCloud').textContent = `${Math.round(w.cloud * 100)}%`;
  $('wStorm').textContent = w.storm ? '⚡ Yes' : 'No';
  $('wWind').textContent = `${w.wind} m/s`;
  $('wVerdict').textContent = `${j.verdict} (launch failure risk ${Math.round(j.risk * 100)}%)`;
  $('wVerdict').className = j.verdict === 'GO' ? 'ok' : j.verdict === 'HOLD' ? 'warn' : 'bad';
  $('wReasons').textContent = `${j.reasons.join('. ')}. Checked ${new Date(rec.checkedAt).toLocaleString()}.`;
}

// Live satellite picture around the site (GOES GeoColor if covered, else yesterday's MODIS), red circle = site.
async function showSiteImage(site, req) {
  const sat = goesFor(site.lon);
  const tile = await loadTile(sat ? goesUrl(sat, 'GeoColor', 7) : MODIS_TRUE, site.lat, site.lon, 6);
  if (req !== weatherReq) return; // site changed while loading
  if (!tile) { $('wImg').removeAttribute('src'); $('wImgNote').textContent = 'No image available for this site.'; return; }
  const ctx = tile.canvas.getContext('2d');
  ctx.strokeStyle = '#ff5252'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(tile.t.px, tile.t.py, 8, 0, 2 * Math.PI); ctx.stroke();
  $('wImg').src = tile.canvas.toDataURL();
  $('wImgNote').textContent = `${sat ? `${GOES[sat].name} GeoColor (live)` : `MODIS Terra true colour (${WX_DATE})`} · red circle = launch site`;
}

async function checkWeather() {
  const site = find('site', $('site').value);
  const req = ++weatherReq;
  weatherRec = null;
  $('siteText').textContent = site.name;
  ['wSrc', 'wCloud', 'wStorm', 'wWind', 'wVerdict'].forEach(id => { $(id).textContent = '…'; $(id).className = ''; });
  $('wReasons').textContent = 'Reading live NASA GIBS imagery…';
  $('weatherBtn').disabled = true;
  const weather = await readWeather(site.lat, site.lon);
  if (req !== weatherReq) return; // a newer check started; ignore this one
  const { desc, cost, ...siteInfo } = site;
  weatherRec = { site: siteInfo, weather, judge: judgeWeather(weather), checkedAt: new Date().toISOString() };
  localStorage.setItem(LAUNCH_KEY, JSON.stringify(weatherRec));
  showWeather(weatherRec);
  $('weatherBtn').disabled = false;
  showSiteImage(site, req);
}

$('site').addEventListener('change', checkWeather);
$('weatherBtn').onclick = checkWeather;

function saveDesign() {
  const cfg = readForm();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cfg, savedAt: new Date().toISOString() }));
  return cfg;
}

// The simulation page reads the saved design (STORAGE_KEY) and launch weather (LAUNCH_KEY) from localStorage.
$('simulateBtn').onclick = () => {
  const cost = selectedParts(readForm()).reduce((sum, p) => sum + p.cost, 0);
  if (cost > BUDGET) { toast(`Over budget by ${money(cost - BUDGET)}. Adjust your parts before simulating.`); return; }
  const clash = incompatibility(readForm());
  if (clash && !confirm(`${clash.replace('⚠ ', '')}\n\nSimulate anyway?`)) return;
  if (!weatherRec) { toast('Still checking launch weather. Try again in a moment.'); return; }
  const j = weatherRec.judge;
  if (j.verdict === 'NO-GO' && !confirm(`Launch weather is NO-GO: ${j.reasons.join(', ')}.\n` +
    `Launch anyway? (${Math.round(j.risk * 100)}% launch failure risk)\n\nPress Cancel to pick another launch site.`)) return;
  saveDesign();
  location.href = SIM_PAGE;
};

let saved = null;
try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { /* corrupt data: ignore */ }
applyForm(saved || DEFAULTS);
if (saved && saved.savedAt) toast(`Loaded saved design from ${new Date(saved.savedAt).toLocaleString()}.`);
checkWeather();
