// Aides de dates (heure locale) et formatage FR/AR, grégorien + hégirien.
import { formatHijri } from './hijri.js';
import { arabicDigits } from './text.js';

export const MIN = 60000;
export const HOUR = 3600000;
export const DAY = 86400000;

export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const sameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();
/** Lundi de la semaine (les semaines professionnelles commencent le lundi au Maroc). */
export const startOfWeek = (d) => { const x = startOfDay(d); const wd = (x.getDay() + 6) % 7; return addDays(x, -wd); };
export const ymd = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
export const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const hm = (d) => { const x = new Date(d); return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; };

const loc = (lang) => (lang === 'ar' ? 'ar-MA-u-nu-latn' : 'fr-FR');

export function digits(s, settings) {
  return settings?.digits === 'arab' ? arabicDigits(s) : s;
}

/** Libellé de date selon le réglage : grégorien, hégirien ou les deux. */
export function dateLabel(date, settings, { weekday = true, year = false } = {}) {
  const lang = settings?.lang || 'fr';
  const mode = settings?.calMode || 'both';
  const g = new Intl.DateTimeFormat(loc(lang), {
    weekday: weekday ? 'long' : undefined, day: 'numeric', month: 'long', year: year ? 'numeric' : undefined,
  }).format(date);
  const h = formatHijri(date, lang, settings?.hijriOffset || 0, { year });
  let out;
  if (mode === 'greg') out = g;
  else if (mode === 'hijri') {
    const wd = weekday ? new Intl.DateTimeFormat(loc(lang), { weekday: 'long' }).format(date) + ' ' : '';
    out = wd + h;
  } else out = `${g} · ${h}`;
  return digits(out, settings);
}

export function timeLabel(date, settings) {
  return digits(hm(date), settings);
}

export function weekdayShort(date, lang) {
  return new Intl.DateTimeFormat(loc(lang), { weekday: 'short' }).format(date);
}

export function monthTitle(date, lang) {
  return new Intl.DateTimeFormat(loc(lang), { month: 'long', year: 'numeric' }).format(date);
}

export function durationLabel(min, lang) {
  const h = Math.floor(min / 60), m = min % 60;
  if (lang === 'ar') return [h ? `${h} س` : '', m ? `${m} د` : ''].filter(Boolean).join(' ');
  return h ? `${h} h${m ? String(m).padStart(2, '0') : ''}` : `${m} min`;
}
