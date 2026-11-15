/* =========================================================================
   Mission Control: agency dashboard, climate charts, fleet, money, logs
   ========================================================================= */

const OpsView = (() => {
  let last = 0, built = false;

  function build() {
    built = true;
    $('#ops').innerHTML = `
      <div class="row" style="justify-content:space-between;margin:0"><div><h2 style="font-size:22px" id="ops-title"></h2><div class="fine" style="margin:2px 0 0" id="ops-sub"></div></div>
        <div class="row" style="margin:0"><button class="btn ghost small" id="ops-save">💾 Save now</button><button class="btn ghost small" id="ops-export">⬇ Export results JSON</button><button class="btn small" id="ops-round">🏁 End mission → report</button></div></div>
      <div class="kpis" id="kpis"></div>
      <div class="charts">
        <div class="panel chart"><div class="ttl"><b>Atmospheric methane</b><span id="c1v"></span></div><div class="leg"><span><i style="background:var(--series-1)"></i>Your world</span><span><i style="background:var(--series-2)"></i>No-action world</span></div><canvas id="c1"></canvas></div>
        <div class="panel chart"><div class="ttl"><b>Global warming (°C)</b><span id="c2v"></span></div><div class="leg"><span><i style="background:rgba(255,93,108,.8)"></i>2.0°C danger line</span></div><canvas id="c2"></canvas></div>
        <div class="panel chart"><div class="ttl"><b>Methane emissions (Mt/yr)</b><span id="c3v"></span></div><canvas id="c3"></canvas></div>
        <div class="panel chart"><div class="ttl"><b>Leaks reported & repaired</b><span id="c4v"></span></div><div class="leg"><span><i style="background:var(--series-1)"></i>Reported</span><span><i style="background:var(--series-2)"></i>Repaired</span></div><canvas id="c4"></canvas></div>
        <div class="panel chart"><div class="ttl"><b>Agency funds</b><span id="c5v"></span></div><canvas id="c5"></canvas></div>
        <div class="panel chart"><div class="ttl"><b>Public support (%)</b><span id="c6v"></span></div><canvas id="c6"></canvas></div>
      </div>
      <div class="panel"><h3>Fleet</h3><div class="scrollbox"><table class="tbl" id="fleet-tbl"></table></div></div>
      <div class="two">
        <div class="panel"><h3>Decisions &amp; what they did</h3><div class="scrollbox" id="decisions"></div></div>
        <div class="panel"><h3>Mission log</h3><div class="scrollbox"><ul class="log-list" id="ops-log"></ul></div></div>
      </div>
      <div class="two">
        <div class="panel"><h3>Money in &amp; out</h3><div class="scrollbox"><table class="tbl" id="ledger"></table></div></div>
        <div class="panel"><h3>Monthly data reports</h3>
          <p class="fine" style="margin-top:0">Graded on data volume, leaks found, sites covered and facility-level attribution. Better reports bring bigger grants, more public support and more pressure on regulators in every country they cover.</p>
          <div class="scrollbox"><table class="tbl" id="reports-tbl"></table></div>
        </div>
      </div>`;
    $('#ops-save').onclick = () => { SIM.save() ? UI.toast('Game saved in this browser.', 'good') : UI.toast('Could not save (storage blocked).', 'bad'); };
    $('#ops-export').onclick = () => {
      const blob = new Blob([JSON.stringify(SIM.results('export'), null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'blue-marble-results.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $('#ops-round').onclick = () => $('#btn-round').click();
  }

  function kpi(lbl, val, sub) { return `<div class="panel kpi"><div class="lbl">${lbl}</div><div class="val">${val}</div><div class="sub">${sub || ''}</div></div>`; }

  function render() {
    const S = SIM.state, c = S.climate;
    $('#ops-title').textContent = S.cfg.agencyName;
    $('#ops-sub').textContent = `${S.cfg.difficulty[0].toUpperCase() + S.cfg.difficulty.slice(1)} · ${S.cfg.durationYears}-year mission ending ${SIM.fmtDate(S.tEnd)} · year ${Math.min(S.cfg.durationYears, Math.floor(SIM.years()) + 1)}`;
    const active = S.satellites.filter(s => s.status === 'active');
    const diff = (c.ch4bau || c.ch4) - c.ch4;
    const lastYear = S.ledger.filter(e => e.t > S.t - SIM.YEAR * 1000);
    const income = lastYear.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0);
    const spend = -lastYear.filter(e => e.amount < 0).reduce((s, e) => s + e.amount, 0);
    $('#kpis').innerHTML = [
      kpi('Funds', fmtK$(S.funds), `last 12 months: +${fmtK$(income)} / −${fmtK$(spend)}`),
      kpi('Public support', S.trust.toFixed(0) + '%', S.trust > 70 ? 'strong backing' : S.trust < 30 ? 'at risk of losing funding' : 'steady'),
      kpi('Methane', c.ch4.toFixed(1) + ' ppb', `${diff >= 0 ? '−' : '+'}${Math.abs(diff).toFixed(1)} ppb vs no action`),
      kpi('Warming', '+' + c.dT.toFixed(2) + '°C', `${((c.avoidedC || 0) * 1000).toFixed(1)} m°C avoided by your work`),
      kpi('Leaks reported', S.stats.leaksDetected.toLocaleString(), `${S.stats.leaksFixed.toLocaleString()} repaired · ${S.stats.missedLeaks} big ones missed`),
      kpi('Methane avoided', S.stats.mtAvoided.toFixed(2) + ' Mt', `≈ ${(S.stats.mtAvoided * 80).toFixed(0)} Mt CO₂-equivalent (20-yr)`),
      kpi('Satellites', `${active.length} active`, `${S.stats.launches} launched · ${S.stats.satsLost} lost · ${S.stats.launchFailures} launch failures`),
      kpi('Science', S.science.toLocaleString(), `${DESIGN.fmtMB(S.stats.dataMB)} downlinked`),
    ].join('');
    charts();
    $('#fleet-tbl').innerHTML = `<tr><th>Satellite</th><th>Status</th><th>Orbit</th><th>Battery</th><th>Propellant</th><th class="num">Leaks</th><th class="num">Data</th><th>Launched</th></tr>` +
      (S.satellites.length ? S.satellites.map(s => `<tr><td><a href="#" data-sat="${s.id}">${esc(s.name)}</a></td><td>${s.status === 'active' ? (s.safeMode ? '⚠ safe mode' : '✅ operating') : s.status}</td>
        <td class="mono">${s.status === 'active' ? `${((s.el.a - ORB.RE) / 1000).toFixed(0)} km · ${(s.el.i / ORB.DEG).toFixed(1)}°` : '—'}</td>
        <td class="mono">${s.status === 'active' ? Math.round(s.batteryHealth * 100) + '% health' : '—'}</td><td class="mono">${(s.prop * 1000).toFixed(0)} g</td>
        <td class="num">${s.stats.detections}</td><td class="num">${DESIGN.fmtMB(s.stats.downMB)}</td><td class="mono">${SIM.fmtDate(s.launched)}</td></tr>`).join('') : '<tr><td colspan="8" class="muted">No satellites yet.</td></tr>');
    $$('#fleet-tbl [data-sat]').forEach(a => a.onclick = e => { e.preventDefault(); UI.show('orbit'); OrbitView.select(a.dataset.sat); });
    $('#decisions').innerHTML = S.decisions.length ? S.decisions.slice(-60).reverse().map(d => `<div class="decision"><b>${esc(d.title)}</b><span class="muted mono" style="font-size:11px">${d.date}</span><div class="bf">Before: ${esc(d.before)}</div><div class="af">After: ${esc(d.after)}</div></div>`).join('') : '<p class="muted">Your choices and their explanations will appear here.</p>';
    $('#ops-log').innerHTML = S.log.slice(-150).reverse().map(e => `<li><span class="d">${e.date}</span><span class="${e.kind}">${esc(e.msg)}</span></li>`).join('');
    $('#ledger').innerHTML = '<tr><th>Month</th><th>Item</th><th class="num">Amount</th></tr>' + S.ledger.slice(-120).reverse().map(e => `<tr><td class="mono">${e.month || SIM.fmtDate(e.t).slice(0, 7)}</td><td>${esc(e.label)}${e.count > 1 ? ` <span class="muted">×${e.count}</span>` : ''}</td><td class="num" style="color:${e.amount < 0 ? 'var(--fail)' : 'var(--good)'}">${fmt$(e.amount)}</td></tr>`).join('');
    const reps = (S.reports || []).slice(-60).reverse();
    $('#reports-tbl').innerHTML = reps.length ? '<tr><th>Month</th><th>Grade</th><th class="num">Data</th><th class="num">Leaks</th><th class="num">Sites</th><th class="num">Grant</th></tr>' + reps.map(r => `<tr><td class="mono">${r.month}</td><td><b class="mono">${r.grade}</b></td><td class="num mono">${r.mb >= 1024 ? (r.mb / 1024).toFixed(0) + ' GB' : r.mb + ' MB'}</td><td class="num mono">${r.detections}</td><td class="num mono">${r.sites}</td><td class="num mono">${r.grant ? fmt$(r.grant) : '—'}</td></tr>`).join('') : '<tr><td class="muted">No reports yet. Reports start the month after your first satellite is in orbit.</td></tr>';
  }

  function charts() {
    const S = SIM.state;
    const H = S.history;
    const xs = H.map(h => h.t);
    const bau = H.map(h => h.bau);
    lineChart($('#c1'), xs, [{ label: 'You', color: '#3987e5', values: H.map(h => h.ch4) }, { label: 'No action', color: '#d95926', values: bau, dash: [5, 4] }], { unit: ' ppb', fmt: v => v.toFixed(0) });
    lineChart($('#c2'), xs, [{ label: 'Warming', color: '#3987e5', values: H.map(h => h.dT) }], { unit: '°C', fmt: v => v.toFixed(2), refLine: 2.0 });
    lineChart($('#c3'), xs, [{ label: 'Total', color: '#3987e5', values: H.map(h => h.emis) }], { unit: ' Mt', fmt: v => v.toFixed(0) });
    lineChart($('#c4'), xs, [{ label: 'Reported', color: '#3987e5', values: H.map(h => h.detected) }, { label: 'Repaired', color: '#d95926', values: H.map(h => h.fixed) }], { fmt: v => v.toFixed(0) });
    lineChart($('#c5'), xs, [{ label: 'Funds', color: '#3987e5', values: H.map(h => h.funds) }], { fmt: v => fmtK$(v) });
    lineChart($('#c6'), xs, [{ label: 'Trust', color: '#3987e5', values: H.map(h => h.trust) }], { unit: '%', fmt: v => v.toFixed(0), yMin: 0, yMax: 100 });
    const l = H[H.length - 1] || {};
    $('#c1v').textContent = l.ch4 ? `${l.ch4} ppb` : ''; $('#c2v').textContent = l.dT ? `+${l.dT.toFixed(2)}°C` : '';
    $('#c3v').textContent = l.emis ? `${l.emis} Mt` : ''; $('#c4v').textContent = `${l.detected || 0} / ${l.fixed || 0}`;
    $('#c5v').textContent = l.funds != null ? fmtK$(l.funds) : ''; $('#c6v').textContent = l.trust != null ? `${l.trust}%` : '';
  }

  function show() { if (!built) build(); render(); last = performance.now(); }
  function frame() { if (UI.active() !== 'ops') return; if (performance.now() - last > 2000) { render(); last = performance.now(); } }
  SIM.on('month', () => { if (UI.active() === 'ops') render(); });
  return { show, frame };
})();
UI.register('ops', OpsView);
