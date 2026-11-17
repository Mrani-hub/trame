// Icônes des éléments (emoji : visibles partout — appli, widget, notifications, partage).
// Ordre de priorité : icône choisie pour l'élément → icône déduite du titre (si activée) → icône par défaut du type.

export const DEFAULT_TYPE_ICONS = { event: '📅', task: '✅', reminder: '⏰', note: '📝', birthday: '🎂', period: '🗓️' };

/** Icônes proposées, par thème. */
export const ICON_SET = [
  ['travail', ['📅', '👥', '🤝', '💼', '📊', '📋', '🖥️', '📞', '✉️', '📝', '📌', '✅', '⏰', '🔔', '⚠️', '⭐']],
  ['technique', ['🔧', '🛠️', '📡', '🛰️', '🗼', '✈️', '🛫', '🔌', '🔋', '⚡', '🧪', '🏗️']],
  ['formation', ['🎓', '📚', '🏫', '🧑‍🏫', '🗓️', '🎤']],
  ['santé', ['🩺', '🦷', '💊', '🏥', '💉', '🧘']],
  ['vie', ['🏠', '🛒', '🍽️', '☕', '🚗', '⛽', '💳', '🧾', '🏦', '📦', '👨‍👩‍👧', '🎂', '🎉', '🎁']],
  ['loisirs', ['🎾', '⚽', '🏃', '🏊', '🧳', '🏖️', '🎬', '🎵', '📖', '🎮']],
  ['foi', ['🕌', '📿', '🌙', '🕋', '🤲']],
];

/** Mots-clés → icône (français, arabe, quelques termes métier ATSEP). */
const KEYWORDS = [
  [/anniv|birthday|عيد ميلاد/i, '🎂'],
  [/r[ée]union|comit[ée]|meeting|point hebdo|copil|اجتماع|لقاء/i, '👥'],
  [/entretien|rdv client|rencontre/i, '🤝'],
  [/m[ée]decin|docteur|clinique|consultation|طبيب|فحص/i, '🩺'],
  [/dentiste|طبيب الأسنان/i, '🦷'],
  [/pharmacie|m[ée]dicament|دواء|صيدلية/i, '💊'],
  [/h[ôo]pital|مستشفى/i, '🏥'],
  [/vol |avion|a[ée]roport|embarquement|طائرة|مطار|رحلة جوية/i, '✈️'],
  [/formation|stage|cours|s[ée]minaire|examen|تكوين|دورة|امتحان/i, '🎓'],
  [/[ée]cole|lyc[ée]e|coll[èe]ge|مدرسة/i, '🏫'],
  [/maintenance|r[ée]paration|panne|intervention|d[ée]pannage|صيانة|إصلاح/i, '🔧'],
  [/\bils\b|vor|dvor|dme|radar|cns|antenne|radio|vhf|balise/i, '📡'],
  [/appel|t[ée]l[ée]phoner|appeler|اتصال|اتصل/i, '📞'],
  [/mail|courrier|envoyer|رسالة|بريد/i, '✉️'],
  [/rapport|compte rendu|pr[ée]sentation|dossier|تقرير|محضر/i, '📊'],
  [/facture|paiement|payer|versement|virement|imp[ôo]t|فاتورة|أداء|دفع/i, '💳'],
  [/banque|بنك/i, '🏦'],
  [/courses|march[ée]|supermarch|تسوق|سوق/i, '🛒'],
  [/d[ée]jeuner|d[îi]ner|repas|restaurant|غداء|عشاء/i, '🍽️'],
  [/caf[ée]|قهوة/i, '☕'],
  [/voiture|garage|vidange|contr[ôo]le technique|سيارة/i, '🚗'],
  [/voyage|vacances|cong[ée]|عطلة|سفر/i, '🧳'],
  [/tennis|padel/i, '🎾'],
  [/foot|match/i, '⚽'],
  [/sport|gym|course à pied|jogging|رياضة/i, '🏃'],
  [/piscine|natation|سباحة/i, '🏊'],
  [/pri[èe]re|mosqu[ée]e|jumu|tarawih|صلاة|مسجد|جمعة/i, '🕌'],
  [/ramadan|iftar|ftour|suhur|رمضان|إفطار|سحور/i, '🌙'],
  [/coran|quran|tilawa|ثمن|حزب|قرآن|تلاوة|استظهار|إستظهار/i, '📿'],
  [/f[êe]te|c[ée]l[ée]bration|mariage|حفل|عرس/i, '🎉'],
  [/livraison|colis|طرد/i, '📦'],
  [/vac de nuit|garde|permanence|nuit|مداومة/i, '🌙'],
  [/vac (du )?matin|matin/i, '🌅'],
  [/vac apr[èe]s|apr[èe]s-midi/i, '🌇'],
];

export function autoIcon(title) {
  const s = String(title || '');
  for (const [re, ic] of KEYWORDS) if (re.test(s)) return ic;
  return '';
}

/**
 * Icône à afficher.
 * @param {string|undefined} own   icône choisie ('' ou undefined = automatique, 'none' = aucune)
 * @param {string} type            event | task | reminder | note | birthday | period
 */
export function resolveIcon(own, title, type, settings = {}) {
  if (own === 'none') return '';
  if (own) return own;
  if (settings.autoIcons !== false) { const a = autoIcon(title); if (a) return a; }
  if (settings.typeIcons === false) return '';
  return { ...DEFAULT_TYPE_ICONS, ...(settings.iconDefaults || {}) }[type] || '';
}
