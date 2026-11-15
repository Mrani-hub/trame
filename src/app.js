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
  waNumber, findConflicts, conflictKeys, freeSlots, suggestPlacements, searchAll, buildContext, buildICS, seriesSig, noteText,
} from './core/logic.js';
import { makeBackup, readBackup, isEncrypted, makeShare, readShare } from './core/backup.js';
import { noteToText, noteToPdf } from './export.js';
import { occurrences, nextAfter, toNativeRule, ruleLabel, presets, presetIdOf, generationHorizon, normalizeRule } from './core/recurrence.js';

// ——— État ———
const DEFAULT_SETTINGS = {
  lang: 'fr', theme: 'auto', calMode: 'both', hijriOffset: 0, digits: 'latin', writeCal: '', hiddenCals: [],
  contextLead: 15, defaultDur: 60, dayStart: 8, dayEnd: 18, taskDueReminder: true, onboarded: false,
  updateUrl: 'https://raw.githubusercontent.com/Mrani-hub/trame/main/version.json', voiceLang: 'auto', lastUpdateCheck: 0, birthdays: 'remind',
};
const state = {
  data: { format: 1, tasks: [], notes: [], localEvents: [], eventMeta: {}, contacts: {}, series: {}, birthdays: [], settings: { ...DEFAULT_SETTINGS } },
  view: 'today', cursor: startOfDay(new Date()), agendaMode: 'week', monthCal: null, selDay: startOfDay(new Date()),
  taskFilter: 'open', query: '', update: null, appVersion: '', listening: false, events: [], range: null, calendars: [], calPerm: false, sheet: null,
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
  gear: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', bell: '<path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 004 0"/>',
  warn: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17v.5"/>', share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
  left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>', clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21M8.5 21h7"/>',
  wa: '<path d="M4 20l1.2-3.6A8 8 0 1112 20a8 8 0 01-3.9-1z"/><path d="M9 9.2c.3 2.4 2.2 4.6 5 5.4l1.2-1.2-1.6-1-.8.6c-.9-.4-1.8-1.3-2.2-2.2l.6-.8-1-1.6z"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>',
  repeat: '<path d="M17 3l3 3-3 3"/><path d="M4 11V9a3 3 0 013-3h13M7 21l-3-3 3-3"/><path d="M20 13v2a3 3 0 01-3 3H4"/>',
  contacts: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="10" r="2.6"/><path d="M8 16.5a4 4 0 018 0"/>',
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
  saveTimer = setTimeout(() => { rescheduleNotifs(); pushWidget(); }, 1200);
}

// ——— Rendez-vous (agendas du téléphone + rendez-vous locaux) ———
async function ensureRange(from, to, force = false) {
  const today = startOfDay(new Date());
  const f = Math.min(from, addDays(today, -14).getTime());
  const tt = Math.max(to, addDays(today, 21).getTime());
  if (!force && state.range && state.range[0] <= from && state.range[1] >= to) return;
  let device = state.calPerm ? await P.listDeviceEvents(f, tt) : [];
  if (device === null) device = state.events.filter((e) => e.source === 'device'); // lecture échouée : on garde l'affichage précédent
  const hidden = new Set(S().hiddenCals);
  const locals = expandLocal(f, tt);
  const bdCals = new Set(state.calendars.filter((c) => c.birthday).map((c) => c.id));
  const yearly = state.calPerm ? await P.yearlyAllDayIds(f, tt) : new Set();
  const dev = device.filter((e) => !hidden.has(e.calendarId))
    .map((e) => (bdCals.has(e.calendarId) || yearly.has(e.id) ? { ...e, birthday: true, allDay: true } : e));
  const bdShown = S().birthdays !== 'hide';
  state.events = [...dev.filter((e) => bdShown || !e.birthday), ...(bdShown ? contactBirthdayEvents(f, tt, dev.filter((e) => e.birthday)) : []), ...locals]
    .map((e) => { const m = metaOf(e); return { ...e, color: m.color || e.color, ownColor: m.color || (e.source === 'local' ? e.color : '') || '', participants: m.participants || [], rule: e.repeat || m.rule || state.data.series[m.series]?.rule || null, seriesId: m.series || null, period: !!(e.period || m.period), periodStart: m.start || null }; })
    .sort((a, b) => a.start - b.start);
  state.range = [f, tt];
}
/** Méta-données Trame d'un rendez-vous (participants, règle, série), par occurrence puis par série. */
function metaOf(e) {
  const M = state.data.eventMeta;
  return M[e.key] || M[e.source === 'local' ? `loc:${e.id}` : `cal:${e.id}`] || {};
}
/** Anniversaires issus des contacts (sauf ceux déjà présents dans un agenda d'anniversaires). */
function contactBirthdayEvents(from, to, existing) {
  const out = [];
  const known = existing.map((e) => `${ymd(e.start)}|${norm(e.title)}`);
  const y0 = new Date(from).getFullYear(), y1 = new Date(to).getFullYear();
  for (const b of state.data.birthdays || []) {
    for (let y = y0; y <= y1; y++) {
      const d = new Date(y, b.month - 1, b.day);
      if (d.getMonth() !== b.month - 1) continue; // 29 février
      const st = d.getTime();
      if (st < from - DAY || st >= to) continue;
      if (known.some((k) => k.startsWith(ymd(st) + '|') && k.includes(norm(b.name).split(' ')[0]))) continue;
      const age = b.year ? y - b.year : null;
      out.push({ source: 'birthday', birthday: true, id: `bd:${norm(b.name)}`, key: `bd:${norm(b.name)}@${st}`, title: `🎂 ${b.name}${age && age > 0 ? ` (${age})` : ''}`,
        start: st, end: st + DAY, allDay: true, person: b.name, attendees: [], location: '' });
    }
  }
  return out;
}
/** Rendez-vous locaux (agenda Trame), occurrences répétitives développées sur [from, to[. */
function expandLocal(from, to) {
  const out = [];
  for (const e of state.data.localEvents) {
    const dur = (e.end - e.start) || 3600000;
    if (!e.repeat) { if (e.end > from && e.start < to) out.push({ ...e, source: 'local' }); continue; }
    for (const st of occurrences(e.repeat, e.start, from - dur, to, { hijriOffset: S().hijriOffset, exdates: e.exdates || [] })) {
      out.push({ ...e, source: 'local', key: `loc:${e.id}@${st}`, start: st, end: st + dur, recurring: true, seriesStart: e.start });
    }
  }
  return out;
}
/** Rendez-vous d'un jour : un rendez-vous horaire n'apparaît que le jour où il commence ;
 *  un rendez-vous « toute la journée » sur plusieurs jours apparaît chaque jour couvert. */
const eventsOn = (day) => {
  const a = startOfDay(day).getTime(), b = a + DAY;
  return state.events.filter((e) => (e.allDay ? e.start < b && e.end > a : e.start >= a && e.start < b));
};
const invalidate = () => { state.range = null; };

