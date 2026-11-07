// "What works on you": compare days a product was used with days it wasn't, using the diary's skin feel and
// the check-in levels. Plain arithmetic, so the numbers can't be invented, and it says when there's too little data.
// It's a pattern, not proof: weather, sleep and lighting move these too.

const FEEL = { glowing: -1, calm: 0, oily: 1, tight: 1, itchy: 2, breakout: 2 };
const LEVEL = { none: 0, mild: 1, noticeable: 2 };
const MIN_DAYS = 3; // each side needs at least this many days before saying anything

const dayOf = (iso) => iso.slice(0, 10);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// One "skin trouble" number per day: the diary feel, plus check-in levels for that day when there are any.
export function dailyScores(db) {
  const days = new Map();
  for (const d of db.diary) {
    const f = FEEL[(d.feel || '').toLowerCase()];
    if (f != null) days.set(d.date, { ...(days.get(d.date) || {}), feel: f });
  }
  for (const c of db.checkins.filter((x) => x.reading?.usable !== false)) {
    const levels = (c.reading.skin || []).filter((s) => ['redness', 'dryness', 'shine'].includes(s.trait)).map((s) => LEVEL[s.level] ?? 0);
    if (levels.length) days.set(dayOf(c.at), { ...(days.get(dayOf(c.at)) || {}), skin: mean(levels), live: c.live });
  }
  return [...days.entries()].map(([date, v]) => ({ date, score: mean([v.feel, v.skin].filter((x) => x != null)), ...v })).sort((a, b) => a.date.localeCompare(b.date));
}

export function whatWorks(db) {
  const scores = dailyScores(db);
  const byDate = new Map(scores.map((s) => [s.date, s.score]));
  const products = db.items.filter((i) => i.category === 'skincare');
  const results = [];
  for (const p of products) {
    const used = [], skipped = [];
    for (const d of db.diary) {
      const s = byDate.get(d.date);
      if (s == null) continue;
      ([...(d.am || []), ...(d.pm || [])].includes(p.id) ? used : skipped).push(s);
    }
    const enough = used.length >= MIN_DAYS && skipped.length >= MIN_DAYS;
    const diff = enough ? +(mean(used) - mean(skipped)).toFixed(2) : null;
    results.push({
      itemId: p.id, name: p.name, usedDays: used.length, otherDays: skipped.length, diff,
      verdict: !enough ? 'not enough data' : diff <= -0.4 ? 'seems to help' : diff >= 0.4 ? 'seems to hurt' : 'no clear effect',
    });
  }
  const live = db.checkins.filter((c) => c.live).length;
  return {
    days: scores.length, liveCheckins: live, results: results.sort((a, b) => (a.diff ?? 9) - (b.diff ?? 9)),
    note: 'Lower is calmer skin. A pattern, not proof: weather, sleep and photo lighting move these too.',
  };
}
