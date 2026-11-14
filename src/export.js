// Export des notes : texte propre et PDF (rendu en image, donc l'arabe est correctement mis en forme).
import { t } from './i18n.js';
import { dateLabel, timeLabel } from './core/dates.js';
import { esc } from './core/text.js';

const isArabic = (s) => /[؀-ۿ]/.test(s || '');

export function noteToText(n, settings) {
  const L = [];
  L.push((n.title || t('untitled')).toUpperCase());
  if (n.eventStart) L.push(`${dateLabel(new Date(n.eventStart), settings, { year: true })} · ${timeLabel(new Date(n.eventStart), settings)}`);
  const m = n.meeting;
  if (m) {
    if (m.participants?.length) L.push('', `${t('participants')} : ${m.participants.join(', ')}`);
    if (m.agenda) L.push('', `${t('agendaItems')} :`, m.agenda);
  }
  if (n.body) L.push('', n.body);
  if (m?.decisions?.length) L.push('', `${t('decisions')} :`, ...m.decisions.map((d) => `• ${d}`));
  if (m?.actions?.length) {
    L.push('', `${t('actions')} :`);
    for (const a of m.actions) L.push(`☐ ${a.text}${a.who ? ` — ${a.who}` : ''}${a.due ? ` (${dateLabel(new Date(a.due), settings, { weekday: false })})` : ''}`);
  }
  L.push('', `— ${t('fromTrame')}`);
  return L.join('\n');
}

export async function noteToPdf(n, settings) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const rtl = settings.lang === 'ar' || isArabic(n.title + n.body);
  const m = n.meeting;
  const list = (arr) => arr.map((x) => `<div style="margin:4px 0">•&nbsp;${esc(x)}</div>`).join('');
  const el = document.createElement('div');
  el.dir = rtl ? 'rtl' : 'ltr';
  el.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;padding:56px 64px;background:#fff;color:#1b2430;font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Arabic","Noto Naskh Arabic",sans-serif;box-sizing:border-box';
  el.innerHTML = `
    <div style="border-bottom:3px solid #1F4E79;padding-bottom:12px;margin-bottom:18px">
      <div style="font-size:12px;color:#5b6b7c;${rtl ? '' : 'letter-spacing:.06em;text-transform:uppercase'}">${esc(m ? t('meetingNote') : t('typeNote'))}</div>
      <div style="font-size:24px;font-weight:700;color:#1F4E79;margin-top:4px">${esc(n.title || t('untitled'))}</div>
      ${n.eventStart ? `<div style="color:#5b6b7c;margin-top:4px">${esc(dateLabel(new Date(n.eventStart), settings, { year: true }))} · ${esc(timeLabel(new Date(n.eventStart), settings))}</div>` : ''}
    </div>
    ${m?.participants?.length ? `<p><b>${t('participants')} :</b> ${esc(m.participants.join(rtl ? '، ' : ', '))}</p>` : ''}
    ${m?.agenda ? `<h3 style="color:#1F4E79">${t('agendaItems')}</h3><div style="white-space:pre-wrap">${esc(m.agenda)}</div>` : ''}
    ${n.body ? `<div style="white-space:pre-wrap;margin-top:12px">${esc(n.body)}</div>` : ''}
    ${m?.decisions?.length ? `<h3 style="color:#1F4E79">${t('decisions')}</h3>${list(m.decisions)}` : ''}
    ${m?.actions?.length ? `<h3 style="color:#1F4E79">${t('actions')}</h3>
      <table style="width:100%;border-collapse:collapse">${m.actions.map((a) => `<tr>
        <td style="border-bottom:1px solid #e3e8ee;padding:6px 4px">☐ ${esc(a.text)}</td>
        <td style="border-bottom:1px solid #e3e8ee;padding:6px 4px;color:#5b6b7c">${esc(a.who || '')}</td>
        <td style="border-bottom:1px solid #e3e8ee;padding:6px 4px;color:#5b6b7c">${a.due ? esc(dateLabel(new Date(a.due), settings, { weekday: false })) : ''}</td></tr>`).join('')}</table>` : ''}
    <div style="margin-top:28px;font-size:11px;color:#8a97a6">${esc(t('fromTrame'))}</div>`;
  document.body.appendChild(el);
  try {
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff' });
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
    const pageH = Math.floor((canvas.width * ph) / pw);
    for (let y = 0, page = 0; y < canvas.height; y += pageH, page++) {
      const slice = document.createElement('canvas');
      slice.width = canvas.width; slice.height = Math.min(pageH, canvas.height - y);
      slice.getContext('2d').drawImage(canvas, 0, y, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
      if (page) pdf.addPage();
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, (slice.height * pw) / canvas.width);
    }
    return pdf.output('blob');
  } finally { el.remove(); }
}
