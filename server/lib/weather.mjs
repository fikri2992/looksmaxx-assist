// Open-Meteo, no key. Used as context the way a professional checks conditions first:
// the real forecast only for the next few days, because 10+ day forecasts are right about half the time.
export async function weatherToday(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=3`
    + '&daily=uv_index_max,apparent_temperature_max,precipitation_probability_max,relative_humidity_2m_mean';
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const { daily } = await res.json();
  return daily.time.map((date, i) => ({
    date, uvMax: daily.uv_index_max[i], feelsMax: daily.apparent_temperature_max[i],
    rainChance: daily.precipitation_probability_max[i], humidity: daily.relative_humidity_2m_mean[i],
  }));
}
