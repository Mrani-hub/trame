import test from 'node:test';
import assert from 'node:assert/strict';
import { occurrences, nextAfter, toNativeRule, ruleLabel, presets, presetIdOf, generationHorizon } from '../src/core/recurrence.js';
import { toHijri } from '../src/core/hijri.js';

const at = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();
const ymd = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const START = at(2026, 11, 19, 10); // jeudi 19 novembre 2026, 10 h

test('quotidien tous les 2 jours, 4 fois', () => {
  const o = occurrences({ freq: 'daily', interval: 2, count: 4 }, START, 0, Infinity);
  assert.deepEqual(o.map(ymd), ['2026-11-19', '2026-11-21', '2026-11-23', '2026-11-25']);
  assert.equal(new Date(o[3]).getHours(), 10);
});

test('jours ouvrables lun.–ven.', () => {
  const o = occurrences({ freq: 'weekly', byDay: [1, 2, 3, 4, 5] }, START, START, at(2026, 11, 26));
  assert.deepEqual(o.map(ymd), ['2026-11-19', '2026-11-20', '2026-11-23', '2026-11-24', '2026-11-25']);
});

test('toutes les 2 semaines lundi et jeudi jusqu’au 10 décembre', () => {
  const o = occurrences({ freq: 'weekly', interval: 2, byDay: [1, 4], until: at(2026, 12, 10) }, START, 0, Infinity);
  assert.deepEqual(o.map(ymd), ['2026-11-19', '2026-11-30', '2026-12-3']);
});

test('mensuel le 31 : mois courts sautés', () => {
  const o = occurrences({ freq: 'monthly', count: 4 }, at(2027, 1, 31, 9), 0, Infinity);
  assert.deepEqual(o.map(ymd), ['2027-1-31', '2027-3-31', '2027-5-31', '2027-7-31']);
});

test('mensuel le 3e jeudi et le dernier jeudi', () => {
  const o = occurrences({ freq: 'monthly', monthMode: 'nth', count: 3 }, START, 0, Infinity);
  assert.deepEqual(o.map(ymd), ['2026-11-19', '2026-12-17', '2027-1-21']);
  const l = occurrences({ freq: 'monthly', monthMode: 'last', count: 3 }, at(2026, 11, 26, 9), 0, Infinity);
  assert.deepEqual(l.map(ymd), ['2026-11-26', '2026-12-31', '2027-1-28']);
});

test('annuel le 29 février : années bissextiles seulement', () => {
  const o = occurrences({ freq: 'yearly', count: 2 }, at(2028, 2, 29), 0, Infinity);
  assert.deepEqual(o.map(ymd), ['2028-2-29', '2032-2-29']);
});

test('hégirien : chaque 1er Ramadan', () => {
  const o = occurrences({ freq: 'hyearly', count: 3 }, at(2027, 2, 8, 19, 30), 0, Infinity);
  assert.equal(o.length, 3);
  for (const t of o) { const h = toHijri(new Date(t)); assert.deepEqual([h.m, h.d], [9, 1]); assert.equal(new Date(t).getHours(), 19); }
  assert.ok(o[1] - o[0] < 356 * 86400000 && o[1] - o[0] > 352 * 86400000);
});

test('hégirien : chaque mois le 15', () => {
  const o = occurrences({ freq: 'hmonthly', count: 4 }, START, 0, Infinity);
  const h0 = toHijri(new Date(START));
  o.forEach((t) => assert.equal(toHijri(new Date(t)).d, h0.d));
});

test('exceptions et occurrence suivante', () => {
  const r = { freq: 'weekly' };
  const o = occurrences(r, START, START, at(2026, 12, 11), { exdates: [at(2026, 11, 26, 10)] });
  assert.deepEqual(o.map(ymd), ['2026-11-19', '2026-12-3', '2026-12-10']);
  assert.equal(ymd(nextAfter(r, START, START)), '2026-11-26');
  assert.equal(nextAfter({ freq: 'daily', count: 1 }, START, START), null);
});

test('conversion vers l’agenda natif', () => {
  assert.deepEqual(toNativeRule({ freq: 'weekly', byDay: [1, 4], count: 5 }, START), { frequency: 'weekly', interval: 1, byWeekDay: [1, 4], count: 5 });
  assert.equal(toNativeRule({ freq: 'hyearly' }, START), null);
  assert.equal(toNativeRule({ freq: 'monthly', monthMode: 'nth' }, START), null);
  assert.ok(generationHorizon({ freq: 'hyearly' }, START).length >= 5);
});

test('libellés FR / AR et préréglages', () => {
  assert.equal(ruleLabel({ freq: 'weekly', interval: 2, byDay: [1, 4] }, START), 'Toutes les 2 semaines le lundi, jeudi');
  assert.equal(ruleLabel({ freq: 'monthly', monthMode: 'nth' }, START), 'Tous les mois le 3e jeudi');
  assert.equal(ruleLabel({ freq: 'weekly', byDay: [1, 2, 3, 4, 5] }, START, 'ar'), 'كل يوم عمل (الاثنين–الجمعة)');
  assert.match(ruleLabel({ freq: 'daily', count: 5 }, START), /5 fois/);
  const p = presets(START);
  assert.equal(p[0].id, 'none');
  assert.ok(p.find((x) => x.id === 'hyearly'));
  assert.equal(presetIdOf({ freq: 'weekly', byDay: [4] }, START), 'weekly');
  assert.equal(presetIdOf({ freq: 'weekly', interval: 2 }, START), 'custom');
});
