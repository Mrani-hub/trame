// Couche plateforme : agendas du téléphone, notifications, fichiers, partage, mises à jour.
// Sur navigateur (aperçu / tests), tout se replie sur un stockage local sans fonctions natives.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { CapacitorCalendar, EventSpan } from '@ebarooni/capacitor-calendar';
import { Contacts } from '@capacitor-community/contacts';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { AppLauncher } from '@capacitor/app-launcher';
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition';
import { hash31 } from './core/text.js';

export const native = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform();
export { App };

// ——— Stockage des données (fichier privé de l'application) ———
const DATA_FILE = 'trame-data.json';
export async function loadData() {
  if (!native) {
    try { return JSON.parse(localStorage.getItem('trame-data') || 'null'); } catch { return null; }
  }
  try {
    const r = await Filesystem.readFile({ path: DATA_FILE, directory: Directory.Data, encoding: Encoding.UTF8 });
    return JSON.parse(r.data);
  } catch {
    try { // reprise sur la copie précédente si l'écriture a été interrompue
      const r = await Filesystem.readFile({ path: DATA_FILE + '.bak', directory: Directory.Data, encoding: Encoding.UTF8 });
      return JSON.parse(r.data);
    } catch { return null; }
  }
}
let saving = Promise.resolve();
export function saveData(data) {
  const text = JSON.stringify(data);
  if (!native) { try { localStorage.setItem('trame-data', text); } catch { /* quota */ } return Promise.resolve(); }
  saving = saving.then(async () => {
    try { await Filesystem.copy({ from: DATA_FILE, to: DATA_FILE + '.bak', directory: Directory.Data, toDirectory: Directory.Data }); } catch { /* premier enregistrement */ }
    await Filesystem.writeFile({ path: DATA_FILE, directory: Directory.Data, data: text, encoding: Encoding.UTF8 });
  }).catch((e) => console.error('save', e));
  return saving;
}

// ——— Agendas du téléphone ———
export async function calendarPermission(request = false) {
  if (!native) return false;
  try {
    if (platform === 'ios') {
      const r = request ? await CapacitorCalendar.requestFullCalendarAccess() : await CapacitorCalendar.checkPermission({ scope: 'readCalendar' });
      return r.result === 'granted';
    }
    if (request) {
      await CapacitorCalendar.requestPermission({ scope: 'readCalendar' });
      await CapacitorCalendar.requestPermission({ scope: 'writeCalendar' });
    }
    const r = await CapacitorCalendar.checkPermission({ scope: 'readCalendar' });
    return r.result === 'granted';
  } catch (e) { console.warn('calendar permission', e); return false; }
}

/** Agendas d'anniversaires (Google « Anniversaires / Birthdays / Contacts », Samsung, iPhone…). */
const BIRTHDAY_CAL = /birthday|anniversaire|cumpleaños|geburtstag|عيد ميلاد|أعياد الميلاد|#contacts@group|^contacts$/i;

export async function listCalendars() {
  if (!native) return [];
  try {
    const { result } = await CapacitorCalendar.listCalendars();
    return (result || []).map((c) => ({
      id: String(c.id), title: c.title || c.internalTitle || c.accountName || '—', color: c.color || '#1F4E79',
      account: c.accountName || c.source?.title || '', writable: c.allowsContentModifications !== false && !c.isImmutable,
      birthday: BIRTHDAY_CAL.test(`${c.title || ''} ${c.internalTitle || ''} ${c.accountName || ''}`),
    }));
  } catch (e) { console.warn('listCalendars', e); return []; }
}

