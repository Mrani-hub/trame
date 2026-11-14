// Logique métier pure : conflits, créneaux libres, recherche, fiche contexte, export .ics.
import { norm, keywords } from './text.js';
import { addDays, startOfDay, MIN } from './dates.js';
import { formatHijri } from './hijri.js';

// ——— Conflits ———
export const overlaps = (a, b) => !a.allDay && !b.allDay && a.start < b.end && b.start < a.end;

/** Rendez-vous qui chevauchent l'intervalle [start, end[. */
export function findConflicts(item, events, ignoreKey = null) {
  if (!item?.start || !item?.end || item.allDay) return [];
  return events.filter((e) => e.key !== ignoreKey && overlaps(item, e));
}

/** Clés des rendez-vous en conflit dans une liste. */
export function conflictKeys(events) {
  const s = new Set();
  const list = events.filter((e) => !e.allDay).sort((a, b) => a.start - b.start);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length && list[j].start < list[i].end; j++) {
      s.add(list[i].key); s.add(list[j].key);
    }
  }
  return s;
}

// ——— Créneaux libres et suggestion de placement ———
/** Créneaux libres d'une journée entre dayStart et dayEnd (heures), en tenant compte des blocs fixes. */
export function freeSlots(day, events, { dayStart = 8, dayEnd = 18, minMinutes = 30, now = new Date() } = {}) {
  const d0 = startOfDay(day);
  let from = new Date(d0).setHours(dayStart, 0, 0, 0);
  const to = new Date(d0).setHours(dayEnd, 0, 0, 0);
  if (now > from && now < to) from = Math.ceil(now.getTime() / (15 * MIN)) * 15 * MIN;
  const busy = events.filter((e) => !e.allDay && e.end > from && e.start < to).sort((a, b) => a.start - b.start);
  const slots = [];
  let cur = from;
  for (const e of busy) {
    if (e.start - cur >= minMinutes * MIN) slots.push({ start: cur, end: e.start });
    cur = Math.max(cur, e.end);
  }
  if (to - cur >= minMinutes * MIN) slots.push({ start: cur, end: to });
  return slots;
}

/** Associe des tâches non planifiées aux créneaux libres (heuristique : échéance la plus proche, puis priorité). */
export function suggestPlacements(tasks, slots, day) {
  const dEnd = addDays(startOfDay(day), 1).getTime();
  const cands = tasks
    .filter((t) => !t.done && !t.plannedStart && (!t.due || t.due < dEnd + 7 * 86400000))
    .sort((a, b) => (b.priority === 'high') - (a.priority === 'high') || (a.due ?? Infinity) - (b.due ?? Infinity));
  const free = slots.map((s) => ({ ...s }));
  const out = [];
  for (const t of cands) {
    const need = (t.durationMin || 30) * MIN;
    const s = free.find((x) => x.end - x.start >= need);
    if (!s) continue;
    out.push({ task: t, start: s.start, end: s.start + need });
    s.start += need;
    if (out.length >= 3) break;
  }
  return out;
}

// ——— Recherche plein texte (FR/AR, sans accents ni harakat) ———
export function searchAll(query, { notes = [], tasks = [], events = [] }) {
  const terms = norm(query).split(' ').filter(Boolean);
  if (!terms.length) return [];
  const out = [];
  const consider = (kind, item, title, body, date) => {
    const nt = norm(title), nb = norm(body);
    const hay = nt + ' ' + nb;
    if (!terms.every((t) => hay.includes(t))) return;
    let score = terms.reduce((s, t) => s + (nt.includes(t) ? 3 : 1), 0);
    if (date) score += Math.max(0, 1 - Math.abs(Date.now() - date) / (90 * 86400000));
    const i = nb.indexOf(terms[0]);
    const snippet = i >= 0 ? body.slice(Math.max(0, i - 40), i + 80).replace(/\s+/g, ' ') : body.slice(0, 100);
    out.push({ kind, item, title, snippet, score, date });
  };
  for (const n of notes) consider('note', n, n.title || '', noteText(n), n.updated);
  for (const t of tasks) consider('task', t, t.title, [t.notes, t.assignee].filter(Boolean).join(' '), t.due);
  for (const e of events) consider('event', e, e.title, [e.location, e.description, (e.attendees || []).map((a) => a.name || a.email).join(' ')].filter(Boolean).join(' '), e.start);
  return out.sort((a, b) => b.score - a.score).slice(0, 60);
}

