/* wx-core.js
 * NetWatch Weather — shared core:
 * - weathercode -> icon + label + mood + visuals
 * - location: GPS -> IP -> fallback
 * - Open-Meteo fetch + normalization
 */

export const WX = (() => {
  const ICON_BASE = "icons/";

  /* ---------------- ICONS + LABELS ---------------- */

  function iconFromWeatherCode(code, isDay = true, cssClass = "weather-anim") {
    const day = !!isDay;
    const img = (file, alt) =>
      `<img src="${ICON_BASE}${file}" alt="${alt}" class="${cssClass}">`;

    if (code === 0) return img(day ? "day.svg" : "night.svg", day ? "Clear sky" : "Clear night");
    if (code === 1 || code === 2) return img(day ? "cloudy-day-1.svg" : "cloudy-night-1.svg", "Partly cloudy");
    if (code === 3) return img("cloudy.svg", "Overcast");
    if (code >= 45 && code <= 48) return img("cloudy.svg", "Fog");
    if (code >= 51 && code <= 57) return img("rainy-1.svg", "Drizzle");
    if (code >= 61 && code <= 67) return img("rainy-4.svg", "Rain");
    if (code >= 71 && code <= 77) return img("snowy-4.svg", "Snow");
    if (code >= 80 && code <= 82) return img("rainy-6.svg", "Rain showers");
    if (code >= 85 && code <= 86) return img("snowy-6.svg", "Snow showers");
    if (code >= 95) return img("thunder.svg", "Thunderstorm");
    return img("weather.svg", "Weather");
  }

  function labelForWeatherCode(code) {
    if (code === 0) return "Clear";
    if (code === 1) return "Mainly clear";
    if (code === 2) return "Partly cloudy";
    if (code === 3) return "Overcast";
    if (code >= 45 && code <= 48) return "Fog";
    if (code >= 51 && code <= 57) return "Drizzle";
    if (code >= 61 && code <= 67) return "Rain";
    if (code >= 71 && code <= 77) return "Snow";
    if (code >= 80 && code <= 82) return "Showers";
    if (code >= 85 && code <= 86) return "Snow showers";
    if (code >= 95) return "Thunderstorm";
    return "Weather";
  }

  /* ---------------- MOOD + VISUALS ---------------- */

  function skyMood(code, isDay = true) {
    if (!isDay) return "clear-night";
    if (code === 0 || code === 1) return "clear";
    if (code === 2 || code === 3) return "overcast";
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return "rain";
    if (code >= 71 && code <= 77) return "snow";
    return "default";
  }

  // Uses your uploaded assets.
  function visualsForMood(mood) {
    const V = {
      clear:       { img: 'url("./boom.png")',       top: "#3b82f6", bot: "#020617" },
      "clear-night": { img: 'url("./boom.png")',     top: "#0f172a", bot: "#020617" },
      overcast:    { img: 'url("./bg-live-dc.jpg")', top: "#475569", bot: "#0b1220" },
      rain:        { img: 'url("./bg-live-dc.jpg")', top: "#1f2937", bot: "#020617" },
      snow:        { img: 'url("./boom.png")',       top: "#60a5fa", bot: "#0b1220" },
      default:     { img: 'url("./boom.png")',       top: "#274690", bot: "#020617" },
    };
    return V[mood] || V.default;
  }

  /* ---------------- LOCATION ---------------- */

  function getGeoLocationViaBrowser() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: "My Location" }),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 7000, maximumAge: 10 * 60 * 1000 }
      );
    });
  }

  async function getLocationViaIP() {
    try {
      const res = await fetch("https://ipwho.is/");
      const data = await res.json();
      if (!data.success) return null;

      const city = data.city || "";
      const region = data.region || "";
      const country = data.country_code || "";

      let label = city;
      if (city && region) label = `${city}, ${region}`;
      else if (!city && region) label = region;
      else if (!label && country) label = country;
      if (!label) label = "Local weather";

      return { lat: data.latitude, lon: data.longitude, label };
    } catch {
      return null;
    }
  }

  async function resolveLocation(fallback) {
    const geo = await getGeoLocationViaBrowser();
    if (geo) return geo;
    const ip = await getLocationViaIP();
    if (ip) return ip;
    return fallback;
  }

  /* ---------------- FETCH + NORMALIZE ---------------- */

  function cToF(c) { return (c * 9) / 5 + 32; }
  
  // Conversion utility exposed for wx-app.js to use during rendering
  function convertTemp(c, unit) { 
    if (typeof c !== 'number' || isNaN(c)) return '--';
    return unit === "F" ? Math.round(cToF(c)) : Math.round(c); 
  }
  
  function windText(mph, unit) { 
    if (typeof mph !== 'number' || isNaN(mph)) return '--';
    return unit === "F" ? `${Math.round(mph)} mph` : `${Math.round(mph * 1.60934)} km/h`; 
  }

  // Approximate lunar phase fraction [0..1) for a given date (0=new, 0.5=full).
  // Uses a simple synodic month approximation; good enough for UI gauges.
  function moonPhaseFraction(date) {
    const synodic = 29.530588853; // days
    // Reference new moon: 2000-01-06 18:14 UTC (approx)
    const ref = Date.UTC(2000, 0, 6, 18, 14, 0);
    const days = (date.getTime() - ref) / 86400000;
    let phase = (days / synodic) % 1;
    if (phase < 0) phase += 1;
    return phase;
  }

  function computeMoonPhaseArray(dateStrings) {
    // dateStrings are YYYY-MM-DD from Open-Meteo daily.time; treat as local noon for stability
    return (dateStrings || []).map((d) => {
      const parts = String(d).split("-").map(Number);
      if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return NaN;
      const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
      return moonPhaseFraction(dt);
    });
  }


  async function fetchOpenMeteo({ lat, lon, unit = "F" }) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new Error(`Invalid coordinates for Open-Meteo request (lat=${lat}, lon=${lon})`);
    }

    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}` +
      `&longitude=${lon}` +
      `&current_weather=true` +
      `&hourly=temperature_2m,apparent_temperature,precipitation_probability,weathercode,is_day,surface_pressure` +
      `&daily=temperature_2m_max,temperature_2m_min,weathercode,uv_index_max,precipitation_sum,windspeed_10m_max,sunrise,sunset` +
      `&windspeed_unit=mph` + // Keep windspeed in MPH as a base unit
      `&timezone=auto`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Open-Meteo error");
    const j = await res.json();

    const cw = j.current_weather || {};
    const hourly = j.hourly || {};
    const daily = j.daily || {};

    return {
      tz: j.timezone,
      lat: j.latitude,
      lon: j.longitude,

      current: {
        code: cw.weathercode ?? 0,
        isDay: !!cw.is_day,
        // Store raw temperature (C)
        rawTemp: cw.temperature ?? 0, 
        wind: windText(cw.windspeed ?? 0, unit),
        rawWindSpeed: cw.windspeed ?? 0,
      },

      hourly: {
        time: hourly.time || [],
        // Store raw temperature arrays (C)
        rawTemp: hourly.temperature_2m || [],
        rawFeels: hourly.apparent_temperature || [],
        pop: hourly.precipitation_probability || [],
        code: hourly.weathercode || [],
        isDay: hourly.is_day || [],
        pressure: hourly.surface_pressure || hourly.pressure_msl || [],
      },

      daily: {
        time: daily.time || [],
        // Store raw temperature arrays (C)
        rawHi: daily.temperature_2m_max || [],
        rawLo: daily.temperature_2m_min || [],
        code: daily.weathercode || [],
        uvMax: daily.uv_index_max || [], 
        precipSum: daily.precipitation_sum || [], 
        rawWindMax: daily.windspeed_10m_max || [],
        sunrise: daily.sunrise || [],
        sunset: daily.sunset || [],
        moonPhase: computeMoonPhaseArray(daily.time || []),
      },
    };

  }

  /* ---------------- TIME + INSIGHT ---------------- */

  function formatHour(iso, tz) {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric" }).format(new Date(iso));
  }

  function formatWeekday(iso, tz) {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(new Date(iso));
  }

  function hourIndexNow(times, tz) {
    if (!times || !times.length) return 0;

    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(now);

    const get = (t) => parts.find((p) => p.type === t)?.value;
    const key = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}`;

    const idx = times.findIndex((t) => t.startsWith(key));
    return idx === -1 ? 0 : idx;
  }

  function nextChangeInsight(hourly, startIdx = 0) {
    if (!hourly?.code?.length) return null;
    const base = hourly.code[startIdx];
    for (let i = startIdx + 1; i < Math.min(startIdx + 18, hourly.code.length); i++) {
      if (hourly.code[i] !== base) return { inHours: i - startIdx, toCode: hourly.code[i] };
    }
    return null;
  }

  return {
    iconFromWeatherCode,
    labelForWeatherCode,
    skyMood,
    visualsForMood,
    resolveLocation,
    fetchOpenMeteo,
    formatHour,
    formatWeekday,
    hourIndexNow,
    nextChangeInsight,
    convertTemp, // Exported utility
    windText,    // Exported utility
  };
})();