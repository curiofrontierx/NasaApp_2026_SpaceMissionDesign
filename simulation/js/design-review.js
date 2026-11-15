/* =========================================================================
   Satellite design review for the mission report (pure, no DOM).
   For each design that flew (or the current design if none flew): what went
   wrong in orbit, what went well, and which part swaps would have helped.
   ========================================================================= */

const DESIGN_REVIEW = (() => {
  const YEAR_MS = 365.25 * 86400000;
  // the parts offered on the Design page (assets/parts.js), as simulation catalog ids
  const CHOICES = {
    battery: ['nicd', 'nih2', 'li40', 'li100', 'solid', 'ves'],
    engine: ['cold', 'resisto', 'hydrazine', 'ascent', 'espray', 'dual', 'hall'],
    storage: ['nanomind', 'kryten', 'cfc400', 'rh3480', 'simplistor', 'spacestor'],
    comms: ['uhf', 'sband', 'srs4', 'ewc27', 'xband', 'xlink', 'ewc34', 'cubelct', 'xsdr'],
    detector: ['swir', 'mwir', 'lwir', 'zoom', 'lidar'],
  };
  const name = id => (ALL_PARTS[id] && ALL_PARTS[id].name) || id;
  const usd = n => '$' + Math.round(n).toLocaleString('en-US');

  // cheapest swap in one category that passes test(comp) without creating a design failure
  function swap(parts, cat, test) {
    const cur = Object.keys(parts).find(id => ALL_PARTS[id] && ALL_PARTS[id].cat === cat);
    const base = DESIGN.compute(parts);
    let best = null;
    for (const id of CHOICES[cat] || []) {
      if (id === cur) continue;
      const p = { ...parts }; if (cur) delete p[cur]; p[id] = 1;
      const c = DESIGN.compute(p);
      if (c.issues.some(i => i.level === 'fail') || !test(c, ALL_PARTS[id])) continue;
      if (!best || c.partsCost < best.c.partsCost) best = { id, c };
    }
    if (!best) return '';
    const d = best.c.partsCost - base.partsCost;
    return `${cur ? `Swap ${name(cur)} for` : 'Add'} <b>${name(best.id)}</b> (${d >= 0 ? '+' : '−'}${usd(Math.abs(d))}).`;
  }

  function review(design, sats, S, launchFails) {
    const parts = design.parts, c = DESIGN.compute(parts);
    const out = [];
    const add = (level, area, what, fix) => out.push({ level, area, what, fix: fix || '' });
    const now = S.t, missionY = S.cfg.durationYears;
    const yrs = s => Math.max(0.01, ((s.endT || now) - s.launched) / YEAR_MS);
    const satYears = sats.reduce((a, s) => a + yrs(s), 0);
    const det = sats.reduce((a, s) => a + (s.stats.detections || 0), 0);
    const down = sats.reduce((a, s) => a + (s.stats.downMB || 0), 0), lost = sats.reduce((a, s) => a + (s.stats.lostMB || 0), 0);
    const flown = sats.length > 0;
    const methDet = c.detectors.filter(d => d.methane);

    // ---- detector ----
    if (!methDet.length) add('bad', 'Detector', 'No instrument on board can see methane, so the satellite could not find leaks.', swap(parts, 'detector', x => x.hasMethane));
    else if (flown) {
      const rate = det / Math.max(0.1, satYears);
      const d0 = methDet[0];
      if (rate < 15) add('bad', 'Detector', `Only ${rate.toFixed(0)} leaks reported per satellite-year with the ${d0.name} (it sees leaks above ${d0.threshold} kg/h, ${d0.eff}% detection chance${d0.cloud >= 0.9 ? ', blocked by clouds' : ''}${d0.types ? ', only at oil & gas, coal and landfill sites' : ''}).`,
        swap(parts, 'detector', (x, p) => p.methane && p.eff > d0.eff && p.threshold <= d0.threshold));
      else add('good', 'Detector', `The ${d0.name} reported ${rate.toFixed(0)} leaks per satellite-year.`);
    }
    // ---- power ----
    const browned = sats.filter(s => (s.brownouts || 0) > 3).length;
    if (c.genAvg < c.avgLoad) add('bad', 'Power', `The solar arrays make ${c.genAvg.toFixed(0)} W but the parts need ${c.avgLoad.toFixed(0)} W: the battery drained every orbit.`, 'Choose lower-power parts (detector or transmitter).');
    else if (browned || (c.usableWh < c.eclipseNeed && !c.rtgW)) add('bad', 'Power', `${browned ? `${browned} of ${sats.length} satellite${sats.length === 1 ? '' : 's'} browned out in Earth's shadow` : 'The battery is too small for Earth\'s shadow'}: the eclipse needs ${c.eclipseNeed.toFixed(0)} Wh but the battery safely gives ${c.usableWh.toFixed(0)} Wh, so instruments were switched off.`,
      swap(parts, 'battery', x => x.usableWh >= x.eclipseNeed));
    else if (flown) add('good', 'Power', `The battery covered every eclipse (${c.usableWh.toFixed(0)} Wh usable, ${c.eclipseNeed.toFixed(0)} Wh needed).`);
    const worn = sats.filter(s => s.status === 'dead' && /battery/.test(s.endWhy || '') || (s.status === 'dead' && s.batteryHealth < 0.3)).length;
    if (worn || (c.batteryLife && c.batteryLife < Math.min(missionY, 5))) add(worn ? 'bad' : 'warn', 'Battery life', `${worn ? `${worn} satellite${worn === 1 ? '' : 's'} died when the battery wore out. ` : ''}The ${c.batteries.map(b => b.name).join(', ')} lasts about ${c.batteryLife} years of charge cycles, in a ${missionY}-year mission.`,
      swap(parts, 'battery', x => x.batteryLife > c.batteryLife && x.usableWh >= x.eclipseNeed));
    // ---- data ----
    const lostPct = lost / Math.max(1, lost + down) * 100;
    if (lostPct > 5) {
      const radioSlow = c.dataPerDay > c.downPerDay;
      add('bad', 'Data', `${lostPct.toFixed(0)}% of observations were thrown away because the recorder was full. ${radioSlow ? `The radio sends ~${DESIGN.fmtMB(c.downPerDay)}/day but the instruments collect ~${DESIGN.fmtMB(c.dataPerDay)}/day.` : `The ${DESIGN.fmtMB(c.storageMB)} recorder fills up between ground-station passes.`}`,
        radioSlow ? swap(parts, 'comms', x => x.downPerDay >= x.dataPerDay * 1.2) : swap(parts, 'storage', x => x.storageMB >= x.dataPerDay * 2));
    } else if (c.dataPerDay > c.downPerDay * 1.2) add('warn', 'Data', `Data bottleneck: ~${DESIGN.fmtMB(c.dataPerDay)}/day collected, ~${DESIGN.fmtMB(c.downPerDay)}/day sent down.`, swap(parts, 'comms', x => x.downPerDay >= x.dataPerDay * 1.2));
    else if (flown) add('good', 'Data', `Almost all data reached the ground (${DESIGN.fmtMB(down)} sent, ${lostPct.toFixed(1)}% lost).`);
    const rad = sats.reduce((a, s) => a + s.faults.filter(f => /[Rr]adiation/.test(f.text)).length, 0);
    if (rad) add('warn', 'Data', `Radiation damaged the data recorder ${rad} time${rad === 1 ? '' : 's'}.`, swap(parts, 'storage', (x, p) => p.rad > Math.min(...x.items.filter(i => i.part.rad).map(i => i.part.rad), 999) || p.rad >= 100));
    // ---- propulsion, pointing, lifetime ----
    if (!c.engines.length) add('bad', 'Propulsion', 'No thrusters: the satellite could not hold its orbit against drag or dodge debris.', swap(parts, 'engine', x => x.dvTotal > 50));
    const noFuel = sats.filter(s => s.outOfFuelLogged).length, fell = sats.filter(s => s.status === 'reentered' && !s.decommissioning).length;
    if (noFuel || fell) add('bad', 'Propulsion', `${noFuel ? `${noFuel} satellite${noFuel === 1 ? '' : 's'} ran out of propellant (${c.dvTotal.toFixed(0)} m/s of Δv). ` : ''}${fell ? `${fell} fell back into the atmosphere early.` : ''}`, swap(parts, 'engine', x => x.dvTotal > c.dvTotal * 1.5));
    if (c.pointing < 0.6 && c.needsFine) add('warn', 'Pointing', `The thrusters can only point the instrument/antenna at about ${(c.pointing * 100).toFixed(0)}% quality, so some looks missed their target.`, swap(parts, 'engine', x => x.pointing >= 0.9));
    if (flown) {
      const life = satYears / sats.length;
      if (life < missionY * 0.6) add('warn', 'Lifetime', `Each satellite worked about ${life.toFixed(1)} years of the ${missionY}-year mission. Longer-lived parts or replacement launches keep the watch going.`);
    }
    if (launchFails) add('warn', 'Launch', `${launchFails} launch${launchFails === 1 ? '' : 'es'} of this design failed.`, 'Dedicated launchers with higher reliability cost more but fail less.');
    sats.forEach(s => s.faults.filter(f => f.part === 'heat' || f.part === 'cold').forEach(f => add('warn', 'Launch', `${s.name}: ${f.text}`, 'Drop the fairing only above ~110 km.')));
    // ---- cost ----
    if (c.partsCost > 260000) add('warn', 'Cost', `Parts cost ${usd(c.partsCost)}, over the $260,000 budget, leaving less money for launches.`);
    if (flown && det) add(det ? 'good' : 'bad', 'Cost', `${usd(c.cost * sats.length / det)} of satellite hardware per leak reported.`);

    const bad = out.filter(f => f.level === 'bad').length;
    return {
      name: design.name, parts: Object.keys(parts).map(id => ({ cat: ALL_PARTS[id] && ALL_PARTS[id].cat, name: name(id) })),
      score: c.score.total, cost: c.cost, mass: +c.mass.toFixed(1), flown: sats.length, detections: det,
      verdict: !flown ? 'untested' : bad === 0 ? 'good' : bad <= 1 ? 'mixed' : 'poor',
      findings: out.sort((a, b) => ({ bad: 0, warn: 1, good: 2 }[a.level] - { bad: 0, warn: 1, good: 2 }[b.level])),
    };
  }

  function build(S) {
    const groups = {};
    const key = p => Object.keys(p).sort().join('+');
    for (const s of S.satellites) {
      const k = key(s.parts);
      (groups[k] = groups[k] || { design: { name: s.name.replace(/-[A-Z]$/, ''), parts: s.parts }, sats: [], fails: 0 }).sats.push(s);
    }
    for (const L of S.launches) if (L.outcome === 'failure') { const k = key(L.parts); (groups[k] = groups[k] || { design: { name: L.designName, parts: L.parts }, sats: [], fails: 0 }).fails++; }
    if (!Object.keys(groups).length && S.current && S.current.parts) groups.x = { design: S.current, sats: [], fails: 0 };
    return Object.values(groups).map(g => { try { return review(g.design, g.sats, S, g.fails); } catch (e) { return null; } }).filter(Boolean);
  }
  return { build };
})();