export function noteText(n) {
  const m = n.meeting || {};
  return [n.body, (m.participants || []).join(' '), m.agenda, (m.decisions || []).join(' '), (m.actions || []).map((a) => `${a.text} ${a.who || ''}`).join(' ')]
    .filter(Boolean).join('\n');
}

// ——— Fiche contexte ———
/** Rassemble ce qui concerne un rendez-vous : notes liées, notes sur le même sujet ou avec les mêmes personnes, actions ouvertes. */
export function buildContext(ev, { notes = [], tasks = [] }) {
  const evPeople = new Set([...(ev.attendees || []).map((a) => norm(a.name || a.email || '')), ...(ev.participants || []).map(norm)].filter(Boolean));
  const evWords = new Set(keywords(ev.title));
  const scored = [];
  for (const n of notes) {
    let s = 0, why = [];
    if (n.eventKey && n.eventKey === ev.key) { s += 100; why.push('linked'); }
    else if (n.eventSig && n.eventSig === seriesSig(ev)) { s += 60; why.push('series'); }
    const people = (n.meeting?.participants || []).map(norm);
    const common = people.filter((p) => evPeople.has(p) || [...evPeople].some((q) => q && (q.includes(p) || p.includes(q))));
    if (common.length) { s += 20 * common.length; why.push('people'); }
    const w = keywords(n.title || '').filter((x) => evWords.has(x));
    if (w.length) { s += 10 * w.length; why.push('topic'); }
    if (s) scored.push({ note: n, score: s, why });
  }
  scored.sort((a, b) => b.score - a.score || (b.note.updated || 0) - (a.note.updated || 0));
  const related = scored.slice(0, 5);
  const noteIds = new Set(related.map((r) => r.note.id));
  const openTasks = tasks.filter((t) => !t.done && (
    (t.noteId && noteIds.has(t.noteId)) || (t.eventKey && t.eventKey === ev.key) ||
    (t.assignee && [...evPeople].some((p) => p && norm(t.assignee).includes(p)))
  ));
  const last = related.map((r) => r.note).filter((n) => n.meeting?.decisions?.length).sort((a, b) => (b.updated || 0) - (a.updated || 0))[0];
  return { related, openTasks, lastDecisions: last ? { note: last, decisions: last.meeting.decisions } : null };
}

/** Signature d'une série : même titre normalisé (réunions récurrentes). */
export const seriesSig = (ev) => norm(ev.title || '').replace(/\d+/g, '#');

/** Clé stable d'un événement : identifiant natif, sinon titre + début. */
export const eventKey = (ev) => ev.id ? `cal:${ev.id}` : `sig:${seriesSig(ev)}@${ev.start}`;

// ——— Export .ics (RFC 5545) ———
export function buildICS(ev, { lang = 'fr', hijriOffset = 0 } = {}) {
  const p = (n) => String(n).padStart(2, '0');
  const utc = (t) => { const d = new Date(t); return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}00Z`; };
  const day = (t) => { const d = new Date(t); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`; };
  const escTxt = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const fold = (line) => {
    const enc = new TextEncoder();
    if (enc.encode(line).length <= 75) return line;
    const parts = []; let cur = '';
    for (const ch of line) {
      if (enc.encode(cur + ch).length > (parts.length ? 74 : 75)) { parts.push(cur); cur = ch; } else cur += ch;
    }
    parts.push(cur);
    return parts.join('\r\n ');
  };
  const hij = formatHijri(new Date(ev.start), lang, hijriOffset);
  const desc = [ev.description, `${lang === 'ar' ? 'التاريخ الهجري' : 'Date hégirienne'} : ${hij}`].filter(Boolean).join('\n');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Trame//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${(ev.uid || ev.key || Date.now()).toString().replace(/[^\w.@-]/g, '')}@trame`,
    `DTSTAMP:${utc(Date.now())}`,
    ev.allDay ? `DTSTART;VALUE=DATE:${day(ev.start)}` : `DTSTART:${utc(ev.start)}`,
    ev.allDay ? `DTEND;VALUE=DATE:${day(ev.end)}` : `DTEND:${utc(ev.end)}`,
    `SUMMARY:${escTxt(ev.title)}`,
    ev.location ? `LOCATION:${escTxt(ev.location)}` : null,
    `DESCRIPTION:${escTxt(desc)}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean);
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Numéro au format international sans « + » (06… / 07… → 2126… / 2127… pour le Maroc). */
export function waNumber(raw) {
  let d = String(raw || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (/^0[5-7]\d{8}$/.test(d)) d = '212' + d.slice(1);
  return d.replace(/\D/g, '');
}
