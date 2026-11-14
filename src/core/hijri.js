// Calendrier hégirien : conversion via Intl (Umm al-Qura), avec ajustement utilisateur ±2 jours.
// Au Maroc, les dates officielles suivent l'observation du croissant : l'ajustement permet de s'y caler.

const DAY = 86400000;

export const HIJRI_MONTHS = {
  fr: ['Mouharram', 'Safar', 'Rabia I', 'Rabia II', 'Joumada I', 'Joumada II', 'Rajab', 'Chaabane', 'Ramadan', 'Chaoual', 'Dhou al-qi’da', 'Dhou al-hijja'],
  ar: ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'],
};

let fmt;
function formatter() {
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
      day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC',
    });
  }
  return fmt;
}

/** Midi UTC du jour civil local de `date` : évite les effets de fuseau / heure d'été. */
function civilNoonUTC(date) {
  const d = new Date(date);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12);
}

const cache = new Map();

/** Date grégorienne (locale) → { y, m (1-12), d } hégirien, après ajustement. */
export function toHijri(date, offset = 0) {
  const t = civilNoonUTC(date) + offset * DAY;
  const hit = cache.get(t);
  if (hit) return hit;
  const parts = formatter().formatToParts(new Date(t));
  const get = (k) => parseInt(parts.find((p) => p.type === k)?.value, 10);
  const r = { y: get('year'), m: get('month'), d: get('day') };
  if (cache.size > 5000) cache.clear();
  cache.set(t, r);
  return r;
}

/** { y, m, d } hégirien → Date locale (00:00) correspondante, ou null si introuvable. */
export function fromHijri(y, m, d, offset = 0) {
  // Estimation (époque hégirienne ≈ 19/07/622 grégorien), puis recherche locale exacte.
  const approx = Date.UTC(622, 6, 19) + ((y - 1) * 354.36707 + (m - 1) * 29.530588 + (d - 1)) * DAY;
  const base = new Date(approx);
  for (let k = 0; k <= 6; k++) {
    for (const s of k ? [k, -k] : [0]) {
      const cand = new Date(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + s);
      const h = toHijri(cand, offset);
      if (h.y === y && h.m === m && h.d === d) return cand;
    }
  }
  return null;
}

/** Nombre de jours (29 ou 30) du mois hégirien. */
export function hijriMonthLength(y, m, offset = 0) {
  return fromHijri(y, m, 30, offset) ? 30 : 29;
}

/** Prochaine occurrence (aujourd'hui inclus) d'un jour/mois hégirien, année optionnelle. */
export function nextHijriDate(m, d, now = new Date(), offset = 0, year = null) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const h = toHijri(today, offset);
  if (year) return fromHijri(year, m, d, offset);
  for (const y of [h.y, h.y + 1]) {
    const g = fromHijri(y, m, Math.min(d, 30), offset) || fromHijri(y, m, 29, offset);
    if (g && g >= today) return g;
  }
  return null;
}

export function formatHijri(date, lang = 'fr', offset = 0, { year = true } = {}) {
  const h = toHijri(date, offset);
  const month = HIJRI_MONTHS[lang === 'ar' ? 'ar' : 'fr'][h.m - 1];
  return `${h.d} ${month}${year ? ' ' + h.y : ''}${lang === 'ar' ? (year ? ' هـ' : '') : year ? ' H' : ''}`;
}
