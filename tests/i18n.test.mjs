import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DICT } from '../src/i18n.js';

test('toutes les clés de texte existent en FR et en AR', () => {
  const src = ['src/app.js', 'src/export.js'].map((f) => readFileSync(f, 'utf8')).join('\n');
  const keys = new Set([...src.matchAll(/\bt\('([A-Za-z_]+)'/g)].map((m) => m[1]));
  // clés passées indirectement
  for (const m of src.matchAll(/'(type(?:Event|Task|Reminder|Note)|filter(?:Open|Reminders|Done)|why(?:Linked|Series|People|Topic))'/g)) keys.add(m[1]);
  keys.delete('freq_'); keys.delete('it_');
  const missing = [...keys].filter((k) => !(k in DICT.fr) || !(k in DICT.ar));
  assert.deepEqual(missing, []);
  assert.deepEqual(Object.keys(DICT.fr).filter((k) => !(k in DICT.ar)), []);
});
