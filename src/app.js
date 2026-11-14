// Trame — interface principale (vanilla JS, rendu par gabarits).
import * as P from './platform.js';
import { t, setLang } from './i18n.js';
import { parseQuick } from './core/parser.js';
import { esc, uid, norm } from './core/text.js';
import { toHijri, fromHijri, hijriMonthLength, HIJRI_MONTHS } from './core/hijri.js';
import {
  DAY, MIN, addDays, startOfDay, endOfDay, sameDay, startOfWeek, ymd, parseYmd, hm, dateLabel, timeLabel,
  weekdayShort, monthTitle, durationLabel, digits,
} from './core/dates.js';
import {
  findConflicts, conflictKeys, freeSlots, suggestPlacements, searchAll, buildContext, buildICS, seriesSig, noteText,
} from './core/logic.js';
import { makeBackup, readBackup, isEncrypted, makeShare, readShare } from './core/backup.js';
import { noteToText, noteToPdf } from './export.js';

// ——— État ———
const DEFAULT_SETTINGS = {
  lang: 'fr', calMode: 'both', hijriOffset: 0, digits: 'latin', writeCal: '', hiddenCals: [],
  contextLead: 15, defaultDur: 60, dayStart: 8, dayEnd: 18, taskDueReminder: true, onboarded: false,
  updateUrl: 'https://raw.githubusercontent.com/Mrani-hub/trame/main/version.json',
};
const state = {
  data: { format: 1, tasks: [], notes: [], localEvents: [], eventMeta: {}, settings: { ...DEFAULT_SETTINGS } },
  view: 'today', cursor: startOfDay(new Date()), agendaMode: 'week', monthCal: null, selDay: startOfDay(new Date()),
  taskFilter: 'open', query: '', events: [], range: null, calendars: [], calPerm: false, sheet: null,
};
const S = () => state.data.settings;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ——— Icônes ———
const ICONS = {
  today: '<path d="M4 6h16M4 6v13h16V6M8 3v4M16 3v4"/><circle cx="12" cy="13" r="2.4"/>',
  agenda: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  tasks: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11M3.5 18l1.5 1.5L7.5 17"/>',
  notes: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', bell: '<path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 004 0"/>',
  warn: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17v.5"/>', share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
  left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>', clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  review: '<path d="M4 12a8 8 0 1014.3-4.9M18.5 3v4.5H14"/>', users: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0111 0M16 5.5a3 3 0 010 5.5M17.5 14a5 5 0 013.5 5"/>',
};
const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;

// ——— Utilitaires d'interface ———
const D = (s) => digits(String(s), S());
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
const fmtTime = (ms) => timeLabel(new Date(ms), S());
const fmtDate = (ms, o) => dateLabel(new Date(ms), S(), o);
function relMinutes(ms) {
  const m = Math.round((ms - Date.now()) / MIN);
  if (m < 60) return D(`${m} ${t('minutes')}`);
  return D(durationLabel(Math.round(m / 15) * 15, S().lang));
}

let saveTimer;
function persist() {
  P.saveData(state.data);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(rescheduleNotifs, 1200);
}

// ——— Rendez-vous (agendas du téléphone + rendez-vous locaux) ———
async function ensureRange(from, to, force = false) {
  const today = startOfDay(new Date());
  const f = Math.min(from, addDays(today, -14).getTime());
  const tt = Math.max(to, addDays(today, 21).getTime());
  if (!force && state.range && state.range[0] <= from && state.range[1] >= to) return;
  const device = state.calPerm ? await P.listDeviceEvents(f, tt) : [];
  const hidden = new Set(S().hiddenCals);
  const locals = state.data.localEvents.filter((e) => e.end > f && e.start < tt).map((e) => ({ ...e, source: 'local' }));
  state.events = [...device.filter((e) => !hidden.has(e.calendarId)), ...locals]
    .map((e) => ({ ...e, participants: state.data.eventMeta[e.key]?.participants || [] }))
    .sort((a, b) => a.start - b.start);
  state.range = [f, tt];
}
const eventsOn = (day) => {
  const a = startOfDay(day).getTime(), b = a + DAY;
  return state.events.filter((e) => e.start < b && e.end > a);
};
const invalidate = () => { state.range = null; };

