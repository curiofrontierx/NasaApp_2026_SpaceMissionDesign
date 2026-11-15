# Hand-off: simulation.html ↔ the team's pages

```
index.html  →  design.html  →  simulation.html  →  feedback.html
 (start)       (satellite)     (gameplay)          (results)
```

`simulation.html` sits next to `design.html`; its code lives in `simulation/`. Pages talk only through the browser's `localStorage`, so all pages must be opened from the same place (the same folder on disk, or the same website).

Page links are at the top of `simulation/js/config.js` (`PAGES`):

| Key | Link | Used for |
|---|---|---|
| `start` | `index.html` | Link in Mission Control |
| `design` | `design.html` | "Change the design" in the Launch view; link in Mission Control |
| `nasaData` | `nasa-data.html` | Link in Mission Control |
| `feedback` | `feedback.html` | **End round** goes here |
| `results` | `feedback.html` | The game end goes here |

## What simulation.html READS

### `cfx.design.v1`: the satellite, written by design.html (`assets/design.js`)

```json
{ "missionName": "MethaneWatch-1", "battery": "liion100", "thruster": "hydrazine",
  "storage": "cfc400", "transmitter": "ewc27", "detector": "swir", "savedAt": "2026-11-14T10:00:00.000Z" }
```

- `simulation/js/design-input.js` maps the `assets/parts.js` ids to the simulation's catalog. Only these ids differ: `liion40`→`li40`, `liion100`→`li100`, `coldgas`→`cold`, `resistojet`→`resisto`, `electrospray`→`espray`, `dualmode`→`dual`, `a3200`→`nanomind`. Every id in `parts.js` is tested to map to the right category at the same price.
- The design is added to the game under its `missionName` and opens in the Launch view. The frame, reaction wheels, solar arrays, star tracker, computer and other subsystems are sized automatically.
- Pressing **Simulate** again with a changed design adds or replaces that design in the running game. A new `missionName` adds a second design, so the player can fly several kinds of satellite.
- If you add a part to `parts.js`, add the same part (with its engineering numbers) to `simulation/js/catalog.js`, or it is skipped with a console warning.

### `mbm.config` (optional)

```json
{ "agencyName": "Blue Marble Space Agency", "playerName": "Director", "durationYears": 25, "difficulty": "director",
  "startFunds": 1500000, "annualBudget": 900000, "startDate": "2027-01-01T00:00:00Z", "roundLengthMonths": 12 }
```

- Every field is optional, and no page writes this key yet, so these defaults apply.
- `difficulty` is `cadet`, `director` or `crisis`.
- If `durationYears`, `startDate` or `difficulty` differ from the saved game, a new game starts.
- URL overrides for tests: `simulation.html?years=50&difficulty=crisis`. `?new=1` forces a fresh game.

## What simulation.html WRITES

### `mbm.results`: when the game ends, then the page opens feedback.html

```json
{
  "reason": "complete | bankrupt | trust | tipping",
  "score": 74, "stars": 4, "rank": "Mission Specialist",
  "subscores": { "climate": 70, "detection": 85, "science": 90, "trust": 61, "budget": 55 },
  "durationYears": 25, "yearsPlayed": 25, "difficulty": "director", "agencyName": "...",
  "climate": { "ch4ppb": 1990.2, "ch4ppbStart": 1935, "ch4ppbBusinessAsUsual": 2260.1, "tempAnomalyC": 1.86, "methaneWarmingC": 0.05, "warmingAvoidedC": 0.081, "emissionsMtPerYear": 560.1 },
  "stats": { "leaksDetected": 900, "leaksFixed": 700, "mtAvoided": 410.5, "launches": 6, "launchFailures": 0, "satsLost": 1, "dataMB": 1.2e7, "satellitesActive": 4 },
  "finances": { "fundsRemaining": 3200000, "grants": 2100000 },
  "satellites": [{ "name": "...", "status": "active", "designScore": 77, "detections": 300, "altKm": 540, "incDeg": 97.6 }],
  "history": [{ "t": 1798761600000, "ch4": 1935, "bau": 1935, "dT": 1.32, "funds": 1500000, "trust": 55, "emis": 634, "detected": 0, "fixed": 0 }],
  "decisions": [ "..." ]
}
```

- Score weights: climate 35%, leak detection 20%, science 15%, trust 15%, budget 15%. Ranks run from Rookie Director to Guardian of Earth.
- `ch4ppbBusinessAsUsual` is a "nobody did anything" world, so feedback.html can show what the player changed.
- `history` is monthly (about 240 points at most) and ready to chart.
- `reports`: the last 36 monthly data reports: `{ month, grade (A–F), quality (0–1), mb, detections, attributed, sites, countries: [ISO codes], grant }`.
- `regions`: the 25 biggest emitting countries: `{ iso (numeric ISO 3166), emissionsMt, startMt, noActionMt, changePct, policyCutPct, leaksReported }`. This shows where the player's data changed the world and where it didn't.

> **Note for the feedback.html owner:** feedback.html currently reads only its own keys (`methane-tycoon-design`, `methane-tycoon-lastflight`) and shows "No mission report yet" without them. To show the simulation's results, read `mbm.results`, for example:
> ```js
> let sim = null; try { sim = JSON.parse(localStorage.getItem('mbm.results') || 'null'); } catch {}
> if (sim) { /* show sim.score, sim.stars, sim.rank, sim.climate, sim.stats, sim.history … */ }
> ```

### `mbm.round`: when the player presses **End round**, then the page opens feedback.html

```json
{
  "from": "2027-01-01", "to": "2028-01-01", "yearsPlayed": 1.0, "durationYears": 25,
  "funds": 1830000, "trust": 63.2, "science": 4200,
  "ch4": 1947.3, "dT": 1.343, "ch4Change": 12.3, "dTChange": 0.021,
  "leaksDetectedThisRound": 87, "leaksFixedThisRound": 55,
  "activeSatellites": [{ "name": "MethaneWatch-1", "altKm": 548, "incDeg": 97.6, "detections": 60, "score": 77 }],
  "decisions": [ "...decisions made during this round..." ]
}
```

To continue, link back to `simulation.html` **without** `?new=1`; the game resumes from its save.

### `mbm.decisions`: the decision log with explanations before and after each choice

An array (the last 500). One entry is added each time the player makes a meaningful choice: receiving a design from design.html, booking a launch, flying it, a manoeuvre, an attitude mode, safe mode, a debris dodge, a budget vote and so on.

```json
{ "id": "d4k2j9x", "t": 1798761600000, "date": "2027-01-01", "year": 2027,
  "type": "design | launch-booked | launch | satellite | debris | budget",
  "title": "Design received: MethaneWatch-1",
  "before": "What it does and its trade-off, shown before the choice",
  "after": "What actually happened as a result",
  "data": { "...": "type-specific details" } }
```

The list is cleared when a brand-new game starts.

### `mbm.sim.save`
The simulation's own save. Other pages should not edit it.
