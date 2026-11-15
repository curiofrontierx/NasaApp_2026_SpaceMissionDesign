// Simulation engine (no DOM): part specs, orbit, power, detection and downlink.
// Specs come from the parts catalog; solar array, bus load and swath are game assumptions.
const SOLAR_W = 30, BUS_W = 3, SWATH_KM = 350, STATION_KM = 2200, REVISIT_S = 4 * 3600;
// Detector scheduling: full power only within TARGET_KM of a hotspot, otherwise standby.
const TARGET_KM = 1500, STANDBY = 0.1;
// Safe mode ends only once the battery has recharged to this fraction (prevents rapid on/off cycling).
const RECOVER_AT = 0.8;
const MISSION_DAYS = 30, RE = 6371, MU = 398600.4418;

const SPECS = {
  battery: {
    nicd: { wh: 20, life: 1 }, nih2: { wh: 50, life: 5 }, liion40: { wh: 40, life: 4 }, liion100: { wh: 100, life: 6 },
    solid: { wh: 150, life: 6, failRisk: 0.15 }, ves: { wh: 1000, life: 12 }, rtg: { wh: 200, life: 20, constantW: 100 }
  },
  thruster: {
    coldgas: { eff: 0.25, life: 2, polar: false }, resistojet: { eff: 0.4, life: 3, polar: true, w: 6 },
    hydrazine: { eff: 0.6, life: 3, polar: true }, ascent: { eff: 0.75, life: 5, polar: true },
    electrospray: { eff: 0.85, life: 10, polar: true }, dualmode: { eff: 0.92, life: 10, polar: true }, hall: { eff: 1, life: 10, polar: true, w: 10 }
  },
  storage: {
    a3200: { mb: 128, w: 0.9 }, kryten: { mb: 4096, w: 0.4 }, cfc400: { mb: 16384, w: 6.3 }, rh3480: { mb: 480000, w: 25 },
    simplistor: { mb: 2.5e6, w: 25 }, spacestor: { mb: 3.97e6, w: 15 }, moog: { mb: 1e7, w: 45 }
  },
  transmitter: {
    uhf: { mbps: 0.0196, w: 5.5 }, sband: { mbps: 0.125, w: 11 }, srs4: { mbps: 10, w: 13 }, ewc27: { mbps: 120, w: 10 },
    xband: { mbps: 150, w: 18 }, xlink: { mbps: 200, w: 15 }, ewc34: { mbps: 600, w: 22 }, cubelct: { mbps: 100, w: 9, laser: true },
    xsdr: { mbps: 1000, w: 30 }, scot80: { mbps: 10000, w: 70, laser: true }
  },
  detector: {
    nir: { eff: 0.25, w: 2, sun: true, mb: 20 }, swir: { eff: 0.6, w: 5, sun: true, mb: 60 }, mwir: { eff: 0.65, w: 8, mb: 40 },
    lwir: { eff: 0.75, w: 12, mb: 50 }, zoom: { eff: 0.9, w: 10, sun: true, mb: 120 }, lidar: { eff: 1, w: 35, mb: 80, active: true }
  }
};

const GROUND_STATIONS = [
  { name: 'Svalbard', lat: 78.2, lon: 15.4 }, { name: 'Fairbanks', lat: 64.8, lon: -147.7 },
  { name: 'Wallops', lat: 37.9, lon: -75.5 }, { name: 'McMurdo', lat: -77.8, lon: 166.7 }
];

const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
const wrapLon = l => ((l + 540) % 360) - 180;

function distKm(a, b) {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * RE * Math.asin(Math.sqrt(h));
}

