// Analyseur de saisie rapide FR/AR — à base de règles, hors ligne, déterministe.
// « dentiste jeudi 10h », « réunion budget 3 رمضان de 10h à 11h30 », « ذكرني غدا على الساعة 9 صباحا بالاتصال بكريم »
// Le résultat est toujours présenté sur une carte de confirmation : l'utilisateur valide ou corrige.
import { latinDigits } from './text.js';
import { fromHijri, nextHijriDate, toHijri } from './hijri.js';
import { addDays, startOfDay, startOfWeek } from './dates.js';

const L = '\\p{L}\\p{N}';
// Début de mot sans lookbehind (non pris en charge avant iOS 16.4) : le séparateur fait partie de la correspondance.
const B = `(?:^|[^${L}])`;
const E = `(?![${L}])`; // fin de mot
const rx = (src, flags = 'iu') => new RegExp(src, flags);

// ——— Mois ———
const GREG_MONTHS = [
  ['janvier', 'janv', 'jan', 'يناير', 'جانفي'],
  ['février', 'fevrier', 'févr', 'fevr', 'fév', 'fev', 'فبراير', 'فيفري'],
  ['mars', 'مارس'],
  ['avril', 'avr', 'أبريل', 'ابريل', 'إبريل', 'أفريل'],
  ['mai', 'ماي', 'مايو'],
  ['juin', 'يونيو', 'يونيه', 'جوان'],
  ['juillet', 'juil', 'يوليوز', 'يوليو', 'جويلية'],
  ['août', 'aout', 'غشت', 'أغسطس', 'اغسطس', 'أوت'],
  ['septembre', 'sept', 'sep', 'شتنبر', 'سبتمبر'],
  ['octobre', 'oct', 'أكتوبر', 'اكتوبر'],
  ['novembre', 'nov', 'نونبر', 'نوفمبر'],
  ['décembre', 'decembre', 'déc', 'dec', 'دجنبر', 'ديسمبر'],
];
const HIJRI_MONTHS_RX = [
  '(?:mou|mu|mo)harr?am|محرم',
  'safar|صفر',
  "rabi[ae]?[ -]?(?:al[ -]?|el[ -]?)?(?:awwal|aouwal|aoual|i|1)|ربيع الا?ول|ربيع الأول",
  "rabi[ae]?[ -]?(?:al[ -]?|el[ -]?|at[ -]?|ath[ -]?)?(?:thani|tani|akhir|ii|2)|ربيع الثاني|ربيع الآخر|ربيع الاخر",
  'jou?mada[ -]?(?:al[ -]?|el[ -]?)?(?:oula|ula|i|1)|جمادى الا?ولى|جمادى الأولى',
  "jou?mada[ -]?(?:al[ -]?|el[ -]?|at[ -]?|ath[ -]?)?(?:thania|thani|tania|akhira|ii|2)|جمادى الثانية|جمادى الآخرة|جمادى الاخرة",
  'rajab|رجب',
  "cha['a]?bane?|sha'?ban|شعبان",
  'rama[dḍ]h?an|رمضان',
  'chaou?al|chawwal|shawwal|شوال',
  "dh?ou?[ -]?(?:al|el|l)?[ -]?qi['’]?[dc]a|ذو القعدة|ذي القعدة",
  "dh?ou?[ -]?(?:al|el|l)?[ -]?hij+a|ذو الحجة|ذي الحجة",
];
// Les variantes « II » doivent être testées avant « I » : on trie par indice décroissant de spécificité.
const HIJRI_ORDER = [3, 5, 2, 4, 0, 1, 6, 7, 8, 9, 10, 11];

const WEEKDAYS = [
  ['dimanche', 'الأحد', 'الاحد'],
  ['lundi', 'الاثنين', 'الإثنين', 'الاتنين'],
  ['mardi', 'الثلاثاء', 'الثلاثا'],
  ['mercredi', 'الأربعاء', 'الاربعاء'],
  ['jeudi', 'الخميس'],
  ['vendredi', 'الجمعة', 'الجمعه'],
  ['samedi', 'السبت'],
];

