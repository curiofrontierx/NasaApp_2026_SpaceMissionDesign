// Design Configuration: player hardware choices, validated and persisted in localStorage.
const STORAGE_KEY = 'cfx.design.v1';
// BUDGET, OPTIONS, LABELS and DEFAULTS come from assets/parts.js.
const SIM_PAGE = 'simulation.html'; // simulation page (built by a teammate)

const $ = id => document.getElementById(id);
const find = (key, id) => OPTIONS[key].find(o => o.id === id);
const money = n => '$' + n.toLocaleString('en-US');

for (const key of Object.keys(OPTIONS)) {
  $(key).innerHTML = OPTIONS[key]
    .map(o => `<option value="${o.id}">${o.name}${o.cost ? ` (${money(o.cost)})` : ''}</option>`).join('');
  $(key).addEventListener('change', update);
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
  return Object.keys(OPTIONS).map(key => ({ label: LABELS[key], ...find(key, cfg[key]) }));
}

function update() {
  const parts = selectedParts(readForm());
  const cost = parts.reduce((sum, p) => sum + p.cost, 0);
  $('costText').textContent = `${money(cost)} / ${money(BUDGET)}`;
  $('costText').className = cost > BUDGET ? 'bad' : 'ok';
  $('costBar').style.width = Math.min(100, cost / BUDGET * 100) + '%';
  $('remainingText').textContent = cost > BUDGET ? `−${money(cost - BUDGET)}` : money(BUDGET - cost);
  $('remainingText').className = cost > BUDGET ? 'bad' : 'ok';

  $('parts').innerHTML = '';
  for (const p of parts) {
    const div = document.createElement('div');
    div.className = 'part';
    const head = document.createElement('div');
    head.className = 'part-head';
    const name = document.createElement('span');
    name.textContent = `${p.label}: ${p.name}`;
    const price = document.createElement('span');
    price.textContent = p.cost ? money(p.cost) : 'No fee';
    head.append(name, price);
    const desc = document.createElement('p');
    desc.className = 'muted';
    desc.textContent = p.desc;
    div.append(head, desc);
    $('parts').appendChild(div);
  }
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
