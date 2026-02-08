import { createWXFX } from "./wx-fx.js";
import { WX } from "./wx-core.js"; // Import WX for conversion utilities

const fx = createWXFX(document.getElementById("wx-fx"));

let wxUnit = "F";
let wxData = null;
let lastPressure = null;

// barometer tween
let pressureAnim = { raf: 0, from: null, to: null, start: 0, dur: 900 };

const DEFAULT_LAT = 40.7128;
const DEFAULT_LON = -74.0060;

const el = (id) => document.getElementById(id);
const els = {
  locate: el("wx-locate"),
  unitF: el("wx-unit-f"),
  unitC: el("wx-unit-c"),
  location: el("wx-location"),
  conditionText: el("wx-condition-text"),
  conditionIconContainer: el("wx-condition-icon-container"),
  currentTemp: el("wx-current-temp"),
  feelsLike: el("wx-feels-like"),
  hiLo: el("wx-hi-lo"),
  wind: el("wx-wind"),
  precip: el("wx-precip"),
  hourly: el("wx-hourly"),
  daily: el("wx-daily"),
  pressureValue: el("wx-pressure-value"),
  pressureTrend: el("wx-pressure-trend"),
  needle: el("wx-needle"),
  pressureArc: el("wx-pressure-arc"),
  pressureArcGlow: el("wx-pressure-arc-glow"),
  pressureDot: el("wx-pressure-dot"),
  radarLink: el("wx-radar-link"),
  radarIframe: el("wx-radar-iframe"),
  alerts: el("wx-alerts"),
  alertsTitle: el("wx-alerts-title"),
  alertsBody: el("wx-alerts-body"),
  alertsClose: el("wx-alerts-close"),
};

const root = document.documentElement;

/* =========================
   Weather icons + background
========================= */
function getWeatherInfo(code, isDay = 1) {
  const BG_CLEAR_DAY = ["#3b82f6", "#60a5fa"];
  const BG_CLEAR_NIGHT = ["#0f172a", "#1e293b"];
  const BG_CLOUDY_DAY = ["#64748b", "#94a3b8"];
  const BG_CLOUDY_NIGHT = ["#1e293b", "#334155"];
  const BG_RAIN = ["#334155", "#475569"];
  const BG_STORM = ["#0f172a", "#312e81"];
  const ICON_BASE = "icons/";

  const map = {
    0: { desc: "Clear Sky", file: isDay ? "day.svg" : "night.svg", bg: isDay ? BG_CLEAR_DAY : BG_CLEAR_NIGHT },
    1: { desc: "Mainly Clear", file: isDay ? "cloudy-day-1.svg" : "cloudy-night-1.svg", bg: isDay ? BG_CLEAR_DAY : BG_CLEAR_NIGHT },
    2: { desc: "Partly Cloudy", file: isDay ? "cloudy-day-1.svg" : "cloudy-night-1.svg", bg: isDay ? BG_CLEAR_DAY : BG_CLEAR_NIGHT },
    3: { desc: "Overcast", file: "cloudy.svg", bg: isDay ? BG_CLOUDY_DAY : BG_CLOUDY_NIGHT },
    45: { desc: "Fog", file: "cloudy.svg", bg: BG_CLOUDY_DAY },
    48: { desc: "Rime Fog", file: "cloudy.svg", bg: BG_CLOUDY_DAY },
    51: { desc: "Drizzle", file: "rainy-1.svg", bg: BG_RAIN },
    53: { desc: "Drizzle", file: "rainy-1.svg", bg: BG_RAIN },
    55: { desc: "Drizzle", file: "rainy-1.svg", bg: BG_RAIN },
    61: { desc: "Rain", file: "rainy-4.svg", bg: BG_RAIN },
    63: { desc: "Rain", file: "rainy-4.svg", bg: BG_RAIN },
    65: { desc: "Heavy Rain", file: "rainy-4.svg", bg: BG_RAIN },
    71: { desc: "Snow", file: "snowy-4.svg", bg: BG_RAIN },
    73: { desc: "Snow", file: "snowy-4.svg", bg: BG_RAIN },
    75: { desc: "Heavy Snow", file: "snowy-6.svg", bg: BG_RAIN },
    80: { desc: "Showers", file: "rainy-6.svg", bg: BG_RAIN },
    81: { desc: "Showers", file: "rainy-6.svg", bg: BG_RAIN },
    82: { desc: "Showers", file: "rainy-6.svg", bg: BG_RAIN },
    85: { desc: "Snow Showers", file: "snowy-6.svg", bg: BG_RAIN },
    86: { desc: "Snow Showers", file: "snowy-6.svg", bg: BG_RAIN },
    95: { desc: "Thunderstorm", file: "thunder.svg", bg: BG_STORM },
    96: { desc: "Thunderstorm", file: "thunder.svg", bg: BG_STORM },
    99: { desc: "Thunderstorm", file: "thunder.svg", bg: BG_STORM },
  };

  const res = map[code] || { desc: "Unknown", file: "weather.svg", bg: BG_CLOUDY_DAY };
  res.path = ICON_BASE + res.file;
  return res;
}

