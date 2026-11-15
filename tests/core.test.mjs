import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuick } from '../src/core/parser.js';
import { toHijri, fromHijri, hijriMonthLength } from '../src/core/hijri.js';
import { findConflicts, conflictKeys, freeSlots, suggestPlacements, searchAll, buildContext, buildICS } from '../src/core/logic.js';
import { makeBackup, readBackup } from '../src/core/backup.js';
import { norm } from '../src/core/text.js';

const NOW = new Date(2026, 10, 14, 17, 0); // samedi 14/11/2026 17:00
const at = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();

test('FR : rendez-vous simple', () => {
  const r = parseQuick('dentiste jeudi 10h', NOW);
  assert.equal(r.type, 'event');
  assert.equal(r.title, 'Dentiste');
  assert.equal(r.start, at(2026, 11, 19, 10));
  assert.equal(r.end, at(2026, 11, 19, 11));
});

test('FR : plage horaire et participants', () => {
  const r = parseQuick('Réunion budget avec Karim et Salma lundi prochain de 10h à 11h30', NOW);
  assert.equal(r.start, at(2026, 11, 16, 10));
  assert.equal(r.end, at(2026, 11, 16, 11, 30));
  assert.deepEqual(r.participants, ['Karim', 'Salma']);
});

test('FR : tâche avec échéance', () => {
  const r = parseQuick('appeler Karim avant vendredi', NOW);
  assert.equal(r.type, 'task');
  assert.equal(r.deadline, true);
  assert.equal(r.title, 'Appeler Karim');
  assert.equal(r.start, at(2026, 11, 20));
});

test('FR : rappel sans heure → 9 h', () => {
  const r = parseQuick('rappel payer la facture demain', NOW);
  assert.equal(r.type, 'reminder');
  assert.equal(r.start, at(2026, 11, 15, 9));
});

test('FR : date numérique, durée', () => {
  const r = parseQuick('Comité de pilotage le 20/11 14:00 pendant 2h', NOW);
  assert.equal(r.start, at(2026, 11, 20, 14));
  assert.equal(r.end, at(2026, 11, 20, 16));
});

test('FR : date passée → année suivante', () => {
  const r = parseQuick('formation 12 mars 9h-17h', NOW);
  assert.equal(r.start, at(2027, 3, 12, 9));
  assert.equal(r.end, at(2027, 3, 12, 17));
});

test('FR : note', () => {
  assert.equal(parseQuick('idée : refaire le parking B', NOW).type, 'note');
});

test('AR : rappel avec heure du matin', () => {
  const r = parseQuick('ذكرني غدا على الساعة 9 صباحا بالاتصال بكريم', NOW);
  assert.equal(r.type, 'reminder');
  assert.equal(r.start, at(2026, 11, 15, 9));
  assert.equal(r.title, 'الاتصال بكريم');
});

test('AR : chiffres arabes et « et demie »', () => {
  const r = parseQuick('موعد طبيب الأسنان بعد غد على الساعة ١٠ و نصف', NOW);
  assert.equal(r.type, 'event');
  assert.equal(r.start, at(2026, 11, 16, 10, 30));
});

test('AR : heure 1-6 sans période → après-midi', () => {
  const r = parseQuick('اجتماع مع المدير يوم الخميس الساعة 3', NOW);
  assert.equal(r.start, at(2026, 11, 19, 15));
  assert.deepEqual(r.participants, ['المدير']);
});

test('AR : tâche avant vendredi', () => {
  const r = parseQuick('مهمة: إرسال التقرير قبل الجمعة', NOW);
  assert.equal(r.type, 'task');
  assert.equal(r.title, 'إرسال التقرير');
});

test('Hégirien : saisie et conversion', () => {
  const r = parseQuick('réunion comité 3 رمضان à 10h', NOW);
  assert.equal(r.hijri, true);
  const h = toHijri(new Date(r.start));
  assert.deepEqual([h.m, h.d], [9, 3]);
  const g = fromHijri(1448, 9, 1);
  assert.deepEqual(toHijri(g), { y: 1448, m: 9, d: 1 });
  assert.ok([29, 30].includes(hijriMonthLength(1448, 9)));
});

test('Hégirien : ajustement ±1 jour', () => {
  const d = new Date(2026, 10, 14);
  const a = toHijri(d, 0), b = toHijri(d, -1);
  assert.notDeepEqual(a, b);
  assert.deepEqual(toHijri(fromHijri(a.y, a.m, a.d, -1), -1), a);
});

