'use strict';
/* versione dell'app: deve coincidere con version.json */
const VERSIONE = '1.14';
window.BC_VERSIONE = VERSIONE;
/* =========================================================
   Beauty Concept – Agenda con conferme e promemoria clienti
   Tutti i dati restano sul telefono (localStorage).
   ========================================================= */

const KEY = 'beautyconcept.v1';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- testi predefiniti dei messaggi ---------- */
const MSG_CONFERMA = `Ciao {nome}! ✨
Ti confermiamo il tuo appuntamento da {centro}:
📅 {data} alle {ora}
💆‍♀️ {servizio}

👉 Tocca qui per salvarlo nel calendario con i promemoria: {link}

Se non puoi venire avvisaci almeno 48 ore prima, così diamo il posto a un'altra cliente. Grazie! 💕`;

const MSG_PROMEMORIA = `Ciao {nome}! 🌸
Ti ricordiamo il tuo appuntamento da {centro}:
📅 {data} alle {ora}
💆‍♀️ {servizio}

Rispondi SÌ per confermare 🙏
Se hai un imprevisto avvisaci subito, così liberiamo il posto.`;

const MSG_PRIVACY = `Ciao {nome}! 🌸
Per poterti seguire al meglio e mandarti i promemoria degli appuntamenti, ti inviamo l'informativa sulla privacy di {centro}:
{link}

Rispondi OK per dare il consenso 🙏
Se vuoi ricevere anche le nostre offerte e promozioni, scrivi OK OFFERTE 💕`;

const DEFAULT = {
  settings: {
    nome: 'Beauty Concept',
    indirizzo: '',
    telefono: '',
    linkBase: '',
    oreAvviso: 72,
    msgConferma: MSG_CONFERMA,
    msgPromemoria: MSG_PROMEMORIA,
    msgPrivacy: MSG_PRIVACY,
    titolare: '',
    piva: '',
    email: ''
  },
  servizi: [
    { id: 's1', nome: 'Pulizia viso', durata: 60 },
    { id: 's2', nome: 'Manicure', durata: 45 },
    { id: 's3', nome: 'Semipermanente mani', durata: 60 },
    { id: 's4', nome: 'Pedicure', durata: 60 },
    { id: 's5', nome: 'Ceretta gambe', durata: 30 },
    { id: 's6', nome: 'Massaggio', durata: 50 }
  ],
  clienti: [],
  appuntamenti: []
};

const STATI = { prenotato: 'Da confermare', confermato: 'Confermato', disdetto: 'Disdetto' };

/* ---------- salvataggio ---------- */
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      const base = JSON.parse(JSON.stringify(DEFAULT));
      return { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}) } };
    }
  } catch (e) { /* dati non leggibili: si riparte dai predefiniti */ }
  return JSON.parse(JSON.stringify(DEFAULT));
}
let db = load();
function save(soloLocale) {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { toast('⚠️ Impossibile salvare i dati'); }
  if (!soloLocale && window.BC && window.BC.onSave) window.BC.onSave(); // sincronizza col cloud
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

/* ---------- date ---------- */
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtData = d => d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtOra = d => d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
const byStart = (a, b) => new Date(a.inizio) - new Date(b.inizio);
function relGiorni(d) {
  const diff = Math.round((parseDay(dayKey(d)) - parseDay(dayKey(new Date()))) / 864e5);
  if (diff === 0) return 'oggi';
  if (diff === 1) return 'domani';
  if (diff === 2) return 'dopodomani';
  return `tra ${diff} giorni`;
}

/* ---------- telefoni e link ---------- */
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function telIntl(t) {
  let n = String(t || '').replace(/[^\d+]/g, '');
  if (n.startsWith('+')) n = n.slice(1);
  else if (n.startsWith('00')) n = n.slice(2);
  else if (n.length <= 10) n = '39' + n; // numero italiano senza prefisso
  return n;
}
const telValido = t => String(t || '').replace(/\D/g, '').length >= 8;
// link completo di WhatsApp: il link breve wa.me su alcuni telefoni rovina le emoji (escono come "?")
const waUrl = (tel, txt) => `https://api.whatsapp.com/send?phone=${telIntl(tel)}&text=${encodeURIComponent(txt)}`;
const smsUrl = (tel, txt) => `sms:+${telIntl(tel)}${isIOS ? '&' : '?'}body=${encodeURIComponent(txt)}`;

function baseLink() {
  const s = (db.settings.linkBase || '').trim();
  if (s) return s;
  if (/^https?:$/.test(location.protocol)) return new URL('appuntamento.html', location.href).href.split('?')[0];
  return '';
}
const utcCompact = iso => new Date(iso).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
function linkCalendario(a) {
  const base = baseLink();
  if (!base) return '';
  const c = cliente(a.clienteId) || {};
  const p = new URLSearchParams({
    n: (c.nome || '').trim().split(/\s+/)[0] || '',
    s: a.servizioNome,
    t: utcCompact(a.inizio),
    m: String(a.durata),
    c: db.settings.nome
  });
  if (db.settings.indirizzo) p.set('a', db.settings.indirizzo);
  if (db.settings.telefono) p.set('p', telIntl(db.settings.telefono));
  return base + '?' + p.toString();
}
function linkPrivacy() {
  const base = baseLink();
  if (!base) return '';
  const s = db.settings;
  const p = new URLSearchParams({ c: s.nome || 'Beauty Concept' });
  if (s.titolare) p.set('r', s.titolare);
  if (s.indirizzo) p.set('a', s.indirizzo);
  if (s.piva) p.set('i', s.piva);
  if (s.email) p.set('e', s.email);
  if (s.telefono) p.set('p', telIntl(s.telefono));
  return base.replace(/appuntamento\.html$/, 'privacy.html') + '?' + p.toString();
}
function msgPrivacy(c) {
  const link = linkPrivacy();
  let tpl = db.settings.msgPrivacy || MSG_PRIVACY;
  if (!link) tpl = tpl.split('\n').filter(l => !l.includes('{link}')).join('\n');
  const val = { nome: (c.nome || '').trim().split(/\s+/)[0], centro: db.settings.nome, link };
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in val ? val[k] : m)).trim();
}
const oggiISO = () => dayKey(new Date());
const fmtBreve = k => k ? parseDay(k).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

