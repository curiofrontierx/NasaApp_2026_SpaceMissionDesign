// Simulation data layer: NASA GIBS (WMTS tiles) + US GHG Center CarbonTracker-CH4, cached in localStorage.
// Fetching follows the same approach as patchguard.github.io/gibsdata (Leaflet tile layers + CORS JSON APIs).
const GIBS = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
const GHG = 'https://earth.gov/ghgcenter/api/raster/collections/ct-ch4-monthgrid-v2025/items';
const FLUX_MONTH = '202312'; // latest CarbonTracker-CH4 month currently published
const FLUX_CACHE_KEY = 'cfx.fluxCache.v1';
const CLOUD_CACHE_KEY = 'cfx.cloudCache.v2'; // v2: values from the official colour key

// GIBS daily layers lag ~1 day; use yesterday (UTC) as the imagery date.
const GIBS_DATE = new Date(Date.now() - 864e5).toISOString().slice(0, 10);

const GIBS_LAYERS = {
  bluemarble: { name: 'Blue Marble (seamless, cloud-free)', url: `${GIBS}/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg`, maxNativeZoom: 8 },
  truecolor: { name: 'MODIS Terra True Color', url: `${GIBS}/MODIS_Terra_CorrectedReflectance_TrueColor/default/${GIBS_DATE}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`, maxNativeZoom: 9 },
  clouds:    { name: 'MODIS Terra Cloud Fraction', url: `${GIBS}/MODIS_Terra_Cloud_Fraction_Day/default/${GIBS_DATE}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`, maxNativeZoom: 6, overlay: true },
  night:     { name: 'VIIRS Black Marble (night lights)', url: `${GIBS}/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png`, maxNativeZoom: 8 }
};

// Known methane emission hotspots.
const HOTSPOTS = [
  { id: 'permian',  name: 'Permian Basin, USA',     lat: 32.0,  lon: -103.0 },
  { id: 'turkmen',  name: 'Turkmenistan gas fields', lat: 39.0,  lon: 55.0 },
  { id: 'shanxi',   name: 'Shanxi coal, China',     lat: 37.5,  lon: 112.5 },
  { id: 'siberia',  name: 'West Siberia gas',       lat: 64.0,  lon: 75.0 },
  { id: 'amazon',   name: 'Amazon wetlands',        lat: -3.0,  lon: -60.0 },
  { id: 'algeria',  name: 'Hassi R\'Mel, Algeria',  lat: 32.9,  lon: 3.3 },
  { id: 'bangla',   name: 'Bangladesh rice/wetland', lat: 23.7, lon: 90.4 },
  { id: 'india',    name: 'Indo-Gangetic Plain',    lat: 26.5,  lon: 80.5 },
  { id: 'iraq',     name: 'Basra oil fields, Iraq', lat: 30.5,  lon: 47.5 },
  { id: 'alberta',  name: 'Alberta oil sands',      lat: 57.0,  lon: -111.5 },
  { id: 'nigeria',  name: 'Niger Delta flaring',    lat: 5.0,   lon: 6.5 },
  { id: 'congo',    name: 'Congo Basin wetlands',   lat: 0.5,   lon: 18.0 }
];

const readCache = key => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } };
const writeCache = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* quota */ } };

// CarbonTracker-CH4 point query: methane flux (g CH4 / m² / yr) for a hotspot. Cached per month.
async function fetchFlux(h) {
  const cache = readCache(FLUX_CACHE_KEY);
  const key = `${FLUX_MONTH}:${h.id}`;
  if (cache[key] != null) return cache[key];
  const qs = ['total', 'fossil', 'microbial'].map(a => `assets=${a}`).join('&');
  const r = await fetch(`${GHG}/ct-ch4-monthgrid-v2025-${FLUX_MONTH}/point/${h.lon.toFixed(3)},${h.lat.toFixed(3)}?${qs}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  const vals = Object.fromEntries(d.band_names.map((b, i) => [b.replace('_b1', ''), Math.max(0, d.values[i] || 0)]));
  cache[key] = vals;
  writeCache(FLUX_CACHE_KEY, cache);
  return vals;
}

// Approximate cloud cover (0..1) at a point by reading the GIBS cloud-fraction tile pixel.
// The layer's colours are used as a brightness proxy, so treat this as an estimate.
function lonLatToTile(lat, lon, z) {
  const n = 2 ** z, rad = lat * Math.PI / 180;
  const fx = (lon + 180) / 360 * n;
  const fy = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n;
  return { x: Math.floor(fx), y: Math.floor(fy), px: Math.floor((fx % 1) * 256), py: Math.floor((fy % 1) * 256) };
}

// Reads the RGBA pixel of a GIBS tile at (lat, lon). Resolves null if the tile is unavailable.
function samplePixel(urlTemplate, lat, lon, z) {
  const t = lonLatToTile(lat, lon, z);
  const url = urlTemplate.replace('{z}', z).replace('{y}', t.y).replace('{x}', t.x);
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve(Array.from(ctx.getImageData(t.px, t.py, 1, 1).data));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
const brightness = ([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

// Official GIBS colour key for MODIS Cloud Fraction (gibs.earthdata.nasa.gov/colormaps/v1.3/MODIS_Cloud_Fraction.xml):
// purple = low cloud … dark red = high cloud. Value = middle of each band's range.
const CLOUD_COLORMAP = [
  { rgb: [183, 15, 141], v: 0.08 }, { rgb: [0, 0, 170], v: 0.21 }, { rgb: [0, 136, 238], v: 0.34 },
  { rgb: [0, 136, 0], v: 0.47 }, { rgb: [255, 255, 0], v: 0.6 }, { rgb: [187, 136, 0], v: 0.72 }, { rgb: [110, 0, 0], v: 0.85 }
];
// Converts a cloud-fraction tile pixel to 0..1 using the nearest colour in the official key.
function cloudFromPixel(px) {
  if (!px || px[3] === 0) return 0; // transparent = no cloud reported
  let best = CLOUD_COLORMAP[0], bestD = Infinity;
  for (const c of CLOUD_COLORMAP) {
    const d = (px[0] - c.rgb[0]) ** 2 + (px[1] - c.rgb[1]) ** 2 + (px[2] - c.rgb[2]) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best.v;
}

async function fetchCloud(h) {
  const cache = readCache(CLOUD_CACHE_KEY);
  const key = `${GIBS_DATE}:${h.id}`;
  if (cache[key] != null) return cache[key];
  const px = await samplePixel(GIBS_LAYERS.clouds.url, h.lat, h.lon, 4);
  if (!px) return null; // unknown: simulation falls back to a random draw
  cache[key] = cloudFromPixel(px);
  writeCache(CLOUD_CACHE_KEY, cache);
  return cache[key];
}