test('Conflits et créneaux libres', () => {
  const evs = [
    { key: 'a', start: at(2026, 11, 16, 9), end: at(2026, 11, 16, 10) },
    { key: 'b', start: at(2026, 11, 16, 9, 30), end: at(2026, 11, 16, 11) },
    { key: 'c', start: at(2026, 11, 16, 14), end: at(2026, 11, 16, 15) },
  ];
  assert.deepEqual([...conflictKeys(evs)].sort(), ['a', 'b']);
  assert.equal(findConflicts({ start: at(2026, 11, 16, 14, 30), end: at(2026, 11, 16, 16) }, evs).length, 1);
  const slots = freeSlots(new Date(2026, 10, 16), evs, { now: NOW });
  assert.deepEqual(slots.map((s) => [new Date(s.start).getHours(), new Date(s.end).getHours()]), [[8, 9], [11, 14], [15, 18]]);
  const sug = suggestPlacements([{ id: 't', title: 'Rapport', durationMin: 120, priority: 'high' }], slots, new Date(2026, 10, 16));
  assert.equal(new Date(sug[0].start).getHours(), 11);
});

test('Recherche FR/AR sans accents ni harakat', () => {
  const notes = [{ id: 'n1', title: 'Réunion groupe électrogène', body: 'Décision : remplacer le démarreur', updated: Date.now() },
    { id: 'n2', title: 'اجتماع الصيانة', body: 'تَقْرِير المولد الكهربائي', updated: Date.now() }];
  assert.equal(searchAll('electrogene demarreur', { notes })[0].item.id, 'n1');
  assert.equal(searchAll('تقرير', { notes })[0].item.id, 'n2');
  assert.equal(norm('إجتماع'), norm('اجتماع'));
});

test('Fiche contexte', () => {
  const ev = { key: 'cal:9', title: 'Point maintenance ILS', start: at(2026, 11, 20, 10), end: at(2026, 11, 20, 11), attendees: [{ name: 'Karim' }] };
  const notes = [
    { id: 'n1', title: 'Point maintenance ILS', updated: 1, meeting: { participants: ['Karim'], decisions: ['Commander la carte'] } },
    { id: 'n2', title: 'Courses', updated: 2 },
  ];
  const tasks = [{ id: 't1', title: 'Commander la carte', noteId: 'n1', done: false }];
  const c = buildContext(ev, { notes, tasks });
  assert.equal(c.related[0].note.id, 'n1');
  assert.equal(c.openTasks.length, 1);
  assert.deepEqual(c.lastDecisions.decisions, ['Commander la carte']);
});

test('ICS valide', () => {
  const ics = buildICS({ key: 'x', title: 'Réunion, budget; 2027', start: at(2026, 11, 20, 10), end: at(2026, 11, 20, 11) });
  assert.match(ics, /BEGIN:VEVENT/);
  assert.match(ics, /SUMMARY:Réunion\\, budget\\; 2027/);
  assert.ok(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75));
});

test('Sauvegarde chiffrée', async () => {
  const data = { tasks: [{ id: 1, title: 'تجربة' }] };
  const txt = await makeBackup(data, 'secret');
  assert.ok(!txt.includes('تجربة'));
  assert.deepEqual(await readBackup(txt, 'secret'), data);
  await assert.rejects(readBackup(txt, 'faux'), /password/);
  assert.deepEqual(await readBackup(await makeBackup(data)), data);
});

import { waNumber } from '../src/core/logic.js';
test('Numéros WhatsApp', () => {
  assert.equal(waNumber('06 12 34 56 78'), '212612345678');
  assert.equal(waNumber('+212 7 11 22 33 44'), '212711223344');
  assert.equal(waNumber('0033 6 12 34 56 78'), '33612345678');
  assert.equal(waNumber(''), '');
});

test('Périodes : du … au …, pendant N semaines, jours ouvrables', () => {
  const now = new Date(2026, 10, 15, 12);
  const ymdOf = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  let r = parseQuick('Formation sécurité 23/11 pendant 2 semaines jours ouvrables 8h30-16h30', now);
  assert.equal(r.type, 'event'); assert.equal(r.title, 'Formation sécurité'); assert.equal(r.workdays, true);
  assert.equal(ymdOf(r.periodEnd), '2026-12-6'); assert.equal(r.start, at(2026, 11, 23, 8, 30)); assert.equal(r.end, at(2026, 11, 23, 16, 30));
  r = parseQuick('formation SMS du 23/11 au 4/12', now);
  assert.equal(ymdOf(new Date(r.start)), '2026-11-23'); assert.equal(ymdOf(r.periodEnd), '2026-12-4'); assert.equal(r.allDay, true);
  r = parseQuick('congé du 21 au 28 décembre', now);
  assert.equal(ymdOf(new Date(r.start)), '2026-12-21'); assert.equal(ymdOf(r.periodEnd), '2026-12-28');
  r = parseQuick('stage pendant 10 jours ouvrables à partir du 23/11', now);
  assert.equal(r.title, 'Stage'); assert.equal(r.periodCount, 10); assert.equal(ymdOf(r.periodEnd), '2026-12-4');
  r = parseQuick('تكوين لمدة أسبوعين أيام العمل ابتداء من 23/11', now);
  assert.equal(r.title, 'تكوين'); assert.equal(r.workdays, true);
  // les durées en heures restent des durées
  assert.equal(parseQuick('Comité le 20/11 14:00 pendant 2h', now).periodEnd, null);
});
