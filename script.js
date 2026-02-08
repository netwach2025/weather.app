const API_KEY = 'YOUR_API_KEY';
const city = 'London'; // You can use geolocation here

async function updateGauges() {
  const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=imperial`);
  const data = await response.json();

  // Update Wind
  document.getElementById('wind-speed').innerText = `${Math.round(data.wind.speed)} mph`;
  
  // Update Pressure
  document.getElementById('pressure').innerText = `${data.main.pressure} hPa`;

  // Calculate Daylight Remaining
  const now = Math.floor(Date.now() / 1000);
  const sunset = data.sys.sunset;
  const remaining = Math.max(0, Math.floor((sunset - now) / 60));
  document.getElementById('daylight').innerText = `${remaining} min`;
}

// Update every 5 minutes
setInterval(updateGauges, 300000);
updateGauges();