// Récurrence des rendez-vous, tâches et rappels — comme l'agenda Android, plus le calendrier hégirien.
//
// Règle : {
//   freq: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'hmonthly' | 'hyearly',
//   interval: 1,                 // tous les N jours / semaines / mois / ans
//   byDay: [1..7],               // hebdomadaire : 1 = lundi … 7 = dimanche
//   monthMode: 'day' | 'nth' | 'last',  // mensuel : le 14 / le 2e jeudi / le dernier jeudi
//   until: ms | null,            // jusqu'au (inclus)
//   count: n | null,             // nombre d'occurrences (la première comprise)
// }
import { toHijri, fromHijri } from './hijri.js';

const DAY = 86400000;
const isoDow = (d) => ((d.getDay() + 6) % 7) + 1; // 1 = lundi … 7 = dimanche
const at = (y, m, d, ref) => new Date(y, m, d, ref.getHours(), ref.getMinutes(), 0, 0);
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

/** n-ième jour de semaine `dow` (1-7) du mois, ou le dernier si n = -1. */
function nthWeekday(y, m, dow, n) {
  if (n === -1) {
    const last = daysInMonth(y, m);
    for (let d = last; d > last - 7; d--) if (isoDow(new Date(y, m, d)) === dow) return d;
  }
  let count = 0;
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    if (isoDow(new Date(y, m, d)) === dow && ++count === n) return d;
  }
  return null;
}
export const weekOfMonth = (date) => Math.ceil(new Date(date).getDate() / 7);
export const isLastWeekOfMonth = (date) => { const d = new Date(date); return d.getDate() + 7 > daysInMonth(d.getFullYear(), d.getMonth()); };

export function normalizeRule(rule, start) {
  if (!rule) return null;
  const r = { interval: 1, monthMode: 'day', until: null, count: null, ...rule };
  r.interval = Math.max(1, Math.floor(+r.interval || 1));
  if (r.freq === 'weekly') r.byDay = [...new Set((r.byDay?.length ? r.byDay : [isoDow(new Date(start))]).map(Number))].sort();
  else delete r.byDay;
  if (r.freq !== 'monthly') r.monthMode = 'day';
  if (r.count) r.count = Math.max(1, Math.floor(+r.count));
  return r;
}

/** Générateur de toutes les occurrences (horodatages de début), dans l'ordre, à partir du début de série. */
function* generate(rule, start, hijriOffset = 0) {
  const s = new Date(start);
  const r = normalizeRule(rule, start);
  const iv = r.interval;
  if (r.freq === 'daily') {
    for (let k = 0; ; k++) yield at(s.getFullYear(), s.getMonth(), s.getDate() + k * iv, s).getTime();
  }
  if (r.freq === 'weekly') {
    const monday = new Date(s.getFullYear(), s.getMonth(), s.getDate() - (isoDow(s) - 1));
    for (let w = 0; ; w++) {
      for (const dow of r.byDay) {
        const d = at(monday.getFullYear(), monday.getMonth(), monday.getDate() + w * 7 * iv + (dow - 1), s);
        if (d.getTime() >= start) yield d.getTime();
      }
    }
  }
  if (r.freq === 'monthly') {
    const dow = isoDow(s), n = r.monthMode === 'last' ? -1 : weekOfMonth(s);
    for (let k = 0; ; k++) {
      const y = s.getFullYear() + Math.floor((s.getMonth() + k * iv) / 12), m = (s.getMonth() + k * iv) % 12;
      const day = r.monthMode === 'day' ? (s.getDate() <= daysInMonth(y, m) ? s.getDate() : null) : nthWeekday(y, m, dow, n);
      if (day) { const d = at(y, m, day, s).getTime(); if (d >= start) yield d; }
    }
  }
  if (r.freq === 'yearly') {
    for (let k = 0; ; k++) {
      const y = s.getFullYear() + k * iv;
      if (s.getDate() <= daysInMonth(y, s.getMonth())) yield at(y, s.getMonth(), s.getDate(), s).getTime();
    }
  }
  if (r.freq === 'hyearly' || r.freq === 'hmonthly') {
    const h = toHijri(s, hijriOffset);
    for (let k = 0; k < 2000; k++) {
      let y = h.y, m = h.m;
      if (r.freq === 'hyearly') y += k * iv;
      else { const t = h.m - 1 + k * iv; y += Math.floor(t / 12); m = (t % 12) + 1; }
      const g = fromHijri(y, m, h.d, hijriOffset) || (h.d === 30 ? fromHijri(y, m, 29, hijriOffset) : null);
      if (g) yield at(g.getFullYear(), g.getMonth(), g.getDate(), s).getTime();
    }
  }
}

