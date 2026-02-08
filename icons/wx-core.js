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
  function convertTemp(c, unit) { return unit === "F" ? Math.round(cToF(c)) : Math.round(c); }
  function windText(mph, unit) { return unit === "F" ? `${Math.round(mph)} mph` : `${Math.round(mph * 1.60934)} km/h`; }

  async function fetchOpenMeteo({ lat, lon, unit = "F" }) {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}` +
      `&longitude=${lon}` +
      `&current_weather=true` +
      `&hourly=temperature_2m,apparent_temperature,precipitation_probability,weathercode,is_day,surface_pressure,pressure_msl` +
      `&daily=temperature_2m_max,temperature_2m_min,weathercode` +
      `&windspeed_unit=mph` +
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
        temp: convertTemp(cw.temperature ?? 0, unit),
        wind: windText(cw.windspeed ?? 0, unit),
      },

      hourly: {
        time: hourly.time || [],
        temp: (hourly.temperature_2m || []).map((c) => convertTemp(c, unit)),
        feels: (hourly.apparent_temperature || []).map((c) => convertTemp(c, unit)),
        pop: hourly.precipitation_probability || [],
        code: hourly.weathercode || [],
        isDay: hourly.is_day || [],
        pressure: hourly.surface_pressure || hourly.pressure_msl || [],
      },

      daily: {
        time: daily.time || [],
        hi: (daily.temperature_2m_max || []).map((c) => convertTemp(c, unit)),
        lo: (daily.temperature_2m_min || []).map((c) => convertTemp(c, unit)),
        code: daily.weathercode || [],
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
  };
})();
