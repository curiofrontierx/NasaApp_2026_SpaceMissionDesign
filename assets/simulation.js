// Simulation page: real-time loop, Leaflet map with NASA GIBS tiles, localStorage persistence.
const DESIGN_KEY = 'cfx.design.v1';
const STATE_KEY = 'cfx.sim.state.v1';     // in-progress run (resume after reload)
const HISTORY_KEY = 'cfx.sim.history.v1'; // finished runs
const STEP_S = 30;                        // simulation step (mission seconds)

const $ = id => document.getElementById(id);
const fmtT = s => `Day ${Math.floor(s / 86400) + 1}, ${String(Math.floor(s % 86400 / 3600)).padStart(2, '0')}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}`;
const fmtMb = mb => mb >= 1e6 ? `${(mb / 1e6).toFixed(2)} TB` : mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
const fmtLL = p => `${Math.abs(p.lat).toFixed(1)}°${p.lat >= 0 ? 'N' : 'S'}, ${Math.abs(p.lon).toFixed(1)}°${p.lon >= 0 ? 'E' : 'W'}`;

let design = null;
try { design = JSON.parse(localStorage.getItem(DESIGN_KEY)); } catch { /* ignore */ }
const valid = design && Object.keys(OPTIONS).every(k => OPTIONS[k].some(o => o.id === design[k]));
if (!valid) design = { ...DEFAULTS };
$('title').textContent = `Mission Simulation: ${design.missionName || DEFAULTS.missionName}`;

// ---------- map (Leaflet + GIBS WMTS tiles) ----------
// One Earth only: no repeated world copies, and panning is locked to the map edges.
const WORLD = L.latLngBounds([[-85, -180], [85, 180]]);
const map = L.map('map', { worldCopyJump: false, maxBounds: WORLD, maxBoundsViscosity: 1 });
// Smallest zoom at which one world fills the map width, so no empty space or copies show.
function fitOneWorld() {
  const z = Math.max(1, Math.ceil(Math.log2(map.getSize().x / 256)));
  map.setMinZoom(z);
  if (map.getZoom() < z || !map._loaded) map.setView([20, 0], z);
}
fitOneWorld();
map.on('resize', fitOneWorld);
// Dragging the map means the player wants to look around, so stop following the satellite.
map.on('dragstart', () => { $('followToggle').checked = false; });
const tile = key => L.tileLayer(GIBS_LAYERS[key].url, {
  noWrap: true, bounds: WORLD,
  maxNativeZoom: GIBS_LAYERS[key].maxNativeZoom, maxZoom: 9, opacity: GIBS_LAYERS[key].overlay ? 0.6 : 1,
  attribution: `NASA GIBS · ${GIBS_LAYERS[key].name}`
});
let base = tile('bluemarble').addTo(map);
const clouds = tile('clouds'); // off by default; toggled with "Show clouds"
$('layer').onchange = e => { map.removeLayer(base); base = tile(e.target.value).addTo(map); base.bringToBack(); };
const syncCloudLegend = () => { $('cloudLegend').style.opacity = $('cloudToggle').checked ? 1 : 0.45; };
$('cloudToggle').onchange = e => { e.target.checked ? clouds.addTo(map) : map.removeLayer(clouds); syncCloudLegend(); };
syncCloudLegend();

const hotMarkers = {};
HOTSPOTS.forEach(h => {
  hotMarkers[h.id] = L.circleMarker([h.lat, h.lon], { radius: 7, color: '#fff', weight: 1, fillColor: '#ff8a8a', fillOpacity: .9 })
    .bindTooltip(h.name).addTo(map);
});
GROUND_STATIONS.forEach(g => L.circleMarker([g.lat, g.lon], { radius: 5, color: '#9cdcff', fillColor: '#9cdcff', fillOpacity: 1 })
  .bindTooltip(`Ground station: ${g.name}`).addTo(map));
const satMarker = L.circleMarker([0, 0], { radius: 8, color: '#000', weight: 2, fillColor: '#ffd27a', fillOpacity: 1 }).addTo(map);
const swath = L.circle([0, 0], { radius: SWATH_KM * 500, color: '#ffd27a', weight: 1, fillOpacity: .08 }).addTo(map);
const newTrack = () => L.polyline([], { color: '#ffd27a', weight: 1.5, opacity: .7 }).addTo(map);
let tracks = [newTrack()];