/** Occurrences dont le début est dans [from, to[ (respecte count / until / exceptions). */
export function occurrences(rule, start, from, to, { hijriOffset = 0, exdates = [], max = 1000 } = {}) {
  if (!rule) return start >= from && start < to ? [start] : [];
  const r = normalizeRule(rule, start);
  const until = r.until ? new Date(r.until).setHours(23, 59, 59, 999) : Infinity;
  const ex = new Set(exdates);
  const out = [];
  let n = 0;
  for (const t of generate(r, start, hijriOffset)) {
    n++;
    if ((r.count && n > r.count) || t > until || t >= to || n > 20000) break;
    if (t >= from && !ex.has(t)) out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** Première occurrence strictement après `after` (null si la série est terminée). */
export function nextAfter(rule, start, after, opts = {}) {
  return occurrences(rule, start, after + 1, Infinity, { ...opts, max: 1 })[0] ?? null;
}

/** Règle au format du plugin d'agenda natif (RRULE), ou null si non exprimable (hégirien, n-ième jour du mois). */
export function toNativeRule(rule, start) {
  if (!rule) return null;
  const r = normalizeRule(rule, start);
  if (r.freq === 'hyearly' || r.freq === 'hmonthly' || (r.freq === 'monthly' && r.monthMode !== 'day')) return null;
  const out = { frequency: r.freq, interval: r.interval };
  if (r.freq === 'weekly') out.byWeekDay = r.byDay;
  if (r.count) out.count = r.count;
  else if (r.until) out.end = new Date(r.until).setHours(23, 59, 59, 999);
  return out;
}

/** Horizon de génération quand la règle n'est pas exprimable nativement : occurrences créées une à une. */
export function generationHorizon(rule, start, hijriOffset = 0) {
  const r = normalizeRule(rule, start);
  const span = r.freq === 'hyearly' || r.freq === 'yearly' ? 5 * 366 : 2 * 366;
  return occurrences(r, start, start, start + span * DAY, { hijriOffset, max: r.freq.includes('year') ? 6 : 30 });
}

// ——— Libellés ———
const L = {
  fr: {
    days: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'],
    ord: ['1er', '2e', '3e', '4e', '5e'],
    months: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
    hmonths: ['Mouharram', 'Safar', 'Rabia I', 'Rabia II', 'Joumada I', 'Joumada II', 'Rajab', 'Chaabane', 'Ramadan', 'Chaoual', 'Dhou al-qi’da', 'Dhou al-hijja'],
    none: 'Ne pas répéter', every: { daily: 'Tous les jours', weekly: 'Toutes les semaines', monthly: 'Tous les mois', yearly: 'Tous les ans', hmonthly: 'Tous les mois hégiriens', hyearly: 'Tous les ans (hégirien)' },
    everyN: { daily: (n) => `Tous les ${n} jours`, weekly: (n) => `Toutes les ${n} semaines`, monthly: (n) => `Tous les ${n} mois`, yearly: (n) => `Tous les ${n} ans`, hmonthly: (n) => `Tous les ${n} mois hégiriens`, hyearly: (n) => `Tous les ${n} ans (hégirien)` },
    weekdays: 'Chaque jour ouvrable (lun.–ven.)', on: 'le', last: 'dernier', the: 'le', until: (d) => `jusqu’au ${d}`, count: (n) => `${n} fois`, sep: ', ',
  },
  ar: {
    days: ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'],
    ord: ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس'],
    months: ['يناير', 'فبراير', 'مارس', 'أبريل', 'ماي', 'يونيو', 'يوليوز', 'غشت', 'شتنبر', 'أكتوبر', 'نونبر', 'دجنبر'],
    hmonths: ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'],
    none: 'بدون تكرار', every: { daily: 'كل يوم', weekly: 'كل أسبوع', monthly: 'كل شهر', yearly: 'كل سنة', hmonthly: 'كل شهر هجري', hyearly: 'كل سنة هجرية' },
    everyN: { daily: (n) => `كل ${n} أيام`, weekly: (n) => `كل ${n} أسابيع`, monthly: (n) => `كل ${n} أشهر`, yearly: (n) => `كل ${n} سنوات`, hmonthly: (n) => `كل ${n} أشهر هجرية`, hyearly: (n) => `كل ${n} سنوات هجرية` },
    weekdays: 'كل يوم عمل (الاثنين–الجمعة)', on: 'يوم', last: 'الأخير', the: 'في', until: (d) => `إلى غاية ${d}`, count: (n) => `${n} مرات`, sep: '، ',
  },
};

export function ruleLabel(rule, start, lang = 'fr', hijriOffset = 0) {
  const T = L[lang === 'ar' ? 'ar' : 'fr'];
  if (!rule) return T.none;
  const r = normalizeRule(rule, start), s = new Date(start), dow = isoDow(s);
  if (r.freq === 'weekly' && r.interval === 1 && r.byDay.join() === '1,2,3,4,5') return T.weekdays + tail();
  let txt = r.interval > 1 ? T.everyN[r.freq](r.interval) : T.every[r.freq];
  if (r.freq === 'weekly') txt += ` ${T.on} ${r.byDay.map((d) => T.days[d - 1]).join(T.sep)}`;
  if (r.freq === 'monthly') {
    if (r.monthMode === 'day') txt += ` ${T.the} ${s.getDate()}`;
    else if (lang === 'ar') txt += ` ${T.on} ${T.days[dow - 1]} ${r.monthMode === 'last' ? T.last : T.ord[weekOfMonth(s) - 1]}`;
    else txt += ` le ${r.monthMode === 'last' ? 'dernier' : T.ord[weekOfMonth(s) - 1]} ${T.days[dow - 1]}`;
  }
  if (r.freq === 'yearly') txt += ` ${T.the} ${lang !== 'ar' && s.getDate() === 1 ? '1er' : s.getDate()} ${T.months[s.getMonth()]}`;
  if (r.freq === 'hyearly' || r.freq === 'hmonthly') {
    const h = toHijri(s, hijriOffset);
    txt += ` ${T.the} ${lang !== 'ar' && h.d === 1 ? '1er' : h.d}${r.freq === 'hyearly' ? ' ' + T.hmonths[h.m - 1] : ''}`;
  }
  return txt + tail();

  function tail() {
    if (r.count) return ` · ${T.count(r.count)}`;
    if (r.until) {
      const u = new Date(r.until);
      return ` · ${T.until(`${u.getDate()} ${T.months[u.getMonth()]} ${u.getFullYear()}`)}`;
    }
    return '';
  }
}

/** Choix rapides proposés pour une date de début (comme l'agenda Android). */
export function presets(start, lang = 'fr', hijriOffset = 0) {
  const s = new Date(start);
  const list = [
    ['none', null],
    ['daily', { freq: 'daily' }],
    ['weekdays', { freq: 'weekly', byDay: [1, 2, 3, 4, 5] }],
    ['weekly', { freq: 'weekly', byDay: [isoDow(s)] }],
    ['monthly', { freq: 'monthly', monthMode: 'day' }],
    ['monthlyNth', { freq: 'monthly', monthMode: weekOfMonth(s) <= 4 ? 'nth' : 'last' }],
  ];
  if (isLastWeekOfMonth(s) && weekOfMonth(s) <= 4) list.push(['monthlyLast', { freq: 'monthly', monthMode: 'last' }]);
  list.push(['yearly', { freq: 'yearly' }], ['hmonthly', { freq: 'hmonthly' }], ['hyearly', { freq: 'hyearly' }]);
  return list.map(([id, rule]) => ({ id, rule, label: ruleLabel(rule, start, lang, hijriOffset) }));
}

/** Retrouve le préréglage correspondant à une règle (sinon « custom »). */
export function presetIdOf(rule, start) {
  if (!rule) return 'none';
  const r = normalizeRule(rule, start);
  if (r.interval !== 1 || r.count || r.until) return 'custom';
  for (const p of presets(start)) {
    if (!p.rule) continue;
    const q = normalizeRule(p.rule, start);
    if (q.freq === r.freq && q.monthMode === r.monthMode && (q.byDay || []).join() === (r.byDay || []).join()) return p.id;
  }
  return 'custom';
}

export { isoDow };
