// Sauvegarde / restauration et échange d'éléments, sans serveur.
// Chiffrement optionnel : PBKDF2 (250 000 itérations, SHA-256) + AES-GCM 256 bits (WebCrypto).

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (buf) => { let s = ''; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function key(password, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function makeBackup(data, password = '') {
  const payload = JSON.stringify(data);
  const meta = { app: 'trame', kind: 'backup', format: 1, created: new Date().toISOString() };
  if (!password) return JSON.stringify({ ...meta, data });
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(password, salt), enc.encode(payload));
  return JSON.stringify({ ...meta, encrypted: true, salt: b64(salt), iv: b64(iv), ct: b64(ct) });
}

export function isEncrypted(text) {
  try { return !!JSON.parse(text).encrypted; } catch { return false; }
}

export async function readBackup(text, password = '') {
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('format'); }
  if (obj.app !== 'trame' || obj.kind !== 'backup') throw new Error('format');
  if (!obj.encrypted) return obj.data;
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(obj.iv) }, await key(password, unb64(obj.salt)), unb64(obj.ct));
    return JSON.parse(dec.decode(pt));
  } catch { throw new Error('password'); }
}

/** Élément partagé entre utilisateurs de Trame (tâche ou note). */
export function makeShare(kind, item) {
  const clean = { ...item };
  delete clean.notifId;
  return JSON.stringify({ app: 'trame', kind: 'share', type: kind, format: 1, item: clean });
}

export function readShare(text) {
  const obj = JSON.parse(text);
  if (obj.app !== 'trame' || obj.kind !== 'share' || !['task', 'note'].includes(obj.type)) throw new Error('format');
  return { type: obj.type, item: obj.item };
}