/** Rendez-vous des agendas du téléphone qui chevauchent [from, to]. */
export async function listDeviceEvents(from, to) {
  if (!native) return [];
  try {
    const { result } = await CapacitorCalendar.listEventsInRange({ from, to });
    // Android stocke les journées entières en UTC (minuit UTC) : on les ramène au minuit local
    const utcDayToLocal = (t) => { const d = new Date(t); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime(); };
    const isUtcMidnight = (t) => { const d = new Date(t); return d.getUTCHours() === 0 && d.getUTCMinutes() === 0; };
    return (result || []).map((e) => (e.isAllDay && isUtcMidnight(e.startDate)
      ? { ...e, rawStart: e.startDate, startDate: utcDayToLocal(e.startDate), endDate: utcDayToLocal(e.endDate || e.startDate + 86400000) } : e)).map((e) => ({
      source: 'device', id: String(e.id), calendarId: e.calendarId ? String(e.calendarId) : null,
      key: e.isPartOfSeries ? `cal:${e.id}@${e.startDate}` : `cal:${e.id}`, rawStart: e.rawStart ?? e.startDate,
      title: e.title || '', start: e.startDate, end: e.endDate || e.startDate + 3600000, allDay: !!e.isAllDay,
      location: e.location || '', description: e.description || '', color: e.color || null, recurring: !!e.isPartOfSeries,
      attendees: (e.attendees || []).map((a) => ({ name: a.name || '', email: a.email || '' })).filter((a) => a.name || a.email),
    }));
  } catch (e) { console.warn('listEvents', e); return null; }
}

export async function createDeviceEvent(ev, calendarId, leadMin, recurrence = null) {
  const { id } = await CapacitorCalendar.createEvent({
    title: ev.title, startDate: ev.start, endDate: ev.allDay ? ev.end - 60000 : ev.end, isAllDay: !!ev.allDay, location: ev.location || undefined,
    description: ev.description || undefined, calendarId: calendarId || undefined, alerts: leadMin ? [-leadMin] : undefined,
    recurrence: recurrence || undefined,
  });
  return id ? String(id) : null;
}

export async function modifyDeviceEvent(ev, recurrence = null) {
  await CapacitorCalendar.modifyEvent({
    id: ev.id, title: ev.title, startDate: ev.start, endDate: ev.allDay ? ev.end - 60000 : ev.end, isAllDay: !!ev.allDay, location: ev.location || '',
    recurrence: recurrence || undefined,
  });
}

/** Ouvre l'éditeur de l'agenda du téléphone (rendez-vous répétitifs : modification de la série en sécurité). */
export async function editDeviceEventNative(ev) {
  await CapacitorCalendar.modifyEventWithPrompt({ id: ev.id });
}

/** scope : 'this' (cette occurrence) ou 'series' (toute la série). */
export async function deleteDeviceEvent(ev, scope = 'this') {
  if (ev.recurring && scope === 'series') await CapacitorCalendar.deleteEvent({ id: ev.id, span: EventSpan.THIS_AND_FUTURE_EVENTS });
  else await CapacitorCalendar.deleteEvent({ id: ev.id, instanceDate: ev.recurring ? ev.start : undefined, span: EventSpan.THIS_EVENT });
}

export async function deleteDeviceEventsById(ids) {
  if (ids.length) await CapacitorCalendar.deleteEventsById({ ids });
}

// ——— Notifications locales ———
export async function notifPermission(request = false) {
  if (!native) return false;
  try {
    let r = await LocalNotifications.checkPermissions();
    if (r.display !== 'granted' && request) r = await LocalNotifications.requestPermissions();
    return r.display === 'granted';
  } catch { return false; }
}

export async function exactAlarmStatus() {
  if (platform !== 'android') return 'granted';
  try { return (await LocalNotifications.checkExactNotificationSetting()).exact_alarm; } catch { return 'granted'; }
}
export async function openExactAlarmSettings() {
  try { await LocalNotifications.changeExactNotificationSetting(); } catch { /* indisponible */ }
}

let channelReady = false;
/** Remplace toutes les notifications programmées par la liste donnée (max 60 : limite iOS = 64). */
export async function scheduleAll(items) {
  if (!native) return;
  try {
    if (platform === 'android' && !channelReady) {
      await LocalNotifications.createChannel({ id: 'trame', name: 'Trame', importance: 4, visibility: 1, vibration: true });
      channelReady = true;
    }
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    const now = Date.now();
    const list = items.filter((i) => i.at > now + 5000).sort((a, b) => a.at - b.at).slice(0, 60);
    if (!list.length) return;
    await LocalNotifications.schedule({
      notifications: list.map((i) => ({
        id: hash31(i.ref), title: i.title, body: i.body || '', channelId: 'trame', smallIcon: 'ic_stat_trame',
        schedule: { at: new Date(i.at), allowWhileIdle: true }, extra: i.extra || null,
      })),
    });
  } catch (e) { console.warn('schedule', e); }
}