// Sun is above the horizon at (lat, lon) for the given UTC time.
function isDay(p, ms) {
  const d = new Date(ms), doy = (ms - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5;
  const sLat = 23.44 * Math.sin(rad(360 * (doy - 81) / 365));
  const sLon = (12 - (d.getUTCHours() + d.getUTCMinutes() / 60)) * 15;
  return Math.sin(rad(p.lat)) * Math.sin(rad(sLat)) + Math.cos(rad(p.lat)) * Math.cos(rad(sLat)) * Math.cos(rad(p.lon - sLon)) > 0;
}

// Circular orbit: polar sun-synchronous if the thruster can reach it, otherwise ISS-like.
function makeOrbit(cfg) {
  const polar = SPECS.thruster[cfg.thruster].polar;
  const alt = polar ? 700 : 420, a = RE + alt;
  return { polar, alt, inc: polar ? 98.2 : 51.6, period: 2 * Math.PI * Math.sqrt(a ** 3 / MU) };
}

function subPoint(o, t) {
  const u = 2 * Math.PI * t / o.period, i = rad(o.inc);
  const lat = deg(Math.asin(Math.sin(i) * Math.sin(u)));
  const lon = wrapLon(deg(Math.atan2(Math.cos(i) * Math.sin(u), Math.cos(u))) + (o.lonOffset ?? -100) - 360 * t / 86164);
  return { lat, lon };
}

// Applies the catalog's game restrictions. Returns modifiers plus warnings for the log.
function applyRules(cfg) {
  const b = cfg.battery, th = cfg.thruster, det = cfg.detector, warn = [];
  const m = { battMax: SPECS.battery[b].wh, point: 1, extraW: SPECS.thruster[th].w || 0, failed: null };
  if (b === 'nicd' && ['lwir', 'lidar'].includes(det)) m.failed = 'Vintage NiCd pack cannot feed a high-draw sensor. Power system failed at launch.';
  if (th === 'resistojet' && ['liion40', 'nicd'].includes(b)) { m.extraW += 8; warn.push('Resistojet is stealing battery power: brownout risk.'); }
  if (th === 'coldgas') { warn.push('Cold gas cannot reach polar orbit: high-latitude hotspots are out of reach.'); if (det === 'zoom') m.point *= 0.5; }
  if (b === 'ves' && SPECS.thruster[th].eff < 0.6) { m.point *= 0.7; warn.push('6.5 kg VES battery is too heavy for this thruster: pointing suffers.'); }
  if (th === 'electrospray' && b === 'ves') { m.point *= 0.8; warn.push('Electrospray slews a >3 kg satellite slowly.'); }
  if (b === 'solid' && Math.random() < SPECS.battery.solid.failRisk) { m.battMax *= 0.5; warn.push('Solid-state prototype lost cells in orbit: capacity halved.'); }
  return { m, warn };
}

// Creates the starting simulation state for a design.
function newSim(cfg, fluxById, cloudById) {
  const { m, warn } = applyRules(cfg);
  return {
    cfg, m, orbit: makeOrbit(cfg), t: 0, startMs: Date.now(), battWh: m.battMax,
    storedMb: 0, downMb: 0, lostMb: 0, brownouts: 0, detections: 0, methaneT: 0, misses: 0,
    lastSeen: {}, fluxById, cloudById, events: warn.map(w => ({ t: 0, type: 'warn', msg: w })),
    done: !!m.failed, failed: m.failed, sun: true, contact: null, pos: { lat: 0, lon: 0 }
  };
}

// Advances the simulation by dt seconds of mission time.
function stepSim(s, dt) {
  if (s.done) return;
  const sp = SPECS, c = s.cfg, bat = sp.battery[c.battery], det = sp.detector[c.detector], tx = sp.transmitter[c.transmitter];
  s.t += dt;
  const ms = s.startMs + s.t * 1000;
  s.pos = subPoint(s.orbit, s.t);
  s.sun = isDay(s.pos, ms);

  // Power: solar in daylight (or RTG), minus bus + storage + thruster + detector + transmitter.
  const station = GROUND_STATIONS.find(g => distKm(s.pos, g) < STATION_KM);
  s.contact = station ? station.name : null;
  // Safe mode (s.dark): only the bus and storage draw power until the battery recovers to RECOVER_AT.
  // The detector is scheduled: full power near a hotspot, standby elsewhere.
  s.targeting = HOTSPOTS.some(h => distKm(s.pos, h) < TARGET_KM);
  const core = BUS_W + sp.storage[c.storage].w * 0.3;
  const detW = det.w * (s.targeting ? 1 : STANDBY);
  const load = s.dark ? core : core + s.m.extraW + detW + (station ? tx.w : 0);
  const gen = bat.constantW || (s.sun ? SOLAR_W : 0);
  s.netW = +(gen - load).toFixed(1);
  s.battWh = Math.max(0, Math.min(s.m.battMax, s.battWh + (gen - load) * dt / 3600));
  if (!s.dark && s.battWh <= 0) {
    s.dark = true; s.brownouts++;
    s.events.push({ t: s.t, type: 'bad', msg: 'Brownout: battery empty, instruments in safe mode.' });
  } else if (s.dark && s.battWh >= s.m.battMax * RECOVER_AT) {
    s.dark = false;
    s.events.push({ t: s.t, type: 'ok', msg: 'Battery recovered: instruments back online.' });
  }
  const powered = !s.dark;

  // Detection: hotspot in swath, revisit window passed, instrument can see.
  if (powered) {
    for (const h of HOTSPOTS) {
      if (distKm(s.pos, h) > SWATH_KM / 2 || (s.lastSeen[h.id] && s.t - s.lastSeen[h.id] < REVISIT_S)) continue;
      s.lastSeen[h.id] = s.t;
      const cloud = s.cloudById[h.id] ?? Math.random() * 0.7;
      const flux = (s.fluxById[h.id] && s.fluxById[h.id].total) || 5;
      let p = det.eff * s.m.point;
      if (det.sun && !s.sun) p = 0;
      if (!det.active) p *= 1 - cloud * (det.sun ? 1 : 0.5);
      const ok = Math.random() < p;
      const label = `${h.name} (cloud ${Math.round(cloud * 100)}%, flux ${flux.toFixed(1)} g/m²/yr)`;
      if (!ok) { s.misses++; s.events.push({ t: s.t, type: 'warn', msg: `Missed ${label}${det.sun && !s.sun ? ' — night side' : ''}.` }); continue; }
      const space = sp.storage[c.storage].mb - s.storedMb;
      if (space < det.mb) { s.lostMb += det.mb; s.events.push({ t: s.t, type: 'bad', msg: `Storage full: lost data over ${h.name}.` }); continue; }
      s.storedMb += det.mb; s.detections++; s.methaneT += flux;
      s.events.push({ t: s.t, type: 'ok', msg: `Detected methane at ${label}.` });
    }
  }

  // Downlink over a ground station. Laser links lose time to clouds.
  if (powered && station && s.storedMb > 0) {
    const mb = Math.min(s.storedMb, tx.mbps / 8 * dt * (tx.laser ? 0.5 : 1));
    s.storedMb -= mb; s.downMb += mb;
  }

  if (s.t >= MISSION_DAYS * 86400) { s.done = true; s.events.push({ t: s.t, type: 'ok', msg: 'Mission complete.' }); }
}

// Final 0–100 score: detections, downlinked share, reliability.
function scoreSim(s) {
  if (s.failed) return 0;
  const tries = s.detections + s.misses || 1;
  const delivered = s.downMb / (s.downMb + s.storedMb + s.lostMb || 1);
  return Math.round(100 * (0.5 * s.detections / tries + 0.35 * delivered + 0.15 * Math.max(0, 1 - s.brownouts / 20)));
}
