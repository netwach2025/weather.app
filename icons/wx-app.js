/* wx-app.js
 * NetWatch Weather full-screen app (weather.html)
 */

import { WX } from "./wx-core.js";

export function initNetWatchApp() {
  const fallback = { lat: 33.7490, lon: -84.3880, label: "Atlanta, GA" };
  const el = (id) => document.getElementById(id);

  const els = {
    bg: el("wx-app-bg"),
    back: el("wx-app-back"),

    unitF: el("wx-app-unit-f"),
    unitC: el("wx-app-unit-c"),

    place: el("wx-app-place"),
    temp: el("wx-app-temp"),
    icon: el("wx-app-icon"),
    meta: el("wx-app-meta"),
    insight: el("wx-app-insight"),

    hourly: el("wx-app-hourly"),
    daily: el("wx-app-daily"),

    needle: el("wx-app-needle"),
    pressureValue: el("wx-app-pressure"),
    pressureTrend: el("wx-app-pressure-trend"),

    radarLink: el("wx-app-radar-link"),
  };

  let unit = "F";
  let loc = { ...fallback };
  let lastPressure = null;

  function setUnit(next) {
    unit = next;
    els.unitF?.classList.toggle("active", unit === "F");
    els.unitC?.classList.toggle("active", unit === "C");
    refresh();
  }

  function applyMood(code, isDay) {
    const mood = WX.skyMood(code, isDay);
    const vis = WX.visualsForMood(mood);

    els.bg?.setAttribute("data-sky", mood);
    document.documentElement.style.setProperty("--wx-bg-top", vis.top);
    document.documentElement.style.setProperty("--wx-bg-bot", vis.bot);
    document.documentElement.style.setProperty("--wx-bg-img", vis.img);
  }

  function updateBarometer(pressure) {
    const min = 970, max = 1040;
    const clamped = Math.max(min, Math.min(max, pressure));
    const ratio = (clamped - min) / (max - min);
    const deg = -135 + ratio * 180;

    if (els.needle) els.needle.style.transform = `translate(-50%, -50%) rotate(${deg}deg)`;
    if (els.pressureValue) els.pressureValue.textContent = `${Math.round(pressure)} hPa`;

    if (els.pressureTrend) {
      if (lastPressure == null) els.pressureTrend.textContent = "Stable";
      else {
        const diff = pressure - lastPressure;
        els.pressureTrend.textContent = Math.abs(diff) < 1 ? "Stable" : diff > 0 ? "Rising" : "Falling";
      }
    }
    lastPressure = pressure;
  }

  async function refresh() {
    try {
      const data = await WX.fetchOpenMeteo({ lat: loc.lat, lon: loc.lon, unit });
      const { current, hourly, daily, tz } = data;

      // HERO
      if (els.icon) els.icon.innerHTML = WX.iconFromWeatherCode(current.code, current.isDay, "wx-icon-hero");
      if (els.temp) els.temp.textContent = `${current.temp}°${unit}`;
      if (els.place) els.place.textContent = loc.label || "Local weather";
      if (els.meta) els.meta.textContent = `Wind ${current.wind} • ${WX.labelForWeatherCode(current.code)}`;

      applyMood(current.code, current.isDay);

      // Insight
      const idx = WX.hourIndexNow(hourly.time, tz);
      const change = WX.nextChangeInsight(hourly, idx);
      if (els.insight) {
        els.insight.textContent = change
          ? `Next change: ${WX.labelForWeatherCode(change.toCode)} in ~${change.inHours}h`
          : `Stable conditions ahead`;
      }

      // HOURLY (12)
      if (els.hourly && hourly.time.length) {
        const sliceEnd = Math.min(idx + 12, hourly.time.length);
        const chips = [];
        for (let i = idx; i < sliceEnd; i++) {
          const isNow = i === idx;
          chips.push(`
            <div class="wx-hour-chip">
              <div class="wx-hour-time">${isNow ? "Now" : WX.formatHour(hourly.time[i], tz)}</div>
              <div class="wx-hour-ic">${WX.iconFromWeatherCode(hourly.code[i], true, "wx-hour-icimg")}</div>
              <div class="wx-hour-temp">${hourly.temp[i]}°</div>
              <div class="wx-hour-pop">${hourly.pop[i] ?? 0}% precip</div>
            </div>
          `);
        }
        els.hourly.innerHTML = chips.join("");
      }

      // DAILY (7)
      if (els.daily && daily.time.length) {
        const rows = [];
        const days = Math.min(7, daily.time.length);
        for (let i = 0; i < days; i++) {
          rows.push(`
            <div class="wx-day-row">
              <div class="wx-day-name">${i === 0 ? "Today" : WX.formatWeekday(daily.time[i], tz)}</div>
              <div class="wx-day-ic">${WX.iconFromWeatherCode(daily.code[i], true, "wx-day-icimg")}</div>
              <div class="wx-day-temps">
                <span class="max">${daily.hi[i]}°</span>
                <span class="min">${daily.lo[i]}°</span>
              </div>
            </div>
          `);
        }
        els.daily.innerHTML = rows.join("");
      }

      // BAROMETER
      const p = hourly.pressure[idx];
      if (p != null) updateBarometer(p);

      // RADAR
      if (els.radarLink) els.radarLink.href = `https://www.windy.com/?${loc.lat},${loc.lon},10`;
    } catch (e) {
      console.error("App refresh error:", e);
      if (els.place) els.place.textContent = "Weather unavailable";
    }
  }

  // Back button
  els.back?.addEventListener("click", () => {
    if (window.history.length > 1) window.history.back();
    else window.location.href = "index.html";
  });

  // Units
  els.unitF?.addEventListener("click", () => setUnit("F"));
  els.unitC?.addEventListener("click", () => setUnit("C"));

  // Init
  if (els.place) els.place.textContent = "Locating…";
  WX.resolveLocation(fallback).then((found) => {
    loc = found || fallback;
    refresh();
  });

  setInterval(refresh, 10 * 60 * 1000);
}

document.addEventListener("DOMContentLoaded", initNetWatchApp);
