// Design Configuration: player hardware choices, validated and persisted in localStorage.
const STORAGE_KEY = 'cfx.design.v1';
// BUDGET, OPTIONS, LABELS and DEFAULTS come from assets/parts.js.
const SIM_PAGE = 'simulation.html'; // simulation page (built by a teammate)

const $ = id => document.getElementById(id);
const find = (key, id) => OPTIONS[key].find(o => o.id === id);
const money = n => '$' + n.toLocaleString('en-US');

for (const key of Object.keys(OPTIONS)) {
  $(key).innerHTML = OPTIONS[key]
    .map(o => `<option value="${o.id}">${o.name} (${money(o.cost)})</option>`).join('');
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
    price.textContent = money(p.cost);
    head.append(name, price);
    const desc = document.createElement('p');
    desc.className = 'muted';
    desc.textContent = p.desc;
    div.append(head, desc);
    $('parts').appendChild(div);
  }
}

function toast(msg) { $('toast').textContent = msg; setTimeout(() => { $('toast').textContent = ''; }, 3000); }

function saveDesign() {
  const cfg = readForm();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cfg, savedAt: new Date().toISOString() }));
  return cfg;
}

$('saveBtn').onclick = () => toast(`Saved "${saveDesign().missionName}".`);

// The simulation page reads the saved design from localStorage (key: STORAGE_KEY).
$('simulateBtn').onclick = () => {
  const cost = selectedParts(readForm()).reduce((sum, p) => sum + p.cost, 0);
  if (cost > BUDGET) { toast(`Over budget by ${money(cost - BUDGET)}. Adjust your parts before simulating.`); return; }
  saveDesign();
  location.href = SIM_PAGE;
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