// ——— Rendu principal ———
async function render() {
  setLang(S().lang);
  document.documentElement.lang = S().lang;
  document.documentElement.dir = S().lang === 'ar' ? 'rtl' : 'ltr';
  const range = viewRange();
  await ensureRange(range[0], range[1]);
  const views = { today: viewToday, agenda: viewAgenda, tasks: viewTasks, notes: viewNotes, search: viewSearch };
  $('#app').innerHTML = `
    <header class="top">
      <div class="brand"><span class="logo">T</span><div><b>Trame</b><small>${esc(fmtDate(Date.now(), { weekday: true }))}</small></div></div>
      <button class="iconbtn" data-act="settings" aria-label="${t('settings')}">${icon('gear')}</button>
    </header>
    <form class="capture" id="capForm" autocomplete="off">
      <input id="capIn" enterkeyhint="send" placeholder="${esc(t('capturePh'))}" aria-label="${esc(t('capturePh'))}">
      <button class="capbtn" aria-label="+">${icon('plus')}</button>
    </form>
    <main id="main">${views[state.view]()}</main>
    <nav class="tabs">${['today', 'agenda', 'tasks', 'notes', 'search'].map((v) => `
      <button data-act="view" data-v="${v}" class="${state.view === v ? 'on' : ''}">${icon(v)}<span>${t(v)}</span></button>`).join('')}
    </nav>`;
  if (state.view === 'search') { const i = $('#q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}

function viewRange() {
  const c = state.cursor;
  if (state.view === 'agenda' && state.agendaMode === 'month') {
    const s = monthGridStart(c); return [s.getTime(), addDays(s, 43).getTime()];
  }
  if (state.view === 'agenda') { const s = startOfWeek(c); return [s.getTime(), addDays(s, 7).getTime()]; }
  const d = startOfDay(new Date()); return [d.getTime(), addDays(d, 2).getTime()];
}

// ——— Vue « Aujourd'hui » ———
function viewToday() {
  const now = new Date(), today = startOfDay(now);
  const evs = eventsOn(today);
  const conf = conflictKeys(evs);
  const todo = state.data.tasks.filter((x) => !x.done && ((x.due && x.due < today.getTime() + DAY) || (x.remindAt && x.remindAt < today.getTime() + DAY) || (x.plannedStart && sameDay(x.plannedStart, today))))
    .sort((a, b) => (taskTime(a) ?? 0) - (taskTime(b) ?? 0));
  const next = evs.find((e) => !e.allDay && e.start > now.getTime());
  const slots = freeSlots(today, [...evs, ...plannedBlocks(today)], { dayStart: S().dayStart, dayEnd: S().dayEnd, now });
  const sug = suggestPlacements(state.data.tasks, slots, today);
  const brief = [
    evs.length ? t('briefEvents', D(evs.length)) : t('briefFree'),
    todo.length ? t('briefTasks', D(todo.length)) : null,
    conf.size ? t('conflictsN', D(Math.ceil(conf.size / 2))) : null,
  ].filter(Boolean);
  const planned = plannedBlocks(today);
  const timeline = [...evs, ...planned].sort((a, b) => a.start - b.start);
  return `
    ${!state.calPerm && P.native ? `<div class="banner"><div><b>${t('connectCal')}</b><small>${t('connectCalHint')}</small></div><button class="btn" data-act="connect">${t('connectCal').split(' ')[0]}</button></div>` : ''}
    <section class="brief">
      <div class="brief-main">${brief.map((b, i) => `<span class="${i === 2 ? 'warn' : ''}">${esc(b)}</span>`).join('<i>·</i>')}</div>
      ${next ? `<div class="brief-next">${icon('clock')} ${esc(t('briefNext', relMinutes(next.start), next.title))}</div>` : ''}
      <button class="chip" data-act="review">${icon('review')} ${t('review')}</button>
    </section>
    <h2>${t('sectionAgenda')}</h2>
    ${timeline.length ? `<div class="list">${timeline.map((e) => e.planned ? plannedRow(e) : eventRow(e, conf)).join('')}</div>` : `<p class="empty">${t('emptyDay')}</p>`}
    <h2>${t('sectionTodo')}</h2>
    ${todo.length ? `<div class="list">${todo.map(taskRow).join('')}</div>` : `<p class="empty">${t('emptyTodo')}</p>`}
    ${sug.length ? `<h2>${t('sectionSlots')}</h2><div class="list">${sug.map((s) => `
      <div class="row slot"><div class="when">${D(fmtTime(s.start))}</div>
        <div class="what"><b>${esc(s.task.title)}</b><small>${D(durationLabel(s.task.durationMin || 30, S().lang))}</small></div>
        <button class="chip" data-act="plan" data-id="${s.task.id}" data-at="${s.start}">${t('plan')}</button></div>`).join('')}</div>` : ''}`;
}
const taskTime = (x) => x.plannedStart || x.remindAt || x.due;
function plannedBlocks(day) {
  return state.data.tasks.filter((x) => !x.done && x.plannedStart && sameDay(x.plannedStart, day))
    .map((x) => ({ planned: true, task: x, key: 'plan:' + x.id, title: x.title, start: x.plannedStart, end: x.plannedStart + (x.durationMin || 30) * MIN }));
}
function eventRow(e, conf = new Set()) {
  const ctx = buildContext(e, state.data);
  const n = ctx.related.length + ctx.openTasks.length;
  return `<button class="row ev" data-act="event" data-key="${esc(e.key)}" style="--c:${esc(e.color || '#1F4E79')}">
    <div class="when">${e.allDay ? t('allDayShort') : `${D(fmtTime(e.start))}<small>${D(fmtTime(e.end))}</small>`}</div>
    <div class="what"><b>${esc(e.title || t('untitled'))}</b>${e.location ? `<small>${esc(e.location)}</small>` : ''}</div>
    ${conf.has(e.key) ? `<span class="badge warn">${icon('warn')}</span>` : ''}${n ? `<span class="badge">${icon('link')}${D(n)}</span>` : ''}
  </button>`;
}
function plannedRow(p) {
  return `<button class="row ev planned" data-act="task" data-id="${p.task.id}">
    <div class="when">${D(fmtTime(p.start))}<small>${D(fmtTime(p.end))}</small></div>
    <div class="what"><b>${esc(p.title)}</b><small>${t('planned')}</small></div></button>`;
}
function taskRow(x) {
  const today = startOfDay(new Date()).getTime();
  const late = !x.done && x.due && x.due < today;
  const meta = [
    x.remindAt ? `${icon('bell')}${D(fmtDate(x.remindAt, { weekday: false }))} ${D(fmtTime(x.remindAt))}` : null,
    x.due && !x.isReminder ? `<span class="${late ? 'late' : ''}">${D(fmtDate(x.due, { weekday: !late }))}</span>` : null,
    x.durationMin ? D(durationLabel(x.durationMin, S().lang)) : null,
    x.assignee ? `${icon('users')}${esc(x.assignee)}` : null,
  ].filter(Boolean).join(' · ');
  return `<div class="row task ${x.done ? 'done' : ''} ${x.priority === 'high' ? 'high' : ''}">
    <button class="tick" data-act="toggle" data-id="${x.id}" aria-label="${t('done')}">${x.done ? icon('check') : ''}</button>
    <button class="what" data-act="task" data-id="${x.id}"><b>${esc(x.title)}</b>${meta ? `<small>${meta}</small>` : ''}</button>
  </div>`;
}

// ——— Vue Agenda (semaine / mois, grégorien ou hégirien) ———
function monthGridStart(c) {
  if (monthIsHijri()) {
    const h = toHijri(c, S().hijriOffset);
    return startOfWeek(fromHijri(h.y, h.m, 1, S().hijriOffset));
  }
  return startOfWeek(new Date(c.getFullYear(), c.getMonth(), 1));
}
const monthIsHijri = () => state.monthCal ? state.monthCal === 'hijri' : S().calMode === 'hijri';

function viewAgenda() {
  const c = state.cursor;
  const head = `<div class="toolbar">
    <button class="iconbtn" data-act="nav" data-d="-1" aria-label="${t('prev')}">${icon(S().lang === 'ar' ? 'right' : 'left')}</button>
    <div class="tb-title">${esc(agendaTitle())}</div>
    <button class="iconbtn" data-act="nav" data-d="1" aria-label="${t('next')}">${icon(S().lang === 'ar' ? 'left' : 'right')}</button>
  </div>
  <div class="seg">
    <button data-act="amode" data-m="week" class="${state.agendaMode === 'week' ? 'on' : ''}">${t('week')}</button>
    <button data-act="amode" data-m="month" class="${state.agendaMode === 'month' ? 'on' : ''}">${t('month')}</button>
    ${state.agendaMode === 'month' ? `<button data-act="mcal" class="ghost">${icon('moon')} ${monthIsHijri() ? t('modeGreg') : t('modeHijri')}</button>` : ''}
    <button data-act="nav" data-d="0" class="ghost">${t('goToday')}</button>
  </div>`;
  return head + (state.agendaMode === 'week' ? weekView() : monthView());
}
function agendaTitle() {
  const c = state.cursor;
  if (state.agendaMode === 'month' && monthIsHijri()) {
    const h = toHijri(c, S().hijriOffset);
    return D(`${HIJRI_MONTHS[S().lang][h.m - 1]} ${h.y}`);
  }
  if (state.agendaMode === 'month') return D(monthTitle(c, S().lang));
  const s = startOfWeek(c), e = addDays(s, 6);
  return D(`${fmtDate(s, { weekday: false })} – ${fmtDate(e, { weekday: false })}`);
}
function dayBlock(d) {
  const evs = eventsOn(d), conf = conflictKeys(evs);
  const tks = state.data.tasks.filter((x) => !x.done && [x.due, x.remindAt, x.plannedStart].some((v) => v && sameDay(v, d)));
  const isToday = sameDay(d, new Date());
  return `<section class="day ${isToday ? 'is-today' : ''}">
    <h3>${esc(fmtDate(d.getTime()))}</h3>
    ${evs.length || tks.length ? `<div class="list">${evs.map((e) => eventRow(e, conf)).join('')}${tks.map(taskRow).join('')}</div>` : `<p class="empty sm">—</p>`}
  </section>`;
}
function weekView() {
  const s = startOfWeek(state.cursor);
  return Array.from({ length: 7 }, (_, i) => dayBlock(addDays(s, i))).join('');
}
function monthView() {
  const hij = monthIsHijri(), off = S().hijriOffset;
  const start = monthGridStart(state.cursor);
  const ref = hij ? toHijri(state.cursor, off) : null;
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    const h = toHijri(d, off);
    const inMonth = hij ? h.m === ref.m && h.y === ref.y : d.getMonth() === state.cursor.getMonth();
    if (i >= 35 && !inMonth && i % 7 === 0) break;
    const n = eventsOn(d).length + state.data.tasks.filter((x) => !x.done && x.due && sameDay(x.due, d)).length;
    const big = hij ? h.d : d.getDate(), small = hij ? d.getDate() : h.d;
    cells.push(`<button class="cell ${inMonth ? '' : 'out'} ${sameDay(d, new Date()) ? 'today' : ''} ${sameDay(d, state.selDay) ? 'sel' : ''}" data-act="selday" data-t="${d.getTime()}">
      <b>${D(big)}</b>${S().calMode !== 'greg' || hij ? `<small>${D(small)}</small>` : ''}${n ? `<i>${'•'.repeat(Math.min(n, 3))}</i>` : ''}</button>`);
  }
  const wd = Array.from({ length: 7 }, (_, i) => `<span>${esc(weekdayShort(addDays(startOfWeek(new Date()), i), S().lang))}</span>`).join('');
  return `<div class="month"><div class="wd">${wd}</div><div class="grid">${cells.join('')}</div></div>${dayBlock(state.selDay)}`;
}

// ——— Vue Tâches ———
function viewTasks() {
  const f = state.taskFilter;
  const all = state.data.tasks;
  const chips = ['open', 'reminders', 'done'].map((k) => `<button data-act="tfilter" data-f="${k}" class="${f === k ? 'on' : ''}">${t({ open: 'filterOpen', reminders: 'filterReminders', done: 'filterDone' }[k])}</button>`).join('');
  let body;
  if (f === 'done') {
    const l = all.filter((x) => x.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 100);
    body = l.length ? `<div class="list">${l.map(taskRow).join('')}</div>` : `<p class="empty">—</p>`;
  } else {
    const l = all.filter((x) => !x.done && (f === 'reminders' ? x.isReminder : !x.isReminder));
    const today = startOfDay(new Date()).getTime();
    const groups = [
      [t('overdue'), l.filter((x) => (x.due || x.remindAt) && (x.due || x.remindAt) < today)],
      [t('today'), l.filter((x) => { const v = x.due || x.remindAt; return v && v >= today && v < today + DAY; })],
      [t('upcoming'), l.filter((x) => (x.due || x.remindAt) >= today + DAY)],
      [t('noDate'), l.filter((x) => !x.due && !x.remindAt)],
    ].filter(([, v]) => v.length);
    groups.forEach(([, v]) => v.sort((a, b) => (b.priority === 'high') - (a.priority === 'high') || (a.due || a.remindAt || 0) - (b.due || b.remindAt || 0)));
    body = groups.length ? groups.map(([g, v]) => `<h2>${g}</h2><div class="list">${v.map(taskRow).join('')}</div>`).join('') : `<p class="empty">${t('emptyTodo')}</p>`;
  }
  return `<div class="seg">${chips}<button class="ghost" data-act="newtask">${icon('plus')} ${t('typeTask')}</button></div>${body}`;
}

// ——— Vue Notes ———
function viewNotes() {
  const l = [...state.data.notes].sort((a, b) => (b.updated || 0) - (a.updated || 0));
  return `<div class="seg"><button class="ghost" data-act="newnote">${icon('plus')} ${t('newNote')}</button>
    <button class="ghost" data-act="newmeeting">${icon('users')} ${t('newMeeting')}</button></div>
    ${l.length ? `<div class="cards">${l.map((n) => `<button class="card" data-act="note" data-id="${n.id}">
      <b>${esc(n.title || t('untitled'))}</b>
      ${n.eventTitle ? `<small class="lnk">${icon('link')} ${esc(n.eventTitle)}${n.eventStart ? ' · ' + D(fmtDate(n.eventStart, { weekday: false })) : ''}</small>` : ''}
      <p>${esc(noteText(n).slice(0, 140))}</p>
      <small>${D(fmtDate(n.updated, { weekday: false }))}</small></button>`).join('')}</div>` : `<p class="empty">${t('emptyNotes')}</p>`}`;
}

// ——— Vue Recherche ———
function viewSearch() {
  const res = state.query.trim() ? searchAll(state.query, { notes: state.data.notes, tasks: state.data.tasks, events: state.events }) : [];
  const kindIcon = { note: 'notes', task: 'tasks', event: 'agenda' };
  return `<div class="searchbox">${icon('search')}<input id="q" type="search" value="${esc(state.query)}" placeholder="${esc(t('searchPh'))}"></div>
    ${state.query.trim() && !res.length ? `<p class="empty">${t('emptySearch')}</p>` : ''}
    <div class="list">${res.map((r) => `<button class="row res" data-act="${r.kind}" ${r.kind === 'event' ? `data-key="${esc(r.item.key)}"` : `data-id="${r.item.id}"`}>
      ${icon(kindIcon[r.kind])}<div class="what"><b>${hl(r.title)}</b><small>${hl(r.snippet)}</small></div>
      ${r.date ? `<small class="dt">${D(fmtDate(r.date, { weekday: false }))}</small>` : ''}</button>`).join('')}</div>`;
}
function hl(s) {
  const terms = norm(state.query).split(' ').filter((x) => x.length > 1);
  let out = esc(s);
  for (const term of terms) {
    const src = esc(s); const n = norm(src);
    if (n.length !== src.length) continue; // pas de surlignage si la normalisation change les positions
    const i = n.indexOf(term);
    if (i >= 0) out = esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + term.length)) + '</mark>' + esc(s.slice(i + term.length));
    break;
  }
  return out;
}