// ---------- persistence ----------
let sim = null, playing = false, lastFrame = 0, logCount = 0, lastSave = 0;

function saveState() {
  if (!sim || sim.done) return;
  const { fluxById, cloudById, ...rest } = sim; // NASA data is cached separately
  try { localStorage.setItem(STATE_KEY, JSON.stringify({ design, sim: rest })); } catch { /* quota */ }
}
function loadState() {
  try {
    const st = JSON.parse(localStorage.getItem(STATE_KEY));
    return st && JSON.stringify(st.design) === JSON.stringify(design) && !st.sim.done ? st.sim : null;
  } catch { return null; }
}
function readHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; } }
function saveResult() {
  const h = readHistory();
  h.unshift({ at: new Date().toISOString(), mission: design.missionName, design, score: scoreSim(sim),
    detections: sim.detections, misses: sim.misses, downMb: Math.round(sim.downMb), brownouts: sim.brownouts, failed: sim.failed });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 20)));
  localStorage.removeItem(STATE_KEY);
}
// ---------- UI ----------
function render() {
  const s = sim, c = s.cfg, cap = SPECS.storage[c.storage].mb;
  $('tTime').textContent = `${fmtT(s.t)} / ${MISSION_DAYS} days`;
  $('tOrbit').textContent = `${s.orbit.polar ? 'Sun-synchronous' : 'ISS-like'} ${s.orbit.alt} km, ${s.orbit.inc}°, ${(s.orbit.period / 60).toFixed(0)} min`;
  $('tPos').textContent = fmtLL(s.pos);
  $('tSun').textContent = s.sun ? '☀ Day side' : '🌙 Night side';
  $('tBatt').textContent = `${s.battWh.toFixed(1)} / ${s.m.battMax} Wh`;
  $('tBatt').className = s.battWh < s.m.battMax * .2 ? 'bad' : 'ok';
  $('battBar').style.width = `${s.battWh / s.m.battMax * 100}%`;
  const net = s.netW ?? 0;
  $('tPower').textContent = net >= 0 ? `⚡ Charging +${net} W` : `🔋 Draining ${net} W`;
  $('tPower').className = net >= 0 ? 'ok' : 'warn';
  $('tDet').textContent = s.dark ? '💤 Safe mode (recharging to 80%)' : s.targeting ? '🎯 Active (near hotspot)' : '⏸ Standby';
  $('tDet').className = s.dark ? 'bad' : s.targeting ? 'ok' : '';
  $('tStore').textContent = `${fmtMb(s.storedMb)} / ${fmtMb(cap)}`;
  $('storeBar').style.width = `${Math.min(100, s.storedMb / cap * 100)}%`;
  $('tContact').textContent = s.contact ? `📡 ${s.contact}` : 'None';
  $('rDet').textContent = s.detections;
  $('rMiss').textContent = s.misses;
  $('rDown').textContent = fmtMb(s.downMb);
  $('rLost').textContent = fmtMb(s.lostMb);
  $('rBrown').textContent = s.brownouts;
  $('rScore').textContent = `${scoreSim(s)} / 100`;

  const ll = [s.pos.lat, s.pos.lon];
  satMarker.setLatLng(ll); swath.setLatLng(ll);
  // Keep the satellite in view. Earth turns under the orbit, so each pass is ~25° further west.
  if ($('followToggle').checked && s.launched) map.panTo(ll, { animate: false });
  let tr = tracks[tracks.length - 1];
  const pts = tr.getLatLngs();
  if (pts.length && Math.abs(pts[pts.length - 1].lng - s.pos.lon) > 180) {
    tr = newTrack(); tracks.push(tr);
    if (tracks.length > 6) map.removeLayer(tracks.shift()); // keep the last few orbits
  }
  tr.addLatLng(ll);

  for (; logCount < s.events.length; logCount++) {
    const e = s.events[logCount], li = document.createElement('li');
    li.className = e.type;
    li.textContent = `[${fmtT(e.t)}] ${e.msg}`;
    $('log').prepend(li);
    const hit = HOTSPOTS.find(h => e.msg.includes(h.name));
    if (hit && e.type === 'ok') hotMarkers[hit.id].setStyle({ fillColor: '#7ee0a1' });
  }
  while ($('log').children.length > 200) $('log').lastChild.remove();
}