function compila(tpl, a) {
  const c = cliente(a.clienteId) || {};
  const d = new Date(a.inizio);
  const link = linkCalendario(a);
  if (!link) tpl = tpl.split('\n').filter(l => !l.includes('{link}')).join('\n');
  const val = {
    nome: (c.nome || '').trim().split(/\s+/)[0],
    servizio: a.servizioNome,
    data: fmtData(d),
    ora: fmtOra(d),
    centro: db.settings.nome,
    indirizzo: db.settings.indirizzo,
    link
  };
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in val ? val[k] : m)).replace(/\n{3,}/g, '\n\n').trim();
}

/* ---------- accesso ai dati ---------- */
const cliente = id => db.clienti.find(c => c.id === id);
const appt = id => db.appuntamenti.find(a => a.id === id);
const apptsOfDay = k => db.appuntamenti.filter(a => dayKey(new Date(a.inizio)) === k).sort(byStart);
function daRicordare() {
  const now = Date.now(), lim = now + (Number(db.settings.oreAvviso) || 72) * 36e5;
  return db.appuntamenti.filter(a => {
    const t = +new Date(a.inizio);
    return a.stato === 'prenotato' && t > now && t <= lim;
  }).sort(byStart);
}
function sovrapposizioni(inizio, durata, escludiId) {
  const s = +new Date(inizio), e = s + durata * 6e4;
  return db.appuntamenti.filter(a => {
    if (a.id === escludiId || a.stato === 'disdetto') return false;
    const as = +new Date(a.inizio), ae = as + a.durata * 6e4;
    return s < ae && e > as;
  });
}

/* ---------- stato interfaccia ---------- */
let tab = 'agenda';
let selDay = dayKey(new Date());
let cerca = '';
let filtroCli = 'tutte';

/* ---------- icone ---------- */
const IC_WA = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2c0 1.3.9 2.5 1 2.7.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>';
const IC_SMS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z"/></svg>';

/* =========================================================
   RENDER
   ========================================================= */
function render() {
  $('#nomeCentro').textContent = db.settings.nome || 'Beauty Concept';
  $('#oggi').textContent = cap(fmtData(new Date()));
  const n = daRicordare().length;
  const b = $('#badge'); b.hidden = !n; b.textContent = n;
  $$('.tabs button').forEach(x => x.classList.toggle('on', x.dataset.tab === tab));
  $('#fab').style.display = tab === 'impostazioni' ? 'none' : '';
  const v = $('#view');
  v.style.animation = 'none'; void v.offsetWidth; v.style.animation = '';
  v.innerHTML = ({ agenda: viewAgenda, ricordare: viewRicordare, clienti: viewClienti, impostazioni: viewImpostazioni })[tab]();
  if (tab === 'agenda') centraGiorno();
  if (tab === 'impostazioni') bindImpostazioni();
  if (window.BC && window.BC.afterRender) window.BC.afterRender(tab);
}

function centraGiorno() {
  const strip = $('#days'), s = strip && $('.day.sel', strip);
  if (s) strip.scrollLeft = s.offsetLeft - strip.clientWidth / 2 + s.clientWidth / 2;
}

/* ---------- Agenda ---------- */
function viewAgenda() {
  const sel = parseDay(selDay);
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - 7);
  if (sel < start) { start.setTime(sel.getTime()); start.setDate(start.getDate() - 3); }
  const counts = {};
  db.appuntamenti.forEach(a => { if (a.stato !== 'disdetto') { const k = dayKey(new Date(a.inizio)); counts[k] = (counts[k] || 0) + 1; } });
  const oggi = dayKey(new Date());
  let days = '';
  const totGiorni = Math.max(60, Math.round((sel - start) / 864e5) + 14);
  for (let i = 0; i < totGiorni; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const k = dayKey(d);
    days += `<button class="day ${k === selDay ? 'sel' : ''} ${k === oggi ? 'today' : ''}" data-day="${k}">
      <small>${d.toLocaleDateString('it-IT', { weekday: 'short' }).replace('.', '')}</small><b>${d.getDate()}</b>${counts[k] ? '<i class="dot"></i>' : ''}</button>`;
  }
  const list = apptsOfDay(selDay);
  const attivi = list.filter(a => a.stato !== 'disdetto').length;
  return `
    <div class="titlebar">
      <div class="h2">${cap(fmtData(sel))}</div>
      <label class="jump" aria-label="Vai a una data">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>
        <input type="date" id="jumpDate" value="${selDay}">
      </label>
    </div>
    <p class="sub">${attivi ? `${attivi} appuntament${attivi === 1 ? 'o' : 'i'}` : 'Nessun appuntamento'}</p>
    <div class="days" id="days">${days}</div>
    ${list.length ? list.map(cardAppt).join('') : `
      <div class="empty"><div class="ic">🌸</div>Giornata libera.<br>Tocca <b>+</b> per aggiungere un appuntamento.</div>`}`;
}

function cardAppt(a) {
  const c = cliente(a.clienteId) || { nome: 'Cliente eliminato' };
  const d = new Date(a.inizio), fine = new Date(d.getTime() + a.durata * 6e4);
  return `<button class="card appt ${a.stato === 'disdetto' ? 'off' : ''}" data-appt="${a.id}">
    <div class="ora">${fmtOra(d)}<small>${fmtOra(fine)}</small></div>
    <div class="info"><b>${esc(c.nome)}</b><span>${esc(a.servizioNome)}</span></div>
    <span class="chip ${a.stato}">${STATI[a.stato]}</span></button>`;
}

