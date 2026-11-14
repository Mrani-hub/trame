// Utilitaires de texte FR/AR : chiffres, normalisation pour la recherche, échappement HTML.

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** Convertit les chiffres arabes orientaux / persans en chiffres latins. */
export function latinDigits(s) {
  return String(s ?? '').replace(/[٠-٩۰-۹]/g, (c) => {
    const i = AR_DIGITS.indexOf(c);
    return String(i >= 0 ? i : FA_DIGITS.indexOf(c));
  });
}

/** Convertit les chiffres latins en chiffres arabes orientaux. */
export function arabicDigits(s) {
  return String(s ?? '').replace(/[0-9]/g, (d) => AR_DIGITS[+d]);
}

/** Normalisation pour la recherche : minuscules, sans accents, sans harakat, alif/ya/ta marbuta unifiés. */
export function norm(s) {
  return latinDigits(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Mots vides FR/AR ignorés pour les rapprochements de sujets. */
export const STOP = new Set(
  norm(
    'le la les de des du un une et en au aux pour avec sur dans par a à chez ce cette ces son sa ses mon ma mes notre nos votre vos leur leurs ' +
      'reunion rdv rendez-vous point appel suivi meeting ' +
      'في من على الى إلى مع عن هذا هذه ذلك التي الذي و او أو ثم اجتماع موعد لقاء'
  ).split(' ')
);

/** Mots significatifs (≥ 3 lettres, hors mots vides). */
export function keywords(s) {
  return [...new Set(norm(s).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !STOP.has(w)))];
}

export function uid(prefix = 'id') {
  const r = (globalThis.crypto?.getRandomValues ? crypto.getRandomValues(new Uint32Array(2)) : [Math.random() * 2 ** 32, Date.now()])
    .map((n) => Math.floor(n).toString(36))
    .join('');
  return `${prefix}_${Date.now().toString(36)}${r}`;
}

/** Entier 31 bits stable dérivé d'une chaîne (identifiants de notifications). */
export function hash31(s) {
  let h = 2166136261;
  for (const c of String(s)) {
    h ^= c.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 1) || 1;
}