function renderHistory() {
  $('history').innerHTML = '';
  readHistory().slice(0, 5).forEach(r => {
    const li = document.createElement('li');
    li.textContent = `${new Date(r.at).toLocaleString()}: ${r.mission}, score ${r.score}, ${r.detections} detections${r.failed ? ' (failed)' : ''}`;
    $('history').appendChild(li);
  });
}

function frame(now) {
  if (!playing) return;
  const realDt = Math.min(0.25, (now - lastFrame) / 1000);
  lastFrame = now;
  let remaining = realDt * +$('speed').value;
  while (remaining > 0 && !sim.done) { const dt = Math.min(STEP_S, remaining); stepSim(sim, dt); remaining -= dt; }
  render();
  if (now - lastSave > 2000) { saveState(); lastSave = now; }
  if (sim.done) return finish();
  requestAnimationFrame(frame);
}

function finish() {
  playing = false;
  $('playBtn').textContent = '▶ Play';
  $('playBtn').disabled = true;
  saveResult();
  renderHistory();
  $('status').textContent = sim.failed ? `Mission failed: ${sim.failed}` : `Mission complete. Final score ${scoreSim(sim)} / 100. Saved to this browser.`;
}

// ---------- launch site & weather ----------
let launch = null; // { site, weather, judge }
try { launch = JSON.parse(localStorage.getItem(LAUNCH_KEY)); } catch { /* ignore */ }
$('site').innerHTML = LAUNCH_SITES.map(s => `<option value="${s.id}">${s.name}</option>`).join('') + '<option value="custom">Custom (click map)</option>';
const siteMarker = L.marker([0, 0], {
  title: 'Launch site',
  icon: L.divIcon({ html: '📍', className: 'site-pin', iconSize: [24, 24], iconAnchor: [12, 22] })
});
let chosen = launch ? launch.site : LAUNCH_SITES[0];
$('site').value = LAUNCH_SITES.some(s => s.id === chosen.id) ? chosen.id : 'custom';

function showSite() {
  siteMarker.setLatLng([chosen.lat, chosen.lon]).bindTooltip(`🚀 ${chosen.name}`).addTo(map);
  $('wLoc').textContent = `${chosen.name} (${fmtLL(chosen)})`;
}
function showWeather() {
  if (!launch || launch.site.id !== chosen.id || launch.site.lat !== chosen.lat) {
    ['wSrc', 'wCloud', 'wStorm', 'wWind', 'wVerdict'].forEach(id => { $(id).textContent = '—'; $(id).className = ''; });
    $('wReasons').textContent = 'Check the weather before launching.';
    return;
  }
  const w = launch.weather, j = launch.judge;
  $('wSrc').textContent = w.source;
  $('wCloud').textContent = `${Math.round(w.cloud * 100)}%`;
  $('wStorm').textContent = w.storm ? '⚡ Yes' : 'No';
  $('wWind').textContent = `${w.wind} m/s`;
  $('wVerdict').textContent = `${j.verdict} (failure risk ${Math.round(j.risk * 100)}%)`;
  $('wVerdict').className = j.verdict === 'GO' ? 'ok' : j.verdict === 'HOLD' ? 'warn' : 'bad';
  $('wReasons').textContent = j.reasons.join('. ') + '.';
}

$('site').onchange = e => {
  if (e.target.value !== 'custom') chosen = LAUNCH_SITES.find(s => s.id === e.target.value);
  showSite(); showWeather();
};
map.on('click', e => {
  if (sim && sim.launched) return; // site is locked once the rocket has launched
  chosen = { id: 'custom', name: 'Custom site', lat: +e.latlng.lat.toFixed(2), lon: +wrapLon(e.latlng.lng).toFixed(2) };
  $('site').value = 'custom';
  showSite(); showWeather();
});
$('weatherBtn').onclick = async () => {
  $('weatherBtn').disabled = true; $('wReasons').textContent = 'Reading NASA GIBS imagery…';
  const weather = await readWeather(chosen.lat, chosen.lon);
  launch = { site: chosen, weather, judge: judgeWeather(weather), checkedAt: new Date().toISOString() };
  localStorage.setItem(LAUNCH_KEY, JSON.stringify(launch));
  $('weatherBtn').disabled = false;
  showWeather();
};

