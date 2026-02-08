/* wx-widget.js
 * NetWatch header widget:
 * - hover opens panel
 * - click goes to weather.html
 * - GPS -> IP -> fallback
 */

import { WX } from "./wx-core.js";

export function initNetWatchWidget() {
  const fallback = { lat: 33.7490, lon: -84.3880, label: "Atlanta, GA" };

  const btn = document.getElementById("weatherBtn");
  const panel = document.getElementById("weatherPanel");

  const wxIcon = document.getElementById("wx-icon");
  const wxTemp = document.getElementById("wx-temp");
  const wxPlace = document.getElementById("wx-place");
  const wxMeta = document.getElementById("wx-meta");
  const boxH = document.getElementById("wx-forecast");
  const boxD = document.getElementById("wx-daily");

  const uF = document.getElementById("uF");
  const uC = document.getElementById("uC");

  let unit = "F";
  let loc = { ...fallback };
  let hoverTimer = null;

  function setUnit(next) {
    unit = next;
    uF?.classList.toggle("active", unit === "F");
    uC?.classList.toggle("active", unit === "C");
    refresh();
  }

  async function refresh() {
    try {
      const data = await WX.fetchOpenMeteo({ lat: loc.lat, lon: loc.lon, unit });
      const { current, hourly, daily, tz } = data;

      if (wxIcon) wxIcon.innerHTML = WX.iconFromWeatherCode(current.code, current.isDay, "weather-anim-main");
      if (wxTemp) wxTemp.textContent = `${current.temp}°${unit}`;
      if (wxPlace) wxPlace.textContent = loc.label || "Local weather";
      if (wxMeta) wxMeta.textContent = `Wind ${current.wind}`;

      // Make the dropdown feel “alive” with a mood tint (no heavy image in header)
      if (panel) {
        const mood = WX.skyMood(current.code, current.isDay);
        const v = WX.visualsForMood(mood);
        panel.style.background =
          `radial-gradient(circle at top, ${v.top} 0%, rgba(15,23,42,0.88) 60%, ${v.bot} 100%)`;
      }

      // Hourly chips (next 8)
      if (boxH && hourly.time.length) {
        const idx = WX.hourIndexNow(hourly.time, tz);
        const items = [];
        for (let i = idx; i < Math.min(idx + 8, hourly.time.length); i++) {
          items.push({
            t: i === idx ? "Now" : WX.formatHour(hourly.time[i], tz),
            temp: hourly.temp[i],
            pop: hourly.pop[i] ?? 0,
            code: hourly.code[i],
          });
        }

        boxH.innerHTML = items.map(it => `
          <div class="chip">
            <div class="t">${it.t}</div>
            <div class="v">${it.temp}°</div>
            <div class="t">${it.pop}% • ${WX.iconFromWeatherCode(it.code, true)}</div>
          </div>
        `).join("");
      }

      // Daily (next 3)
      if (boxD && daily.time.length) {
        boxD.innerHTML = daily.time.slice(0, 3).map((d, i) => `
          <div class="row">
            <div>${WX.formatWeekday(d, tz)}</div>
            <div style="font-size:18px">${WX.iconFromWeatherCode(daily.code[i], true)}</div>
            <div>${daily.lo[i]}° / <strong>${daily.hi[i]}°</strong></div>
          </div>
        `).join("");
      }

      if (btn) btn.title = `Local weather — ${loc.label}`;
    } catch (e) {
      console.error("Widget refresh error:", e);
      if (wxPlace) wxPlace.textContent = "Weather unavailable";
    }
  }

  // Hover open/close
  if (btn && panel) {
    const open = () => {
      clearTimeout(hoverTimer);
      panel.classList.add("open");
      btn.setAttribute("aria-expanded", "true");
    };
    const closeSoon = () => {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        panel.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
      }, 150);
    };

    btn.addEventListener("mouseenter", open);
    panel.addEventListener("mouseenter", open);
    btn.addEventListener("mouseleave", closeSoon);
    panel.addEventListener("mouseleave", closeSoon);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      window.location.href = "weather.html";
    });
  }

  // Unit toggles
  uF?.addEventListener("click", () => setUnit("F"));
  uC?.addEventListener("click", () => setUnit("C"));

  // Init
  if (wxPlace) wxPlace.textContent = "Locating…";
  WX.resolveLocation(fallback).then((found) => {
    loc = found || fallback;
    refresh();
  });

  setInterval(refresh, 10 * 60 * 1000);
}

document.addEventListener("DOMContentLoaded", initNetWatchWidget);
