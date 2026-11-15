/* =========================================================================
   Mission: Blue Marble — Simulation page configuration
   simulation.html is the gameplay. design.html hands the satellite design in
   and feedback.html receives the results, through localStorage
   (see simulation/HANDOFF.md).
   ========================================================================= */

// Relative to simulation.html (same folder as design.html).
const PAGES = {
  start: 'index.html',
  design: 'design.html',
  nasaData: 'nasa-data.html',
  feedback: 'feedback.html',   // "End round" goes here
  results: 'feedback.html',    // final results go here when the game ends
};

const STORE = {
  design: 'cfx.design.v1',     // read:  satellite design saved by design.html (assets/design.js)
  config: 'mbm.config',        // read:  optional game setup (length, difficulty, funds)
  save: 'mbm.sim.save',        // read/write: full simulation save (continue after a Feedback round)
  decisions: 'mbm.decisions',  // write: decision log with before/after explanations (Feedback page)
  round: 'mbm.round',          // write: summary of the round that just ended (Feedback page)
  results: 'mbm.results',      // write: final results when the game ends (feedback.html)
  nasaKey: 'mbm.nasaKey',      // read:  api.nasa.gov key (shared with the NASA Data Configuration page)
};

// Defaults used when a teammate page has not saved a config yet.
const DEFAULT_CONFIG = {
  agencyName: 'Blue Marble Space Agency',
  playerName: 'Director',
  durationYears: 25,          // 10, 25, 50 or 100
  difficulty: 'director',     // 'cadet' | 'director' | 'crisis'
  startFunds: 1500000,        // USD
  annualBudget: 900000,       // USD per year before trust modifier
  startDate: '2027-01-01T00:00:00Z',
  roundLengthMonths: 12,      // "End round" suggestion interval for the Feedback page
};

const DIFFICULTY = {
  cadet:    { warmingRate: 0.016, leakRate: 0.7, fundMult: 1.3, eventRate: 0.6 },
  director: { warmingRate: 0.022, leakRate: 1.0, fundMult: 1.0, eventRate: 1.0 },
  crisis:   { warmingRate: 0.030, leakRate: 1.5, fundMult: 0.7, eventRate: 1.6 },
};

function safeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function safeSet(key, val) { try { localStorage.setItem(key, val); return true; } catch { return false; } }
function safeDel(key) { try { localStorage.removeItem(key); } catch { /* blocked */ } }

function loadConfig() {
  let cfg = {};
  try { cfg = JSON.parse(safeGet(STORE.config) || '{}') || {}; } catch { cfg = {}; }
  const params = new URLSearchParams(location.search);
  if (params.get('years')) cfg.durationYears = +params.get('years');
  if (params.get('difficulty')) cfg.difficulty = params.get('difficulty');
  const out = { ...DEFAULT_CONFIG, ...cfg };
  if (!DIFFICULTY[out.difficulty]) out.difficulty = 'director';
  return out;
}

function nasaKey() { return safeGet(STORE.nasaKey) || 'DEMO_KEY'; }