/* ---------- Da ricordare ---------- */
function viewRicordare() {
  const ore = Number(db.settings.oreAvviso) || 72;
  const list = daRicordare();
  const conf = db.appuntamenti.filter(a => a.stato === 'confermato' && +new Date(a.inizio) > Date.now() && +new Date(a.inizio) <= Date.now() + ore * 36e5).length;
  return `
    <div class="h2">Da ricordare</div>
    <p class="sub">Appuntamenti delle prossime ${ore} ore non ancora confermati. Manda il promemoria: se la cliente non risponde, hai ancora tempo per dare il posto a un'altra.</p>
    ${list.length ? list.map(cardRem).join('') : `<div class="empty"><div class="ic">✨</div>Tutto a posto!<br>Nessuna cliente da ricordare.</div>`}
    ${conf ? `<p class="hint" style="text-align:center;margin-top:14px">✅ ${conf} già confermat${conf === 1 ? 'o' : 'i'} nello stesso periodo</p>` : ''}`;
}

function cardRem(a) {
  const c = cliente(a.clienteId) || { nome: 'Cliente eliminato', tel: '' };
  const d = new Date(a.inizio);
  const txt = compila(db.settings.msgPromemoria, a);
  const inv = (a.inviato && a.inviato.promemoria) || {};
  const sent = [inv.wa && 'WhatsApp', inv.sms && 'SMS'].filter(Boolean);
  return `<div class="card rem">
    <div class="when">${relGiorni(d)} · ${d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}, ${fmtOra(d)}</div>
    <div class="who">${esc(c.nome)}</div>
    <div class="what">${esc(a.servizioNome)} · ${a.durata} min</div>
    ${sent.length ? `<div class="sentline">Promemoria inviato: <b>${sent.join(' + ')}</b></div>` : ''}
    <div class="grid2">
      ${telValido(c.tel) ? `<a class="btn wa small ${inv.wa ? 'sent' : ''}" href="${waUrl(c.tel, txt)}" target="_blank" rel="noopener" data-sent="promemoria:wa" data-id="${a.id}">${IC_WA} WhatsApp <span class="tick">✓</span></a>
      <a class="btn sms small ${inv.sms ? 'sent' : ''}" href="${smsUrl(c.tel, txt)}" data-sent="promemoria:sms" data-id="${a.id}">${IC_SMS} SMS <span class="tick">✓</span></a>`
      : `<button class="btn small" data-cli="${c.id || ''}" style="grid-column:span 2">📞 Manca il numero: aggiungilo</button>`}
      <button class="btn ok small" data-act="conferma" data-id="${a.id}">✓ Ha confermato</button>
      <button class="btn ko small" data-act="disdici" data-id="${a.id}">✕ Disdetto</button>
    </div></div>`;
}

/* ---------- Clienti ---------- */
const senzaTel = c => !String(c.tel || '').replace(/\D/g, '');
const FILTRI_CLI = {
  tutte: { nome: 'Tutte', f: () => true },
  privacy: { nome: 'Senza consenso privacy', f: c => !c.privacy },
  numero: { nome: 'Senza numero', f: senzaTel },
  offerte: { nome: 'Sì offerte', f: c => !!c.marketing }
};
function viewClienti() {
  const q = cerca.trim().toLowerCase();
  const filtro = FILTRI_CLI[filtroCli] || FILTRI_CLI.tutte;
  const list = db.clienti
    .filter(filtro.f)
    .filter(c => !q || c.nome.toLowerCase().includes(q) || String(c.tel).includes(q))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  return `
    <div class="h2">Clienti</div>
    <p class="sub">${db.clienti.length} in rubrica</p>
    <div class="chips">${Object.entries(FILTRI_CLI).map(([k, v]) => `<button class="chipf ${k === filtroCli ? 'on' : ''}" data-act="filtroCli" data-id="${k}">${v.nome} <small>${db.clienti.filter(v.f).length}</small></button>`).join('')}</div>
    <input type="search" id="cerca" placeholder="🔍  Cerca per nome o telefono" value="${esc(cerca)}" style="margin-bottom:14px">
    ${list.length ? list.map(c => {
      const n = db.appuntamenti.filter(a => a.clienteId === c.id && a.stato !== 'disdetto').length;
      const ini = c.nome.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
      return `<button class="card cli" data-cli="${c.id}"><span class="avatar">${esc(ini)}</span>
        <span class="info"><b>${esc(c.nome)}</b><span>${c.tel ? esc(c.tel) : '<em style="color:var(--ko);font-style:normal">Senza numero</em>'} · ${n} appuntament${n === 1 ? 'o' : 'i'}</span></span>${c.privacy ? '' : '<span class="nopriv" title="Consenso privacy mancante">🔒</span>'}</button>`;
    }).join('') : `<div class="empty"><div class="ic">👩🏻</div>${q ? 'Nessun risultato.' : 'Nessuna cliente ancora.<br>Vengono aggiunte da sole quando crei un appuntamento.'}</div>`}`;
}

