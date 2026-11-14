// Design Configuration: player hardware choices, validated and persisted in localStorage.
const STORAGE_KEY = 'cfx.design.v1';
const BUDGET = 150;   // $M
const BUS_MASS = 150; // kg (structure / bus)
const OPTIONS = {
  engine: [
    { id: 'small',  name: 'Small solid booster',  cost: 25, maxMass: 400 },
    { id: 'medium', name: 'Medium liquid engine', cost: 45, maxMass: 900 },
    { id: 'heavy',  name: 'Heavy-lift engine',    cost: 80, maxMass: 2000 }
  ],
  battery: [
    { id: 'liion',  name: 'Li-ion 2 kWh',      cost: 4,  mass: 30, power: 120 },
    { id: 'liion2', name: 'Li-ion 5 kWh',      cost: 8,  mass: 60, power: 260 },
    { id: 'solid',  name: 'Solid-state 8 kWh', cost: 15, mass: 55, power: 420 }
  ],
  instrument: [
    { id: 'swir',  name: 'SWIR spectrometer (passive)', cost: 30, mass: 180, power: 150, score: 60, needsSun: true },
    { id: 'lidar', name: 'Active LIDAR',                cost: 55, mass: 320, power: 380, score: 85, needsSun: false },
    { id: 'both',  name: 'SWIR + LIDAR suite',          cost: 80, mass: 500, power: 530, score: 95, needsSun: false }
  ],
  orbit: [
    { id: 'leo400', name: 'LEO 400 km',             massFactor: 1.0, scoreBonus: 10,  radiation: 1 },
    { id: 'sso700', name: 'Sun-synchronous 700 km', massFactor: 1.2, scoreBonus: 15,  radiation: 2 },
    { id: 'meo',    name: 'MEO 2000 km',            massFactor: 1.6, scoreBonus: -10, radiation: 3 }
  ]
};
const DEFAULTS = { missionName: 'MethaneWatch-1', engine: 'medium', battery: 'liion2', instrument: 'swir', orbit: 'sso700', shielding: false };

const $ = id => document.getElementById(id);
const find = (key, id) => OPTIONS[key].find(o => o.id === id);

for (const key of Object.keys(OPTIONS)) {
  $(key).innerHTML = OPTIONS[key]
    .map(o => `<option value="${o.id}">${o.name}${o.cost ? ` ($${o.cost}M)` : ''}</option>`).join('');
  $(key).addEventListener('change', update);
}
$('shielding').addEventListener('change', update);
$('missionName').addEventListener('input', update);

function readForm() {
  return {
    missionName: $('missionName').value.trim() || DEFAULTS.missionName,
    engine: $('engine').value, battery: $('battery').value,
    instrument: $('instrument').value, orbit: $('orbit').value,
    shielding: $('shielding').checked
  };
}

function applyForm(cfg) {
  const c = { ...DEFAULTS, ...cfg };
  for (const key of Object.keys(OPTIONS)) $(key).value = find(key, c[key]) ? c[key] : DEFAULTS[key];
  $('missionName').value = String(c.missionName).slice(0, 40);
  $('shielding').checked = !!c.shielding;
  update();
}

function evaluate(cfg) {
  const e = find('engine', cfg.engine), b = find('battery', cfg.battery);
  const i = find('instrument', cfg.instrument), o = find('orbit', cfg.orbit);
  const cost = e.cost + b.cost + i.cost + (cfg.shielding ? 8 : 0);
  const mass = BUS_MASS + b.mass + i.mass + (cfg.shielding ? 40 : 0);
  const capacity = Math.round(e.maxMass / o.massFactor);
  const powerBalance = b.power - i.power;
  const issues = [];
  if (cost > BUDGET) issues.push(`Over budget by $${cost - BUDGET}M.`);
  if (mass > capacity) issues.push(`Payload ${mass} kg exceeds launch capacity ${capacity} kg for this orbit.`);
  if (powerBalance < 0) issues.push(`Battery cannot power instrument (deficit ${-powerBalance} W).`);
  let score = i.score + o.scoreBonus;
  if (o.radiation >= 2 && !cfg.shielding) {
    score -= 15 * (o.radiation - 1);
    issues.push('Unshielded electronics degrade in this radiation environment.');
  }
  if (i.needsSun) issues.push('Note: SWIR is passive — no detection on the night side or under clouds.');
  score = Math.max(0, Math.min(100, score));
  const valid = cost <= BUDGET && mass <= capacity && powerBalance >= 0;
  return { cost, mass, capacity, powerBalance, score, issues, valid };
}

function update() {
  const r = evaluate(readForm());
  $('costText').textContent = `$${r.cost}M / $${BUDGET}M`;
  $('costText').className = r.cost > BUDGET ? 'bad' : 'ok';
  $('costBar').style.width = Math.min(100, r.cost / BUDGET * 100) + '%';
  $('massText').textContent = `${r.mass} kg / ${r.capacity} kg`;
  $('massText').className = r.mass > r.capacity ? 'bad' : 'ok';
  $('massBar').style.width = Math.min(100, r.mass / r.capacity * 100) + '%';
  $('powerText').textContent = `${r.powerBalance >= 0 ? '+' : ''}${r.powerBalance} W`;
  $('powerText').className = r.powerBalance < 0 ? 'bad' : 'ok';
  $('scoreText').textContent = `${r.score} / 100`;
  $('statusText').textContent = r.valid ? 'Ready for launch' : 'Not launchable';
  $('statusText').className = r.valid ? 'ok' : 'bad';
  $('issues').innerHTML = '';
  r.issues.forEach(t => { const li = document.createElement('li'); li.textContent = t; $('issues').appendChild(li); });
}

function toast(msg) { $('toast').textContent = msg; setTimeout(() => { $('toast').textContent = ''; }, 3000); }

$('saveBtn').onclick = () => {
  const cfg = readForm();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cfg, savedAt: new Date().toISOString() }));
  toast(`Saved "${cfg.missionName}".`);
};
$('resetBtn').onclick = () => { localStorage.removeItem(STORAGE_KEY); applyForm(DEFAULTS); toast('Reset to defaults.'); };
$('exportBtn').onclick = () => {
  const cfg = readForm();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' }));
  a.download = `${cfg.missionName.replace(/\W+/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};
$('importFile').onchange = async ev => {
  const file = ev.target.files[0];
  if (!file) return;
  try { applyForm(JSON.parse(await file.text())); toast('Imported — click Save to keep it.'); }
  catch { toast('Invalid JSON file.'); }
};

let saved = null;
try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { /* corrupt data: ignore */ }
applyForm(saved || DEFAULTS);
if (saved && saved.savedAt) toast(`Loaded saved design from ${new Date(saved.savedAt).toLocaleString()}.`);
