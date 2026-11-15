# Mission: Blue Marble: Simulation page

The gameplay for the NASA Space Apps Challenge 2026 project. The player designs a methane-hunting satellite on **design.html**, then runs a space agency here for 10–100 game years. They fly the satellite to orbit on a physics-based rocket, operate it, and watch its data turn into leak repairs, policy changes and a cooler planet. Results go to **feedback.html**.

Plain HTML/CSS/JavaScript: no install, no build step. The page is `simulation.html` (next to design.html); its code lives in this `simulation/` folder. Open it in Chrome or Edge with an internet connection (NASA data and the 3D/map libraries load from the web).

- Normal flow: `index.html` → `design.html` → **Simulate** → `simulation.html`.
- `simulation.html?new=1` starts a fresh game.
- `simulation.html?new=1&demo=1` starts with three satellites already in orbit and a launch booked (for testing and presentations).
- `simulation.html?new=1&demo=flight` starts on the launch pad (add `&utc=20` for a daytime launch from Vandenberg).

How this page connects to design.html and feedback.html: see **HANDOFF.md**. Every NASA service and URL the page uses: see **NASA_DATA_SOURCES.txt** in the Project folder (next to `NasaApp_2026_SpaceMissionDesign`).

## The top bar
Four views (keys `1`–`4`), the game clock with time warp (`Space` pause, `,` `.` slower/faster, from 1× up to 1 month per second), funds, public trust, science points, global warming, atmospheric methane, the satellite count, a news ticker, and **End round**.

| View | What you do there |
|---|---|
| 🌡️ **Methane Emissions** | Leaflet map over live NASA GIBS imagery: Blue Marble, true colour (pick a date), night lights, plus overlays of real AIRS methane, CO, sea and land temperature and clouds, with NASA's own colour legends. Countries can be coloured by simulated **methane emissions**, **change since the start** (teal = falling, red = rising), **emissions per km²**, **local warming** (with Arctic amplification) or **leak-control policy**. Emission sites can be shown by **source** (oil & gas, coal, landfill, farming, wetland, permafrost) or by **amount** (regional emissions plus active leaks). The map responds to how well you do: see *Climate* below. Satellite ground tracks, instrument swaths, ground stations and the day/night terminator move in real time. Click a country for its trend, how fast its regulators respond, the evidence you've given them and what can still be cut; click a site for its leaks. |
| 🛰️ **Orbit Viewer** | three.js Earth textured with NASA GIBS (day Blue Marble, night VIIRS Black Marble, optional AIRS methane), lit by the real Sun position and rotating with sidereal time. Every satellite, orbit line, ground station, leak site and debris object is shown. Click a satellite (or open the **Fleet** panel) to manage it: **Overview**, **Power** (battery, eclipses, sun-pointing), **Attitude** (reaction-wheel modes nadir / target / sun / station / manual roll-pitch-yaw, wheel saturation and desaturation), **Propulsion** (station-keeping, Hohmann or electric-spiral altitude changes, plane changes, manual burns in six directions, deorbit), **Comms** (storage, queue, next ground contact, **Transmit now**), **Payload**. |
| 🚀 **Launch** | **Planner:** the satellite from design.html is already selected (with a link back to change it). Choose how many, a ride (rideshare, ISS deployer, dedicated small launcher, dedicated medium launcher), launch site and target orbit. Range-safety azimuths and the Earth-rotation boost are computed. The cost shows your parts and, separately, the subsystems, frame and integration. Then book it. **Flight (3D, inspired by Kerbal Space Program):** the rocket stands on a pad at the real launch site, with NASA imagery of the region as the ground. Drag to look around, scroll to zoom out to the whole planet. Fly it yourself (`W`/`S` pitch, `A`/`D` yaw, `Q`/`E` roll, `Shift`/`Ctrl` throttle, `Z`/`X`, `Space` stage, `F` fairing, `M` map view, `T` autopilot, `Enter` deploy), or tell the autopilot to take off, reach orbit, circularise, change orbit, hold prograde/retrograde/radial, deorbit, or land/abort. Touching the controls pauses the autopilot; 2.5 s after you let go it re-plans from wherever you left the rocket. The HUD shows trajectory, air pressure and temperature, Mach, dynamic pressure, angle of attack, aerodynamic stability, heating, skin and payload temperature, and whether you are in sunlight. |
| 📊 **Mission Control** | Headline numbers, charts (methane vs a no-action world, warming, emissions, leaks reported/repaired, funds, trust), fleet table, decision log with before/after explanations, mission log, money in and out, and the monthly data reports. |

## How realistic is it?

**Orbits** (`js/orbit.js`)
- Keplerian elements with J2 secular drift, so Sun-synchronous orbits actually precess 0.9856°/day.
- GMST Earth rotation, a solar ephemeris, cylindrical eclipses and beta-angle eclipse fractions.
- Exponential atmosphere (Vallado table) scaled by an 11-year solar cycle; drag decay uses each satellite's own area-to-mass ratio.
- Hohmann and Edelbaum Δv, and a rough radiation dose model.

**Satellites** (`js/sim.js`, `js/design.js`)
- Battery state of charge with depth-of-discharge limits, ageing, brownouts and safe mode.
- Solar arrays sized automatically.
- Reaction-wheel momentum build-up and magnetorquer dumping.
- The rocket equation for every burn, chemical vs electric thrust, and station-keeping against drag.
- Instruments differ in swath, steering range, detection threshold, day-only operation, cloud sensitivity and tundra/ocean penalties.
- Data volumes per observation, storage limits, downlink rates per radio, ground-station visibility (10° elevation mask), laser links that need clear skies, and per-minute ground-station fees.