/* =========================
   Unit helpers
========================= */
function getTemp(celsius) {
  // Use WX utility to convert raw Celsius value to current unit
  return WX.convertTemp(celsius, wxUnit);
}
function getWind(speedMph) {
  // Use WX utility to format wind speed
  return WX.windText(speedMph, wxUnit);
}
function getPrecip(mm) {
    if (mm == null || mm < 0.1) return 'None';
    if (wxUnit === "F") {
        // Simple conversion for display in inches
        return `${(mm / 25.4).toFixed(2)} in`; 
    }
    return `${mm.toFixed(1)} mm`;
}

function animateNumber(node, to, suffix = "") {
  if (!node) return;
  const from = Number(node.dataset.v ?? to);
  node.dataset.v = String(to);
  const start = performance.now();
  const dur = 520;
  const ease = (p) => 1 - Math.pow(1 - p, 3);

  function tick(now) {
    const p = Math.min(1, (now - start) / dur);
    const v = from + (to - from) * ease(p);
    // Ensure we round only the final calculated value
    node.textContent = `${Math.round(v)}${suffix}`;
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // Quick animation pulse
  node.classList.remove("wx-value-pop");
  void node.offsetWidth;
  node.classList.add("wx-value-pop");
  setTimeout(() => node.classList.remove("wx-value-pop"), 180);
}

function formatTime(isoString, timezone, options) {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, ...options }).format(new Date(isoString));
}

/* =========================
   Alerts (heuristic storm-chaser mode)
========================= */
function buildAlerts(curr, hourly, idx, timezone) {
  const alerts = [];

  const code = curr.code ?? 0;
  const windMph = Number(curr.rawWindSpeed ?? 0); // Use rawWindSpeed from current
  const pop = Number(hourly.pop?.[idx] ?? 0);

  const at = (hoursFromNow) => {
    const t = hourly.time?.[Math.min(idx + hoursFromNow, (hourly.time?.length || 1) - 1)];
    if (!t) return "Now";
    return formatTime(t, timezone, { hour: "numeric", minute: "2-digit" });
  };

  const add = (severity, title, detail, when = "Now") => {
    alerts.push({ severity, title, detail, when });
  };

  // Thunderstorm / severe (Open-Meteo thunder codes: 95/96/99)
  if (code >= 95) {
    add("crit", "Thunderstorm", "Lightning risk. Seek shelter; avoid open areas.", "Now");
  }

  // Flash-flood-ish heuristic: high POP + rain codes + sustained
  const isRain = (c) => (c >= 61 && c <= 67) || (c >= 80 && c <= 82) || (c >= 51 && c <= 57);
  const futurePopMax = Math.max(...(hourly.pop || []).slice(idx, idx + 6).map(Number).filter(Number.isFinite), pop);

  if (isRain(code) && (pop >= 80 || futurePopMax >= 85)) {
    add("warn", "Heavy Rain Possible", "High precip probability. Watch for ponding and rapid rises.", at(0));
  }

  // Wind warning heuristic
  if (windMph >= 35) {
    add("warn", "High Wind", `Sustained winds near ${Math.round(windMph)} mph. Secure loose objects.`, "Now");
  } else if (windMph >= 25) {
    add("watch", "Gusty Winds", `Winds near ${Math.round(windMph)} mph. Choppy driving conditions.`, "Now");
  }

  // Snow codes
  const isSnow = (c) => (c >= 71 && c <= 77) || (c >= 85 && c <= 86);
  if (isSnow(code)) {
    add("watch", "Snow / Reduced Visibility", "Watch for slick roads and reduced visibility.", "Now");
  }

  // Pressure trend cue (storm-chaser vibe)
  const presNow = (hourly.pressure?.[idx]);
  const presFuture = (hourly.pressure?.[Math.min(idx + 3, (hourly.time?.length || 1) - 1)]);
  if (Number.isFinite(presNow) && Number.isFinite(presFuture)) {
    const dp = presFuture - presNow;
    if (dp <= -3) add("watch", "Falling Pressure", "Pressure dropping fast — conditions may worsen.", at(3));
  }

  // Sort: crit -> warn -> watch
  const rank = { crit: 0, warn: 1, watch: 2 };
  alerts.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9));
  return alerts;
}