// ——— Rendu principal ———
async function render() {
  setLang(S().lang);
  document.documentElement.lang = S().lang;
  document.documentElement.dir = S().lang === 'ar' ? 'rtl' : 'ltr';
  applyTheme();
  const range = viewRange();
  await ensureRange(range[0], range[1]);
  const views = { today: viewToday, agenda: viewAgenda, tasks: viewTasks, notes: viewNotes, search: viewSearch };
  $('#app').innerHTML = `
    <header class="top">
      <div class="brand"><span class="logo">T</span><div><b>Trame</b><small>${esc(fmtDate(Date.now(), { weekday: true }))}</small></div></div>
      <div class="top-actions">
        <button class="iconbtn" data-act="theme" aria-label="${t(isDark() ? 'themeLight' : 'themeDark')}">${icon(isDark() ? 'sun' : 'moon')}</button>
        <button class="iconbtn" data-act="settings" aria-label="${t('settings')}">${icon('gear')}</button>
      </div>
    </header>
    <form class="capture" id="capForm" autocomplete="off">
      <input id="capIn" enterkeyhint="send" placeholder="${esc(t('capturePh'))}" aria-label="${esc(t('capturePh'))}">
      ${P.voiceSupported() ? `<button type="button" class="micbtn ${state.listening ? 'on' : ''}" data-act="voice" aria-label="${esc(t('voice'))}">${icon('mic')}</button>` : ''}
      <button type="button" class="capbtn" data-act="add" aria-label="${esc(t('addNew'))}">${icon('plus')}</button>
    </form>
    <main id="main">${views[state.view]()}</main>
    <nav class="tabs">${['today', 'agenda', 'tasks', 'notes', 'search'].map((v) => `
      <button data-act="view" data-v="${v}" class="${state.view === v ? 'on' : ''}">${icon(v)}<span>${t(v)}</span></button>`).join('')}
    </nav>`;
  if (state.view === 'search') { const i = $('#q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
}

const isDark = () => { const th = S().theme || 'auto'; return th === 'dark' || (th === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches); };
function applyTheme() {
  const th = S().theme || 'auto';
  if (th === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = th;
  const dark = th === 'dark' || (th === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0f151c' : '#f4f6f9');
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
    ${state.update?.available ? `<div class="banner upd"><div><b>${t('updateAvailShort', D(state.update.latest))}</b>${state.update.notes ? `<small>${esc(state.update.notes)}</small>` : ''}</div><button class="btn primary" data-act="install">${icon('download')} ${t('install')}</button></div>` : ''}
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
    <div class="when">${e.allDay ? t('allDayShort') : `${D(fmtTime(e.start))}<small>${D(fmtTime(e.end))}${sameDay(e.start, e.end) ? '' : ` <sup>+${Math.round((startOfDay(e.end) - startOfDay(e.start)) / DAY)}</sup>`}</small>`}</div>
    <div class="what"><b>${e.birthday && !/^🎂/.test(e.title || '') ? '🎂 ' : ''}${esc(e.title || t('untitled'))}${!e.period && (e.recurring || e.rule || e.seriesId) ? ` <span class="rep">${icon('repeat')}</span>` : ''}</b>${(() => { const p = e.period && periodInfo(e); const sub = [p ? D(t('dayOf', p.i, p.n)) : '', e.location || ''].filter(Boolean).join(' · '); return sub ? `<small>${esc(sub)}</small>` : ''; })()}</div>
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
    <button class="what" data-act="task" data-id="${x.id}"><b>${esc(x.title)}${x.repeat ? ` <span class="rep">${icon('repeat')}</span>` : ''}</b>${meta ? `<small>${meta}</small>` : ''}</button>
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
  <div class="seg compact">
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
  const calColor = new Map(state.calendars.map((c) => [c.id, c.color]));
  const MAX = 4; // nombre de libellés visibles par jour, comme l'agenda Android
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    const h = toHijri(d, off);
    const inMonth = hij ? h.m === ref.m && h.y === ref.y : d.getMonth() === state.cursor.getMonth();
    if (i >= 35 && !inMonth && i % 7 === 0) break;
    const evs = eventsOn(d).sort((a, b) => (b.allDay - a.allDay) || a.start - b.start);
    const tks = state.data.tasks.filter((x) => !x.done && [x.due, x.remindAt, x.plannedStart].some((v) => v && sameDay(v, d)));
    const chips = [
      ...evs.map((e) => {
        const col = e.birthday ? '#33B679' : normColor(e.color || calColor.get(e.calendarId)) || (e.source === 'local' ? '#0F766E' : '#1F4E79');
        const title = e.birthday ? e.title.replace(/^🎂\s*/, '') : e.title || t('untitled');
        return `<span class="mchip" dir="auto" style="--chip:${col};--chipfg:${inkFor(col)}">${e.birthday ? '<i>🎂</i>' : ''}${esc(title)}</span>`;
      }),
      ...tks.map((x) => `<span dir="auto" class="mchip task ${x.priority === 'high' ? 'high' : ''}">${x.isReminder ? '⏰' : '○'} ${esc(x.title)}</span>`),
    ];
    const more = chips.length > MAX ? chips.length - (MAX - 1) : 0;
    const shown = more ? chips.slice(0, MAX - 1) : chips;
    const big = hij ? h.d : d.getDate(), small = hij ? d.getDate() : h.d;
    cells.push(`<button class="mcell ${inMonth ? '' : 'out'} ${sameDay(d, new Date()) ? 'today' : ''} ${sameDay(d, state.selDay) ? 'sel' : ''}" data-act="selday" data-t="${d.getTime()}">
      <span class="mnum"><b>${D(big)}</b>${S().calMode !== 'greg' || hij ? `<small>${D(small)}</small>` : ''}</span>
      ${shown.join('')}${more ? `<span class="mmore">+${D(more)}</span>` : ''}</button>`);
  }
  const wd = Array.from({ length: 7 }, (_, i) => `<span>${esc(weekdayShort(addDays(startOfWeek(new Date()), i), S().lang))}</span>`).join('');
  return `<div class="month full"><div class="wd">${wd}</div><div class="mgrid" style="--rows:${cells.length / 7}">${cells.join('')}</div></div>
    <p class="hint center">${t('dblTapHint')}</p>${dayBlock(state.selDay)}`;
}
/** Couleurs proposées (palette de Google Agenda) ; '' = couleur de l'agenda d'origine. */
const COLORS = [['', 'colAgenda'], ['#D50000', 'colTomato'], ['#E67C73', 'colFlamingo'], ['#F4511E', 'colTangerine'], ['#F6BF26', 'colBanana'], ['#33B679', 'colSage'],
  ['#0B8043', 'colBasil'], ['#039BE5', 'colPeacock'], ['#3F51B5', 'colBlueberry'], ['#7986CB', 'colLavender'], ['#8E24AA', 'colGrape'], ['#616161', 'colGraphite']];
/** Couleur CSS valide à partir de la couleur d'un agenda (#RRGGBB, #AARRGGBB ou entier Android). */
function normColor(c) {
  if (c == null || c === '') return null;
  if (typeof c === 'number') return '#' + ((c >>> 0) & 0xffffff).toString(16).padStart(6, '0');
  const m = String(c).trim().match(/^#?([0-9a-f]{8}|[0-9a-f]{6})$/i);
  if (!m) return String(c);
  return '#' + (m[1].length === 8 ? m[1].slice(2) : m[1]);
}
/** Texte blanc ou foncé selon la clarté du fond. */
function inkFor(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#fff';
  const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.66 ? '#1b2430' : '#fff';
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
  const renderers = { editscope: sheetEditScope, delrep: sheetDelRep, wa: sheetWhatsApp, edit: sheetEdit, event: sheetEvent, note: sheetNote, settings: sheetSettings, review: sheetReview, welcome: sheetWelcome };
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
  if (r.periodEnd) { d.type = 'event'; d.multi = true; d.endDate = ymd(r.periodEnd); d.workdays = !!r.workdays; }
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
    ${d.heard ? `<p class="heard">${icon('mic')} « ${esc(d.heard)} »</p>` : ''}
    ${d.fromShare ? `<p class="heard">📒 ${esc(t('fromShare'))}</p>` : ''}
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
      <label class="check"><input type="checkbox" name="multi" ${d.multi ? 'checked' : ''}> ${t('multiDay')}</label>
      ${d.multi ? `<div class="period-box">
        <label>${t('periodEnd')}<input type="date" name="endDate" value="${d.endDate || d.date}" min="${d.date}"></label>
        <label class="check"><input type="checkbox" name="workdays" ${d.workdays ? 'checked' : ''}> ${t('workdaysOnly')}</label>
        <p class="replabel" id="periodLbl"></p>
      </div>` : ''}
      <div class="two times ${d.allDay ? 'hidden' : ''}">
        <label>${t('start')}<input type="time" name="time" value="${d.time}"></label>
        <label>${t('end')}<input type="time" name="endTime" value="${d.endTime}"></label>
      </div>
      <div id="conflictBox"></div>
      <label>${t('location')}<input name="location" value="${esc(d.location)}"></label>
      <div class="colors"><small>${t('color')}</small><div class="swatches">${COLORS.map(([c, n]) => `<button type="button" class="swatch ${(d.color || '') === c ? 'on' : ''}" data-act="pickcolor" data-c="${c}" title="${esc(t(n))}" style="--sw:${c || 'transparent'}">${c ? '' : 'A'}</button>`).join('')}</div></div>
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
    ${d.type !== 'note' && !(d.type === 'event' && d.multi) ? repeatBlock(d) : ''}
    ${d.warnings?.includes('defaultTime') ? `<p class="warnline">${icon('warn')} ${t('defaultTimeWarn')}</p>` : ''}
    <div class="actions">
      ${d.existing ? `<button type="button" class="btn danger ghost" data-act="edel">${t('del')}</button>` : ''}
      ${d.existing?.kind === 'task' ? `<button type="button" class="btn wa" data-act="taskwa">${icon('wa')} WhatsApp</button>` : ''}
      <button type="button" class="btn ghost" data-act="close">${t('cancel')}</button>
      <button class="btn primary">${t('save')}</button>
    </div>
  </form>`;
}
/** Règle d'une période : chaque jour (ou chaque jour ouvrable) jusqu'à la date de fin ; null = un seul bloc « toute la journée ». */
function periodRule(d) {
  if (!d.multi || !d.endDate || d.endDate < d.date) return null;
  const until = parseYmd(d.endDate).getTime();
  if (d.allDay && !d.workdays) return null;
  return d.workdays ? { freq: 'weekly', byDay: [1, 2, 3, 4, 5], until } : { freq: 'daily', until };
}
/** Position dans une période : « jour 3 / 10 ». */
function periodInfo(e) {
  if (!e.period || !e.rule) return null;
  const st = e.seriesStart || e.periodStart || e.start;
  const all = occurrences(e.rule, st, st, Infinity, { max: 2000, hijriOffset: S().hijriOffset });
  if (!all.length) return null;
  const i = all.findIndex((x) => sameDay(x, e.start));
  return { i: i + 1, n: all.length, from: all[0], to: all[all.length - 1] };
}
const refStart = (d) => (d.date ? combine(d.date, d.time || '09:00') : startOfDay(new Date()).getTime() + 9 * 3600000);
function repeatBlock(d) {
  const ref = refStart(d), L = S().lang;
  const pid = d.repPreset || presetIdOf(d.repeat, ref);
  const r = normalizeRule(d.repeat || { freq: 'weekly' }, ref);
  const opt = (v, cur, label) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(label)}</option>`;
  const dows = t('dowShort');
  const wk = Math.ceil(new Date(ref).getDate() / 7);
  const endMode = r.count ? 'count' : r.until ? 'until' : 'never';
  return `<div class="repeat-box">
    <label>${t('repeat')}<select name="repeatPreset">${presets(ref, L, S().hijriOffset).map((p) => opt(p.id, pid, D(p.label))).join('')}${opt('custom', pid, t('repCustom'))}</select></label>
    ${pid === 'custom' ? `<div class="custom-rep">
      <div class="two"><label>${t('repEvery')}<input type="number" name="repInterval" min="1" max="99" value="${r.interval}" inputmode="numeric"></label>
      <label>&nbsp;<select name="repFreq">${['daily', 'weekly', 'monthly', 'yearly', 'hmonthly', 'hyearly'].map((f) => opt(f, r.freq, t('freq_' + f))).join('')}</select></label></div>
      ${r.freq === 'weekly' ? `<div class="dows">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<label class="dow"><input type="checkbox" name="repDay" value="${n}" ${r.byDay.includes(n) ? 'checked' : ''}><span>${dows[n - 1]}</span></label>`).join('')}</div>` : ''}
      ${r.freq === 'monthly' ? `<select name="repMonthMode">${opt('day', r.monthMode, D(ruleLabel({ freq: 'monthly' }, ref, L)))}${wk <= 4 ? opt('nth', r.monthMode, ruleLabel({ freq: 'monthly', monthMode: 'nth' }, ref, L)) : ''}${opt('last', r.monthMode, ruleLabel({ freq: 'monthly', monthMode: 'last' }, ref, L))}</select>` : ''}
      <div class="two"><label>${t('repEnds')}<select name="repEnd">${opt('never', endMode, t('repNever'))}${opt('until', endMode, t('repUntil'))}${opt('count', endMode, t('repCount'))}</select></label>
      <label>&nbsp;${endMode === 'until' ? `<input type="date" name="repUntil" value="${r.until ? ymd(r.until) : ymd(addDays(new Date(ref), 90))}">` : endMode === 'count' ? `<input type="number" name="repCount" min="1" max="999" value="${r.count || 10}" inputmode="numeric">` : ''}</label></div>
    </div>` : ''}
    ${d.repeat ? `<p class="replabel" id="repLbl">${esc(D(ruleLabel(d.repeat, ref, L, S().hijriOffset)))}</p>` : ''}
  </div>`;
}
function readEditForm() {
  const f = $('#editForm'); if (!f) return;
  const d = state.sheet.draft;
  const v = (n) => f.elements[n]?.value ?? undefined;
  for (const k of ['title', 'body', 'date', 'time', 'endTime', 'location', 'calendarId', 'priority', 'assignee']) if (f.elements[k]) d[k] = v(k).trim();
  if (f.elements.durationMin) d.durationMin = +v('durationMin');
  if (f.elements.allDay) d.allDay = f.elements.allDay.checked;
  if (f.elements.multi) d.multi = f.elements.multi.checked;
  if (f.elements.endDate) d.endDate = v('endDate');
  if (f.elements.workdays) d.workdays = f.elements.workdays.checked;
  if (f.elements.participants) d.participants = v('participants').split(/[,،]/).map((s) => s.trim()).filter(Boolean);
  if (f.elements.remindDate) d.remindAt = v('remindDate') ? combine(v('remindDate'), v('remindTime') || '09:00') : null;
  if (f.elements.repeatPreset) {
    const ref = refStart(d), pid = v('repeatPreset');
    d.repPreset = pid;
    if (pid !== 'custom') d.repeat = presets(ref).find((p) => p.id === pid)?.rule || null;
    else if (!f.elements.repFreq) d.repeat = d.repeat || { freq: 'weekly' };
    else {
      const freq = v('repFreq'), end = f.elements.repEnd.value;
      d.repeat = {
        freq, interval: Math.max(1, +v('repInterval') || 1),
        byDay: freq === 'weekly' ? $$('[name=repDay]:checked', f).map((i) => +i.value) : undefined,
        monthMode: freq === 'monthly' ? (v('repMonthMode') || 'day') : 'day',
        until: end === 'until' && v('repUntil') ? parseYmd(v('repUntil')).getTime() : null,
        count: end === 'count' ? Math.max(1, +v('repCount') || 10) : null,
      };
    }
  }
  return d;
}
const combine = (date, time) => { const x = parseYmd(date); const [h, m] = (time || '00:00').split(':').map(Number); x.setHours(h, m, 0, 0); return x.getTime(); };

async function updateEditDerived() {
  const f = $('#editForm'); if (!f) return;
  const d = readEditForm();
  const lbl = $('#hijriLbl');
  if (lbl) lbl.textContent = d.date ? D(dateLabel(parseYmd(d.date), { ...S(), calMode: S().calMode === 'greg' ? 'both' : S().calMode }, { year: true })) : t('noDue');
  const times = $('.times', f); if (times) times.classList.toggle('hidden', !!d.allDay);
  const pl = $('#periodLbl');
  if (pl && d.date && d.endDate) {
    const r = periodRule(d);
    const n = r ? occurrences(r, combine(d.date, d.time || '09:00'), 0, Infinity, { max: 2000 }).length
      : Math.round((parseYmd(d.endDate) - parseYmd(d.date)) / DAY) + 1;
    const g = (x) => dateLabel(parseYmd(x), { ...S(), calMode: 'greg' }, { weekday: false });
    pl.textContent = D(t('periodSummary', Math.max(0, n), g(d.date), g(d.endDate), d.workdays));
  }
  const rl = $('#repLbl'); if (rl && d.repeat) rl.textContent = D(ruleLabel(d.repeat, refStart(d), S().lang, S().hijriOffset));
  const box = $('#conflictBox');
  if (box && d.type === 'event' && d.date && d.time && !d.allDay) {
    const start = combine(d.date, d.time);
    let end = d.endTime ? combine(d.date, d.endTime) : start + S().defaultDur * MIN;
    if (end <= start) end = start + S().defaultDur * MIN;
    await ensureRange(startOfDay(start).getTime(), endOfDay(start).getTime());
    const c = findConflicts({ start, end }, state.events, d.existing?.key);
    box.innerHTML = c.length ? `<div class="conflict">${icon('warn')}<div><b>${t('conflictWarn')}</b>${c.map((e) => `<small>${D(fmtTime(e.start))}–${D(fmtTime(e.end))} · ${esc(e.title)}</small>`).join('')}</div></div>` : '';
  } else if (box) box.innerHTML = '';
}

async function saveEdit(draft = null) {
  const d = draft || readEditForm();
  const s = S();
  if (d.type !== 'note' && !d.title) { toast(t('noTitleWarn')); return; }
  const now = Date.now();
  if (d.type === 'event') {
    if (!d.date) return;
    const start = d.allDay ? parseYmd(d.date).getTime() : combine(d.date, d.time || '09:00');
    const pRule = periodRule(d);
    const spanAllDay = d.multi && d.allDay && !d.workdays && d.endDate > d.date; // un seul bloc sur plusieurs jours
    let end = d.allDay ? addDays(parseYmd(spanAllDay ? d.endDate : d.date), 1).getTime() : d.endTime ? combine(d.date, d.endTime) : start + s.defaultDur * MIN;
    if (end <= start) end = start + s.defaultDur * MIN;
    const ev = { title: d.title, start, end, allDay: d.allDay, location: d.location };
    const rule = pRule ? normalizeRule(pRule, start) : d.multi ? null : d.repeat ? normalizeRule(d.repeat, start) : null;
    const color = d.color ?? null; // '' = couleur de l'agenda
    // Rendez-vous répétitif existant : « cette occurrence » ou « toute la série » ?
    const isRec = d.existing && (d.existing.recurring || d.existing.seriesId);
    if (isRec && !d.scope) { state.sheet = { kind: 'editscope', draft: d, back: state.sheet }; renderSheet(); return; }
    let key, metaKeys = [];
    try {
      if (isRec) {
        key = await saveRecurringEdit(d, ev, rule, color);
      } else if (d.existing?.source === 'device') {
        const native = toNativeRule(rule, start);
        await P.modifyDeviceEvent({ ...ev, id: d.existing.id }, native);
        key = `cal:${d.existing.id}`;
        if (color !== d.existing.color) await P.setEventColor(d.existing.id, color);
        if (rule && !native) metaKeys = await createGeneratedSeries(ev, rule, d.existing.calendarId, [d.existing.id]);
        else if (rule) state.data.eventMeta[key] = { ...(state.data.eventMeta[key] || {}), rule };
      } else if (d.existing?.source === 'local') {
        const base = state.data.localEvents.find((e) => e.id === d.existing.id);
        // une occurrence modifiée décale toute la série du même écart
        const delta = start - d.existing.start;
        Object.assign(base, { title: ev.title, location: ev.location, allDay: ev.allDay, start: base.start + delta, end: base.start + delta + (end - start), repeat: rule, color: color || null });
        key = `loc:${base.id}`;
      } else if (d.calendarId && d.calendarId !== 'local' && state.calPerm) {
        const native = toNativeRule(rule, start);
        if (rule && !native) { metaKeys = await createGeneratedSeries(ev, rule, d.calendarId, []); key = metaKeys[0]; }
        else {
          const id = await P.createDeviceEvent(ev, d.calendarId, s.contextLead, native); key = `cal:${id}`;
          if (color) await P.setEventColor(id, color);
          if (rule) state.data.eventMeta[key] = { rule };
        }
        if (s.writeCal !== d.calendarId) s.writeCal = d.calendarId;
      } else {
        const id = uid('ev'); key = `loc:${id}`;
        state.data.localEvents.push({ id, key, ...ev, repeat: rule, color: color || null, created: now });
      }
      if (metaKeys.length && color) for (const k of metaKeys) { await P.setEventColor(k.slice(4), color); }
    } catch (e) { console.error(e); toast(String(e.message || e)); return; }
    if (pRule) {
      const lb = state.data.localEvents.find((e) => e.key === key || `loc:${e.id}` === key);
      if (lb) lb.period = true;
      else state.data.eventMeta[key] = { ...(state.data.eventMeta[key] || {}), period: true, start, rule };
    }
    for (const k of metaKeys.length ? metaKeys : [key]) {
      if (k && !k.startsWith('loc:')) state.data.eventMeta[k] = { ...(state.data.eventMeta[k] || {}), color: color || null };
      if (d.participants?.length) state.data.eventMeta[k] = { ...(state.data.eventMeta[k] || {}), participants: d.participants };
    }
    if (d.sharedText && d.sharedText.trim() !== d.title.trim()) {
      const ev2 = state.events.find((e) => e.key === key) || { key, title: d.title, start: ev.start };
      const n = { id: uid('n'), title: d.title, body: d.sharedText, created: now, updated: now, meeting: null };
      linkNote(n, { ...ev2, key, title: d.title, start: ev.start });
      state.data.notes.push(n);
    }
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
      repeat: d.repeat ? normalizeRule(d.repeat, isRem ? combine(d.date, d.time || '09:00') : (d.date ? parseYmd(d.date).getTime() : Date.now())) : null,
    });
    if (x.repeat && !(x.due || x.remindAt)) x.due = startOfDay(new Date()).getTime();
    if (d.sharedText && !x.notes) x.notes = d.sharedText;
    x.repeatStart = x.repeat ? (x.due || x.remindAt) : null;
    if (!d.existing) state.data.tasks.push(x);
  }
  persist(); closeSheet(); toast(t('saved')); render();
}
const firstLine = (s) => (s || '').split('\n')[0].slice(0, 60);

/** Modification d'un rendez-vous répétitif selon la portée choisie (d.scope = 'this' | 'series'). Renvoie la clé méta. */
async function saveRecurringEdit(d, ev, rule, color) {
  const x = d.existing, shift = ev.start - x.start, duration = ev.end - ev.start;
  if (x.source === 'local') {
    const base = state.data.localEvents.find((e) => e.id === x.id);
    if (d.scope === 'this') {
      base.exdates = [...(base.exdates || []), x.start];
      const id = uid('ev');
      state.data.localEvents.push({ id, key: `loc:${id}`, ...ev, repeat: null, color: color || base.color || null, created: Date.now() });
      return `loc:${id}`;
    }
    Object.assign(base, { title: ev.title, location: ev.location, allDay: ev.allDay, start: base.start + shift, end: base.start + shift + duration, color: color || null,
      repeat: d.repTouched ? rule : base.repeat });
    return `loc:${base.id}`;
  }
  if (x.seriesId && state.data.series[x.seriesId]) { // série générée par Trame (hégirien, 2e jeudi…)
    const ser = state.data.series[x.seriesId];
    const ids = d.scope === 'this' ? [x.id] : ser.ids;
    for (const id of ids) await P.modifySeries(id, { title: ev.title, location: ev.location, shift, duration, allDay: ev.allDay, color, single: true });
    if (d.scope !== 'this') ser.title = ev.title;
    return `cal:${x.id}`;
  }
  if (d.scope === 'this') {
    await P.modifyOccurrence(ev, x.rawStart ?? x.start, color);
    return `cal:${x.id}@${ev.start}`;
  }
  const native = d.repTouched ? toNativeRule(rule, ev.start) : null;
  await P.modifySeries(x.id, { title: ev.title, location: ev.location, shift, duration, allDay: ev.allDay, rrule: native ? rruleString(native) : null, color });
  if (native) state.data.eventMeta[`cal:${x.id}`] = { ...(state.data.eventMeta[`cal:${x.id}`] || {}), rule };
  return `cal:${x.id}`;
}
/** Règle native → chaîne RRULE (RFC 5545). */
function rruleString(r) {
  const D = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
  const parts = [`FREQ=${r.frequency.toUpperCase()}`];
  if (r.interval > 1) parts.push(`INTERVAL=${r.interval}`);
  if (r.byWeekDay?.length) parts.push(`BYDAY=${r.byWeekDay.map((n) => D[n - 1]).join(',')}`);
  if (r.count) parts.push(`COUNT=${r.count}`);
  else if (r.end) { const u = new Date(r.end); parts.push(`UNTIL=${u.getUTCFullYear()}${String(u.getUTCMonth() + 1).padStart(2, '0')}${String(u.getUTCDate()).padStart(2, '0')}T235959Z`); }
  return parts.join(';');
}
function sheetEditScope() {
  const d = state.sheet.draft;
  return `<div class="sheet-head"><b>${t('editRepTitle')}</b><button class="iconbtn" data-act="scopeback">✕</button></div>
    <p class="meta">${esc(d.title)}</p>
    <div class="actions col">
      <button class="btn" data-act="scope" data-scope="this">${t('editThis')}</button>
      <button class="btn primary" data-act="scope" data-scope="series">${t('editSeries')}</button>
      <button class="btn ghost" data-act="scopeback">${t('cancel')}</button>
    </div>`;
}

/** Règle non exprimable dans l'agenda du téléphone (hégirien, 2e jeudi…) : occurrences créées une à une, regroupées en série. */
async function createGeneratedSeries(ev, rule, calendarId, existingIds) {
  const dur = ev.end - ev.start;
  const starts = generationHorizon(rule, ev.start, S().hijriOffset);
  const ids = [...existingIds];
  for (const st of starts) {
    if (existingIds.length && st === ev.start) continue;
    const id = await P.createDeviceEvent({ ...ev, start: st, end: st + dur }, calendarId, S().contextLead, null);
    if (id) ids.push(id);
  }
  const sid = uid('s');
  state.data.series[sid] = { rule, ids, title: ev.title, start: ev.start, calendarId };
  const keys = ids.map((id) => `cal:${id}`);
  for (const k of keys) state.data.eventMeta[k] = { ...(state.data.eventMeta[k] || {}), series: sid };
  toast(t('seriesCreated', ids.length));
  return keys;
}

/** Terminer une tâche répétitive crée la suivante (comme Google Tasks). */
function completeTask(x) {
  x.done = true; x.doneAt = Date.now();
  if (!x.repeat || x.nextId) return null;
  const base = x.remindAt || x.due;
  if (!base) return null;
  const series = x.repeatStart || base;
  const next = nextAfter(x.repeat, series, base, { hijriOffset: S().hijriOffset });
  if (!next) return null;
  const n = { ...x, id: uid('t'), done: false, doneAt: null, created: Date.now(), plannedStart: null, nextId: null, repeatStart: series,
    due: x.due ? startOfDay(next).getTime() : null, remindAt: x.remindAt ? next : null };
  x.nextId = n.id;
  state.data.tasks.push(n);
  toast(t('nextOccurrence', D(fmtDate(next, { weekday: true }))));
  return n;
}

async function deleteFromEdit() {
  const d = state.sheet.draft;
  const ev = d.existing.kind === 'event' ? state.events.find((e) => e.key === d.existing.key) : null;
  if (ev && (ev.recurring || ev.seriesId)) { openSheet({ kind: 'delrep', ev, back: state.sheet }); return; }
  if (!confirm(t('confirmDelete'))) return;
  if (d.existing.kind === 'task') state.data.tasks = state.data.tasks.filter((x) => x.id !== d.existing.id);
  else if (d.existing.source === 'device') { try { await P.deleteDeviceEvent(d.existing); } catch (e) { toast(String(e.message || e)); return; } }
  else state.data.localEvents = state.data.localEvents.filter((e) => e.id !== d.existing.id);
  invalidate(); persist(); closeSheet(); toast(t('deleted')); render();
}

function sheetDelRep() {
  const e = state.sheet.ev;
  return `<div class="sheet-head"><b>${t('delRepTitle')}</b><button class="iconbtn" data-act="close">✕</button></div>
    <p class="meta">${esc(e.title)} · ${D(fmtDate(e.start, { weekday: true }))}</p>
    <div class="actions col">
      <button class="btn" data-act="delrep" data-scope="this">${t('delThis')}</button>
      <button class="btn danger" data-act="delrep" data-scope="series">${t('delSeries')}</button>
      <button class="btn ghost" data-act="close">${t('cancel')}</button>
    </div>`;
}
async function deleteRecurring(e, scope) {
  try {
    if (e.source === 'local') {
      const base = state.data.localEvents.find((x) => x.id === e.id);
      if (scope === 'series' || !base) state.data.localEvents = state.data.localEvents.filter((x) => x.id !== e.id);
      else base.exdates = [...(base.exdates || []), e.start];
    } else if (e.seriesId && state.data.series[e.seriesId]) {
      const ser = state.data.series[e.seriesId];
      if (scope === 'series') {
        await P.deleteDeviceEventsById(ser.ids);
        delete state.data.series[e.seriesId];
      } else {
        await P.deleteDeviceEventsById([e.id]);
        ser.ids = ser.ids.filter((i) => i !== e.id);
      }
    } else await P.deleteDeviceEvent(e, scope);
  } catch (err) { toast(String(err.message || err)); return; }
  invalidate(); persist(); closeSheet(); toast(t('deleted')); render();
}

function openTaskEditor(id) {
  const x = state.data.tasks.find((k) => k.id === id); if (!x) return;
  openSheet({ kind: 'edit', draft: {
    type: x.isReminder ? 'reminder' : 'task', title: x.title, date: x.isReminder ? (x.remindAt ? ymd(x.remindAt) : '') : x.due ? ymd(x.due) : '',
    time: x.isReminder && x.remindAt ? hm(x.remindAt) : '', durationMin: x.durationMin || 30, priority: x.priority, assignee: x.assignee,
    remindAt: x.isReminder ? null : x.remindAt, repeat: x.repeat || null, existing: { kind: 'task', id: x.id },
  } });
}
function openEventEditor(e) {
  openSheet({ kind: 'edit', draft: {
    type: 'event', title: e.title, date: ymd(e.start), time: e.allDay ? '' : hm(e.start), endTime: e.allDay ? '' : hm(e.end), allDay: e.allDay,
    location: e.location || '', participants: e.participants || [], calendarId: e.source === 'local' ? 'local' : e.calendarId,
    repeat: e.source === 'local' ? (state.data.localEvents.find((x) => x.id === e.id)?.repeat || null) : e.rule || null,
    multi: !!e.period || (e.allDay && e.end - e.start > DAY + 3600000),
    endDate: e.period && e.rule?.until ? ymd(e.rule.until) : e.allDay && e.end - e.start > DAY + 3600000 ? ymd(e.end - DAY) : '',
    workdays: !!(e.period && e.rule?.freq === 'weekly'),
    color: e.ownColor || '',
    existing: { kind: 'event', source: e.source, id: e.id, key: e.key, recurring: e.recurring, seriesId: e.seriesId, start: e.start, rawStart: e.rawStart, color: e.ownColor || '' },
  } });
}

// ——— Fiche d'un rendez-vous + fiche contexte ———
function sheetEvent() {
  const e = state.sheet.ev;
  const ctx = buildContext(e, state.data);
  const conf = findConflicts(e, state.events, e.key);
  const why = { linked: 'whyLinked', series: 'whySeries', people: 'whyPeople', topic: 'whyTopic' };
  const cal = state.calendars.find((c) => c.id === e.calendarId);
  const people = [...(e.attendees || []).map((a) => a.name || a.email), ...(e.participants || [])];
  return `<div class="sheet-head"><b>${esc(e.title || t('untitled'))}</b><button class="iconbtn" data-act="close" aria-label="${t('close')}">✕</button></div>
    <p class="meta">${D(esc(fmtDate(e.start, { year: true })))}<br>${e.allDay ? t('allDay') : `${D(fmtTime(e.start))} – ${D(fmtTime(e.end))}`}
      ${e.location ? `<br>${esc(e.location)}` : ''}<br><small>${esc(e.source === 'local' ? t('localCal') : cal?.title || '')}</small></p>
    ${e.period && periodInfo(e) ? (() => { const p = periodInfo(e); return `<p class="replabel">${icon('agenda')} ${esc(D(t('periodDay', p.i, p.n, dateLabel(new Date(p.from), { ...S(), calMode: 'greg' }, { weekday: false }), dateLabel(new Date(p.to), { ...S(), calMode: 'greg' }, { weekday: false }))))}</p>`; })() : ''}
    ${!e.period && (e.rule || e.recurring) ? `<p class="replabel">${icon('repeat')} ${esc(e.rule ? D(ruleLabel(e.rule, e.seriesStart || state.data.series[e.seriesId]?.start || e.start, S().lang, S().hijriOffset)) : t('repeating'))}</p>` : ''}
    ${people.length ? `<p class="meta">${icon('users')} ${esc(people.join(', '))}</p>` : ''}
    ${conf.length ? `<div class="conflict">${icon('warn')}<div><b>${t('conflictWarn')}</b>${conf.map((c) => `<small>${D(fmtTime(c.start))}–${D(fmtTime(c.end))} · ${esc(c.title)}</small>`).join('')}</div></div>` : ''}
    <h3 class="ctx-title">${icon('link')} ${t('context')}</h3>
    ${!ctx.related.length && !ctx.openTasks.length ? `<p class="empty sm">${t('contextEmpty')}</p>` : ''}
    ${ctx.lastDecisions ? `<div class="ctx-box"><b>${t('lastDecisions')}</b><ul>${ctx.lastDecisions.decisions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${ctx.openTasks.length ? `<div class="ctx-box"><b>${t('openActions')}</b><div class="list">${ctx.openTasks.map(taskRow).join('')}</div></div>` : ''}
    ${ctx.related.length ? `<div class="ctx-box"><b>${t('relatedNotes')}</b>${ctx.related.map((r) => `<button class="row" data-act="note" data-id="${r.note.id}">
      <div class="what"><b>${esc(r.note.title || t('untitled'))}</b><small>${r.why.map((w) => t(why[w])).join(' · ')} · ${D(fmtDate(r.note.updated, { weekday: false }))}</small></div></button>`).join('')}</div>` : ''}
    <div class="actions wrap">
      ${e.birthday ? '' : `<button class="btn primary" data-act="evnote">${icon('users')} ${t('newMeeting')}</button>`}
      <button class="btn wa" data-act="evwa">${icon('wa')} WhatsApp</button>
      <button class="btn ghost" data-act="evics">${icon('share')} ${t('shareIcs')}</button>
      ${e.source === 'birthday' ? '' : `<button class="btn ghost" data-act="evedit">${t('edit')}</button>`}
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
    <div class="upd-box">
      <div><b>Trame ${D(state.appVersion || '')}</b><small>${state.update?.available ? t('updateAvailShort', D(state.update.latest)) : state.update ? t('upToDate') : t('updateNever')}</small></div>
      ${state.update?.available ? `<button class="btn primary" data-act="install">${icon('download')} ${t('install')}</button>` : `<button class="btn" data-act="update">${t('checkUpdate')}</button>`}
    </div>
    <label>${t('sLang')}<select data-set="lang">${opt('fr', s.lang, 'Français')}${opt('ar', s.lang, 'العربية')}</select></label>
    ${P.voiceSupported() ? `<label>${t('sVoiceLang')}<select data-set="voiceLang">${opt('auto', s.voiceLang, t('voiceAuto'))}${opt('fr-FR', s.voiceLang, 'Français')}${opt('ar-MA', s.voiceLang, 'العربية (المغرب)')}</select></label>` : ''}
    <label>${t('sTheme')}<select data-set="theme">${opt('auto', s.theme, t('themeAuto'))}${opt('light', s.theme, t('themeLight'))}${opt('dark', s.theme, t('themeDark'))}</select></label>
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
    ${P.platform === 'android' ? `<p class="hint">${t('widgetHint')}</p>` : ''}
    <h3>🎂 ${t('sBirthdays')}</h3>
    <label>${t('sBirthdaysMode')}<select data-set="birthdays">${opt('remind', s.birthdays, t('bdRemind'))}${opt('show', s.birthdays, t('bdShow'))}${opt('hide', s.birthdays, t('bdHide'))}</select></label>
    ${P.native ? `<div class="actions wrap"><button class="btn ghost" data-act="bdimport">${icon('contacts')} ${t('bdImport')}</button><small>${state.data.birthdays?.length ? D(t('bdCount', state.data.birthdays.length)) : ''}</small></div>` : ''}
    <p class="hint">${t('bdHint')}</p>
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
  if (k === 'theme') applyTheme();
  if (k === 'birthdays') { invalidate(); pushWidget(); rescheduleNotifs(); }
  if (k === 'lang' || k === 'calMode' || k === 'hijriOffset' || k === 'digits') { setLang(S().lang); renderSheet(); }
  render();
}

// ——— Accueil (premier lancement) ———
function sheetWelcome() {
  return `<div class="welcome"><span class="logo big">T</span><h2>${t('welcome')}</h2><p>${t('welcomeText')}</p>
    <div class="seg center"><button data-act="wlang" data-l="fr" class="${S().lang === 'fr' ? 'on' : ''}">Français</button><button data-act="wlang" data-l="ar" class="${S().lang === 'ar' ? 'on' : ''}">العربية</button></div>
    <button class="btn primary wide" data-act="wstart">${t('start_')}</button></div>`;
}

// ——— Mises à jour ———
async function checkForUpdate(force = false) {
  const s = S();
  if (!s.updateUrl) return null;
  if (!force && Date.now() - (s.lastUpdateCheck || 0) < 6 * 3600000 && state.update) return state.update;
  try {
    const u = await P.checkUpdate(s.updateUrl);
    state.update = u; s.lastUpdateCheck = Date.now(); P.saveData(state.data);
    return u;
  } catch (e) { console.warn('update', e); return null; }
}

// ——— Dictée vocale ———
async function startVoice() {
  if (state.listening) return;
  const s = S();
  const lang = s.voiceLang && s.voiceLang !== 'auto' ? s.voiceLang : s.lang === 'ar' ? 'ar-MA' : 'fr-FR';
  state.listening = true; render();
  try {
    const text = await P.listen(lang, t('voicePrompt'));
    if (!text) { toast(t('voiceNothing')); return; }
    const r = parseQuick(text, new Date(), { hijriOffset: s.hijriOffset });
    openSheet({ kind: 'edit', draft: { ...draftFromParse(r), heard: text } });
  } catch (e) {
    toast(/permission|denied/i.test(String(e?.message || e)) ? t('voiceDenied') : t('voiceFail'));
  } finally { state.listening = false; render(); }
}

// ——— Envoi par WhatsApp ———
function eventMessage(e) {
  const s = S(), ar = s.lang === 'ar';
  const people = [...new Set([...(e.attendees || []).map((a) => a.name || a.email), ...(e.participants || [])])].filter(Boolean);
  return [
    `📅 *${e.title || t('untitled')}*`,
    `🗓 ${dateLabel(new Date(e.start), { ...s, calMode: s.calMode === 'greg' ? 'greg' : 'both' }, { year: true })}`,
    `🕘 ${e.allDay ? t('allDay') : `${fmtTime(e.start)} – ${fmtTime(e.end)}`}`,
    e.location ? `📍 ${e.location}` : null,
    people.length ? `👥 ${people.join(ar ? '، ' : ', ')}` : null,
    e.description ? `\n${e.description.slice(0, 500)}` : null,
    '', `_${t('fromTrame')}_`,
  ].filter((x) => x !== null).join('\n');
}
function taskMessage(x) {
  const s = S();
  return [
    `✅ *${x.title}*`,
    x.due ? `📆 ${t('due')} : ${dateLabel(new Date(x.due), s, { year: true })}` : null,
    x.remindAt ? `⏰ ${fmtDate(x.remindAt, { weekday: true })} ${fmtTime(x.remindAt)}` : null,
    x.assignee ? `👤 ${t('assignee')} : ${x.assignee}` : null,
    x.durationMin ? `⏱ ${durationLabel(x.durationMin, s.lang)}` : null,
    '', `_${t('fromTrame')}_`,
  ].filter((v) => v !== null).join('\n');
}
const whoOf = (e) => [...new Set([...(e.attendees || []).map((a) => a.name).filter(Boolean), ...(e.participants || [])])];
function openWhatsApp(text, people = []) {
  const known = people.map((p) => ({ name: p, phone: state.data.contacts[norm(p)] || '' }));
  openSheet({ kind: 'wa', text, people: known, ev: state.sheet?.kind === 'event' ? state.sheet.ev : null, back: state.sheet, phone: known.length === 1 ? known[0].phone : '', name: known.length === 1 ? known[0].name : '', phones: [], sug: [] });
  // Si l'accès aux contacts est déjà accordé : numéros retrouvés automatiquement à partir des noms
  P.allContacts(false).then((list) => {
    state.contactsList = list;
    const w = state.sheet; if (w?.kind !== 'wa' || !list.length) return;
    let changed = false;
    for (const p of w.people) {
      if (p.phone) continue;
      const m = matchContacts(p.name);
      if (m.length === 1) { p.phone = waNumber(m[0].phones[0].number); changed = true; }
    }
    const cur = w.people.find((p) => p.name === w.name);
    if (cur && !w.phone && cur.phone) { w.phone = cur.phone; changed = true; }
    if (changed) { syncWaFromDom(); renderSheet(); }
  });
}
function matchContacts(name, max = 6) {
  const q = norm(name || '');
  if (q.length < 2) return [];
  return (state.contactsList || []).filter((c) => { const n = norm(c.name); return n.includes(q) || q.split(' ').every((w) => n.includes(w)); }).slice(0, max);
}
function syncWaFromDom() {
  const f = $('#waForm'), w = state.sheet; if (!f || w?.kind !== 'wa') return;
  w.name = f.querySelector('[name=name]').value; w.phone = f.querySelector('[name=phone]').value; w.text = f.querySelector('[name=text]').value;
}
const phoneType = (p) => (p.type === 'mobile' ? t('phoneMobile') : p.type === 'work' ? t('phoneWork') : p.type === 'home' ? t('phoneHome') : p.label || '');
function useContact(c) {
  const w = state.sheet;
  w.name = c.name; w.phones = c.phones; w.phone = c.phones[0] ? waNumber(c.phones[0].number) : ''; w.sug = [];
  renderSheet();
}
function sheetWhatsApp() {
  const w = state.sheet;
  return `<div class="sheet-head"><button class="iconbtn" data-act="waback" aria-label="${t('close')}">${icon(S().lang === 'ar' ? 'right' : 'left')}</button><b>${icon('wa')} WhatsApp</b><button class="iconbtn" data-act="close">✕</button></div>
  <div class="form" id="waForm">
    ${w.people.length > 1 ? `<div class="seg">${w.people.map((p, i) => `<button type="button" data-act="wapick" data-i="${i}" class="${w.name === p.name ? 'on' : ''}">${esc(p.name)}</button>`).join('')}</div>` : ''}
    ${P.native ? `<button type="button" class="btn ghost" data-act="wacontact">${icon('contacts')} ${t('pickContact')}</button>` : ''}
    <div class="two"><label>${t('waName')}<input name="name" value="${esc(w.name)}" autocomplete="off"></label>
    <label>${t('waPhone')}<input name="phone" type="tel" inputmode="tel" dir="ltr" value="${esc(w.phone)}" placeholder="06 12 34 56 78"></label></div>
    <div id="waSug" class="sug">${(w.sug || []).map((c, i) => `<button type="button" class="chip" data-act="wasug" data-i="${i}">${icon('contacts')} ${esc(c.name)}</button>`).join('')}</div>
    ${w.phones?.length > 1 ? `<div class="seg">${w.phones.map((p, i) => `<button type="button" data-act="waphone" data-i="${i}" class="${waNumber(p.number) === waNumber(w.phone) ? 'on' : ''}" dir="ltr">${esc(p.number)}${phoneType(p) ? ` · ${esc(phoneType(p))}` : ''}</button>`).join('')}</div>` : ''}
    <p class="hint">${t('waHint')}</p>
    <label>${t('waMessage')}<textarea name="text" rows="9">${esc(w.text)}</textarea></label>
    <div class="actions wrap">
      ${w.ev ? `<button type="button" class="btn ghost" data-act="waics">${icon('share')} ${t('shareIcs')}</button>` : ''}
      <button type="button" class="btn wa" data-act="wasend">${icon('wa')} ${t('waSend')}</button>
    </div>
  </div>`;
}
async function sendWhatsApp() {
  const f = $('#waForm'); const w = state.sheet;
  const name = f.querySelector('[name=name]').value.trim(), phone = waNumber(f.querySelector('[name=phone]').value);
  const text = f.querySelector('[name=text]').value;
  if (name && phone) { state.data.contacts[norm(name)] = phone; persist(); }
  await P.openWhatsApp(text, phone);
}

// ——— Widget ———
function pushWidget() {
  if (P.platform !== 'android') return;
  const s = S(), from = startOfDay(new Date()).getTime() - 7 * DAY;
  P.updateWidget({
    v: 1, lang: s.lang, calMode: s.calMode, birthdays: s.birthdays, hijriOffset: s.hijriOffset, digits: s.digits,
    hiddenCals: s.birthdays === 'hide' ? [...s.hiddenCals, ...state.calendars.filter((c) => c.birthday).map((c) => c.id)] : s.hiddenCals,
    calPerm: state.calPerm,
    colors: Object.fromEntries(Object.entries(state.data.eventMeta).filter(([k, m]) => m.color && k.startsWith('cal:')).map(([k, m]) => [k.slice(4).split('@')[0], m.color])),
    localEvents: [...expandLocal(from, from + 130 * DAY), ...(s.birthdays === 'hide' ? [] : contactBirthdayEvents(from, from + 130 * DAY, []))].map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end, allDay: !!e.allDay, location: e.location || '', color: e.color || '' })),
    tasks: state.data.tasks.filter((x) => !x.done && (x.due || x.remindAt || x.plannedStart)).map((x) => ({
      id: x.id, title: x.title, high: x.priority === 'high', reminder: !!x.isReminder,
      due: x.due || null, remindAt: x.remindAt || null, plannedStart: x.plannedStart || null, durationMin: x.durationMin || null,
    })),
  });
}

/** Texte reçu d'une autre appli (Keep…) : rendez-vous / tâche / rappel si une date est détectée, sinon note. */
async function receiveShared(subject, text) {
  state.view = 'today'; await render();
  const body = String(text).trim();
  const head = (subject || body.split('\n')[0]).trim();
  const r = parseQuick(subject ? `${subject} ${body.split('\n')[0]}` : head, new Date(), { hijriOffset: S().hijriOffset });
  let d;
  if (r.start && r.type !== 'note') {
    d = { ...draftFromParse(r), body, sharedText: body };
    if (!d.title) d.title = head.slice(0, 80);
  } else {
    d = { type: 'note', title: subject || (body.includes('\n') ? head.slice(0, 80) : ''), body: subject ? body : body.includes('\n') ? body.split('\n').slice(1).join('\n').trim() : body, parsed: true };
  }
  d.fromShare = true;
  openSheet({ kind: 'edit', draft: d });
}

async function handleLaunch() {
  const a = await P.consumeLaunchAction();
  if (!a) return;
  if (a.action === 'capture') { state.view = 'today'; await render(); $('#capIn')?.focus(); }
  if (a.action === 'day' && a.day) { state.view = 'agenda'; state.agendaMode = 'month'; state.cursor = startOfDay(new Date(+a.day)); state.selDay = state.cursor; await render(); }
  if (a.action === 'event' && a.start) {
    const st = +a.start;
    await ensureRange(startOfDay(st).getTime(), endOfDay(st).getTime(), true);
    const e = state.events.find((x) => (a.local ? x.id === a.id && x.source === 'local' : x.id === String(a.id)) && x.start === st)
      || state.events.find((x) => x.id === String(a.id));
    state.view = 'today'; await render();
    if (e) openSheet({ kind: 'event', ev: e });
  }
  if (a.action === 'task' && a.id) openTaskEditor(a.id);
  if (a.action === 'shared' && a.text) receiveShared(a.subject || '', a.text);
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
    const device = (state.calPerm ? await P.listDeviceEvents(from, to) : []) || [];
    const evs = [...device.filter((e) => !s.hiddenCals.includes(e.calendarId)), ...expandLocal(from, to).filter((e) => e.start > from)];
    for (const e of evs) {
      if (e.allDay) continue;
      if (e.birthday) continue;
      const ctx = buildContext({ ...e, participants: metaOf(e).participants || [] }, state.data);
      items.push({
        ref: 'e:' + e.key, at: e.start - s.contextLead * MIN, title: `${t('notifEvent', s.contextLead)} · ${e.title}`,
        body: t('notifCtx', ctx.related.length, ctx.openTasks.length), extra: { kind: 'event', key: e.key, start: e.start },
      });
    }
  }
  if (s.birthdays === 'remind') {
    const from = startOfDay(new Date()).getTime(), to = from + 8 * DAY;
    const device = (state.calPerm ? await P.listDeviceEvents(from, to) : []) || [];
    const bdCals = new Set(state.calendars.filter((c) => c.birthday).map((c) => c.id));
    const yearly = await P.yearlyAllDayIds(from, to);
    const bds = device.filter((e) => (bdCals.has(e.calendarId) || yearly.has(e.id)) && !s.hiddenCals.includes(e.calendarId));
    const all = [...bds.map((e) => ({ ...e, birthday: true })), ...contactBirthdayEvents(from, to, bds)];
    for (const e of all) {
      const day = startOfDay(e.start).getTime();
      items.push({ ref: 'b:' + e.key, at: day + 9 * 3600000, title: e.title.startsWith('🎂') ? e.title : `🎂 ${e.title}`, body: t('bdNotif'), extra: { kind: 'event', key: e.key, start: e.start } });
    }
  }
  await P.scheduleAll(items);
}

// ——— Actions ———
/** Bouton + ou touche Entrée : analyse la phrase saisie, ou ouvre un formulaire vide si rien n'est saisi. */
function capture(blank = false) {
  const v = blank ? '' : $('#capIn')?.value.trim();
  if (v) {
    const r = parseQuick(v, new Date(), { hijriOffset: S().hijriOffset });
    $('#capIn').value = '';
    openSheet({ kind: 'edit', draft: draftFromParse(r) });
    return;
  }
  const s = new Date(); s.setMinutes(0, 0, 0); s.setHours(blank && !sameDay(state.selDay, new Date()) ? 9 : s.getHours() + 1);
  const day = state.view === 'agenda' ? new Date(state.selDay) : new Date();
  day.setHours(s.getHours(), 0, 0, 0);
  openSheet({ kind: 'edit', draft: {
    type: 'event', title: '', date: ymd(day), time: hm(day), endTime: hm(day.getTime() + S().defaultDur * MIN), allDay: false,
    durationMin: 30, priority: 'normal', assignee: '', location: '', participants: [], body: '',
    calendarId: S().writeCal || (state.calPerm ? '' : 'local'),
  } });
  setTimeout(() => $('#editForm [name=title]')?.focus(), 250);
}

const actions = {
  add: () => capture(),
  bdimport: async () => {
    const list = await P.contactBirthdays(true);
    if (!list) { toast(t('contactsDenied')); return; }
    state.data.birthdays = list; invalidate(); persist(); renderSheet(); render(); toast(D(t('bdCount', list.length)));
  },
  theme: () => { S().theme = isDark() ? 'light' : 'dark'; applyTheme(); persist(); render(); },
  view: (b) => { state.view = b.dataset.v; if (state.view === 'agenda') state.cursor = startOfDay(new Date()); render(); window.scrollTo(0, 0); },
  settings: () => openSheet({ kind: 'settings' }),
  close: () => { const wasNote = state.sheet?.kind === 'note'; closeSheet(); if (wasNote) render(); },
  connect: async () => {
    state.calPerm = await P.calendarPermission(true);
    if (state.calPerm) { state.calendars = await P.listCalendars(); if (!S().writeCal) { const w = state.calendars.find((c) => c.writable); S().writeCal = w ? w.id : 'local'; persist(); } }
    else toast(t('calDenied'));
    invalidate(); if (state.sheet) renderSheet(); render(); pushWidget();
  },
  review: () => openSheet({ kind: 'review' }),
  rv: (b) => {
    const x = state.data.tasks.find((k) => k.id === b.dataset.id); if (!x) return;
    const op = b.dataset.op, tomorrow = addDays(startOfDay(new Date()), 1).getTime();
    if (op === 'done') completeTask(x);
    if (op === 'tomorrow') { x.due = tomorrow; x.plannedStart = null; if (x.remindAt) x.remindAt = tomorrow + 9 * 3600000; }
    if (op === 'nodate') Object.assign(x, { due: null, plannedStart: null, remindAt: null });
    if (op === 'del') state.data.tasks = state.data.tasks.filter((k) => k !== x);
    persist(); renderSheet(); render();
  },
  plan: (b) => { const x = state.data.tasks.find((k) => k.id === b.dataset.id); if (x) { x.plannedStart = +b.dataset.at; persist(); render(); } },
  toggle: (b) => {
    const x = state.data.tasks.find((k) => k.id === b.dataset.id); if (!x) return;
    if (x.done) { x.done = false; x.doneAt = null; } else completeTask(x);
    persist(); if (state.sheet) renderSheet(); render();
  },
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
  selday: (b) => {
    // double appui sur un jour (≤ 400 ms) : nouveau rendez-vous ce jour-là
    const tms = +b.dataset.t, now = Date.now();
    const dbl = state.lastTap && state.lastTap.t === tms && now - state.lastTap.at < 400;
    state.lastTap = dbl ? null : { t: tms, at: now };
    state.selDay = new Date(tms);
    if (dbl) { capture(true); return; }
    render();
  },
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
  scope: (b) => { const d = state.sheet.draft; d.scope = b.dataset.scope; state.sheet = state.sheet.back; saveEdit(d); },
  scopeback: () => { state.sheet = state.sheet.back; renderSheet(); },
  pickcolor: (b) => { const f = $('#editForm'); if (!f) return; state.sheet.draft.color = b.dataset.c; $$('.swatch', f).forEach((x) => x.classList.toggle('on', x === b)); },
  delrep: (b) => deleteRecurring(state.sheet.ev, b.dataset.scope),
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
    m.innerHTML = `<button data-act="nsh" data-f="keep">📒 Google Keep</button><button data-act="nsh" data-f="text">${t('shareText')}</button><button data-act="nsh" data-f="pdf">${t('sharePdf')}</button><button data-act="nsh" data-f="trame">${t('shareTrame')}</button>`;
    $('#sheet .panel').appendChild(m);
  },
  nsh: async (b) => {
    $('#shareMenu')?.remove();
    const n = state.sheet.note, name = (n.title || 'note').slice(0, 40);
    try {
      if (b.dataset.f === 'keep') { const r = await P.sendToKeep(n.title || t('untitled'), noteToText(n, S()).replace(/^.*\n/, '').trim()); if (r === 'copied') toast(t('copied')); }
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
    toast(t('checking'));
    const u = await checkForUpdate(true);
    if (!u) toast(t('updateFail'));
    else if (!u.available) toast(t('upToDate'));
    if (state.sheet) renderSheet();
    render();
  },
  install: () => { if (state.update?.url) { P.openUrl(state.update.url); toast(t('installHint')); } },
  voice: () => startVoice(),
  evwa: () => {
    const e = state.sheet.ev;
    if (e.birthday) { const who = e.person || e.title.replace(/^🎂\s*/, '').replace(/\s*\(\d+\)$/, ''); openWhatsApp(t('bdWish', who.split(' ')[0]), [who]); return; }
    openWhatsApp(eventMessage(e), whoOf(e));
  },
  taskwa: () => { const x = state.data.tasks.find((k) => k.id === state.sheet.draft.existing.id); if (x) openWhatsApp(taskMessage(x), x.assignee ? [x.assignee] : []); },
  wasend: () => sendWhatsApp(),
  wapick: (b) => {
    syncWaFromDom(); const w = state.sheet; const p = w.people[+b.dataset.i];
    w.name = p.name; w.phone = p.phone; w.phones = [];
    const m = p.phone ? [] : matchContacts(p.name);
    if (m.length === 1) useContact(m[0]); else { w.sug = m; renderSheet(); }
  },
  wacontact: async () => {
    syncWaFromDom();
    try { const c = await P.pickContact(); if (c) { if (!c.phones.length) toast(t('noPhone')); useContact(c); } }
    catch (e) { if (/denied|permission/i.test(String(e?.message || e))) toast(t('contactsDenied')); }
  },
  wasug: (b) => { syncWaFromDom(); useContact(state.sheet.sug[+b.dataset.i]); },
  waphone: (b) => { syncWaFromDom(); const w = state.sheet; w.phone = waNumber(w.phones[+b.dataset.i].number); renderSheet(); },
  waics: () => { const w = state.sheet; if (w.ev) P.shareFile(`${(w.ev.title || 'rdv').slice(0, 40)}.ics`, buildICS(w.ev, { lang: S().lang, hijriOffset: S().hijriOffset }), 'text/calendar', t('shareIcs')); },
  waback: () => { const w = state.sheet; state.sheet = w.back; renderSheet(); },
  wlang: (b) => { S().lang = b.dataset.l; setLang(S().lang); persist(); render(); renderSheet(); },
  wstart: async () => {
    S().onboarded = true; persist(); closeSheet();
    if (P.native) { await actions.connect(); await P.notifPermission(true); rescheduleNotifs(); }
    render();
  },
};

function normalizeData(d) {
  const out = { format: 1, tasks: [], notes: [], localEvents: [], eventMeta: {}, contacts: {}, series: {}, birthdays: [], ...(d || {}) };
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
    if (ev.target.id === 'capForm') capture();
    if (ev.target.id === 'editForm') saveEdit();
  });
  document.addEventListener('input', (ev) => {
    if (ev.target.id === 'q') { state.query = ev.target.value; clearTimeout(bind.qt); bind.qt = setTimeout(render, 180); }
    if (ev.target.name === 'name' && ev.target.closest('#waForm')) {
      const w = state.sheet; w.sug = matchContacts(ev.target.value);
      const box = $('#waSug');
      if (box) box.innerHTML = w.sug.map((c, i) => `<button type="button" class="chip" data-act="wasug" data-i="${i}">${icon('contacts')} ${esc(c.name)}</button>`).join('');
    }
  });
  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.closest('#editForm') && /^rep/.test(el.name || '')) state.sheet.draft.repTouched = true;
    if (el.closest('#editForm') && ['repeatPreset', 'repFreq', 'repEnd', 'date', 'multi', 'allDay'].includes(el.name)) {
      readEditForm();
      if (el.name !== 'date' || state.sheet.draft.repPreset !== 'custom') { renderSheet(); return; }
    }
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
      S().hiddenCals = [...h]; invalidate(); persist(); render(); pushWidget();
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
    P.App.addListener('resume', async () => { invalidate(); await render(); rescheduleNotifs(); pushWidget(); handleLaunch(); checkForUpdate().then((u) => { if (u?.available) render(); }); });
    P.App.addListener('backButton', () => {
      if ($('#shareMenu')) $('#shareMenu').remove();
      else if (state.sheet) { closeSheet(); render(); }
      else if (state.view !== 'today') { state.view = 'today'; render(); }
      else P.App.exitApp();
    });
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());
  await render();
  if (!S().onboarded) openSheet({ kind: 'welcome' });
  rescheduleNotifs();
  pushWidget();
  handleLaunch();
  state.appVersion = await P.appVersion();
  if (P.native && state.data.birthdays?.length) P.contactBirthdays(false).then((l) => { if (l) { state.data.birthdays = l; invalidate(); P.saveData(state.data); } });
  checkForUpdate().then((u) => { if (u?.available) render(); });
}

init();
