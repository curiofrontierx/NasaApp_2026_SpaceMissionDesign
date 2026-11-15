// My Designs: named designs saved in the browser (localStorage). Works on GitHub Pages.
// Uses $, readForm, applyForm, checkWeather, toast and money from design.js.
const LIBRARY_KEY = 'cfx.designLibrary.v1';

const readLibrary = () => {
  try { const l = JSON.parse(localStorage.getItem(LIBRARY_KEY)); return Array.isArray(l) ? l : []; } catch { return []; }
};
const writeLibrary = lib => localStorage.setItem(LIBRARY_KEY, JSON.stringify(lib));
const designCost = d => Object.keys(OPTIONS).reduce((sum, k) => sum + ((OPTIONS[k].find(o => o.id === d[k]) || {}).cost || 0), 0);

function renderLibrary() {
  const lib = readLibrary(), el = $('library');
  el.innerHTML = '';
  if (!lib.length) { el.innerHTML = '<p class="muted">No saved designs yet.</p>'; return; }
  for (const entry of lib) {
    const row = document.createElement('div');
    row.className = 'part';
    const head = document.createElement('div');
    head.className = 'part-head';
    const name = document.createElement('span');
    name.textContent = entry.name;
    const info = document.createElement('span');
    info.className = 'muted';
    info.textContent = money(designCost(entry.design));
    head.append(name, info);
    const when = document.createElement('p');
    when.className = 'muted';
    when.textContent = `Saved ${new Date(entry.savedAt).toLocaleString()}`;
    const load = Object.assign(document.createElement('button'), { textContent: 'Load', className: 'secondary' });
    load.onclick = () => { applyForm({ ...entry.design, missionName: entry.name }); checkWeather(); toast(`Loaded "${entry.name}".`); };
    const del = Object.assign(document.createElement('button'), { textContent: 'Delete', className: 'secondary' });
    del.onclick = () => {
      if (!confirm(`Delete "${entry.name}"?`)) return;
      writeLibrary(readLibrary().filter(e => e.name !== entry.name));
      renderLibrary();
    };
    row.append(head, when, load, del);
    el.appendChild(row);
  }
}

// Saving uses the mission name; saving again with the same name replaces it.
$('saveNamedBtn').onclick = () => {
  const { missionName, ...design } = readForm();
  const lib = readLibrary();
  const exists = lib.some(e => e.name === missionName);
  if (exists && !confirm(`A design named "${missionName}" already exists. Replace it?`)) return;
  writeLibrary([{ name: missionName, design, savedAt: new Date().toISOString() }, ...lib.filter(e => e.name !== missionName)]);
  renderLibrary();
  toast(`Saved "${missionName}". Change the mission name to save another design.`);
};

renderLibrary();