function renderAlerts(alerts) {
  if (!els.alerts) return;

  if (!alerts || !alerts.length) {
    els.alerts.hidden = true;
    els.alerts.classList.remove("wx-alert-crit", "wx-alert-warn", "wx-alert-watch");
    return;
  }

  const top = alerts[0];
  els.alerts.hidden = false;

  els.alerts.classList.toggle("wx-alert-crit", top.severity === "crit");
  els.alerts.classList.toggle("wx-alert-warn", top.severity === "warn");
  els.alerts.classList.toggle("wx-alert-watch", top.severity === "watch");

  if (els.alertsTitle) {
    els.alertsTitle.textContent =
      top.severity === "crit" ? "Severe Alert" : top.severity === "warn" ? "Warning" : "Watch / Advisory";
  }

  if (els.alertsBody) {
    els.alertsBody.innerHTML = alerts.map(a => `
      <div class="wx-alert-item">
        <div class="wx-alert-dot"></div>
        <div>
          <div class="wx-alert-main">${a.title}</div>
          <div class="wx-alert-sub">${a.detail}</div>
        </div>
        <div class="wx-alert-time">${a.when}</div>
      </div>
    `).join("");
  }
}

/* =========================
   Barometer
========================= */
// ... (Barometer functions: setPressureVisuals, updateBarometerInstant, updateBarometer - kept as is)
function setPressureVisuals(pressure, trend) {
  const minP = 970;
  const maxP = 1040;
  const clamped = Math.max(minP, Math.min(maxP, pressure));
  const ratio = (clamped - minP) / (maxP - minP);

  const hue = Math.round(25 + ratio * (210 - 25));
  root.style.setProperty("--wx-p-ratio", String(ratio));
  root.style.setProperty("--wx-p-hue", String(hue));

  document.body.classList.toggle("wx-p-rising", trend === "rising");
  document.body.classList.toggle("wx-p-falling", trend === "falling");
  document.body.classList.toggle("wx-p-stable", trend === "stable");
}

function updateBarometerInstant(pressure) {
  const minP = 970;
  const maxP = 1040;
  const clamped = Math.max(minP, Math.min(maxP, pressure));
  const ratio = (clamped - minP) / (maxP - minP);

  const minDeg = -135;
  const maxDeg = 45;
  const deg = minDeg + ratio * (maxDeg - minDeg);

  if (els.needle) els.needle.style.transform = `translate(-50%, -50%) rotate(${deg}deg)`;

  const arcLen = 212;
  const offset = (1 - ratio) * arcLen;
  if (els.pressureArc) els.pressureArc.style.strokeDashoffset = `${offset}`;
  if (els.pressureArcGlow) els.pressureArcGlow.style.strokeDashoffset = `${offset}`;

  if (els.pressureDot) {
    const r = 45;
    const rad = (deg - 90) * (Math.PI / 180);
    const cx = 60 + Math.cos(rad) * r;
    const cy = 60 + Math.sin(rad) * r;
    els.pressureDot.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
  }

  if (els.pressureValue) {
    els.pressureValue.textContent = `${Math.round(pressure)} hPa`;
    els.pressureValue.classList.remove("wx-value-pop");
    void els.pressureValue.offsetWidth;
    els.pressureValue.classList.add("wx-value-pop");
    setTimeout(() => els.pressureValue.classList.remove("wx-value-pop"), 180);
  }
}