// Launch attempt at the start of the mission: weather decides delay or failure.
function attemptLaunch() {
  if (!launch || launch.site.id !== chosen.id || launch.site.lat !== chosen.lat) {
    $('status').textContent = 'Check the launch weather first.'; return false;
  }
  const j = launch.judge;
  if (j.verdict === 'NO-GO' && !confirm(`Weather is NO-GO: ${j.reasons.join(', ')}.\nLaunch anyway? (${Math.round(j.risk * 100)}% failure risk)`)) return false;
  sim.launched = true;
  sim.startMs = Date.now() + (j.verdict === 'HOLD' ? 2 * 3600e3 : 0);
  sim.orbit.lonOffset = chosen.lon; // first ground track passes over the launch site
  sim.events.push({ t: 0, type: j.verdict === 'GO' ? 'ok' : 'warn', msg: `Launch from ${chosen.name}: weather ${j.verdict}${j.verdict === 'HOLD' ? ' (2 h hold)' : ''}.` });
  if (Math.random() < j.risk) {
    sim.done = true;
    sim.failed = `Launch failure from ${chosen.name} in ${j.verdict} weather (${j.reasons.join(', ')}).`;
    sim.events.push({ t: 0, type: 'bad', msg: sim.failed });
    render(); finish(); return false;
  }
  $('site').disabled = $('weatherBtn').disabled = true;
  return true;
}

$('playBtn').onclick = () => {
  if (!playing && !sim.launched && !attemptLaunch()) return;
  playing = !playing;
  $('playBtn').textContent = playing ? '❚❚ Pause' : '▶ Play';
  if (playing) { lastFrame = performance.now(); requestAnimationFrame(frame); } else saveState();
};

const nasa = { flux: {}, cloud: {} };
function start(resume) {
  playing = false;
  $('playBtn').textContent = '▶ Play';
  $('playBtn').disabled = false;
  $('log').innerHTML = ''; logCount = 0;
  tracks.forEach(t => map.removeLayer(t)); tracks = [newTrack()];
  HOTSPOTS.forEach(h => hotMarkers[h.id].setStyle({ fillColor: '#ff8a8a' }));
  sim = newSim(design, nasa.flux, nasa.cloud);
  if (resume) Object.assign(sim, resume, { fluxById: nasa.flux, cloudById: nasa.cloud });
  $('site').disabled = $('weatherBtn').disabled = !!sim.launched;
  showSite(); showWeather();
  render();
  if (sim.done) finish();
}
$('restartBtn').onclick = () => { localStorage.removeItem(STATE_KEY); start(null); $('status').textContent = 'Restarted. Press Play.'; };
window.addEventListener('beforeunload', saveState);

// ---------- boot: fetch NASA data (cached in localStorage), then start ----------
(async () => {
  let fluxOk = 0, cloudOk = 0;
  await Promise.all(HOTSPOTS.map(async h => {
    try { nasa.flux[h.id] = await fetchFlux(h); fluxOk++; } catch { /* default flux used */ }
    const c = await fetchCloud(h);
    if (c != null) { nasa.cloud[h.id] = c; cloudOk++; }
  }));
  HOTSPOTS.forEach(h => {
    const f = nasa.flux[h.id], c = nasa.cloud[h.id];
    hotMarkers[h.id].setTooltipContent(`${h.name}<br>Flux: ${f ? f.total.toFixed(1) + ' g/m²/yr' : 'n/a'}<br>Cloud: ${c != null ? Math.round(c * 100) + '%' : 'n/a'}`);
  });
  const resume = loadState();
  start(resume);
  renderHistory();
  $('status').textContent = `NASA data loaded: methane flux for ${fluxOk}/${HOTSPOTS.length} hotspots (${FLUX_MONTH.slice(0, 4)}-${FLUX_MONTH.slice(4)}), cloud cover for ${cloudOk}/${HOTSPOTS.length} (${GIBS_DATE}). `
    + (resume ? 'Resumed your saved run. ' : '') + 'Press Play.';
})();
