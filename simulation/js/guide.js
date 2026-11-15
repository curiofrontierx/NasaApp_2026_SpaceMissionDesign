/* =========================================================================
   Player guidance:
   - Warp to launch day: plays the waiting time quickly (a few seconds), slowing
     down as launch day approaches. Every event in between still happens; a banner
     shows them as they come, decisions still pause the clock, and on arrival a
     "while you waited" summary lists what happened.
   - Help (?) and the first-run welcome.
   ========================================================================= */

const GUIDE = (() => {
  let warp = null;           // launch-day warp in progress

  /* ===================== warp to launch day ===================== */
  function warpToLaunch(id, opts = {}) {
    const S = SIM.state;
    const L = S.launches.find(l => l.id === id) || S.launches.filter(l => l.status === 'scheduled').sort((a, b) => a.date - b.date)[0];
    if (!L || L.status !== 'scheduled') return;
    warp = { toOrbit: !!opts.toOrbit, id: L.id, name: L.designName, from: S.t, prevWarp: S.warp, leaks: 0, fixes: 0, reports: [], events: [], start: performance.now() };
    S.paused = false;
    banner();
  }
  function stopWarp(silent) {
    if (!warp) return;
    const S = SIM.state;
    UI.setWarp(warp.prevWarp && warp.prevWarp <= 86400 ? warp.prevWarp : 600);
    if (!silent) { S.paused = true; UI.toast('Warp stopped. Press ▶ to keep the clock running, or warp again from the Launch tab.'); }
    warp = null;
    banner();
    UI.updateTop(true);
  }
  function warpFrame() {
    if (!warp) return;
    const S = SIM.state;
    const L = S.launches.find(l => l.id === warp.id);
    if (!L || L.status !== 'scheduled') { // arrived (the launch-day pop-up shows the summary) or the launch was scrubbed
      if (warp && warp.done !== true) { UI.setWarp(600); warp = null; banner(); }
      return;
    }
    if (S.paused && !S.pending) { stopWarp(true); UI.toast('Warp stopped.'); return; }
    // cover the remaining time in about a second's worth of "half-lives": fast far away, slow near the day
    const left = Math.max(0, (L.date - S.t) / 1000);
    S.warp = Math.max(6 * 3600, Math.min(30 * 86400, left / 0.9));
    const wl = document.getElementById('warp-label'); if (wl) wl.textContent = S.warp >= 86400 ? (S.warp / 86400).toFixed(0) + ' days/s' : (S.warp / 3600).toFixed(0) + ' h/s';
    if (performance.now() - (warp.lastBanner || 0) > 150) { warp.lastBanner = performance.now(); banner(L, left); }
  }
  function banner(L, left) {
    let el = document.getElementById('warp-banner');
    if (!warp) { if (el) el.hidden = true; return; }
    if (!el) {
      el = document.createElement('div'); el.id = 'warp-banner'; el.className = 'warp-banner';
      document.body.appendChild(el);
    }
    el.hidden = false;
    const days = left != null ? left / 86400 : 0;
    const ev = warp.events.slice(-3).reverse().map(e => `<li>${esc(e)}</li>`).join('');
    el.innerHTML = `<div class="wb-head"><b>${warp.toOrbit ? '⏭ Warping to orbit' : '⏩ Warping to launch day'} · ${esc(warp.name)}</b><span class="mono">${days >= 1 ? days.toFixed(0) + ' days' : (days * 24).toFixed(0) + ' h'} to go · ${SIM.fmtDate(SIM.state.t)}</span>
      <button class="btn small ghost" id="wb-stop">Stop</button></div>
      <div class="wb-stats">${warp.leaks} leaks reported · ${warp.fixes} repaired · ${warp.reports.length} data report${warp.reports.length === 1 ? '' : 's'}${SIM.state.pending ? ' · <b>waiting for your decision</b>' : ''}</div>
      ${ev ? `<ul class="wb-events">${ev}</ul>` : '<div class="wb-events fine">Events along the way appear here.</div>'}`;
    const b = document.getElementById('wb-stop'); if (b) b.onclick = () => stopWarp();
  }
  function onLog(e) {
    if (!warp) return;
    if (/^🔧/.test(e.msg)) warp.fixes++;
    if (/📡/.test(e.msg)) return; // individual leak reports are counted, not listed
    warp.events.push(`${e.date} · ${e.msg}`);
    if (warp.events.length > 60) warp.events.shift();
  }
  // used by the launch-day pop-up: what happened during the warp
  function warpSummaryHTML() {
    if (!warp) return '';
    const w = warp;
    warp.done = true;
    const days = (SIM.state.t - w.from) / 86400000;
    const grades = w.reports.map(r => r.grade).join(', ');
    const list = w.events.slice(-8).reverse().map(e => `<li>${esc(e)}</li>`).join('');
    const html = `<div class="note"><b>While you waited (${days.toFixed(0)} days):</b> ${w.leaks} leaks reported, ${w.fixes} repaired${w.reports.length ? `, data report grade${w.reports.length > 1 ? 's' : ''} ${grades}` : ''}.
      ${list ? `<ul class="wb-events" style="margin-top:6px">${list}</ul>` : ''}</div>`;
    UI.setWarp(600);
    warp = null; banner();
    return html;
  }

  /* ===================== help & first run ===================== */
  function showHelp() {
    const S = SIM.state;
    UI.modal(`<h2>How to play</h2>
      <p>Find methane leaks from space so they get fixed, and slow global warming over <b>${S.cfg.durationYears} years</b>. The review at the end counts the whole mission.</p>
      <ol style="padding-left:18px;line-height:1.7;margin:8px 0">
        <li><b>🔧 Mission Design</b> (Design page): choose your satellite's parts and the game settings.</li>
        <li><b>🚀 Launch:</b> book a ride, then press <b>⏭ Warp to orbit</b> (or <b>⏩ Warp to launch day</b> to fly the rocket yourself). In orbit, press <b>🛰️ Deploy satellite</b>.</li>
        <li><b>▶ / »</b> run and speed up time. Satellites report leaks as they pass over them; leaks get repaired and countries tighten their rules.</li>
        <li><b>🌡️ Map</b> and <b>📊 Mission Control</b> show what changed, including monthly data reports (A–F).</li>
        <li>Satellites wear out: keep booking launches. More satellites cover more of the world.</li>
      </ol>
      <div class="kv"><span>Switch views</span><b>1 2 3 4</b><span>Pause / play</span><b>Space</b><span>Slower / faster</span><b>, .</b>
      <span>Flight</span><b>W/S pitch · A/D turn · Shift/Ctrl throttle · Space stage · T autopilot · K warp to orbit · M map · Enter deploy</b></div>
      <div class="modal-actions"><button class="btn" id="m-close">Close</button></div>`);
    $('#m-close').onclick = UI.closeModal;
  }
  function firstRun() {
    const S = SIM.state;
    UI.modal(`<h2>Welcome to Mission: Blue Marble</h2>
      <p>You run a young space agency with <b>${fmt$(S.funds)}</b> and <b>${S.cfg.durationYears} years</b> to find methane leaks from space and slow global warming.</p>
      <ol style="padding-left:18px;line-height:1.7;margin:8px 0">
        <li>On the <b>🚀 Launch</b> tab, press <b>📅 Book this launch</b>.</li>
        <li>Press <b>⏭ Warp to orbit</b>, then <b>🛰️ Deploy satellite</b>.</li>
        <li>Press <b>▶</b> and <b>»</b> to run time, and watch the <b>🌡️ map</b> and <b>📊 Mission Control</b> as your satellite finds leaks.</li>
      </ol>
      <p class="fine">Press <b>?</b> in the top bar any time for help and the controls.</p>
      <div class="modal-actions"><button class="btn ghost" id="m-look">Look around first</button><button class="btn" id="m-go">🚀 Plan my first launch</button></div>`);
    $('#m-go').onclick = () => { UI.closeModal(); UI.show('launch'); };
    $('#m-look').onclick = UI.closeModal;
  }

  /* ===================== wiring ===================== */
  function init() {
    SIM.on('log', onLog);
    SIM.on('detection', () => { if (warp) warp.leaks++; });
    SIM.on('report', r => { if (warp) warp.reports.push(r); });
    const hb = document.getElementById('btn-help'); if (hb) hb.onclick = showHelp;
    safeDel('mbm.tutorial'); // progress from the old tutorial
  }
  function frame() { warpFrame(); }
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  return { init, frame, warpToLaunch, stopWarp, warpSummaryHTML, showHelp, firstRun, get warping() { return !!warp; } };
})();