function updateBarometer(pressure) {
  let trend = "stable";
  if (lastPressure !== null) {
    const diff = pressure - lastPressure;
    if (Math.abs(diff) < 1) trend = "stable";
    else if (diff > 0) trend = "rising";
    else trend = "falling";
  }
  lastPressure = pressure;

  if (els.pressureTrend) {
    els.pressureTrend.textContent = trend === "stable" ? "Stable" : trend === "rising" ? "Rising" : "Falling";
  }

  setPressureVisuals(pressure, trend);

  const currentDisplayed = pressureAnim.to ?? pressure;
  pressureAnim.from = currentDisplayed;
  pressureAnim.to = pressure;
  pressureAnim.start = performance.now();

  cancelAnimationFrame(pressureAnim.raf);

  const ease = (p) => 1 - Math.pow(1 - p, 3);
  function step(now) {
    const p = Math.min(1, (now - pressureAnim.start) / pressureAnim.dur);
    const v = pressureAnim.from + (pressureAnim.to - pressureAnim.from) * ease(p);
    updateBarometerInstant(v);
    if (p < 1) pressureAnim.raf = requestAnimationFrame(step);
  }
  pressureAnim.raf = requestAnimationFrame(step);
}
/* =========================
   Daily Forecast Interactivity
========================= */
function toggleDailyDetail(event) {
  const item = event.target.closest(".wx-daily-item");
  if (!item) return;

  if (item.classList.contains("open")) {
    item.classList.remove("open");
    return;
  }

  document.querySelectorAll(".wx-daily-item.open").forEach(other => {
    other.classList.remove("open");
  });

  item.classList.add("open");
}