/* ---------- Impostazioni ---------- */
function viewImpostazioni() {
  const s = db.settings;
  const link = baseLink();
  return `
    <div class="h2">Impostazioni</div>
    <p class="sub">Le modifiche si salvano da sole.</p>

    <div class="section-t">Il centro</div>
    <div class="card">
      <label style="margin-top:2px">Nome del centro</label><input data-set="nome" value="${esc(s.nome)}">
      <label>Indirizzo (compare nel calendario della cliente)</label><input data-set="indirizzo" value="${esc(s.indirizzo)}" placeholder="Via Roma 1, Napoli">
      <label>Telefono / WhatsApp del centro</label><input data-set="telefono" type="tel" inputmode="tel" value="${esc(s.telefono)}" placeholder="333 1234567">
      <label>Avvisa nella sezione "Da ricordare" quante ore prima?</label>
      <select data-set="oreAvviso">${[48, 72, 96].map(h => `<option value="${h}" ${Number(s.oreAvviso) === h ? 'selected' : ''}>${h} ore prima (${h / 24} giorni)</option>`).join('')}</select>
    </div>

    <div class="section-t">Privacy (GDPR)</div>
    <div class="card">
      <p class="hint" style="margin-top:0">Questi dati compaiono nell'informativa che mandi alle clienti.</p>
      <label>Titolare (nome e cognome o ragione sociale)</label><input data-set="titolare" value="${esc(s.titolare)}" placeholder="Es. Sara Rossi">
      <label>P.IVA / Codice fiscale</label><input data-set="piva" value="${esc(s.piva)}">
      <label>Email per le richieste privacy</label><input data-set="email" type="email" inputmode="email" value="${esc(s.email)}">
      <label>Messaggio con l'informativa</label><textarea data-set="msgPrivacy">${esc(s.msgPrivacy)}</textarea>
      ${linkPrivacy() ? `<a class="btn ghost block small" href="${esc(linkPrivacy())}" target="_blank" rel="noopener" style="margin-top:12px">📄 Vedi l'informativa</a>` : ''}
      <p class="hint">Testo standard per centri estetici: fallo controllare dal vostro consulente o commercialista. ${(() => { const n = db.clienti.filter(c => !c.privacy).length; return n ? `<br><b>${n}</b> client${n === 1 ? 'e' : 'i'} senza consenso: le trovi in Clienti → "Senza consenso privacy".` : ''; })()}</p>
    </div>

    <div class="section-t">Servizi</div>
    <div class="card" id="servizi">
      ${db.servizi.map(x => `<div class="srv">
        <input data-srv="${x.id}" data-k="nome" value="${esc(x.nome)}" placeholder="Nome servizio">
        <input class="d" data-srv="${x.id}" data-k="durata" type="number" inputmode="numeric" value="${x.durata}" min="5" step="5">
        <button data-act="delSrv" data-id="${x.id}" aria-label="Elimina">✕</button></div>`).join('')}
      <p class="hint">Nome e durata in minuti.</p>
      <button class="btn ghost block" data-act="addSrv" style="margin-top:10px">+ Aggiungi servizio</button>
    </div>

    <div class="section-t">Messaggi</div>
    <div class="card">
      <label style="margin-top:2px">Conferma (inviata appena prendi l'appuntamento)</label>
      <textarea data-set="msgConferma">${esc(s.msgConferma)}</textarea>
      <label>Promemoria (dalla sezione "Da ricordare")</label>
      <textarea data-set="msgPromemoria">${esc(s.msgPromemoria)}</textarea>
      <p class="hint">Parole che si sostituiscono da sole: <code>{nome}</code> <code>{servizio}</code> <code>{data}</code> <code>{ora}</code> <code>{centro}</code> <code>{indirizzo}</code> <code>{link}</code></p>
      <button class="btn ghost block small" data-act="resetMsg" style="margin-top:12px">Ripristina testi originali</button>
    </div>

    <div class="section-t">Link calendario per le clienti</div>
    <div class="card">
      ${link ? `<div class="okbox">✓ Link attivo:<br>${esc(link)}</div>` : `<div class="warnbox">⚠️ L'app è aperta dal computer (file locale): le clienti non potrebbero aprire il link. Pubblica l'app online (es. GitHub Pages) oppure scrivi qui sotto l'indirizzo della pagina <b>appuntamento.html</b>. Finché manca, i messaggi partono senza link.</div>`}
      <label>Indirizzo pagina cliente (lascia vuoto se l'app è già online)</label>
      <input data-set="linkBase" value="${esc(s.linkBase)}" placeholder="https://tuonome.github.io/beauty-concept/appuntamento.html" inputmode="url">
    </div>

    <div class="section-t">Importa da Google Calendar</div>
    <div class="card">
      <p class="hint" style="margin-top:0">Porta nell'app gli appuntamenti che hai su Google Calendar. Da computer: calendar.google.com → ⚙️ Impostazioni → Importa ed esporta → Esporta. Poi scegli qui il file scaricato (.zip o .ics).</p>
      <label class="btn block" style="margin:10px 0 0;color:var(--txt);font-size:15px">📅 Scegli il file di Google Calendar<input type="file" id="gcalFile" accept=".zip,.ics,text/calendar,application/zip" hidden></label>
    </div>

    <div class="section-t">Numeri dalla rubrica del telefono</div>
    <div class="card">
      ${(() => { const n = db.clienti.filter(c => !String(c.tel || '').replace(/\D/g, '')).length; return n ? `<div class="warnbox" style="margin-top:0">${n} client${n === 1 ? 'e' : 'i'} senza numero</div>` : `<div class="okbox" style="margin-top:0">✓ Tutte le clienti hanno il numero</div>`; })()}
      <p class="hint">Esporta la rubrica del telefono e sceglila qui: l'app abbina da sola i numeri alle clienti e ti fa controllare prima di salvare.<br>
      <b>iPhone:</b> app Contatti → in alto a sinistra <b>Liste</b> → tieni premuto <b>Tutti i contatti</b> → <b>Esporta</b> → Salva su File.<br>
      <b>Android:</b> app Contatti → menu → <b>Gestisci contatti</b> → <b>Esporta</b> (file .vcf).</p>
      <label class="btn block" style="margin:10px 0 0;color:var(--txt);font-size:15px">📇 Scegli il file della rubrica (.vcf)<input type="file" id="vcfFile" accept=".vcf,text/vcard,text/x-vcard" hidden></label>
    </div>

    <div class="section-t">Cloud e backup automatici</div>
    <div class="card" id="cloudBox"><p class="hint" style="margin:0">Caricamento…</p></div>

    <div class="section-t">Backup su file</div>
    <div class="card">
      <p class="hint" style="margin-top:0">Puoi anche scaricare una copia su file da conservare dove vuoi (Drive, email, WhatsApp).</p>
      <div class="grid2">
        <button class="btn" data-act="export">⬇️ Salva backup</button>
        <label class="btn" style="margin:0;color:var(--txt);font-size:15px">⬆️ Carica backup<input type="file" id="importFile" accept="application/json,.json" hidden></label>
      </div>
    </div>
    <button class="btn ghost block small" data-aggiorna style="margin-top:22px">🔄 Aggiorna app all'ultima versione</button>
    <p class="hint" style="text-align:center;margin:10px 0 4px">Beauty Concept · v${VERSIONE}</p>`;
}

function bindImpostazioni() {
  let t;
  $$('[data-set]').forEach(el => el.addEventListener('input', () => {
    db.settings[el.dataset.set] = el.dataset.set === 'oreAvviso' ? Number(el.value) : el.value;
    clearTimeout(t); t = setTimeout(() => {
      save();
      $('#nomeCentro').textContent = db.settings.nome || 'Beauty Concept';
      const n = daRicordare().length, b = $('#badge'); b.hidden = !n; b.textContent = n;
    }, 300);
  }));
  $$('[data-srv]').forEach(el => el.addEventListener('input', () => {
    const s = db.servizi.find(x => x.id === el.dataset.srv);
    if (!s) return;
    s[el.dataset.k] = el.dataset.k === 'durata' ? Math.max(5, Number(el.value) || 30) : el.value;
    clearTimeout(t); t = setTimeout(save, 300);
  }));
  $('#importFile').addEventListener('change', e => importa(e.target.files[0]));
}

/* =========================================================
   PANNELLI (dal basso)
   ========================================================= */
function openSheet(html) {
  const s = $('#sheet');
  s.innerHTML = '<div class="grab"></div>' + html;
  s.scrollTop = 0;
  s.classList.add('on'); $('#backdrop').classList.add('on');
}
function closeSheet() { $('#sheet').classList.remove('on'); $('#backdrop').classList.remove('on'); }

/* ---------- nuovo / modifica appuntamento ---------- */
function defaultStart() {
  const d = parseDay(selDay);
  const now = new Date();
  if (dayKey(d) === dayKey(now) && now.getHours() >= 8) { d.setHours(now.getHours() + 1, 0, 0, 0); }
  else d.setHours(9, 0, 0, 0);
  return d;
}
function formAppt(a) {
  const c = a ? cliente(a.clienteId) : null;
  const d = a ? new Date(a.inizio) : defaultStart();
  const srvId = a ? (db.servizi.find(s => s.nome === a.servizioNome) || {}).id || '__altro' : (db.servizi[0] || {}).id || '__altro';
  const durata = a ? a.durata : (db.servizi[0] || {}).durata || 60;
  openSheet(`
    <h3>${a ? 'Modifica appuntamento' : 'Nuovo appuntamento'}</h3>
    <label>Cliente</label>
    <input id="fNome" list="dlClienti" autocomplete="off" placeholder="Nome e cognome" value="${esc(c ? c.nome : '')}">
    <datalist id="dlClienti">${db.clienti.map(x => `<option value="${esc(x.nome)}">`).join('')}</datalist>
    <label>Cellulare</label>
    <input id="fTel" type="tel" inputmode="tel" placeholder="333 1234567" value="${esc(c ? c.tel : '')}">
    ${window.BCRubrica && BCRubrica.pickerOk ? '<button class="btn ghost block small" data-rubrica="fTel" style="margin-top:8px">📇 Prendi dalla rubrica</button>' : ''}
    <label>Servizio</label>
    <select id="fSrv">
      ${db.servizi.map(s => `<option value="${s.id}" ${s.id === srvId ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}
      <option value="__altro" ${srvId === '__altro' ? 'selected' : ''}>Altro…</option>
    </select>
    <input id="fSrvAltro" placeholder="Scrivi il servizio" style="margin-top:8px;${srvId === '__altro' ? '' : 'display:none'}" value="${esc(srvId === '__altro' && a ? a.servizioNome : '')}">
    <div class="row">
      <div><label>Giorno</label><input id="fData" type="date" value="${dayKey(d)}"></div>
      <div><label>Ora</label><input id="fOra" type="time" step="300" value="${pad(d.getHours())}:${pad(d.getMinutes())}"></div>
    </div>
    <label>Durata (minuti)</label>
    <input id="fDur" type="number" inputmode="numeric" min="5" step="5" value="${durata}">
    <label>Note (facoltative)</label>
    <input id="fNote" placeholder="Es. pelle sensibile" value="${esc(a ? a.note || '' : '')}">
    <div id="fWarn"></div>
    <button class="btn pri block" data-act="salvaAppt" data-id="${a ? a.id : ''}" style="margin-top:18px">${a ? 'Salva modifiche' : 'Salva e invia conferma →'}</button>`);

  const fNome = $('#fNome'), fTel = $('#fTel'), fSrv = $('#fSrv');
  fNome.addEventListener('input', () => {
    const m = db.clienti.find(x => x.nome.toLowerCase() === fNome.value.trim().toLowerCase());
    if (m) fTel.value = m.tel;
  });
  fSrv.addEventListener('change', () => {
    const s = db.servizi.find(x => x.id === fSrv.value);
    $('#fSrvAltro').style.display = s ? 'none' : '';
    if (s) $('#fDur').value = s.durata; else $('#fSrvAltro').focus();
    checkWarn();
  });
  const checkWarn = () => {
    const v = $('#fData').value, o = $('#fOra').value;
    if (!v || !o) return;
    const ini = new Date(`${v}T${o}`);
    const over = sovrapposizioni(ini.toISOString(), Number($('#fDur').value) || 30, a ? a.id : null);
    $('#fWarn').innerHTML = over.length ? `<div class="warnbox">⚠️ Si sovrappone a: ${over.map(x => `${fmtOra(new Date(x.inizio))} ${esc((cliente(x.clienteId) || {}).nome || '')}`).join(', ')}</div>` : '';
  };
  ['fData', 'fOra', 'fDur'].forEach(id => $('#' + id).addEventListener('change', checkWarn));
  checkWarn();
}

function salvaAppt(id) {
  const nome = $('#fNome').value.trim().replace(/\s+/g, ' ');
  const tel = $('#fTel').value.trim();
  const v = $('#fData').value, o = $('#fOra').value;
  const s = db.servizi.find(x => x.id === $('#fSrv').value);
  const servizioNome = s ? s.nome : $('#fSrvAltro').value.trim();
  const durata = Math.max(5, Number($('#fDur').value) || 30);
  if (!nome) return toast('Scrivi il nome della cliente');
  if (tel && !telValido(tel)) return toast('Controlla il numero di cellulare');
  if (!servizioNome) return toast('Scegli o scrivi il servizio');
  if (!v || !o) return toast('Inserisci giorno e ora');
  const inizio = new Date(`${v}T${o}`).toISOString();

  let c = db.clienti.find(x => x.nome.toLowerCase() === nome.toLowerCase());
  if (!c) { c = { id: uid(), nome, tel, note: '' }; db.clienti.push(c); }
  else c.tel = tel;

  let a = id ? appt(id) : null;
  let spostato = false;
  if (a) {
    spostato = a.inizio !== inizio;
    Object.assign(a, { clienteId: c.id, servizioNome, inizio, durata, note: $('#fNote').value.trim() });
    if (spostato) { a.stato = 'prenotato'; a.inviato = {}; }
  } else {
    a = { id: uid(), clienteId: c.id, servizioNome, inizio, durata, note: $('#fNote').value.trim(), stato: 'prenotato', inviato: {}, creato: new Date().toISOString() };
    db.appuntamenti.push(a);
  }
  save();
  selDay = v; tab = 'agenda';
  render();
  if (!id || spostato) sheetInvio(a.id, 'conferma', spostato);
  else { closeSheet(); toast('Appuntamento aggiornato'); }
}

/* ---------- invio conferma / promemoria ---------- */
function sheetInvio(id, tipo, spostato) {
  const a = appt(id); if (!a) return;
  const c = cliente(a.clienteId) || {};
  const txt = compila(tipo === 'conferma' ? db.settings.msgConferma : db.settings.msgPromemoria, a);
  const inv = (a.inviato && a.inviato[tipo]) || {};
  const noLink = tipo === 'conferma' && !baseLink();
  openSheet(`
    <h3>${tipo === 'conferma' ? (spostato ? 'Appuntamento spostato' : 'Invia la conferma') : 'Invia il promemoria'}</h3>
    <p class="lead">A <b>${esc(c.nome)}</b>${c.tel ? ' · ' + esc(c.tel) : ''}<br>Tocca WhatsApp, invia, poi torna qui e tocca SMS.</p>
    <div class="preview">${esc(txt)}</div>
    ${!telValido(c.tel) ? `<div class="warnbox">⚠️ Manca il numero di cellulare di ${esc(c.nome)}.</div>
      <button class="btn pri block" data-cli="${c.id || ''}">📞 Aggiungi il numero</button>` : ''}
    ${noLink ? '<div class="warnbox">⚠️ Il link al calendario non è attivo (vedi Impostazioni). Il messaggio parte comunque senza link.</div>' : ''}
    <div class="stack">
      ${telValido(c.tel) ? `<a class="btn wa block ${inv.wa ? 'sent' : ''}" href="${waUrl(c.tel, txt)}" target="_blank" rel="noopener" data-sent="${tipo}:wa" data-id="${a.id}">${IC_WA} Invia su WhatsApp <span class="tick">✓</span></a>
      <a class="btn sms block ${inv.sms ? 'sent' : ''}" href="${smsUrl(c.tel, txt)}" data-sent="${tipo}:sms" data-id="${a.id}">${IC_SMS} Invia SMS <span class="tick">✓</span></a>` : ''}
      <button class="btn ghost block" data-act="chiudi">Fatto</button>
    </div>`);
}

/* ---------- dettaglio appuntamento ---------- */
function sheetDettaglio(id) {
  const a = appt(id); if (!a) return;
  const c = cliente(a.clienteId) || { nome: 'Cliente eliminato', tel: '' };
  const d = new Date(a.inizio);
  const iv = a.inviato || {};
  const fatto = (o) => [o && o.wa && 'WhatsApp', o && o.sms && 'SMS'].filter(Boolean).join(' + ') || '—';
  openSheet(`
    <h3>${esc(c.nome)}</h3>
    <p class="lead"><span class="chip ${a.stato}">${STATI[a.stato]}</span></p>
    <div class="kv"><span>Servizio</span><b>${esc(a.servizioNome)}</b></div>
    <div class="kv"><span>Quando</span><b>${cap(fmtData(d))}, ${fmtOra(d)}</b></div>
    <div class="kv"><span>Durata</span><b>${a.durata} min</b></div>
    <div class="kv"><span>Cellulare</span><b>${esc(c.tel)}</b></div>
    ${a.note ? `<div class="kv"><span>Note</span><b>${esc(a.note)}</b></div>` : ''}
    <div class="kv"><span>Conferma inviata</span><b>${fatto(iv.conferma)}</b></div>
    <div class="kv"><span>Promemoria inviato</span><b>${fatto(iv.promemoria)}</b></div>
    <div class="grid2" style="margin-top:16px">
      <button class="btn" data-act="invia" data-tipo="conferma" data-id="${a.id}">📩 Conferma</button>
      <button class="btn" data-act="invia" data-tipo="promemoria" data-id="${a.id}">🔔 Promemoria</button>
      ${a.stato === 'disdetto'
        ? `<button class="btn ok" data-act="ripristina" data-id="${a.id}" style="grid-column:span 2">↺ Ripristina appuntamento</button>`
        : `${a.stato !== 'confermato' ? `<button class="btn ok" data-act="conferma" data-id="${a.id}">✓ Confermato</button>` : `<button class="btn" data-act="ripristina" data-id="${a.id}">↺ Da confermare</button>`}
           <button class="btn ko" data-act="disdici" data-id="${a.id}">✕ Disdetto</button>`}
      <button class="btn ghost" data-act="modifica" data-id="${a.id}">✏️ Modifica</button>
      <button class="btn ghost" data-act="elimina" data-id="${a.id}" style="color:var(--ko)">🗑 Elimina</button>
    </div>`);
}

/* ---------- scheda cliente ---------- */
function sheetCliente(id) {
  const c = id ? cliente(id) : null;
  const storico = c ? db.appuntamenti.filter(a => a.clienteId === c.id).sort(byStart).reverse().slice(0, 8) : [];
  openSheet(`
    <h3>${c ? esc(c.nome) : 'Nuova cliente'}</h3>
    <label>Nome e cognome</label><input id="cNome" value="${esc(c ? c.nome : '')}">
    <label>Cellulare</label><input id="cTel" type="tel" inputmode="tel" value="${esc(c ? c.tel : '')}">
    ${window.BCRubrica && BCRubrica.pickerOk ? '<button class="btn ghost block small" data-rubrica="cTel" style="margin-top:8px">📇 Prendi dalla rubrica</button>' : ''}
    <label>Note</label><input id="cNote" value="${esc(c ? c.note || '' : '')}" placeholder="Allergie, preferenze…">
    <div class="section-t" style="margin-top:18px">Privacy</div>
    <label class="chk"><input type="checkbox" id="cPriv" ${c && c.privacy ? 'checked' : ''}>
      <span>Ha ricevuto l'informativa e dato il consenso al trattamento dei dati (anche allergie / pelle)${c && c.privacy ? `<small>dal ${fmtBreve(c.privacy)}</small>` : ''}</span></label>
    <label class="chk"><input type="checkbox" id="cMkt" ${c && c.marketing ? 'checked' : ''}>
      <span>Vuole ricevere offerte e promozioni${c && c.marketing ? `<small>dal ${fmtBreve(c.marketing)}</small>` : ''}</span></label>
    ${c && telValido(c.tel) && linkPrivacy() ? `<a class="btn ghost block small" href="${esc(waUrl(c.tel, msgPrivacy(c)))}" target="_blank" rel="noopener" style="margin-top:8px">📄 Manda l'informativa su WhatsApp</a>
      <p class="hint">Quando risponde OK, spunta qui sopra e salva.</p>` : ''}
    <button class="btn pri block" data-act="salvaCli" data-id="${c ? c.id : ''}" style="margin-top:16px">Salva</button>
    ${c ? `
      <div class="grid2">
        ${c.tel ? `<a class="btn wa" href="https://api.whatsapp.com/send?phone=${telIntl(c.tel)}" target="_blank" rel="noopener">${IC_WA} Scrivi</a>
        <a class="btn" href="tel:+${telIntl(c.tel)}">📞 Chiama</a>` : ''}
        <button class="btn" data-act="nuovoPer" data-id="${c.id}" style="grid-column:span 2">+ Nuovo appuntamento per lei</button>
      </div>
      ${storico.length ? `<div class="section-t">Ultimi appuntamenti</div>${storico.map(a => `<div class="kv"><span>${new Date(a.inizio).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: '2-digit' })} · ${esc(a.servizioNome)}</span><b class="chip ${a.stato}">${STATI[a.stato]}</b></div>`).join('')}` : ''}
      <button class="btn ghost block" data-act="delCli" data-id="${c.id}" style="margin-top:16px;color:var(--ko)">Elimina cliente</button>` : ''}`);
}

function salvaCli(id) {
  const nome = $('#cNome').value.trim().replace(/\s+/g, ' ');
  const tel = $('#cTel').value.trim();
  if (!nome) return toast('Scrivi il nome');
  if (tel && !telValido(tel)) return toast('Controlla il numero di cellulare');
  const doppio = db.clienti.find(x => x.nome.toLowerCase() === nome.toLowerCase() && x.id !== id);
  if (doppio) return toast('Esiste già una cliente con questo nome');
  const vecchio = id ? cliente(id) : {};
  const consensi = {
    privacy: $('#cPriv').checked ? (vecchio.privacy || oggiISO()) : '',
    marketing: $('#cMkt').checked ? (vecchio.marketing || oggiISO()) : ''
  };
  if (id) Object.assign(cliente(id), { nome, tel, note: $('#cNote').value.trim() }, consensi);
  else db.clienti.push({ id: uid(), nome, tel, note: $('#cNote').value.trim(), ...consensi });
  save(); closeSheet(); render(); toast('Cliente salvata');
}

/* ---------- backup ---------- */
function esporta() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `beauty-concept-backup-${dayKey(new Date())}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Backup salvato');
}
function importa(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!Array.isArray(d.appuntamenti) || !Array.isArray(d.clienti)) throw new Error();
      if (!confirm(`Caricare il backup? Sostituirà i dati attuali (${d.clienti.length} clienti, ${d.appuntamenti.length} appuntamenti).`)) return;
      const base = JSON.parse(JSON.stringify(DEFAULT));
      db = { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}) } };
      save(); render(); toast('Backup caricato ✓');
    } catch (e) { toast('File di backup non valido'); }
  };
  r.readAsText(file);
}

/* ---------- toast ---------- */
let toastT;
function toast(m) {
  const t = $('#toast'); t.textContent = m; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2300);
}

/* =========================================================
   EVENTI
   ========================================================= */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-tab],[data-day],[data-appt],[data-cli],[data-act],[data-sent]');
  if (!el) return;

  if (el.dataset.sent) { // registra l'invio, il link si apre normalmente
    const a = appt(el.dataset.id);
    if (a) {
      const [tipo, canale] = el.dataset.sent.split(':');
      a.inviato = a.inviato || {}; a.inviato[tipo] = a.inviato[tipo] || {};
      a.inviato[tipo][canale] = new Date().toISOString();
      save(); el.classList.add('sent');
      if (tab === 'ricordare') setTimeout(render, 600);
    }
    return;
  }
  if (el.dataset.tab) { tab = el.dataset.tab; if (tab === 'agenda') selDay = selDay || dayKey(new Date()); render(); window.scrollTo(0, 0); return; }
  if (el.dataset.day) { selDay = el.dataset.day; render(); return; }
  if (el.dataset.appt) { sheetDettaglio(el.dataset.appt); return; }
  if (el.dataset.cli) { sheetCliente(el.dataset.cli); return; }

  const id = el.dataset.id;
  switch (el.dataset.act) {
    case 'chiudi': closeSheet(); render(); break;
    case 'salvaAppt': salvaAppt(id); break;
    case 'invia': sheetInvio(id, el.dataset.tipo); break;
    case 'modifica': formAppt(appt(id)); break;
    case 'conferma': appt(id).stato = 'confermato'; save(); closeSheet(); render(); toast('Confermato ✓'); break;
    case 'disdici': appt(id).stato = 'disdetto'; save(); closeSheet(); render(); toast('Disdetto: il posto è libero'); break;
    case 'ripristina': appt(id).stato = 'prenotato'; save(); closeSheet(); render(); break;
    case 'elimina':
      if (confirm('Eliminare definitivamente questo appuntamento?')) {
        db.appuntamenti = db.appuntamenti.filter(a => a.id !== id); save(); closeSheet(); render(); toast('Eliminato');
      } break;
    case 'salvaCli': salvaCli(id); break;
    case 'nuovoPer': {
      const c = cliente(id); formAppt(null);
      $('#fNome').value = c.nome; $('#fTel').value = c.tel; break;
    }
    case 'delCli': {
      const n = db.appuntamenti.filter(a => a.clienteId === id).length;
      if (confirm(n ? `Eliminare la cliente e i suoi ${n} appuntamenti?` : 'Eliminare la cliente?')) {
        db.clienti = db.clienti.filter(c => c.id !== id);
        db.appuntamenti = db.appuntamenti.filter(a => a.clienteId !== id);
        save(); closeSheet(); render(); toast('Cliente eliminata');
      } break;
    }
    case 'addSrv': db.servizi.push({ id: uid(), nome: 'Nuovo servizio', durata: 30 }); save(); render(); break;
    case 'delSrv': db.servizi = db.servizi.filter(s => s.id !== id); save(); render(); break;
    case 'resetMsg':
      if (confirm('Ripristinare i testi originali dei messaggi?')) {
        db.settings.msgConferma = MSG_CONFERMA; db.settings.msgPromemoria = MSG_PROMEMORIA; save(); render(); toast('Testi ripristinati');
      } break;
    case 'export': esporta(); break;
    case 'filtroCli': filtroCli = id; render(); break;
  }
});

document.addEventListener('input', e => {
  if (e.target.id === 'cerca') {
    cerca = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const f = $('#cerca'); f.focus(); try { f.setSelectionRange(pos, pos); } catch (err) {}
  }
});
document.addEventListener('change', e => {
  if (e.target.id === 'jumpDate' && e.target.value) { selDay = e.target.value; render(); }
});

$('#fab').addEventListener('click', () => (tab === 'clienti' ? sheetCliente(null) : formAppt(null)));
$('#backdrop').addEventListener('click', () => { closeSheet(); render(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#sheet').classList.contains('on')) render(); });

/* ---------- collegamento con cloud.js (Firebase) ---------- */
window.BC = {
  getDb: () => db,
  setDb: d => { const base = JSON.parse(JSON.stringify(DEFAULT)); db = { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}) } }; },
  reset: () => { db = JSON.parse(JSON.stringify(DEFAULT)); },
  defaults: () => JSON.parse(JSON.stringify(DEFAULT)),
  save: () => save(),
  saveLocal: () => save(true),
  render: () => render(),
  toast: m => toast(m),
  vista: () => tab,
  onSave: null,
  afterRender: null
};

render();

if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

/* ---------- aggiornamento automatico ----------
   Controlla version.json su GitHub quando si torna sull'app e ogni 15 minuti.
   Se c'è una versione nuova si ricarica da sola, ma solo se non si sta scrivendo
   o compilando qualcosa; altrimenti mostra un avviso da toccare. */
let avvisoAgg = false;
function staLavorando() {
  const a = document.activeElement;
  return $('#sheet').classList.contains('on') || (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) || !!$('#login input:focus');
}
async function controllaAggiornamento() {
  if (!navigator.onLine || !/^https?:$/.test(location.protocol)) return;
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const { v } = await r.json();
    if (!v || v === VERSIONE) return;
    if (!staLavorando()) { aggiornaOra(); return; }
    if (avvisoAgg) return;
    avvisoAgg = true;
    const b = document.createElement('button');
    b.className = 'agg-banner';
    b.innerHTML = '✨ Nuova versione pronta · <b>tocca per aggiornare</b>';
    b.addEventListener('click', aggiornaOra);
    document.body.appendChild(b);
  } catch (e) { /* senza rete: riproverà */ }
}
function aggiornaOra() {
  if (window.BCAggiorna) window.BCAggiorna(); else location.reload();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) controllaAggiornamento(); });
setInterval(controllaAggiornamento, 15 * 60e3);
setTimeout(controllaAggiornamento, 5000);