// ——— Feuilles (panneaux) ———
function openSheet(sheet) { state.sheet = sheet; renderSheet(); }
function closeSheet() {
  if (state.sheet?.kind === 'note') saveNoteFromSheet(false);
  state.sheet = null; $('#sheet').innerHTML = ''; $('#sheet').className = '';
}
function renderSheet() {
  const s = state.sheet, el = $('#sheet');
  if (!s) { el.innerHTML = ''; el.className = ''; return; }
  const renderers = { edit: sheetEdit, event: sheetEvent, note: sheetNote, settings: sheetSettings, review: sheetReview, welcome: sheetWelcome };
  el.className = 'open' + (s.kind === 'note' ? ' full' : '');
  el.innerHTML = `<div class="scrim" data-act="close"></div><div class="panel" role="dialog">${renderers[s.kind]()}</div>`;
  if (s.kind === 'edit') updateEditDerived();
}

// ——— Éditeur (confirmation de saisie rapide, création, modification) ———
function draftFromParse(r) {
  const s = S();
  const d = {
    type: r.type, title: r.title, date: r.start ? ymd(r.start) : '', time: r.time ? hm(r.start) : '',
    endTime: r.end && r.type === 'event' && !r.allDay ? hm(r.end) : '', allDay: !!r.allDay, warnings: r.warnings,
    durationMin: r.type === 'task' ? (r.durationMin || 30) : r.durationMin, priority: 'normal', assignee: '', location: '',
    calendarId: s.writeCal || (state.calPerm ? '' : 'local'), body: '', participants: r.participants || [], parsed: true,
  };
  if (d.type === 'event' && !d.time && !d.allDay && d.date) d.allDay = true;
  if (d.type === 'event' && d.time && !d.endTime) d.endTime = hm(new Date(r.start + (r.durationMin || s.defaultDur) * MIN));
  if (d.type === 'note') { d.body = r.title; d.title = ''; }
  return d;
}
function sheetEdit() {
  const d = state.sheet.draft;
  const types = ['event', 'task', 'reminder', 'note'];
  const cals = state.calendars.filter((c) => c.writable);
  const tName = { event: 'typeEvent', task: 'typeTask', reminder: 'typeReminder', note: 'typeNote' };
  const hij = d.date ? toHijri(parseYmd(d.date), S().hijriOffset) : toHijri(new Date(), S().hijriOffset);
  return `<form id="editForm" class="form">
    <div class="sheet-head"><b>${d.existing ? t('edit') : d.parsed ? t('confirmTitle') : t('save')}</b><button type="button" class="iconbtn" data-act="close" aria-label="${t('close')}">✕</button></div>
    ${d.parsed ? `<p class="hint">${t('parsedHint')}</p>` : ''}
    ${!d.existing ? `<div class="seg types">${types.map((x) => `<button type="button" data-act="etype" data-t="${x}" class="${d.type === x ? 'on' : ''}">${t(tName[x])}</button>`).join('')}</div>` : ''}
    ${d.type !== 'note' ? `<label>${t('title')}<input name="title" value="${esc(d.title)}" required></label>` : `<label>${t('title')}<input name="title" value="${esc(d.title)}" placeholder="${esc(t('noteTitlePh'))}"></label><label>${t('body')}<textarea name="body" rows="5">${esc(d.body)}</textarea></label>`}
    ${d.type !== 'note' ? `
      <div class="two">
        <label>${d.type === 'task' ? t('due') : t('date')}<input type="date" name="date" value="${d.date}" ${d.type === 'task' ? '' : 'required'}></label>
        ${d.type === 'reminder' ? `<label>${t('start')}<input type="time" name="time" value="${d.time}" required></label>` : ''}
        ${d.type === 'task' ? `<label>${t('duration')}<select name="durationMin">${[15, 30, 45, 60, 90, 120, 180, 240].map((m) => `<option value="${m}" ${+d.durationMin === m ? 'selected' : ''}>${D(durationLabel(m, S().lang))}</option>`).join('')}</select></label>` : ''}
      </div>
      <div class="hijri-line"><span id="hijriLbl"></span><button type="button" class="link" data-act="hijtoggle">${icon('moon')} ${t('hijriInput')}</button></div>
      <div class="hijri-pick ${state.sheet.hijriOpen ? '' : 'hidden'}">
        <select data-h="d">${Array.from({ length: 30 }, (_, i) => `<option ${hij.d === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select>
        <select data-h="m">${HIJRI_MONTHS[S().lang].map((m, i) => `<option value="${i + 1}" ${hij.m === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select>
        <select data-h="y">${[hij.y - 1, hij.y, hij.y + 1, hij.y + 2].map((y) => `<option ${hij.y === y ? 'selected' : ''}>${y}</option>`).join('')}</select>
      </div>` : ''}
    ${d.type === 'event' ? `
      <label class="check"><input type="checkbox" name="allDay" ${d.allDay ? 'checked' : ''}> ${t('allDay')}</label>
      <div class="two times ${d.allDay ? 'hidden' : ''}">
        <label>${t('start')}<input type="time" name="time" value="${d.time}"></label>
        <label>${t('end')}<input type="time" name="endTime" value="${d.endTime}"></label>
      </div>
      <div id="conflictBox"></div>
      <label>${t('location')}<input name="location" value="${esc(d.location)}"></label>
      <label>${t('participants')}<input name="participants" value="${esc((d.participants || []).join(', '))}" placeholder="${esc(t('participantsPh'))}"></label>
      ${!d.existing || d.existing.source === 'local' ? `<label>${t('calendar')}<select name="calendarId">
        ${cals.map((c) => `<option value="${esc(c.id)}" ${d.calendarId === c.id ? 'selected' : ''}>${esc(c.title)}${c.account && c.account !== c.title ? ' — ' + esc(c.account) : ''}</option>`).join('')}
        <option value="local" ${d.calendarId === 'local' || !cals.length ? 'selected' : ''}>${t('localCal')}</option></select></label>` : ''}` : ''}
    ${d.type === 'task' ? `
      <div class="two">
        <label>${t('priority')}<select name="priority"><option value="normal">${t('prioNormal')}</option><option value="high" ${d.priority === 'high' ? 'selected' : ''}>${t('prioHigh')}</option></select></label>
        <label>${t('assignee')}<input name="assignee" value="${esc(d.assignee)}"></label>
      </div>
      <div class="two"><label>${t('remindAt')}<input type="date" name="remindDate" value="${d.remindAt ? ymd(d.remindAt) : ''}"></label>
      <label>&nbsp;<input type="time" name="remindTime" value="${d.remindAt ? hm(d.remindAt) : ''}"></label></div>` : ''}
    ${d.warnings?.includes('defaultTime') ? `<p class="warnline">${icon('warn')} ${t('defaultTimeWarn')}</p>` : ''}
    <div class="actions">
      ${d.existing ? `<button type="button" class="btn danger ghost" data-act="edel">${t('del')}</button>` : ''}
      <button type="button" class="btn ghost" data-act="close">${t('cancel')}</button>
      <button class="btn primary">${t('save')}</button>
    </div>
  </form>`;
}
function readEditForm() {
  const f = $('#editForm'); if (!f) return;
  const d = state.sheet.draft;
  const v = (n) => f.elements[n]?.value ?? undefined;
  for (const k of ['title', 'body', 'date', 'time', 'endTime', 'location', 'calendarId', 'priority', 'assignee']) if (f.elements[k]) d[k] = v(k).trim();
  if (f.elements.durationMin) d.durationMin = +v('durationMin');
  if (f.elements.allDay) d.allDay = f.elements.allDay.checked;
  if (f.elements.participants) d.participants = v('participants').split(/[,،]/).map((s) => s.trim()).filter(Boolean);
  if (f.elements.remindDate) d.remindAt = v('remindDate') ? combine(v('remindDate'), v('remindTime') || '09:00') : null;
  return d;
}
const combine = (date, time) => { const x = parseYmd(date); const [h, m] = (time || '00:00').split(':').map(Number); x.setHours(h, m, 0, 0); return x.getTime(); };

async function updateEditDerived() {
  const f = $('#editForm'); if (!f) return;
  const d = readEditForm();
  const lbl = $('#hijriLbl');
  if (lbl) lbl.textContent = d.date ? D(dateLabel(parseYmd(d.date), { ...S(), calMode: S().calMode === 'greg' ? 'both' : S().calMode }, { year: true })) : t('noDue');
  const times = $('.times', f); if (times) times.classList.toggle('hidden', !!d.allDay);
  const box = $('#conflictBox');
  if (box && d.type === 'event' && d.date && d.time && !d.allDay) {
    const start = combine(d.date, d.time);
    let end = d.endTime ? combine(d.date, d.endTime) : start + S().defaultDur * MIN;
    if (end <= start) end = start + S().defaultDur * MIN;
    await ensureRange(startOfDay(start).getTime(), endOfDay(start).getTime());
    const c = findConflicts({ start, end }, eventsOn(new Date(start)), d.existing?.key);
    box.innerHTML = c.length ? `<div class="conflict">${icon('warn')}<div><b>${t('conflictWarn')}</b>${c.map((e) => `<small>${D(fmtTime(e.start))}–${D(fmtTime(e.end))} · ${esc(e.title)}</small>`).join('')}</div></div>` : '';
  } else if (box) box.innerHTML = '';
}

async function saveEdit() {
  const d = readEditForm();
  const s = S();
  if (d.type !== 'note' && !d.title) { toast(t('noTitleWarn')); return; }
  const now = Date.now();
  if (d.type === 'event') {
    if (!d.date) return;
    const start = d.allDay ? parseYmd(d.date).getTime() : combine(d.date, d.time || '09:00');
    let end = d.allDay ? addDays(parseYmd(d.date), 1).getTime() : d.endTime ? combine(d.date, d.endTime) : start + s.defaultDur * MIN;
    if (end <= start) end = start + s.defaultDur * MIN;
    const ev = { title: d.title, start, end, allDay: d.allDay, location: d.location };
    let key;
    try {
      if (d.existing?.source === 'device') {
        await P.modifyDeviceEvent({ ...ev, id: d.existing.id }); key = d.existing.key;
      } else if (d.existing?.source === 'local') {
        Object.assign(state.data.localEvents.find((e) => e.id === d.existing.id), ev); key = d.existing.key;
      } else if (d.calendarId && d.calendarId !== 'local' && state.calPerm) {
        const id = await P.createDeviceEvent(ev, d.calendarId, s.contextLead); key = `cal:${id}`;
        if (s.writeCal !== d.calendarId) s.writeCal = d.calendarId;
      } else {
        const id = uid('ev'); key = `loc:${id}`;
        state.data.localEvents.push({ id, key, ...ev, created: now });
      }
    } catch (e) { console.error(e); toast(String(e.message || e)); return; }
    if (d.participants?.length) state.data.eventMeta[key] = { participants: d.participants };
    invalidate();
  } else if (d.type === 'note') {
    const n = { id: uid('n'), title: d.title || firstLine(d.body), body: d.body, created: now, updated: now, meeting: null };
    state.data.notes.push(n);
  } else {
    const isRem = d.type === 'reminder';
    const x = d.existing ? state.data.tasks.find((k) => k.id === d.existing.id) : { id: uid('t'), created: now, done: false };
    Object.assign(x, {
      title: d.title, isReminder: isRem, updated: now,
      due: !isRem && d.date ? parseYmd(d.date).getTime() : null,
      remindAt: isRem ? combine(d.date, d.time || '09:00') : d.remindAt || null,
      durationMin: isRem ? null : d.durationMin || 30, priority: d.priority || 'normal', assignee: d.assignee || '',
    });
    if (!d.existing) state.data.tasks.push(x);
  }
  persist(); closeSheet(); toast(t('saved')); render();
}
const firstLine = (s) => (s || '').split('\n')[0].slice(0, 60);

async function deleteFromEdit() {
  const d = state.sheet.draft;
  if (!confirm(t('confirmDelete'))) return;
  if (d.existing.kind === 'task') state.data.tasks = state.data.tasks.filter((x) => x.id !== d.existing.id);
  else if (d.existing.source === 'device') { try { await P.deleteDeviceEvent(d.existing); } catch (e) { toast(String(e.message || e)); return; } }
  else state.data.localEvents = state.data.localEvents.filter((e) => e.id !== d.existing.id);
  invalidate(); persist(); closeSheet(); toast(t('deleted')); render();
}

function openTaskEditor(id) {
  const x = state.data.tasks.find((k) => k.id === id); if (!x) return;
  openSheet({ kind: 'edit', draft: {
    type: x.isReminder ? 'reminder' : 'task', title: x.title, date: x.isReminder ? (x.remindAt ? ymd(x.remindAt) : '') : x.due ? ymd(x.due) : '',
    time: x.isReminder && x.remindAt ? hm(x.remindAt) : '', durationMin: x.durationMin || 30, priority: x.priority, assignee: x.assignee,
    remindAt: x.isReminder ? null : x.remindAt, existing: { kind: 'task', id: x.id },
  } });
}
function openEventEditor(e) {
  openSheet({ kind: 'edit', draft: {
    type: 'event', title: e.title, date: ymd(e.start), time: e.allDay ? '' : hm(e.start), endTime: e.allDay ? '' : hm(e.end), allDay: e.allDay,
    location: e.location || '', participants: e.participants || [], calendarId: e.source === 'local' ? 'local' : e.calendarId,
    existing: { kind: 'event', source: e.source, id: e.id, key: e.key, recurring: e.recurring, start: e.start },
  } });
}

// ——— Fiche d'un rendez-vous + fiche contexte ———
function sheetEvent() {
  const e = state.sheet.ev;
  const ctx = buildContext(e, state.data);
  const conf = findConflicts(e, eventsOn(new Date(e.start)), e.key);
  const why = { linked: 'whyLinked', series: 'whySeries', people: 'whyPeople', topic: 'whyTopic' };
  const cal = state.calendars.find((c) => c.id === e.calendarId);
  const people = [...(e.attendees || []).map((a) => a.name || a.email), ...(e.participants || [])];
  return `<div class="sheet-head"><b>${esc(e.title || t('untitled'))}</b><button class="iconbtn" data-act="close" aria-label="${t('close')}">✕</button></div>
    <p class="meta">${D(esc(fmtDate(e.start, { year: true })))}<br>${e.allDay ? t('allDay') : `${D(fmtTime(e.start))} – ${D(fmtTime(e.end))}`}
      ${e.location ? `<br>${esc(e.location)}` : ''}<br><small>${esc(e.source === 'local' ? t('localCal') : cal?.title || '')}</small></p>
    ${people.length ? `<p class="meta">${icon('users')} ${esc(people.join(', '))}</p>` : ''}
    ${conf.length ? `<div class="conflict">${icon('warn')}<div><b>${t('conflictWarn')}</b>${conf.map((c) => `<small>${D(fmtTime(c.start))}–${D(fmtTime(c.end))} · ${esc(c.title)}</small>`).join('')}</div></div>` : ''}
    <h3 class="ctx-title">${icon('link')} ${t('context')}</h3>
    ${!ctx.related.length && !ctx.openTasks.length ? `<p class="empty sm">${t('contextEmpty')}</p>` : ''}
    ${ctx.lastDecisions ? `<div class="ctx-box"><b>${t('lastDecisions')}</b><ul>${ctx.lastDecisions.decisions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${ctx.openTasks.length ? `<div class="ctx-box"><b>${t('openActions')}</b><div class="list">${ctx.openTasks.map(taskRow).join('')}</div></div>` : ''}
    ${ctx.related.length ? `<div class="ctx-box"><b>${t('relatedNotes')}</b>${ctx.related.map((r) => `<button class="row" data-act="note" data-id="${r.note.id}">
      <div class="what"><b>${esc(r.note.title || t('untitled'))}</b><small>${r.why.map((w) => t(why[w])).join(' · ')} · ${D(fmtDate(r.note.updated, { weekday: false }))}</small></div></button>`).join('')}</div>` : ''}
    <div class="actions wrap">
      <button class="btn primary" data-act="evnote">${icon('users')} ${t('newMeeting')}</button>
      <button class="btn ghost" data-act="evics">${icon('share')} ${t('shareIcs')}</button>
      <button class="btn ghost" data-act="evedit">${t('edit')}</button>
    </div>`;
}
async function openEventByKey(key, hintStart) {
  if (hintStart) await ensureRange(startOfDay(hintStart).getTime(), endOfDay(hintStart).getTime());
  let e = state.events.find((x) => x.key === key);
  if (!e && hintStart) { await ensureRange(startOfDay(hintStart).getTime(), endOfDay(hintStart).getTime(), true); e = state.events.find((x) => x.key === key); }
  if (e) openSheet({ kind: 'event', ev: e });
}

// ——— Éditeur de note / compte rendu ———
function newNote(meeting, ev = null) {
  const now = Date.now();
  const n = { id: uid('n'), title: ev ? ev.title : '', body: '', created: now, updated: now, meeting: meeting ? { participants: [], agenda: '', decisions: [], actions: [] } : null };
  if (ev) linkNote(n, ev);
  if (ev && meeting) n.meeting.participants = [...new Set([...(ev.attendees || []).map((a) => a.name || a.email), ...(ev.participants || [])])];
  openSheet({ kind: 'note', note: n, isNew: true });
}
function linkNote(n, ev) {
  if (!ev) { delete n.eventKey; delete n.eventSig; delete n.eventTitle; delete n.eventStart; return; }
  Object.assign(n, { eventKey: ev.key, eventSig: seriesSig(ev), eventTitle: ev.title, eventStart: ev.start });
}
function sheetNote() {
  const n = state.sheet.note, m = n.meeting;
  const around = state.events.filter((e) => Math.abs(e.start - Date.now()) < 21 * DAY).slice(0, 80);
  return `<div class="sheet-head"><button class="iconbtn" data-act="close" aria-label="${t('close')}">${icon(S().lang === 'ar' ? 'right' : 'left')}</button>
      <b>${m ? t('meetingNote') : t('typeNote')}</b>
      <button class="iconbtn" data-act="noteshare" aria-label="${t('share')}">${icon('share')}</button></div>
    <div class="form" id="noteForm">
      <input class="title-in" name="title" value="${esc(n.title)}" placeholder="${esc(t('noteTitlePh'))}">
      <label>${t('linkedEvent')}<select name="eventKey"><option value="">${t('none')}</option>
        ${n.eventKey && !around.find((e) => e.key === n.eventKey) ? `<option value="${esc(n.eventKey)}" selected>${esc(n.eventTitle)} · ${D(fmtDate(n.eventStart, { weekday: false }))}</option>` : ''}
        ${around.map((e) => `<option value="${esc(e.key)}" ${n.eventKey === e.key ? 'selected' : ''}>${D(fmtDate(e.start, { weekday: false }))} ${e.allDay ? '' : D(fmtTime(e.start))} · ${esc(e.title)}</option>`).join('')}
      </select></label>
      ${m ? `<label>${t('participants')}<input name="participants" value="${esc(m.participants.join(', '))}" placeholder="${esc(t('participantsPh'))}"></label>
        <label>${t('agendaItems')}<textarea name="agenda" rows="3">${esc(m.agenda)}</textarea></label>` : ''}
      <label>${m ? t('notes') : t('body')}<textarea name="body" rows="${m ? 5 : 14}">${esc(n.body)}</textarea></label>
      ${m ? `<h3>${t('decisions')}</h3>
        ${m.decisions.map((x, i) => `<div class="li"><input data-dec="${i}" value="${esc(x)}"><button type="button" class="iconbtn sm" data-act="decdel" data-i="${i}">✕</button></div>`).join('')}
        <button type="button" class="link" data-act="decadd">${icon('plus')} ${t('addDecision')}</button>
        <h3>${t('actions')}</h3>
        ${m.actions.map((a, i) => `<div class="action-item">
          <input data-act-text="${i}" value="${esc(a.text)}" placeholder="${esc(t('actions'))}">
          <div class="two"><input data-act-who="${i}" value="${esc(a.who || '')}" placeholder="${esc(t('who'))}"><input type="date" data-act-due="${i}" value="${a.due ? ymd(a.due) : ''}"></div>
          <div class="ai-foot">${a.taskId ? `<span class="ok">${icon('check')} ${t('taskCreated')}</span>` : `<button type="button" class="chip" data-act="actask" data-i="${i}">${t('toTask')}</button>`}
          <button type="button" class="iconbtn sm" data-act="actdel" data-i="${i}">✕</button></div></div>`).join('')}
        <button type="button" class="link" data-act="actadd">${icon('plus')} ${t('addAction')}</button>` : ''}
      <div class="actions">
        ${!state.sheet.isNew ? `<button type="button" class="btn danger ghost" data-act="notedel">${t('del')}</button>` : ''}
        <button type="button" class="btn primary" data-act="notesave">${t('save')}</button>
      </div>
    </div>`;
}
function syncNoteFromDom() {
  const f = $('#noteForm'); if (!f || !state.sheet?.note) return;
  const n = state.sheet.note, m = n.meeting;
  const q = (s) => f.querySelector(`[name="${s}"]`);
  n.title = q('title').value.trim(); n.body = q('body').value;
  const key = q('eventKey').value;
  if (key !== (n.eventKey || '')) linkNote(n, key ? state.events.find((e) => e.key === key) : null);
  if (m) {
    m.participants = q('participants').value.split(/[,،]/).map((s) => s.trim()).filter(Boolean);
    m.agenda = q('agenda').value;
    m.decisions = $$('[data-dec]', f).map((i) => i.value);
    m.actions.forEach((a, i) => {
      a.text = f.querySelector(`[data-act-text="${i}"]`).value;
      a.who = f.querySelector(`[data-act-who="${i}"]`).value;
      const due = f.querySelector(`[data-act-due="${i}"]`).value;
      a.due = due ? parseYmd(due).getTime() : null;
    });
  }
}
function saveNoteFromSheet(closeAfter = true) {
  syncNoteFromDom();
  const n = state.sheet?.note; if (!n) return;
  const empty = !n.title && !n.body?.trim() && !(n.meeting && (n.meeting.decisions.some(Boolean) || n.meeting.actions.some((a) => a.text) || n.meeting.agenda));
  if (empty) { if (closeAfter) { state.sheet = null; renderSheet(); } return; }
  if (!n.title) n.title = firstLine(n.body) || (n.eventTitle ?? t('untitled'));
  if (n.meeting) { n.meeting.decisions = n.meeting.decisions.map((s) => s.trim()).filter(Boolean); n.meeting.actions = n.meeting.actions.filter((a) => a.text.trim() || a.taskId); }
  // les tâches issues des actions suivent leurs modifications
  for (const a of n.meeting?.actions || []) {
    const tk = a.taskId && state.data.tasks.find((x) => x.id === a.taskId);
    if (tk) Object.assign(tk, { title: a.text, assignee: a.who || '', due: a.due || null });
  }
  n.updated = Date.now();
  const i = state.data.notes.findIndex((x) => x.id === n.id);
  if (i >= 0) state.data.notes[i] = n; else state.data.notes.push(n);
  state.sheet.isNew = false;
  persist();
  if (closeAfter) { state.sheet = null; renderSheet(); toast(t('saved')); render(); }
}

// ——— Bilan du jour ———
function sheetReview() {
  const end = startOfDay(new Date()).getTime() + DAY;
  const l = state.data.tasks.filter((x) => !x.done && ((x.due && x.due < end) || (x.plannedStart && x.plannedStart < end) || (x.remindAt && x.remindAt < Date.now())));
  return `<div class="sheet-head"><b>${t('review')}</b><button class="iconbtn" data-act="close">✕</button></div>
    ${l.length ? `<p class="hint">${t('reviewHint')}</p><div class="list">${l.map((x) => `<div class="row review">
      <div class="what"><b>${esc(x.title)}</b><small>${x.due ? D(fmtDate(x.due, { weekday: false })) : ''}</small></div>
      <div class="rv-btns"><button class="chip ok" data-act="rv" data-op="done" data-id="${x.id}">${icon('check')}</button>
      <button class="chip" data-act="rv" data-op="tomorrow" data-id="${x.id}">${t('tomorrow')}</button>
      <button class="chip" data-act="rv" data-op="nodate" data-id="${x.id}">${t('noDate')}</button>
      <button class="chip danger" data-act="rv" data-op="del" data-id="${x.id}">✕</button></div></div>`).join('')}</div>` : `<p class="empty">${t('reviewEmpty')}</p>`}`;
}

// ——— Réglages ———
function sheetSettings() {
  const s = S();
  const opt = (v, cur, label) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${label}</option>`;
  const writable = state.calendars.filter((c) => c.writable);
  return `<div class="sheet-head"><b>${t('settings')}</b><button class="iconbtn" data-act="close">✕</button></div>
  <div class="form" id="setForm">
    <label>${t('sLang')}<select data-set="lang">${opt('fr', s.lang, 'Français')}${opt('ar', s.lang, 'العربية')}</select></label>
    <label>${t('sCalMode')}<select data-set="calMode">${opt('both', s.calMode, t('modeBoth'))}${opt('greg', s.calMode, t('modeGreg'))}${opt('hijri', s.calMode, t('modeHijri'))}</select></label>
    <label>${t('sHijriOffset')}<select data-set="hijriOffset" data-num="1">${[-2, -1, 0, 1, 2].map((n) => opt(n, s.hijriOffset, (n > 0 ? '+' : '') + n)).join('')}</select>
      <small>${t('sHijriHint')} — ${esc(dateLabel(new Date(), s, { year: true }))}</small></label>
    <label>${t('sDigits')}<select data-set="digits">${opt('latin', s.digits, t('digitsLatin'))}${opt('arab', s.digits, t('digitsArab'))}</select></label>
    <h3>${t('calendar')}</h3>
    ${P.native && !state.calPerm ? `<button class="btn" data-act="connect">${t('connectCal')}</button>` : ''}
    ${writable.length ? `<label>${t('sWriteCal')}<select data-set="writeCal">${writable.map((c) => opt(c.id, s.writeCal, esc(c.title))).join('')}${opt('local', s.writeCal, t('localCal'))}</select></label>` : ''}
    ${state.calendars.length ? `<div class="cals"><small>${t('sVisibleCals')}</small>${state.calendars.map((c) => `<label class="check"><input type="checkbox" data-cal="${esc(c.id)}" ${s.hiddenCals.includes(c.id) ? '' : 'checked'}><i style="background:${esc(c.color)}"></i>${esc(c.title)}</label>`).join('')}</div>` : ''}
    <label>${t('sDefaultDur')}<select data-set="defaultDur" data-num="1">${[15, 30, 45, 60, 90, 120].map((m) => opt(m, s.defaultDur, D(durationLabel(m, s.lang)))).join('')}</select></label>
    <div class="two"><label>${t('sDayHours')}<select data-set="dayStart" data-num="1">${[6, 7, 8, 9, 10].map((h) => opt(h, s.dayStart, D(h + ':00'))).join('')}</select></label>
      <label>&nbsp;<select data-set="dayEnd" data-num="1">${[15, 16, 17, 18, 19, 20].map((h) => opt(h, s.dayEnd, D(h + ':00'))).join('')}</select></label></div>
    <h3>${t('sNotif')}</h3>
    <label>${t('sLead')}<select data-set="contextLead" data-num="1">${opt(0, s.contextLead, t('off'))}${[5, 10, 15, 30, 60].map((m) => opt(m, s.contextLead, D(t('minutesBefore', m)))).join('')}</select></label>
    <label class="check"><input type="checkbox" data-set="taskDueReminder" ${s.taskDueReminder ? 'checked' : ''}> ${t('sTaskReminder')}</label>
    ${P.native ? `<div class="actions wrap"><button class="btn ghost" data-act="notifperm">${icon('bell')} ${t('enableNotif')}</button>
      ${P.platform === 'android' ? `<button class="btn ghost" data-act="exact">${t('exactAlarm')}</button>` : ''}</div>` : ''}
    <h3>${t('sBackup')}</h3>
    <input id="bkPwd" type="password" placeholder="${esc(t('backupPwd'))}" autocomplete="new-password">
    <div class="actions wrap"><button class="btn ghost" data-act="backup">${t('exportBackup')}</button><button class="btn ghost" data-act="import">${t('importFile')}</button></div>
    <h3>${t('sUpdates')}</h3>
    <label>${t('updateUrl')}<input data-set="updateUrl" value="${esc(s.updateUrl)}" dir="ltr"></label>
    <div class="actions wrap"><button class="btn ghost" data-act="update">${t('checkUpdate')}</button><small id="verLbl"></small></div>
    <h3>${t('sPrivacy')}</h3><p class="hint">${t('privacyText')}</p>
  </div>`;
}
async function applySetting(el) {
  const k = el.dataset.set;
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset.num) v = +v;
  S()[k] = v;
  if (k === 'hijriOffset' || k === 'calMode') state.monthCal = null;
  persist();
  if (k === 'lang' || k === 'calMode' || k === 'hijriOffset' || k === 'digits') { setLang(S().lang); renderSheet(); }
  render();
}

// ——— Accueil (premier lancement) ———
function sheetWelcome() {
  return `<div class="welcome"><span class="logo big">T</span><h2>${t('welcome')}</h2><p>${t('welcomeText')}</p>
    <div class="seg center"><button data-act="wlang" data-l="fr" class="${S().lang === 'fr' ? 'on' : ''}">Français</button><button data-act="wlang" data-l="ar" class="${S().lang === 'ar' ? 'on' : ''}">العربية</button></div>
    <button class="btn primary wide" data-act="wstart">${t('start_')}</button></div>`;
}

// ——— Notifications programmées ———
async function rescheduleNotifs() {
  if (!P.native) return;
  const s = S(), items = [];
  for (const x of state.data.tasks) {
    if (x.done) continue;
    if (x.remindAt) items.push({ ref: 'r:' + x.id, at: x.remindAt, title: (x.isReminder ? '' : t('notifTask') + ' · ') + x.title, body: x.assignee || '', extra: { kind: 'task', id: x.id } });
    else if (s.taskDueReminder && x.due) items.push({ ref: 'd:' + x.id, at: x.due + 9 * 3600000, title: `${t('due')} · ${x.title}`, body: x.assignee || '', extra: { kind: 'task', id: x.id } });
    if (x.plannedStart) items.push({ ref: 'p:' + x.id, at: x.plannedStart, title: `${t('notifPlanned')} · ${x.title}`, extra: { kind: 'task', id: x.id } });
  }
  if (s.contextLead > 0) {
    const from = Date.now(), to = from + 7 * DAY;
    const device = state.calPerm ? await P.listDeviceEvents(from, to) : [];
    const evs = [...device.filter((e) => !s.hiddenCals.includes(e.calendarId)), ...state.data.localEvents.filter((e) => e.start > from && e.start < to)];
    for (const e of evs) {
      if (e.allDay) continue;
      const ctx = buildContext({ ...e, participants: state.data.eventMeta[e.key]?.participants || [] }, state.data);
      items.push({
        ref: 'e:' + e.key, at: e.start - s.contextLead * MIN, title: `${t('notifEvent', s.contextLead)} · ${e.title}`,
        body: t('notifCtx', ctx.related.length, ctx.openTasks.length), extra: { kind: 'event', key: e.key, start: e.start },
      });
    }
  }
  await P.scheduleAll(items);
}

// ——— Actions ———
const actions = {
  view: (b) => { state.view = b.dataset.v; if (state.view === 'agenda') state.cursor = startOfDay(new Date()); render(); window.scrollTo(0, 0); },
  settings: () => { openSheet({ kind: 'settings' }); P.appVersion().then((v) => { const l = $('#verLbl'); if (l) l.textContent = `${t('version')} ${v}`; }); },
  close: () => { const wasNote = state.sheet?.kind === 'note'; closeSheet(); if (wasNote) render(); },
  connect: async () => {
    state.calPerm = await P.calendarPermission(true);
    if (state.calPerm) { state.calendars = await P.listCalendars(); if (!S().writeCal) { const w = state.calendars.find((c) => c.writable); S().writeCal = w ? w.id : 'local'; persist(); } }
    else toast(t('calDenied'));
    invalidate(); if (state.sheet) renderSheet(); render();
  },
  review: () => openSheet({ kind: 'review' }),
  rv: (b) => {
    const x = state.data.tasks.find((k) => k.id === b.dataset.id); if (!x) return;
    const op = b.dataset.op, tomorrow = addDays(startOfDay(new Date()), 1).getTime();
    if (op === 'done') Object.assign(x, { done: true, doneAt: Date.now() });
    if (op === 'tomorrow') { x.due = tomorrow; x.plannedStart = null; if (x.remindAt) x.remindAt = tomorrow + 9 * 3600000; }
    if (op === 'nodate') Object.assign(x, { due: null, plannedStart: null, remindAt: null });
    if (op === 'del') state.data.tasks = state.data.tasks.filter((k) => k !== x);
    persist(); renderSheet(); render();
  },
  plan: (b) => { const x = state.data.tasks.find((k) => k.id === b.dataset.id); if (x) { x.plannedStart = +b.dataset.at; persist(); render(); } },
  toggle: (b) => { const x = state.data.tasks.find((k) => k.id === b.dataset.id); if (x) { x.done = !x.done; x.doneAt = x.done ? Date.now() : null; persist(); if (state.sheet) renderSheet(); render(); } },
  task: (b) => openTaskEditor(b.dataset.id),
  event: (b) => { const e = state.events.find((x) => x.key === b.dataset.key); if (e) openSheet({ kind: 'event', ev: e }); },
  note: (b) => { const n = state.data.notes.find((x) => x.id === b.dataset.id); if (n) openSheet({ kind: 'note', note: JSON.parse(JSON.stringify(n)) }); },
  nav: (b) => {
    const d = +b.dataset.d;
    if (!d) { state.cursor = startOfDay(new Date()); state.selDay = state.cursor; }
    else if (state.agendaMode === 'week') state.cursor = addDays(state.cursor, 7 * d);
    else if (monthIsHijri()) { const h = toHijri(state.cursor, S().hijriOffset); state.cursor = addDays(fromHijri(h.y, h.m, 1, S().hijriOffset), d > 0 ? hijriMonthLength(h.y, h.m, S().hijriOffset) : -2); }
    else state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + d, 1);
    render();
  },
  amode: (b) => { state.agendaMode = b.dataset.m; render(); },
  mcal: () => { state.monthCal = monthIsHijri() ? 'greg' : 'hijri'; render(); },
  selday: (b) => { state.selDay = new Date(+b.dataset.t); render(); },
  tfilter: (b) => { state.taskFilter = b.dataset.f; render(); },
  newtask: () => openSheet({ kind: 'edit', draft: { type: 'task', title: '', date: '', durationMin: 30, priority: 'normal', assignee: '' } }),
  newnote: () => newNote(false),
  newmeeting: () => newNote(true),
  etype: (b) => {
    const d = readEditForm(); d.type = b.dataset.t;
    if (d.type === 'note' && !d.body) { d.body = d.title; d.title = ''; }
    if (d.type !== 'note' && !d.title && d.body) { d.title = firstLine(d.body); }
    if ((d.type === 'event' || d.type === 'reminder') && !d.date) d.date = ymd(new Date());
    if (d.type === 'reminder' && !d.time) d.time = '09:00';
    if (d.type === 'task' && !d.durationMin) d.durationMin = 30;
    renderSheet();
  },
  hijtoggle: () => { readEditForm(); state.sheet.hijriOpen = !state.sheet.hijriOpen; renderSheet(); },
  edel: () => deleteFromEdit(),
  evnote: () => { const ev = state.sheet.ev; newNote(true, ev); },
  evics: () => { const e = state.sheet.ev; P.shareFile(`${(e.title || 'rdv').slice(0, 40)}.ics`, buildICS(e, { lang: S().lang, hijriOffset: S().hijriOffset }), 'text/calendar', t('shareIcs')); },
  evedit: () => openEventEditor(state.sheet.ev),
  decadd: () => { syncNoteFromDom(); state.sheet.note.meeting.decisions.push(''); renderSheet(); $$('[data-dec]').pop()?.focus(); },
  decdel: (b) => { syncNoteFromDom(); state.sheet.note.meeting.decisions.splice(+b.dataset.i, 1); renderSheet(); },
  actadd: () => { syncNoteFromDom(); state.sheet.note.meeting.actions.push({ id: uid('a'), text: '', who: '', due: null }); renderSheet(); $$('[data-act-text]').pop()?.focus(); },
  actdel: (b) => { syncNoteFromDom(); state.sheet.note.meeting.actions.splice(+b.dataset.i, 1); renderSheet(); },
  actask: (b) => {
    syncNoteFromDom();
    const n = state.sheet.note, a = n.meeting.actions[+b.dataset.i];
    if (!a.text.trim()) return;
    const x = { id: uid('t'), title: a.text.trim(), assignee: a.who || '', due: a.due || null, durationMin: 30, priority: 'normal', done: false, created: Date.now(), noteId: n.id, eventKey: n.eventKey || null };
    state.data.tasks.push(x); a.taskId = x.id;
    saveNoteFromSheet(false); renderSheet(); toast(t('taskCreated'));
  },
  notesave: () => saveNoteFromSheet(true),
  notedel: () => {
    if (!confirm(t('confirmDelete'))) return;
    const id = state.sheet.note.id;
    state.data.notes = state.data.notes.filter((x) => x.id !== id);
    state.sheet = null; renderSheet(); persist(); render(); toast(t('deleted'));
  },
  noteshare: () => {
    syncNoteFromDom();
    $('#shareMenu')?.remove();
    const m = document.createElement('div');
    m.id = 'shareMenu'; m.className = 'menu';
    m.innerHTML = `<button data-act="nsh" data-f="text">${t('shareText')}</button><button data-act="nsh" data-f="pdf">${t('sharePdf')}</button><button data-act="nsh" data-f="trame">${t('shareTrame')}</button>`;
    $('#sheet .panel').appendChild(m);
  },
  nsh: async (b) => {
    $('#shareMenu')?.remove();
    const n = state.sheet.note, name = (n.title || 'note').slice(0, 40);
    try {
      if (b.dataset.f === 'text') { const r = await P.shareText(n.title, noteToText(n, S())); if (r === 'copied') toast(t('copied')); }
      if (b.dataset.f === 'pdf') await P.shareFile(`${name}.pdf`, await noteToPdf(n, S()), 'application/pdf', n.title);
      if (b.dataset.f === 'trame') await P.shareFile(`${name}.trame`, makeShare('note', n), 'application/json', n.title);
    } catch (e) { if (!/cancel/i.test(String(e))) toast(String(e.message || e)); }
  },
  notifperm: async () => { await P.notifPermission(true); rescheduleNotifs(); },
  exact: () => P.openExactAlarmSettings(),
  backup: async () => {
    const pwd = $('#bkPwd')?.value || '';
    const txt = await makeBackup(state.data, pwd);
    await P.shareFile(`Trame-sauvegarde-${ymd(new Date())}.json`, txt, 'application/json', t('exportBackup'));
  },
  import: async () => {
    const txt = await P.pickTextFile(); if (!txt) return;
    try {
      const obj = JSON.parse(txt);
      if (obj.kind === 'share') {
        const { type, item } = readShare(txt);
        const copy = { ...item, id: uid(type === 'task' ? 't' : 'n'), updated: Date.now() };
        (type === 'task' ? state.data.tasks : state.data.notes).push(copy);
        persist(); render(); toast(t('imported')); return;
      }
      const pwd = isEncrypted(txt) ? prompt(t('backupPwdAsk')) || '' : '';
      const data = await readBackup(txt, pwd);
      if (!confirm(t('restoreConfirm'))) return;
      state.data = normalizeData(data); invalidate(); persist(); closeSheet(); render(); toast(t('restored'));
    } catch (e) { toast(e.message === 'password' ? t('badPwd') : t('badFile')); }
  },
  update: async () => {
    try {
      const u = await P.checkUpdate(S().updateUrl);
      if (u.available) { if (confirm(t('updateAvail', u.latest) + (u.notes ? '\n\n' + u.notes : ''))) P.openUrl(u.url); }
      else toast(t('upToDate'));
    } catch { toast(t('updateFail')); }
  },
  wlang: (b) => { S().lang = b.dataset.l; setLang(S().lang); persist(); render(); renderSheet(); },
  wstart: async () => {
    S().onboarded = true; persist(); closeSheet();
    if (P.native) { await actions.connect(); await P.notifPermission(true); rescheduleNotifs(); }
    render();
  },
};

function normalizeData(d) {
  const out = { format: 1, tasks: [], notes: [], localEvents: [], eventMeta: {}, ...(d || {}) };
  out.settings = { ...DEFAULT_SETTINGS, ...(d?.settings || {}) };
  return out;
}

// ——— Délégation d'événements ———
function bind() {
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) { if (!ev.target.closest('#shareMenu')) $('#shareMenu')?.remove(); return; }
    const fn = actions[b.dataset.act];
    if (fn) { ev.preventDefault(); fn(b); }
  });
  document.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (ev.target.id === 'capForm') {
      const v = $('#capIn').value.trim(); if (!v) return;
      const r = parseQuick(v, new Date(), { hijriOffset: S().hijriOffset });
      $('#capIn').value = '';
      openSheet({ kind: 'edit', draft: draftFromParse(r) });
    }
    if (ev.target.id === 'editForm') saveEdit();
  });
  document.addEventListener('input', (ev) => {
    if (ev.target.id === 'q') { state.query = ev.target.value; clearTimeout(bind.qt); bind.qt = setTimeout(render, 180); }
  });
  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.closest('#editForm')) {
      if (el.dataset.h) { // sélecteur hégirien → date grégorienne
        const f = $('#editForm'); const g = (k) => +f.querySelector(`[data-h="${k}"]`).value;
        const d = fromHijri(g('y'), g('m'), g('d'), S().hijriOffset) || fromHijri(g('y'), g('m'), 29, S().hijriOffset);
        if (d) f.elements.date.value = ymd(d);
      }
      updateEditDerived();
    }
    if (el.dataset.set) applySetting(el);
    if (el.dataset.cal) {
      const h = new Set(S().hiddenCals);
      el.checked ? h.delete(el.dataset.cal) : h.add(el.dataset.cal);
      S().hiddenCals = [...h]; invalidate(); persist(); render();
    }
  });
}

// ——— Démarrage ———
async function init() {
  state.data = normalizeData(await P.loadData());
  setLang(S().lang);
  bind();
  if (P.native) {
    state.calPerm = await P.calendarPermission(false);
    if (state.calPerm) state.calendars = await P.listCalendars();
    P.onNotificationOpen(async (x) => {
      if (x.kind === 'event') { state.view = 'today'; await render(); openEventByKey(x.key, x.start); }
      if (x.kind === 'task') openTaskEditor(x.id);
    });
    P.App.addListener('resume', async () => { invalidate(); await render(); rescheduleNotifs(); });
    P.App.addListener('backButton', () => {
      if ($('#shareMenu')) $('#shareMenu').remove();
      else if (state.sheet) { closeSheet(); render(); }
      else if (state.view !== 'today') { state.view = 'today'; render(); }
      else P.App.exitApp();
    });
  }
  await render();
  if (!S().onboarded) openSheet({ kind: 'welcome' });
  rescheduleNotifs();
}

init();