/* =========================
   Render
========================= */
function render() {
  if (!wxData) return;
  
  // Use the nested object structure to access raw data
  const curr = wxData.current || {};
  const hourly = wxData.hourly || {};
  const daily = wxData.daily || {};
  const timezone = wxData.tz;

  const info = getWeatherInfo(curr.code, curr.isDay);

  els.location.textContent = wxData.locationName || "Local weather";
  els.conditionText.textContent = info.desc;
  els.conditionIconContainer.innerHTML = `<img src="${info.path}" alt="${info.desc}" class="wx-icon-hero">`;

  // FIX: Use rawTemp for conversion
  animateNumber(els.currentTemp, getTemp(curr.rawTemp), "°");
  
  // FIX: Use rawWindSpeed for conversion
  els.wind.textContent = `Wind: ${getWind(curr.rawWindSpeed)}`; 
  
  root.style.setProperty("--wx-bg-top", info.bg[0]);
  root.style.setProperty("--wx-bg-bottom", info.bg[1]);

  // timezone-aware "now" index (logic remains the same)
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (t) => parts.find((p) => p.type === t)?.value;
  const key = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}`;
  let idx = hourly.time.findIndex((t) => t.startsWith(key));
  if (idx === -1) idx = 0;

  // FIX: Use rawFeels for conversion
  els.feelsLike.textContent = `Feels like ${getTemp(hourly.rawFeels[idx])}°`;

  const precipProb = hourly.pop[idx] ?? 0;
  els.precip.textContent = `Precip: ${precipProb}%`;

  // Gauges (right of the temperature)
  // Wind speed + unit
  const windBaseMph = Number(curr.rawWindSpeed ?? 0);
  const windVal = wxUnit === "F" ? Math.round(windBaseMph) : Math.round(windBaseMph * 1.60934);
  const windUnit = wxUnit === "F" ? "mph" : "km/h";
  const gWind = document.getElementById("wx-g-wind");
  const gWindUnit = document.getElementById("wx-g-wind-unit");
  if (gWind) gWind.textContent = Number.isFinite(windVal) ? String(windVal) : "--";
  if (gWindUnit) gWindUnit.textContent = windUnit;

  // Pressure: base is hPa (Open-Meteo surface_pressure / msl)
  const presHpa = Number(hourly.pressure?.[idx]);
  const gPres = document.getElementById("wx-g-pressure");
  const gPresUnit = document.getElementById("wx-g-pressure-unit");
  if (gPres) {
    if (Number.isFinite(presHpa)) {
      if (wxUnit === "F") {
        const inHg = presHpa * 0.02953;
        gPres.textContent = inHg.toFixed(2);
        if (gPresUnit) gPresUnit.textContent = "inHg";
      } else {
        gPres.textContent = String(Math.round(presHpa));
        if (gPresUnit) gPresUnit.textContent = "hPa";
      }
    } else {
      gPres.textContent = "----";
    }
  }

  // Daylight: minutes to sunset (today)
  const gDay = document.getElementById("wx-g-daylight");
  try {
    const dayKey = hourly.time?.[idx]?.slice(0, 10) || daily.time?.[0];
    const dayIdx = (daily.time || []).findIndex((d) => d === dayKey);
    const sunsetIso = daily.sunset?.[dayIdx >= 0 ? dayIdx : 0];
    if (gDay && sunsetIso) {
      const mins = Math.max(0, Math.floor((new Date(sunsetIso).getTime() - Date.now()) / 60000));
      gDay.textContent = String(mins);
    } else if (gDay) {
      gDay.textContent = "--";
    }
  } catch {
    if (gDay) gDay.textContent = "--";
  }

  // Moon illumination (approx) from Open-Meteo moon_phase (0..1)
  const gMoon = document.getElementById("wx-g-moon");
  try {
    const dayKey = hourly.time?.[idx]?.slice(0, 10) || daily.time?.[0];
    const dayIdx = (daily.time || []).findIndex((d) => d === dayKey);
    const phase = Number(daily.moonPhase?.[dayIdx >= 0 ? dayIdx : 0]);
    if (gMoon && Number.isFinite(phase)) {
      const illum = 0.5 * (1 - Math.cos(2 * Math.PI * phase));
      gMoon.textContent = String(Math.round(illum * 100));
    } else if (gMoon) {
      gMoon.textContent = "--";
    }
  } catch {
    if (gMoon) gMoon.textContent = "--";
  }

  // Alerts
  renderAlerts(buildAlerts(curr, hourly, idx, timezone));

  // Ambient FX (logic remains the same)
  const code = curr.code;
  const isFog = code >= 45 && code <= 48;
  const isSnow = (code >= 71 && code <= 77) || (code >= 85 && code <= 86);
  const isRain = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
  const mode = isFog ? "fog" : isSnow ? "snow" : isRain ? "rain" : "dust";

  fx.set({
    mode,
    windMph: Number(curr.rawWindSpeed || 0),
    intensity: Math.max(0, Math.min(1, (precipProb ?? 0) / 100)),
  });

  // FIX: Use rawHi/rawLo for conversion
  els.hiLo.textContent = `H:${getTemp(daily.rawHi[0])}° L:${getTemp(daily.rawLo[0])}°`;

  // Hourly (Next 24h)
  els.hourly.innerHTML = "";
  let hourlyHTML = "";
  for (let i = idx; i < idx + 24 && i < hourly.time.length; i++) {
    const hInfo = getWeatherInfo(hourly.code[i], hourly.isDay[i]);
    const hTime = formatTime(hourly.time[i], timezone, { hour: "numeric" });

    hourlyHTML += `
      <div class="wx-hourly-item">
        <span class="wx-hourly-item-time">${i === idx ? "Now" : hTime}</span>
        <img src="${hInfo.path}" alt="${hInfo.desc}" class="wx-hourly-item-icon">
        <span class="wx-hourly-item-temp">${getTemp(hourly.rawTemp[i])}°</span>
      </div>
    `;
  }
  els.hourly.innerHTML = hourlyHTML;

  // Daily (7 days)
  let dailyHTML = "";
  for (let i = 0; i < 7 && i < daily.time.length; i++) {
    const dInfo = getWeatherInfo(daily.code[i], 1);
    const dLabel = i === 0 ? "Today" : formatTime(daily.time[i], timezone, { weekday: "long" });

    const maxWind = daily.rawWindMax[i] || 0;
    const precipSum = daily.precipSum[i] || 0;
    const uvMax = daily.uvMax[i] || 0;

    dailyHTML += `
      <div class="wx-daily-item" data-index="${i}">
        <div class="wx-daily-row">
          <span class="wx-daily-label">${dLabel}</span>
          <img src="${dInfo.path}" alt="${dInfo.desc}" class="wx-daily-icon">
          <div class="wx-daily-temps">
            <span>${getTemp(daily.rawHi[i])}°</span>
            <span>${getTemp(daily.rawLo[i])}°</span>
          </div>
        </div>
        <div class="wx-daily-details">
          <div>Max Wind: <strong>${getWind(maxWind)}</strong></div>
          <div>UV Index Max: <strong>${Math.round(uvMax)}</strong></div>
          <div>Precipitation: <strong>${getPrecip(precipSum)}</strong></div>
          <div>Condition: <strong>${dInfo.desc}</strong></div>
        </div>
      </div>
    `;
  }
  els.daily.innerHTML = dailyHTML;
  
  els.daily.removeEventListener("click", toggleDailyDetail); 
  els.daily.addEventListener("click", toggleDailyDetail);


  // Pressure
  const pres = hourly.pressure?.[idx];
  if (pres != null) updateBarometer(pres);

  // Radar (logic remains the same)
  const lat = wxData.lat ?? DEFAULT_LAT;
  const lon = wxData.lon ?? DEFAULT_LON;

  if (els.radarIframe) {
    const zoom = 7; 
    const unitsWind = wxUnit === "F" ? "mph" : "kt";
    const unitsTemp = wxUnit === "F" ? "F" : "C";
    const src =
      `https://embed.windy.com/embed2.html?lat=${lat}&lon=${lon}` +
      `&detailLat=${lat}&detailLon=${lon}` +
      `&width=650&height=450&zoom=${zoom}` +
      `&level=surface&overlay=radar&product=radar&menu=&message=true` +
      `&marker=true&calendar=now&type=map&location=coordinates` +
      `&metricWind=${unitsWind}&metricTemp=${unitsTemp}&radarRange=-1`;

    if (els.radarIframe.dataset.src !== src) {
      els.radarIframe.dataset.src = src;
      els.radarIframe.src = src;
    }
  }

  if (els.radarLink) els.radarLink.href = `https://www.windy.com/?${lat},${lon},10`;
}