const TYPE_PREFIX = [
  ['reminder', `^\\s*(?:rappel(?:le)?(?:[- ]moi)?(?:\\s+(?:de|d'|qu'|que))?|rappeler|ذكرني(?:\\s+ب)?|تذكير(?:\\s+ب)?)${E}\\s*:?\\s*`],
  ['task', `^\\s*(?:t[âa]che|todo|à faire|a faire|مهمة|مهمه)${E}\\s*:?\\s*`],
  ['note', `^\\s*(?:note|m[ée]mo|id[ée]e|ملاحظة|ملاحظه|فكرة|فكره)${E}\\s*:?\\s*`],
  ['event', `^\\s*(?:rdv|rendez[- ]vous)\\s*:\\s*`],
];
const EVENT_WORDS = rx(`${B}(?:rdv|rendez[- ]vous|r[ée]union|rencontre|entretien|visite|comit[ée]|audience|موعد|اجتماع|لقاء|زيارة)${E}`);

const NUM_WORDS = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, 'واحد': 1, 'اثنين': 2, 'ثلاث': 3, 'ثلاثة': 3, 'أربع': 4, 'خمس': 5 };

export function parseQuick(input, now = new Date(), { hijriOffset = 0 } = {}) {
  const orig = latinDigits(input || '').replace(/\s+/g, ' ').trim();
  const low = orig.toLowerCase();
  const sameLen = low.length === orig.length;
  const mask = new Array(orig.length).fill(false);
  const free = (i, j) => { for (let k = i; k < j; k++) if (mask[k]) return false; return true; };
  const take = (i, j) => { for (let k = i; k < j; k++) mask[k] = true; };
  /** Cherche le premier motif non encore consommé. */
  const find = (re) => {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m;
    while ((m = g.exec(low))) {
      // le séparateur de début (espace…) peut déjà avoir été consommé par une règle précédente
      m.s = m[0].length && !/[\p{L}\p{N}]/u.test(m[0][0]) ? m.index + 1 : m.index;
      if (m[0].length && free(m.s, m.index + m[0].length)) return m;
      if (!m[0].length) g.lastIndex++;
    }
    return null;
  };

  const r = {
    type: null, explicitType: false, title: '', date: null, time: null, endTime: null, durationMin: null,
    deadline: false, hijri: false, participants: [], hint: null, warnings: [],
  };
  const today = startOfDay(now);

  // 1. Type explicite en tête
  for (const [type, src] of TYPE_PREFIX) {
    const m = low.match(rx(src));
    if (m) { r.type = type; r.explicitType = true; take(0, m[0].length); break; }
  }

  // 2. Dates hégiriennes : « 3 رمضان », « 1er ramadan 1448 », « فاتح شوال »
  for (const mi of HIJRI_ORDER) {
    const m = find(rx(`${B}(1er|premier|فاتح|\\d{1,2})\\s*(?:de\\s+|d['’]\\s*)?(?:${HIJRI_MONTHS_RX[mi]})${E}(?:\\s*(1[34]\\d\\d)${E})?(?:\\s*(?:هـ|ه|h)${E})?`));
    if (m) {
      const d = /^\d+$/.test(m[1]) ? +m[1] : 1;
      const y = m[2] ? +m[2] : null;
      const g = y ? fromHijri(y, mi + 1, d, hijriOffset) : nextHijriDate(mi + 1, d, now, hijriOffset);
      if (g && d >= 1 && d <= 30) { r.date = g; r.hijri = true; take(m.s, m.index + m[0].length); markDeadline(m.index); }
      break;
    }
  }

  // 3. Dates grégoriennes explicites
  if (!r.date) {
    let m = find(rx(`${B}(\\d{1,2})[/.-](\\d{1,2})(?:[/.-](\\d{2,4}))?${E}`));
    if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) {
      let y = m[3] ? +m[3] : null;
      if (y && y < 100) y += 2000;
      setDate(new Date(y ?? today.getFullYear(), +m[2] - 1, +m[1]), !y, 'year');
      take(m.s, m.index + m[0].length); markDeadline(m.index);
    }
  }
  if (!r.date) {
    for (let mi = 0; mi < 12 && !r.date; mi++) {
      const names = GREG_MONTHS[mi].sort((a, b) => b.length - a.length).join('|');
      const m = find(rx(`${B}(1er|\\d{1,2})\\s*(?:${names})\\.?${E}(?:\\s*(20\\d\\d)${E})?`));
      if (m) {
        const d = m[1] === '1er' ? 1 : +m[1];
        setDate(new Date(m[2] ? +m[2] : today.getFullYear(), mi, d), !m[2], 'year');
        take(m.s, m.index + m[0].length); markDeadline(m.index);
      }
    }
  }

  // 4. Relatifs
  if (!r.date) {
    const rel = [
      [`après[- ]demain|apres[- ]demain|بعد غد(?:ا|اً|ًا)?`, 2],
      [`demain|غد(?:ا|اً|ًا)|بكرة|غدوة`, 1],
      [`aujourd['’]?hui|اليوم`, 0],
      [`ce soir|cette nuit|هذا المساء|الليلة|هذه الليلة`, 0, 'evening'],
      [`ce matin|هذا الصباح`, 0, 'morning'],
      [`cet après[- ]midi|cet apres[- ]midi|هذا الزوال|بعد الظهر`, 0, 'afternoon'],
    ];
    for (const [src, n, hint] of rel) {
      const m = find(rx(`${B}(?:${src})${E}`));
      if (m) { r.date = addDays(today, n); if (hint) r.hint = hint; take(m.s, m.index + m[0].length); markDeadline(m.index); break; }
    }
  }
  if (!r.date) {
    // « dans 3 jours », « بعد 3 أيام », « بعد يومين »
    const m = find(rx(`${B}(?:dans|d['’]ici|بعد|خلال)\\s+(\\d+|un|une|deux|trois|quatre|cinq|six)?\\s*(jours?|j|semaines?|sem|mois|heures?|h|minutes?|min|يوم|أيام|ايام|يومين|أسبوع|اسبوع|أسابيع|اسابيع|أسبوعين|اسبوعين|ساعة|ساعات|ساعتين|دقيقة|دقائق|دقيقتين)${E}`));
    if (m) {
      let n = m[1] ? (NUM_WORDS[m[1]] ?? +m[1]) : 1;
      const u = m[2];
      if (/ين$/.test(u)) n = 2;
      take(m.s, m.index + m[0].length);
      if (/^(heure|h|ساع)/.test(u)) { const t = new Date(now.getTime() + n * 3600000); r.date = startOfDay(t); r.time = { h: t.getHours(), m: t.getMinutes() }; }
      else if (/^(min|دقي)/.test(u)) { const t = new Date(now.getTime() + n * 60000); r.date = startOfDay(t); r.time = { h: t.getHours(), m: t.getMinutes() }; }
      else if (/^(sem|أسب|اسب)/.test(u)) r.date = addDays(today, 7 * n);
      else if (/^mois/.test(u)) { const d = new Date(today); d.setMonth(d.getMonth() + n); r.date = d; }
      else r.date = addDays(today, n);
      if (/^d['’]ici/.test(m[0])) r.deadline = true;
    }
  }
  if (!r.date) {
    const m = find(rx(`${B}(?:la\\s+)?semaine prochaine${E}|${B}(?:ال)?أسبوع (?:القادم|المقبل)${E}|${B}الاسبوع (?:القادم|المقبل)${E}`));
    if (m) { r.date = addDays(startOfWeek(today), 7); take(m.s, m.index + m[0].length); markDeadline(m.index); }
  }
  if (!r.date) {
    for (let wd = 0; wd < 7 && !r.date; wd++) {
      const names = WEEKDAYS[wd].join('|');
      const m = find(rx(`${B}(?:يوم\\s+)?(?:${names})${E}(?:\\s+(?:prochain|prochaine|القادم|المقبل|الجاي)${E})?`));
      if (m) {
        const next = /prochain|القادم|المقبل|الجاي/.test(m[0]);
        let delta = (wd - today.getDay() + 7) % 7;
        if (delta === 0 && next) delta = 7;
        r.date = addDays(today, delta);
        take(m.s, m.index + m[0].length); markDeadline(m.index);
      }
    }
  }
  if (!r.date) {
    // « le 12 » : jour du mois courant (ou suivant s'il est passé)
    const m = find(rx(`${B}le\\s+(1er|\\d{1,2})${E}(?!\\s*(?:h|:|heures?)${E})`));
    if (m) {
      const d = m[1] === '1er' ? 1 : +m[1];
      if (d >= 1 && d <= 31) { setDate(new Date(today.getFullYear(), today.getMonth(), d), true, 'month'); take(m.s, m.index + m[0].length); markDeadline(m.index); }
    }
  }

  // 5. Heures : plage puis heure seule
  const T = `(\\d{1,2})\\s*(?:h|:|heures?)\\s*(\\d{2})?`;
  const PERIOD = `(?:\\s*(du matin|du soir|de l['’]après[- ]midi|de l['’]apres[- ]midi|صباحا|صباحاً|صباح|مساء|مساءً|مساءا|ليلا|ليلاً|ظهرا|زوالا|بالليل))?`;
  let m = find(rx(`${B}(?:de\\s+|entre\\s+|من\\s+(?:الساعة\\s+)?)?${T}\\s*(?:à|a|-|–|et|jusqu['’]à|إلى|الى|حتى|ل)\\s*(?:الساعة\\s+)?(\\d{1,2})\\s*(?:h|:|heures?)?\\s*(\\d{2})?${E}${PERIOD}`));
  if (m && m[3] && (m[0].match(/h|:|heure/) || /من|الساعة/.test(m[0]))) {
    const a = fixHour(+m[1], m[5], false), b = fixHour(+m[3], m[5], false);
    if (valid(a, m[2]) && valid(b, m[4])) {
      r.time = { h: a, m: +(m[2] || 0) };
      r.endTime = { h: b < a ? b + 12 : b, m: +(m[4] || 0) };
      if (r.endTime.h > 23) r.endTime.h -= 12;
      take(m.s, m.index + m[0].length);
    }
  }
  if (!r.time) {
    m = find(rx(`${B}(?:(?:à|a|vers|pour|على|عند)\\s+)?(?:(?:على\\s+)?الساعة\\s+(\\d{1,2})(?:\\s*[:h]\\s*(\\d{2}))?(?:\\s+(?:و|و\\s*)?(نصف|النصف|ربع|الربع))?|${T})${E}${PERIOD}`));
    if (m) {
      const viaSaa = m[1] != null;
      let h = viaSaa ? +m[1] : +m[4];
      let mm = viaSaa ? +(m[2] || 0) : +(m[5] || 0);
      if (viaSaa && m[3]) mm = /نصف/.test(m[3]) ? 30 : 15;
      h = fixHour(h, m[6], viaSaa);
      if (valid(h, mm)) { r.time = { h, m: mm }; take(m.s, m.index + m[0].length); }
    }
  }
  if (!r.time) {
    m = find(rx(`${B}(?:à\\s+|a\\s+)?(midi|minuit|الظهر|منتصف الليل)${E}`));
    if (m) { r.time = /midi|الظهر/.test(m[1]) ? { h: 12, m: 0 } : { h: 0, m: 0 }; take(m.s, m.index + m[0].length); }
  }
  if (!r.hint) {
    const p = find(rx(`${B}(?:le\\s+)?(matin|soir|après[- ]midi|apres[- ]midi|صباحا|مساء|مساءً|زوالا)${E}`));
    if (p) { r.hint = /matin|صباح/.test(p[1]) ? 'morning' : /soir|مساء/.test(p[1]) ? 'evening' : 'afternoon'; take(p.s, p.index + p[0].length); }
  }

  // 6. Durée
  m = find(rx(`${B}(?:pendant|durant|durée(?:\\s*:)?|duree|لمدة|مدة)\\s+(?:(\\d+)\\s*(?:h|heures?)\\s*(\\d{2})?|(\\d+)\\s*(?:min|minutes?|mn|د|دقيقة|دقائق)|(une heure|1 heure|une demi[- ]heure|ساعة|ساعتين|نصف ساعة|ربع ساعة|ساعة ونصف|(\\d+)\\s*ساعات?))${E}`));
  if (m) {
    if (m[1]) r.durationMin = +m[1] * 60 + +(m[2] || 0);
    else if (m[3]) r.durationMin = +m[3];
    else if (m[4]) {
      const w = m[4];
      r.durationMin = /demi|نصف ساعة/.test(w) && !/ونصف/.test(w) ? 30 : /ربع/.test(w) ? 15 : /ونصف/.test(w) ? 90 : /ساعتين/.test(w) ? 120 : m[5] ? +m[5] * 60 : 60;
    }
    take(m.s, m.index + m[0].length);
  }

  // 8. Type par défaut
  const hasEventWord = EVENT_WORDS.test(low);
  if (!r.type) {
    if (r.deadline) r.type = 'task';
    else if (r.time) r.type = 'event';
    else if (hasEventWord && r.date) r.type = 'event';
    else if (r.date) r.type = 'task';
    else r.type = orig.length > 90 || /\n/.test(input || '') ? 'note' : 'task';
  }

  // 9. Heure par défaut selon l'indice (matin / après-midi / soir)
  if (!r.time && r.hint && (r.type === 'event' || r.type === 'reminder')) {
    r.time = { h: r.hint === 'morning' ? 9 : r.hint === 'afternoon' ? 15 : 19, m: 0 };
    r.warnings.push('defaultTime');
  }
  if (r.type === 'reminder' && !r.time) { r.time = { h: 9, m: 0 }; r.warnings.push('defaultTime'); }
  if ((r.type === 'event' || r.type === 'reminder') && r.time && !r.date) {
    const t = new Date(today); t.setHours(r.time.h, r.time.m);
    r.date = t < now ? addDays(today, 1) : today;
  }
  if (r.type === 'reminder' && !r.date) r.date = addDays(today, 1);

  // 10. Titre = ce qui reste
  let rest = '';
  const src = sameLen ? orig : low;
  for (let i = 0; i < src.length; i++) rest += mask[i] ? ' ' : src[i];
  const conn = '(?:le|la|les|l\'|à|a|au|de|du|d\'|pour|en|vers|et|,|:|-|–|في|على|يوم|ل|،|من|إلى|الى)';
  rest = rest.replace(/\s+/g, ' ').trim();
  for (let k = 0; k < 4; k++) {
    rest = rest.replace(rx(`^${conn}(?:\\s+|$)`), '').replace(rx(`(?:\\s+|^)${conn}$`), '').trim();
  }
  rest = rest.replace(/^(?:d|l|qu)['’]\s*/i, '').replace(/^ب(?=ال)/, '').trim();
  // 7. Participants (gardés dans le titre) : « avec Karim et Salma », « مع كريم »
  const pm = rest.match(/(?:^|\s)avec\s+((?:[A-ZÀ-Ý][\p{L}'-]+)(?:\s+[A-ZÀ-Ý][\p{L}'-]+)?(?:\s*(?:,|et)\s*[A-ZÀ-Ý][\p{L}'-]+(?:\s+[A-ZÀ-Ý][\p{L}'-]+)?)*)/u);
  if (pm) r.participants = pm[1].split(/\s*(?:,|\bet\b)\s*/).map((s) => s.trim()).filter(Boolean);
  const pa = rest.match(/(?:^|\s)مع\s+((?:ال)?[\p{Script=Arabic}]+(?:\s+(?:و)?[\p{Script=Arabic}]+)?)/u);
  if (pa) r.participants.push(...pa[1].split(/\s+و|\s*،\s*/).map((s) => s.replace(/^و/, '').trim()).filter((s) => s.length > 1));

  r.title = rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : '';
  if (!r.title) r.warnings.push('noTitle');

  // 11. Construction des horodatages
  if (r.date) {
    const d = new Date(r.date);
    if (r.time) d.setHours(r.time.h, r.time.m, 0, 0);
    r.start = d.getTime();
    if (r.endTime) {
      const e = new Date(r.date); e.setHours(r.endTime.h, r.endTime.m, 0, 0);
      r.end = e.getTime() > r.start ? e.getTime() : r.start + 3600000;
      r.durationMin = Math.round((r.end - r.start) / 60000);
    } else if (r.type === 'event' && r.time) {
      r.end = r.start + (r.durationMin || 60) * 60000;
    }
    r.allDay = r.type === 'event' && !r.time;
    if (r.allDay) r.end = addDays(d, 1).getTime();
    if (r.hijri) r.hijriDate = toHijri(d, hijriOffset);
  }
  r.confidence = !r.title ? 'low' : r.warnings.length ? 'medium' : 'high';
  return r;

  // ——— aides internes ———
  function setDate(d, inferred, roll) {
    if (inferred && d < today) {
      if (roll === 'year') d.setFullYear(d.getFullYear() + 1);
      else d.setMonth(d.getMonth() + 1);
    }
    r.date = d;
  }
  function markDeadline(i) {
    const before = low.slice(0, i);
    const dm = before.match(rx(`${B}(avant|d['’]ici|au plus tard|pour|قبل|في أجل أقصاه|أقصاه)\\s*(?:le\\s+|يوم\\s+)?$`));
    if (dm && free(dm.index, i)) {
      if (!/^pour/.test(dm[1]) || !r.type) {
        take(dm.index, i);
        if (!/^pour/.test(dm[1])) r.deadline = true;
      }
    }
  }
}

function fixHour(h, period, twelveHour) {
  const p = period || '';
  if (/soir|après|apres|مساء|ليل|ظهر|زوال/.test(p) && h < 12) return h + 12;
  if (/matin|صباح/.test(p) && h === 12) return 0;
  if (!p && twelveHour && h >= 1 && h <= 6) return h + 12; // « الساعة 3 » ≈ 15 h en contexte pro
  return h;
}
const valid = (h, m) => h >= 0 && h <= 23 && +(m || 0) >= 0 && +(m || 0) <= 59;