export function onNotificationOpen(cb) {
  if (!native) return;
  LocalNotifications.addListener('localNotificationActionPerformed', (a) => cb(a.notification?.extra || {}));
}

// ——— Fichiers et partage ———
export async function shareText(title, text) {
  if (native) return Share.share({ title, text, dialogTitle: title });
  if (navigator.share) return navigator.share({ title, text }).catch(() => {});
  await navigator.clipboard?.writeText(text);
  return 'copied';
}

const blobToB64 = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1]);
  r.onerror = rej;
  r.readAsDataURL(blob);
});

/** Partage un fichier (texte ou Blob) via la feuille de partage du système. */
export async function shareFile(name, content, mime = 'application/octet-stream', title = name) {
  const safe = name.replace(/[\\/:*?"<>|]+/g, '-');
  if (native) {
    const isBlob = content instanceof Blob;
    const w = await Filesystem.writeFile({
      path: safe, directory: Directory.Cache, data: isBlob ? await blobToB64(content) : content,
      encoding: isBlob ? undefined : Encoding.UTF8,
    });
    return Share.share({ title, files: [w.uri], dialogTitle: title });
  }
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = safe;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function pickTextFile(accept = '.trame,.json,application/json') {
  return new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept;
    i.onchange = async () => resolve(i.files?.[0] ? await i.files[0].text() : null);
    i.click();
  });
}

// ——— Version et mises à jour (sans serveur : simple fichier JSON public) ———
export async function appVersion() {
  if (native) { try { return (await App.getInfo()).version; } catch { /* */ } }
  return globalThis.__APP_VERSION__ || '0.0.0';
}

export const newer = (a, b) => {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
};

export async function checkUpdate(url) {
  const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('http ' + r.status);
  const info = await r.json();
  const cur = await appVersion();
  return { current: cur, latest: info.version, url: info.apk || info.url, notes: info.notes || '', available: newer(info.version, cur) };
}

export const openUrl = (url) => (native ? Browser.open({ url }) : window.open(url, '_blank'));

// ——— Widget Android (écran d'accueil) ———
// L'appli écrit widget.json (réglages, tâches, rendez-vous locaux) ; le widget lit aussi directement les agendas du téléphone.
const TrameWidget = registerPlugin('TrameWidget');
export async function updateWidget(payload) {
  if (platform !== 'android') return;
  try {
    await Filesystem.writeFile({ path: 'widget.json', directory: Directory.Data, data: JSON.stringify(payload), encoding: Encoding.UTF8 });
    await TrameWidget.refresh();
  } catch (e) { console.warn('widget', e); }
}
/** Action demandée par le widget à l'ouverture (« capture », « event »…), consommée une seule fois. */
/** Android : identifiants des rendez-vous annuels « toute la journée » (anniversaires dans l'agenda principal de Google). */
export async function yearlyAllDayIds(from, to) {
  if (platform !== 'android') return new Set();
  try { const r = await TrameWidget.yearlyAllDayIds({ from, to }); return new Set((r?.ids || []).map(String)); } catch { return new Set(); }
}
export async function consumeLaunchAction() {
  if (platform !== 'android') return null;
  try { const r = await TrameWidget.consumeLaunch(); return r?.action ? r : null; } catch { return null; }
}

// ——— Dictée vocale (reconnaissance du système : Google sur Android, Apple sur iPhone) ———
const WebSR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
export const voiceSupported = () => native || !!WebSR;

/** Écoute une phrase et renvoie le texte reconnu (ou '' si rien). */
export async function listen(lang, prompt) {
  if (native) {
    const av = await SpeechRecognition.available().catch(() => ({ available: false }));
    if (!av.available) throw new Error('unavailable');
    let perm = await SpeechRecognition.checkPermissions();
    if (perm.speechRecognition !== 'granted') perm = await SpeechRecognition.requestPermissions();
    if (perm.speechRecognition !== 'granted') throw new Error('permission denied');
    const r = await SpeechRecognition.start({ language: lang, maxResults: 3, prompt, popup: platform === 'android', partialResults: false, addPunctuation: false });
    return (r?.matches || [])[0] || '';
  }
  return new Promise((resolve, reject) => {
    const rec = new WebSR();
    rec.lang = lang; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = (e) => resolve(e.results?.[0]?.[0]?.transcript || '');
    rec.onerror = (e) => reject(new Error(e.error || 'voice'));
    rec.onend = () => resolve('');
    rec.start();
  });
}

// ——— WhatsApp ———
/** Ouvre WhatsApp avec le message prêt (et le contact si le numéro est connu). */
export async function openWhatsApp(text, phone = '') {
  const q = `text=${encodeURIComponent(text)}`;
  if (native) {
    try {
      await AppLauncher.openUrl({ url: `whatsapp://send?${phone ? `phone=${phone}&` : ''}${q}` });
      return;
    } catch { /* WhatsApp absent : on passe par le lien web */ }
  }
  return openUrl(`https://wa.me/${phone}?${q}`);
}

// ——— Contacts du téléphone ———
const contactName = (c) => c?.name?.display || [c?.name?.given, c?.name?.family].filter(Boolean).join(' ') || '';
const contactPhones = (c) => (c?.phones || []).filter((p) => p.number).map((p) => ({ number: p.number, type: p.type, label: p.label || '' }))
  .sort((a, b) => (b.type === 'mobile') - (a.type === 'mobile'));

export async function contactsPermission(request = false) {
  if (!native) return false;
  try {
    let r = await Contacts.checkPermissions();
    if (r.contacts !== 'granted' && r.contacts !== 'limited' && request) r = await Contacts.requestPermissions();
    return r.contacts === 'granted' || r.contacts === 'limited';
  } catch { return false; }
}

/** Sélecteur de contact du système : { name, phones: [{ number, type, label }] } ou null. */
export async function pickContact() {
  if (!(await contactsPermission(true))) throw new Error('permission denied');
  const r = await Contacts.pickContact({ projection: { name: true, phones: true } });
  return r?.contact ? { name: contactName(r.contact), phones: contactPhones(r.contact) } : null;
}

let contactCache = null;
/** Tous les contacts avec numéro (mis en cache), si l'accès a déjà été accordé. */
export async function allContacts(request = false) {
  if (contactCache) return contactCache;
  if (!(await contactsPermission(request))) return [];
  const r = await Contacts.getContacts({ projection: { name: true, phones: true } });
  contactCache = (r.contacts || []).map((c) => ({ name: contactName(c), phones: contactPhones(c) })).filter((c) => c.name && c.phones.length);
  return contactCache;
}

/** Anniversaires des contacts du téléphone : [{ name, day, month (1-12), year|null }]. */
export async function contactBirthdays(request = false) {
  if (!(await contactsPermission(request))) return null;
  const r = await Contacts.getContacts({ projection: { name: true, birthday: true } });
  return (r.contacts || [])
    .filter((c) => c.birthday?.day && c.birthday?.month)
    .map((c) => ({ name: contactName(c), day: c.birthday.day, month: c.birthday.month, year: c.birthday.year || null }))
    .filter((b) => b.name);
}

// ——— Modification interne des rendez-vous répétitifs et couleurs (Android) ———
export async function modifyOccurrence(ev, instanceDate, color) {
  return TrameWidget.modifyOccurrence({ id: ev.id, instanceDate, title: ev.title, start: ev.start, end: ev.end, allDay: !!ev.allDay, location: ev.location || '', color: color ?? undefined });
}
export async function modifySeries(id, { title, location, shift, duration, allDay, rrule, color, single = false }) {
  return TrameWidget.modifySeries({ id, title, location: location || '', shift, duration, allDay: !!allDay, rrule: rrule || undefined, color: color ?? undefined, single });
}
export async function setEventColor(id, color) {
  if (platform !== 'android') return;
  try { await TrameWidget.setEventColor({ id, color: color || '' }); } catch (e) { console.warn('color', e); }
}

// ——— Google Keep (pas d'API pour les comptes personnels : passage par le partage Android) ———
export async function sendToKeep(title, text) {
  if (platform === 'android') {
    try { return await TrameWidget.shareTo({ package: 'com.google.android.keep', title, text }); } catch (e) { console.warn('keep', e); }
  }
  return shareText(title, text);
}