**Climate and the map**
- National emissions start from approximate 2020s values (EDGAR / IEA Global Methane Tracker, rounded). Each country grows at its own rate: falling in the EU, UK and Japan, flat in the US and Russia, rising fastest in South Asia and Africa.
- About 48 real super-emitter regions spawn heavy-tailed leak events (0.15–100 t/h).
- Reports trigger repairs (oil and gas fastest; coal, landfills and agriculture slower and only partial).
- Every leak report and every monthly data report builds **evidence** in the countries it covers. Evidence fades over a few years if monitoring stops.
- Regulators turn evidence into rules at the speed of that country: fast where methane rules are strong (EU, Canada, US, Japan), slowly in opaque oil and gas states. Rules can cut only what that country's sources allow: about 70% of oil & gas methane, half of coal and landfill, a quarter of farming. Evidence also slows emission growth as companies invest in fixing leaks.
- Places your satellites never see keep growing. So orbit choice, instruments and coverage decide where the map turns teal.
- **Monthly data report:** graded A–F on data volume, leaks found, sites covered and facility-level attribution. It brings a grant and public trust, and pushes regulators in every country it covers.
- Global methane follows a one-box model: 2.78 Tg per ppb and a 9.1-year lifetime.
- Methane forcing uses 0.036(√M − √M₀) × 1.65 (indirect effects), with λ = 0.8 K per W/m² and a 4-year response, plus a non-methane warming trend set by difficulty.
- A business-as-usual shadow world (same countries, no satellites) is tracked for comparison.

**Rockets** (`js/flight.js` physics, `js/flight-scene.js` 3D view)
- Full 3D flight around a rotating Earth (the pad starts with Earth's rotation speed), using public stage data for Electron-class and Falcon 9-class launchers.
- Gravity: inverse-square plus J2 (Earth's equatorial bulge).
- Atmosphere: US Standard Atmosphere 1976 below 86 km (temperature, pressure, density, speed of sound), Vallado table above. Thrust and Isp change with outside pressure.
- Wind: a jet stream peaking near 11 km plus gusts, different every launch.
- Drag that rises through the sound barrier and falls when supersonic, extra drag and a normal (lift) force at angle of attack.
- Stability: the rocket is aerodynamically stable (it can't be customised), so the air keeps its nose in the airflow. Engine gimbal (or small thrusters when coasting) can push it off the airflow only as far as the control torque allows, and the nose swings more slowly in thick, fast air.
- Structural limits: dynamic pressure, side load (dynamic pressure × angle of attack) and g-load.
- Heat and cold: aerodynamic heating (Sutton–Graves), sunlight, Earth's infrared and radiation to cold space. The skin heats on ascent and burns up on re-entry from orbit. The satellites are protected by the fairing; dropping it below ~100 km (above the 1.1 kW/m² free-molecular heating limit) cooks them, and waiting too long in Earth's shadow chills them. Damage carries into orbit (calibration drift, weaker battery).
- The autopilot steers into the target orbit plane (yaw steering), with booster recovery, an entry burn and a "suicide burn" landing on only the engines it needs.
- Random engine-out or loss according to vehicle reliability.
- The 3D view: NASA Blue Marble / Black Marble globe lit by the real Sun, NASA imagery of the launch region under the pad, sky colour and stars by altitude and time of day, exhaust that widens in vacuum, smoke, a vapour cone near Mach 1, re-entry glow, tumbling stages and fairing halves, and a KSP-style map view with apoapsis and periapsis.

**Money and trust**
- Monthly appropriation scaled by trust, leak-report payments (higher for facility-level attribution), grants, operations costs, launch prices from public rideshare and dedicated pricing, and booster-reuse credits.
- Random events: solar storms, debris conjunctions (a choice), major leaks, budget-cut votes (a choice), calibration drift, battery faults and partnerships.

**Time warp**
- Up to 2 game hours per frame, every satellite is stepped along its real ground track.
- Faster than that, orbit-averaged power and statistically sampled passes are used, so a 100-year game takes minutes.

**Simplifications to know about**
- Rocket attitude follows commands through a stability model rather than a full rigid-body simulation, and the vehicle is treated as one body for aerodynamics.
- Constellations are spread evenly around the orbit instead of drifting into place.
- Detector and thruster mass and power figures are engineering estimates where the team sheets didn't list them.
- Emission figures, country growth rates and regulator responsiveness are rounded gameplay estimates, not for citation.

## Files

```
../simulation.html     the page (top bar, four views, modal, toasts)
css/sim.css            styling
js/config.js           page links, storage keys, default config, difficulty
js/design-input.js     reads the design saved by design.html and maps its part ids
js/orbit.js            orbital mechanics (pure)
js/catalog.js          parts with full engineering stats, automatic subsystems, rockets, launch options,
                       launch sites, ground stations, emission sites, national emissions
js/design.js           satellite engineering: subsystem sizing, budgets, rules, design score (pure)
js/sim.js              world simulation, economy, events, saving, round and final results (pure)
js/flight.js           rocket physics and adaptive autopilot, 3D (pure)
js/flight-scene.js     3D launch view (three.js): planet, launch site, rocket, effects, map view
js/nasa/gibs.js        NASA GIBS: map tiles, globe images, legends
js/nasa/image-library.js  NASA Image and Video Library: launch-option photos
js/ui.js               top bar, time controls, modals, toasts, chart helper
js/view-*.js           one file per view (map, orbit, launch, ops)
js/main.js             boot, demo mode, main loop

```
The `pure` files have no page code and can be tested in Node.