/* =========================
   Fetch
========================= */
async function getLocationViaIP() {
  try {
    const res = await fetch("https://ipwho.is/", { cache: "no-store" });
    const data = await res.json();
    if (!data.success) return null;
    return { lat: data.latitude, lon: data.longitude, name: `${data.city}, ${data.country_code}` };
  } catch {
    return null;
  }
}

async function loadWeather(useGeo) {
  let lat = DEFAULT_LAT;
  let lon = DEFAULT_LON;
  let name = "New York, USA";

  els.location.textContent = "Locating...";
  els.conditionText.textContent = "Fetching...";

  let foundLocation = null;

  // 1) Browser geolocation
  if (useGeo && navigator.geolocation) {
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3500 });
      });
      foundLocation = { lat: pos.coords.latitude, lon: pos.coords.longitude, name: "My Location" };
    } catch {}
  }

  // 2) IP fallback
  if (!foundLocation) {
    const ipLoc = await getLocationViaIP();
    if (ipLoc) foundLocation = ipLoc;
    else name = "New York (Fallback)";
  }

  if (foundLocation) {
    lat = foundLocation.lat;
    lon = foundLocation.lon;
    name = foundLocation.name;
  }
  
  const fetchedData = await WX.fetchOpenMeteo({ lat, lon, unit: wxUnit });
  
  if (fetchedData) {
    wxData = { ...fetchedData, locationName: name };
    render();
  } else {
    els.location.textContent = "Connection Error";
    els.conditionText.textContent = "Failed to fetch weather";
    renderAlerts([]);
  }
}

/* =========================
   Events
========================= */
function setUnit(u) {
  wxUnit = u;
  els.unitF?.classList.toggle("active", u === "F");
  els.unitC?.classList.toggle("active", u === "C");
  
  // Since all data is stored as raw Celsius, we can just re-render immediately.
  // We only need to reload if the data is stale or if the initial load failed.
  if (wxData) {
    render();
  } else {
    loadWeather(false);
  }
}

els.unitF?.addEventListener("click", () => setUnit("F"));
els.unitC?.addEventListener("click", () => setUnit("C"));
els.locate?.addEventListener("click", () => loadWeather(true));

els.alertsClose?.addEventListener("click", () => {
  if (els.alerts) els.alerts.hidden = true;
});

// Init
loadWeather(true);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) loadWeather(false);
});