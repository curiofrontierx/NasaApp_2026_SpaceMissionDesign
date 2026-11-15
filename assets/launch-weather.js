// Launch weather from NASA GIBS. Needs sim-data.js (GIBS, GIBS_DATE, samplePixel, brightness).
const LAUNCH_KEY = 'cfx.launch.v1';

const LAUNCH_SITES = [
  { id: 'cape',        name: 'Cape Canaveral, USA',     lat: 28.5,  lon: -80.6 },
  { id: 'vandenberg',  name: 'Vandenberg, USA',         lat: 34.7,  lon: -120.6 },
  { id: 'kourou',      name: 'Kourou, French Guiana',   lat: 5.2,   lon: -52.8 },
  { id: 'baikonur',    name: 'Baikonur, Kazakhstan',    lat: 45.9,  lon: 63.3 },
  { id: 'plesetsk',    name: 'Plesetsk, Russia',        lat: 62.9,  lon: 40.6 },
  { id: 'sriharikota', name: 'Sriharikota, India',      lat: 13.7,  lon: 80.2 },
  { id: 'wenchang',    name: 'Wenchang, China',         lat: 19.6,  lon: 110.95 },
  { id: 'tanegashima', name: 'Tanegashima, Japan',      lat: 30.4,  lon: 131.0 },
  { id: 'mahia',       name: 'Mahia Peninsula, NZ',     lat: -39.3, lon: 177.9 }
];

// Live GOES geostationary layers ("default" time = latest image, ~10 min old).
const GOES = {
  east: { name: 'GOES-East', minLon: -110, maxLon: -20 },
  west: { name: 'GOES-West', minLon: -180, maxLon: -110 }
};
const goesUrl = (sat, layer, level) =>
  `${GIBS}/GOES-${sat === 'east' ? 'East' : 'West'}_ABI_${layer}/default/default/GoogleMapsCompatible_Level${level}/{z}/{y}/{x}.png`;

function goesFor(lon) {
  if (lon >= GOES.east.minLon && lon <= GOES.east.maxLon) return 'east';
  if (lon >= GOES.west.minLon && lon < GOES.west.maxLon) return 'west';
  return null;
}

// Clean-IR colouring: grey = warm/low clouds, coloured = very cold (storm) tops.
const saturation = ([r, g, b]) => (Math.max(r, g, b) - Math.min(r, g, b)) / 255;

// Returns { source, cloud 0..1, storm bool, wind m/s, live bool }.
async function readWeather(lat, lon) {
  const sat = goesFor(lon);
  let cloud = null, storm = false, source;
  if (sat) {
    const ir = await samplePixel(goesUrl(sat, 'Band13_Clean_Infrared', 6), lat, lon, 5);
    if (ir && ir[3] > 0) {
      cloud = Math.min(1, Math.max(0, (brightness(ir) - 0.35) / 0.5));
      storm = saturation(ir) > 0.35;
      source = `${GOES[sat].name} Clean Infrared (live)`;
    }
  }
  if (cloud == null) {
    const px = await samplePixel(GIBS_LAYERS.clouds.url, lat, lon, 4);
    if (px) {
      cloud = cloudFromPixel(px);
      source = `MODIS Terra Cloud Fraction (${GIBS_DATE})`;
    }
  }
  if (cloud == null) { cloud = Math.random() * 0.6; source = 'No NASA data here: simulated'; }
  // GIBS has no live upper-level wind, so wind is simulated (cloudier skies → windier).
  const wind = +(3 + cloud * 12 + Math.random() * 6).toFixed(1);
  return { source, cloud: +cloud.toFixed(2), storm, wind, live: !!sat && source.includes('live') };
}

// Simplified launch commit criteria → verdict and failure risk.
function judgeWeather(w) {
  const reasons = [];
  if (w.storm) reasons.push('Thunderstorm cloud tops nearby (lightning risk)');
  if (w.cloud > 0.75) reasons.push(`Thick cloud cover (${Math.round(w.cloud * 100)}%)`);
  if (w.wind > 15) reasons.push(`High winds (${w.wind} m/s)`);
  const marginal = !reasons.length && (w.cloud > 0.5 || w.wind > 11);
  if (reasons.length) return { verdict: 'NO-GO', risk: 0.35, reasons };
  if (marginal) return { verdict: 'HOLD', risk: 0.1, reasons: ['Marginal clouds or wind'] };
  return { verdict: 'GO', risk: 0.02, reasons: ['Weather within limits'] };
}
