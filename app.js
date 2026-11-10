'use strict';
/* versione dell'app: deve coincidere con version.json */
const VERSIONE = '1.20';
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

const MSG_ATTESA = `Ciao {nome}! 🌸
Si è appena liberato un posto da {centro}:
📅 {data} alle {ora}

Ti interessa per {servizio}? Rispondimi appena puoi, il posto va a chi conferma per prima 😉`;

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
    msgAttesa: MSG_ATTESA,
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
  appuntamenti: [],
  attesa: []
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
    n: nomeMessaggio(c) || '',
    s: a.servizioNome,
    t: utcCompact(a.inizio),
    m: String(a.durata),
    c: db.settings.nome
  });
  if (db.settings.indirizzo) p.set('a', db.settings.indirizzo);
  if (db.settings.telefono) p.set('p', telIntl(db.settings.telefono));
  return base + '?' + p.toString();
}
/* nome da usare nei messaggi: riconosce i doppi nomi (Maria Grazia, Anna Maria…);
   si può sempre correggere nella scheda cliente ("Come chiamarla nei messaggi") */
const SECONDI_NOMI = new Set(('grazia giovanna maria teresa rosaria rosa luisa paola laura chiara elena lucia rita antonietta carmela ' +
  'assunta concetta cristina francesca vittoria angela beatrice elisa pia giulia carla stella sole letizia lorena loredana ' +
  'pina carmen gabriella giuseppina immacolata vincenza anna rachele serena chiara silvia sofia martina federica ' +
  'giovanni giuseppe luigi paolo antonio francesco carlo pietro andrea luca marco angelo alberto').split(' '));
function nomeMessaggio(c) {
  if (!c) return '';
  if (c.chiamata && c.chiamata.trim()) return c.chiamata.trim();
  const p = String(c.nome || '').trim().replace(/\(.*?\)/g, ' ').split(/\s+/).filter(Boolean);
  if (!p.length) return '';
  if (p.length >= 2 && SECONDI_NOMI.has(p[1].toLowerCase()) && /^[A-ZÀ-Ý]/.test(p[1])) return p[0] + ' ' + p[1];
  return p[0];
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
  const val = { nome: nomeMessaggio(c), centro: db.settings.nome, link };
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
    nome: nomeMessaggio(c),
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

/* ---------- lista d'attesa ---------- */
const FASCE = {
  qualsiasi: { nome: 'Qualsiasi orario', ok: () => true },
  mattina: { nome: 'Mattina (prima delle 13)', ok: h => h < 13 },
  pomeriggio: { nome: 'Pomeriggio (13–17)', ok: h => h >= 13 && h < 17 },
  sera: { nome: 'Tardo pomeriggio (dalle 17)', ok: h => h >= 17 }
};
const attesaAttive = () => (db.attesa || []).filter(x => x.stato !== 'sistemata');
function periodoTesto(x) {
  if (x.dal && x.al) return x.dal === x.al ? `il ${fmtBreve(x.dal)}` : `dal ${fmtBreve(x.dal)} al ${fmtBreve(x.al)}`;
  if (x.dal) return `dal ${fmtBreve(x.dal)}`;
  if (x.al) return `entro il ${fmtBreve(x.al)}`;
  return 'quando capita';
}
// clienti in attesa adatte a un posto libero (stesso servizio prima, poi le più vecchie)
function compatibili(slot) {
  const d = new Date(slot.inizio), k = dayKey(d), h = d.getHours();
  if (+d < Date.now()) return [];
  const norm = s => String(s || '').toLowerCase().trim();
  return attesaAttive()
    .filter(x => x.clienteId !== slot.clienteId)
    .filter(x => (!x.dal || x.dal <= k) && (!x.al || x.al >= k))
    .filter(x => (FASCE[x.fascia] || FASCE.qualsiasi).ok(h))
    .sort((x, y) => (norm(y.servizioNome) === norm(slot.servizioNome)) - (norm(x.servizioNome) === norm(slot.servizioNome)) || String(x.creato).localeCompare(String(y.creato)));
}

/* ---------- prezzi ---------- */
const euro = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n || 0);
const numero = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : null; };
function prezzoServizio(nome) {
  const s = db.servizi.find(x => x.nome.toLowerCase() === String(nome || '').toLowerCase());
  return s ? numero(s.prezzo) : null;
}
// prezzo di un appuntamento: quello scritto, poi quello del calendario importato (note), poi il listino
function prezzoAppt(a) {
  if (typeof a.prezzo === 'number') return a.prezzo;
  const nota = String(a.note || '');
  const tot = nota.match(/totale\s*€?\s*(\d+(?:[.,]\d+)?)/i);
  if (tot) return numero(tot[1]);
  const imp = [...nota.matchAll(/€\s?(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s?€/g)].map(m => numero(m[1] || m[2])).filter(n => n != null);
  if (imp.length) return imp.reduce((s, n) => s + n, 0);
  return prezzoServizio(a.servizioNome);
}

/* ---------- stato interfaccia ---------- */
let tab = 'agenda';
let selDay = dayKey(new Date());
let cerca = '';
let filtroCli = 'tutte';
let vistaCli = 'rubrica';
let vistaAg = (() => { try { return localStorage.getItem('beautyconcept.vista') || 'giorno'; } catch (e) { return 'giorno'; } })();
let inizioProposto = null;
const KEY_UI = 'beautyconcept.ui';
try { // dopo un aggiornamento si torna dove si era
  const u = JSON.parse(sessionStorage.getItem(KEY_UI) || 'null');
  if (u) { tab = u.tab || tab; vistaCli = u.vistaCli || vistaCli; selDay = u.selDay || selDay; filtroCli = u.filtroCli || filtroCli; }
} catch (e) { /* ignora */ }
function salvaUI() { try { sessionStorage.setItem(KEY_UI, JSON.stringify({ tab, vistaCli, selDay, filtroCli })); } catch (e) { /* ignora */ } }

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
  $('#fab').style.display = tab === 'impostazioni' || tab === 'incassi' ? 'none' : '';
  const v = $('#view');
  v.style.animation = 'none'; void v.offsetWidth; v.style.animation = '';
  v.innerHTML = ({ agenda: viewAgenda, ricordare: viewRicordare, clienti: viewClienti, incassi: viewIncassi, impostazioni: viewImpostazioni })[tab]();
  if (tab === 'agenda') { if (vistaAg === 'settimana') bindSettimana(); else centraGiorno(); }
  if (tab === 'impostazioni') bindImpostazioni();
  if (window.BC && window.BC.afterRender) window.BC.afterRender(tab);
  salvaUI();
}

function centraGiorno() {
  const strip = $('#days'), s = strip && $('.day.sel', strip);
  if (s) strip.scrollLeft = s.offsetLeft - strip.clientWidth / 2 + s.clientWidth / 2;
}

/* ---------- Agenda ---------- */
function viewAgenda() {
  const seg = `<div class="seg"><button class="${vistaAg === 'giorno' ? 'on' : ''}" data-act="vistaAg" data-id="giorno">Giorno</button><button class="${vistaAg === 'settimana' ? 'on' : ''}" data-act="vistaAg" data-id="settimana">Settimana</button></div>`;
  return seg + (vistaAg === 'settimana' ? viewSettimana() : viewGiorno());
}

/* ---------- vista settimana a griglia ---------- */
const PX_ORA = 56;
let wkInizioOra = 8;
function lunedi(k) { const d = parseDay(k); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }
function corsie(list) { // affianca gli appuntamenti che si sovrappongono
  const out = []; let gruppo = [], fineGr = 0;
  const chiudi = () => { const n = Math.max(...gruppo.map(x => x.lane)) + 1; gruppo.forEach(x => { x.n = n; }); gruppo = []; };
  list.forEach(a => {
    const s = +new Date(a.inizio), e = s + a.durata * 6e4;
    if (gruppo.length && s >= fineGr) chiudi();
    const usate = new Set(gruppo.filter(x => x.e > s).map(x => x.lane));
    let l = 0; while (usate.has(l)) l++;
    const x = { a, s, e, lane: l }; gruppo.push(x); out.push(x); fineGr = Math.max(fineGr, e);
  });
  if (gruppo.length) chiudi();
  return out;
}
function viewSettimana() {
  const lun = lunedi(selDay);
  const giorni = [...Array(7)].map((_, i) => { const d = new Date(lun); d.setDate(lun.getDate() + i); return d; });
  const fineSett = new Date(lun); fineSett.setDate(lun.getDate() + 7);
  const sett = db.appuntamenti.filter(a => a.stato !== 'disdetto' && +new Date(a.inizio) >= +lun && +new Date(a.inizio) < +fineSett);
  let hIni = 8, hFin = 20;
  sett.forEach(a => { const d = new Date(a.inizio); hIni = Math.min(hIni, d.getHours()); hFin = Math.max(hFin, Math.ceil((d.getHours() * 60 + d.getMinutes() + a.durata) / 60)); });
  hFin = Math.min(24, hFin); wkInizioOra = hIni;
  const altezza = (hFin - hIni) * PX_ORA;
  const ult = giorni[6], oggi = dayKey(new Date());
  const titolo = lun.getMonth() === ult.getMonth()
    ? `${lun.getDate()} – ${ult.getDate()} ${ult.toLocaleDateString('it-IT', { month: 'long' })}`
    : `${lun.getDate()} ${MESI[lun.getMonth()]} – ${ult.getDate()} ${MESI[ult.getMonth()]}`;
  const ora = new Date(), minOra = (ora.getHours() - hIni) * 60 + ora.getMinutes();
  return `
    <div class="pernav"><button data-act="settSposta" data-id="-7" aria-label="Settimana precedente">‹</button>
      <b>${esc(titolo)}</b><button data-act="settSposta" data-id="7" aria-label="Settimana successiva">›</button></div>
    <p class="sub" style="text-align:center;margin-top:-6px">${sett.length} appuntament${sett.length === 1 ? 'o' : 'i'} · tocca uno spazio vuoto per aggiungere, tieni premuto per spostare</p>
    <div class="wk">
      <div class="wk-ore" style="height:${altezza}px">${[...Array(hFin - hIni)].map((_, i) => `<span style="top:${i * PX_ORA}px">${pad(hIni + i)}</span>`).join('')}</div>
      ${giorni.map(d => {
        const k = dayKey(d);
        const lista = corsie(sett.filter(a => dayKey(new Date(a.inizio)) === k).sort(byStart));
        return `<div class="wk-giorno">
          <button class="wk-testa ${k === oggi ? 'oggi' : ''}" data-act="apriGiorno" data-id="${k}"><small>${d.toLocaleDateString('it-IT', { weekday: 'short' }).replace('.', '')}</small><b>${d.getDate()}</b></button>
          <div class="wk-corpo" data-wbody="${k}" style="height:${altezza}px;background-size:100% ${PX_ORA}px">
            ${k === oggi && minOra > 0 && minOra < (hFin - hIni) * 60 ? `<i class="wk-ora" style="top:${minOra / 60 * PX_ORA}px"></i>` : ''}
            ${lista.map(x => {
              const di = new Date(x.a.inizio), c = cliente(x.a.clienteId) || { nome: '?' };
              const top = ((di.getHours() - hIni) * 60 + di.getMinutes()) / 60 * PX_ORA;
              const h = Math.max(22, x.a.durata / 60 * PX_ORA - 2);
              return `<div class="wk-ev ${x.a.stato}" data-wev="${x.a.id}" style="top:${top}px;height:${h}px;left:calc(${x.lane / x.n * 100}% + 1px);width:calc(${100 / x.n}% - 2px)">
                <b>${fmtOra(di)}</b><span>${esc(c.nome.split(' ')[0])}</span>${h > 40 ? `<small>${esc(x.a.servizioNome)}</small>` : ''}</div>`;
            }).join('')}
          </div></div>`;
      }).join('')}
    </div>`;
}

/* tocchi e trascinamento nella settimana */
function bindSettimana() {
  const minDa = (corpo, y) => { const r = corpo.getBoundingClientRect(); return Math.max(0, Math.round(((y - r.top) / PX_ORA * 60) / 15) * 15); };
  const quando = (k, min) => { const d = parseDay(k); d.setHours(wkInizioOra, 0, 0, 0); d.setMinutes(d.getMinutes() + min); return d; };
  let drag = null, timer = null, appenaTrascinato = false;

  // tocco su spazio vuoto = nuovo appuntamento a quell'ora
  $$('.wk-corpo').forEach(corpo => corpo.addEventListener('click', e => {
    if (e.target !== corpo || appenaTrascinato) return;
    selDay = corpo.dataset.wbody;
    inizioProposto = quando(corpo.dataset.wbody, minDa(corpo, e.clientY));
    formAppt(null);
  }));

  const fine = () => { clearTimeout(timer); timer = null; };
  const iniziaDrag = (ev, x, y) => {
    const a = appt(ev.dataset.wev); if (!a) return;
    const r = ev.getBoundingClientRect();
    drag = { ev, a, offY: y - r.top, k: null, min: null };
    ev.classList.add('wk-drag');
    const fantasma = ev.cloneNode(true); fantasma.classList.add('wk-fantasma'); fantasma.removeAttribute('data-wev');
    drag.fantasma = fantasma;
    if (navigator.vibrate) try { navigator.vibrate(15); } catch (e) {}
    muovi(x, y);
  };
  const muovi = (x, y) => {
    if (!drag) return;
    const sotto = document.elementsFromPoint(x, y).find(el => el.classList && el.classList.contains('wk-corpo'));
    if (!sotto) return;
    const min = minDa(sotto, y - drag.offY);
    drag.k = sotto.dataset.wbody; drag.min = min;
    const f = drag.fantasma;
    if (f.parentNode !== sotto) sotto.appendChild(f);
    f.style.top = (min / 60 * PX_ORA) + 'px'; f.style.left = '1px'; f.style.width = 'calc(100% - 2px)';
    const d = quando(drag.k, min);
    f.querySelector('b').textContent = fmtOra(d);
  };
  const rilascia = () => {
    fine();
    if (!drag) return;
    const { a, k, min, ev, fantasma } = drag; drag = null;
    ev.classList.remove('wk-drag'); fantasma.remove();
    appenaTrascinato = true; setTimeout(() => { appenaTrascinato = false; }, 400);
    if (k == null) return;
    const nuovo = quando(k, min);
    if (+nuovo === +new Date(a.inizio)) return;
    chiediSposta(a.id, nuovo);
  };

  $$('.wk-ev').forEach(ev => {
    ev.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      const x0 = e.clientX, y0 = e.clientY, tipo = e.pointerType;
      const pid = e.pointerId;
      if (tipo === 'mouse') {
        const mm = m => { if (!drag && Math.hypot(m.clientX - x0, m.clientY - y0) > 5) iniziaDrag(ev, x0, y0); muovi(m.clientX, m.clientY); };
        const mu = () => { document.removeEventListener('pointermove', mm); document.removeEventListener('pointerup', mu); rilascia(); };
        document.addEventListener('pointermove', mm); document.addEventListener('pointerup', mu);
      } else {
        timer = setTimeout(() => { timer = null; try { ev.setPointerCapture(pid); } catch (x) {} iniziaDrag(ev, x0, y0); }, 380);
      }
    });
    ev.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') { if (timer && Math.hypot(e.movementX, e.movementY) > 6) fine(); if (drag) muovi(e.clientX, e.clientY); } });
    ev.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') rilascia(); });
    ev.addEventListener('pointercancel', () => { fine(); if (drag) { drag.ev.classList.remove('wk-drag'); drag.fantasma.remove(); drag = null; } });
    ev.addEventListener('contextmenu', e => e.preventDefault());
    ev.addEventListener('click', e => { e.stopPropagation(); if (!appenaTrascinato && !drag) sheetDettaglio(ev.dataset.wev); });
  });
  // mentre si trascina con il dito, la pagina non deve scorrere
  if (!window.__wkTouch) {
    window.__wkTouch = true;
    document.addEventListener('touchmove', e => { if (document.querySelector('.wk-drag')) e.preventDefault(); }, { passive: false });
  }
}
function chiediSposta(id, nuovo) {
  const a = appt(id); if (!a) return;
  const c = cliente(a.clienteId) || {};
  const over = sovrapposizioni(nuovo.toISOString(), a.durata, a.id);
  openSheet(`
    <h3>Spostare l'appuntamento?</h3>
    <p class="lead"><b>${esc(c.nome || '')}</b> · ${esc(a.servizioNome)}</p>
    <div class="kv"><span>Da</span><b>${cap(fmtData(new Date(a.inizio)))}, ${fmtOra(new Date(a.inizio))}</b></div>
    <div class="kv"><span>A</span><b>${cap(fmtData(nuovo))}, ${fmtOra(nuovo)}</b></div>
    ${over.length ? `<div class="warnbox">⚠️ Si sovrappone a: ${over.map(x => `${fmtOra(new Date(x.inizio))} ${esc((cliente(x.clienteId) || {}).nome || '')}`).join(', ')}</div>` : ''}
    <button class="btn pri block" data-act="confermaSposta" data-id="${a.id}" data-quando="${nuovo.toISOString()}" style="margin-top:16px">Sposta e avvisa la cliente</button>
    <button class="btn ghost block" data-act="chiudi" style="margin-top:8px">Annulla</button>`);
}

function viewGiorno() {
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
  const nAtt = attesaAttive().length;
  const sel = `<div class="seg"><button class="${vistaCli === 'rubrica' ? 'on' : ''}" data-act="vistaCli" data-id="rubrica">Rubrica</button><button class="${vistaCli === 'attesa' ? 'on' : ''}" data-act="vistaCli" data-id="attesa">Lista d'attesa${nAtt ? ` <small>${nAtt}</small>` : ''}</button></div>`;
  if (vistaCli === 'attesa') return sel + viewAttesa();
  return sel + `
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

function viewAttesa() {
  const list = attesaAttive().sort((x, y) => String(x.creato).localeCompare(String(y.creato)));
  return `
    <div class="h2">Lista d'attesa</div>
    <p class="sub">Clienti che vorrebbero un posto prima. Quando segni un appuntamento come <b>Disdetto</b>, l'app ti propone subito quelle adatte.</p>
    ${list.length ? list.map(x => {
      const c = cliente(x.clienteId) || { nome: 'Cliente eliminata' };
      return `<button class="card att" data-act="editAttesa" data-id="${x.id}">
        <div class="att-top"><b>${esc(c.nome)}</b><span class="chip prenotato">⏳ ${esc(periodoTesto(x))}</span></div>
        <div class="att-info">${esc(x.servizioNome || 'Qualsiasi servizio')} · ${esc((FASCE[x.fascia] || FASCE.qualsiasi).nome)}</div>
        ${x.note ? `<div class="att-note">${esc(x.note)}</div>` : ''}
      </button>`;
    }).join('') : `<div class="empty"><div class="ic">⏳</div>Nessuna cliente in attesa.<br>Tocca <b>+</b> per aggiungerne una.</div>`}`;
}

/* ---------- Incassi ---------- */
let statPer = 'mese', statRif = new Date();
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
function periodo(per, rif) {
  const d = new Date(rif); d.setHours(0, 0, 0, 0);
  let ini, fine, nome;
  if (per === 'giorno') { ini = d; fine = new Date(d); fine.setDate(d.getDate() + 1); nome = cap(fmtData(d)); }
  else if (per === 'settimana') {
    ini = new Date(d); ini.setDate(d.getDate() - ((d.getDay() + 6) % 7)); fine = new Date(ini); fine.setDate(ini.getDate() + 7);
    const ult = new Date(fine); ult.setDate(fine.getDate() - 1);
    nome = `${ini.getDate()} ${MESI[ini.getMonth()]} – ${ult.getDate()} ${MESI[ult.getMonth()]}`;
  } else if (per === 'mese') { ini = new Date(d.getFullYear(), d.getMonth(), 1); fine = new Date(d.getFullYear(), d.getMonth() + 1, 1); nome = cap(ini.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })); }
  else { ini = new Date(d.getFullYear(), 0, 1); fine = new Date(d.getFullYear() + 1, 0, 1); nome = String(d.getFullYear()); }
  return { ini, fine, nome };
}
function spostaPeriodo(per, rif, n) {
  const d = new Date(rif);
  if (per === 'giorno') d.setDate(d.getDate() + n);
  else if (per === 'settimana') d.setDate(d.getDate() + 7 * n);
  else if (per === 'mese') d.setMonth(d.getMonth() + n, 1);
  else d.setFullYear(d.getFullYear() + n);
  return d;
}
function calcola(ini, fine) {
  const ora = Date.now();
  const tutti = db.appuntamenti.filter(a => { const t = +new Date(a.inizio); return t >= +ini && t < +fine; });
  const attivi = tutti.filter(a => a.stato !== 'disdetto');
  let incassato = 0, previsto = 0, conPrezzo = 0, senzaPrezzo = 0;
  attivi.forEach(a => {
    const p = prezzoAppt(a);
    if (p == null) { senzaPrezzo++; return; }
    if (+new Date(a.inizio) <= ora) { incassato += p; conPrezzo++; } else previsto += p;
  });
  return { tutti, attivi, incassato, previsto, conPrezzo, senzaPrezzo, disdetti: tutti.length - attivi.length };
}
function viewIncassi() {
  const { ini, fine, nome } = periodo(statPer, statRif);
  const r = calcola(ini, fine);
  const prec = periodo(statPer, spostaPeriodo(statPer, statRif, -1));
  const rp = calcola(prec.ini, prec.fine);
  const totale = r.incassato + r.previsto, totPrec = rp.incassato + rp.previsto;
  const varia = totPrec > 0 ? Math.round((totale - totPrec) / totPrec * 100) : null;
  const medio = r.conPrezzo ? r.incassato / r.conPrezzo : 0;
  const percDisd = r.tutti.length ? Math.round(r.disdetti / r.tutti.length * 100) : 0;
  const clientiUniche = new Set(r.attivi.map(a => a.clienteId)).size;
  const ora = Date.now();

  // barre: giorni della settimana/mese, mesi dell'anno
  let barre = [];
  if (statPer === 'settimana' || statPer === 'mese') {
    for (let d = new Date(ini); d < fine; d.setDate(d.getDate() + 1)) barre.push({ k: dayKey(d), et: statPer === 'settimana' ? d.toLocaleDateString('it-IT', { weekday: 'short' }).replace('.', '') : String(d.getDate()), tit: cap(fmtData(d)), fatto: 0, prev: 0 });
    r.attivi.forEach(a => { const b = barre.find(x => x.k === dayKey(new Date(a.inizio))); const p = prezzoAppt(a); if (b && p != null) { if (+new Date(a.inizio) <= ora) b.fatto += p; else b.prev += p; } });
  } else if (statPer === 'anno') {
    barre = MESI.map((m, i) => ({ k: i, et: m, tit: cap(new Date(ini.getFullYear(), i, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })), fatto: 0, prev: 0 }));
    r.attivi.forEach(a => { const d = new Date(a.inizio), p = prezzoAppt(a); if (p != null) { if (+d <= ora) barre[d.getMonth()].fatto += p; else barre[d.getMonth()].prev += p; } });
  }
  const max = Math.max(1, ...barre.map(b => b.fatto + b.prev));
  const haPrev = barre.some(b => b.prev > 0);

  // servizi e clienti migliori
  const perSrv = {}, perCli = {};
  r.attivi.forEach(a => {
    const pv = prezzoAppt(a), p = pv || 0;
    const s = perSrv[a.servizioNome] = perSrv[a.servizioNome] || { n: 0, e: 0, conP: false }; s.n++; s.e += p; if (pv != null) s.conP = true;
    const c = perCli[a.clienteId] = perCli[a.clienteId] || { n: 0, e: 0 }; c.n++; c.e += p;
  });
  const topSrv = Object.entries(perSrv).sort((x, y) => y[1].e - x[1].e || y[1].n - x[1].n).slice(0, 6);
  const maxSrv = Math.max(1, ...topSrv.map(x => x[1].e));
  const topCli = Object.entries(perCli).sort((x, y) => y[1].e - x[1].e || y[1].n - x[1].n).slice(0, 5);

  return `
    <div class="h2">Incassi</div>
    <div class="seg seg4">${[['giorno', 'Giorno'], ['settimana', 'Settimana'], ['mese', 'Mese'], ['anno', 'Anno']].map(([k, n]) => `<button class="${statPer === k ? 'on' : ''}" data-act="statPer" data-id="${k}">${n}</button>`).join('')}</div>
    <div class="pernav"><button data-act="statSposta" data-id="-1" aria-label="Periodo precedente">‹</button><b>${esc(nome)}</b><button data-act="statSposta" data-id="1" aria-label="Periodo successivo">›</button></div>

    <div class="hero card">
      <small>Totale del periodo</small>
      <div class="hero-n">${euro(totale)}</div>
      <div class="hero-sub">${euro(r.incassato)} incassati${r.previsto ? ` · ${euro(r.previsto)} ancora da fare` : ''}</div>
      ${varia != null ? `<div class="hero-var ${varia >= 0 ? 'su' : 'giu'}">${varia >= 0 ? '▲' : '▼'} ${Math.abs(varia)}% rispetto al periodo prima</div>` : ''}
    </div>
    <div class="kpi">
      <div class="card"><small>Appuntamenti</small><b>${r.attivi.length}</b></div>
      <div class="card"><small>Clienti</small><b>${clientiUniche}</b></div>
      <div class="card"><small>Scontrino medio</small><b>${medio ? euro(Math.round(medio)) : '—'}</b></div>
      <div class="card"><small>Disdette</small><b>${r.disdetti}${r.tutti.length ? ` <em>${percDisd}%</em>` : ''}</b></div>
    </div>
    ${r.senzaPrezzo ? `<div class="warnbox">💶 ${r.senzaPrezzo} appuntament${r.senzaPrezzo === 1 ? 'o' : 'i'} senza prezzo, non contat${r.senzaPrezzo === 1 ? 'o' : 'i'} nel totale. Imposta i prezzi in <b>Impostazioni → Servizi</b>.
      <button class="btn small ghost block" data-tab="impostazioni" style="margin-top:8px">Vai ai prezzi dei servizi</button></div>` : ''}

    ${barre.length ? `<div class="section-t">Andamento</div>
    <div class="card grafico">
      <div class="bars ${barre.length > 12 ? 'fitte' : ''}">${barre.map(b => `<button class="bar" data-act="barra" data-id="${esc(b.tit)}: ${euro(b.fatto + b.prev)}${b.prev ? ` (di cui ${euro(b.prev)} prenotati)` : ''}">
        <span class="col"><i class="prev" style="height:${b.prev / max * 100}%"></i><i class="fatto" style="height:${b.fatto / max * 100}%"></i></span>
        <span class="et">${esc(b.et)}</span></button>`).join('')}</div>
      <div class="legenda"><span><i class="fatto"></i>Incassato</span>${haPrev ? '<span><i class="prev"></i>Prenotato</span>' : ''}<span class="mut">Tocca una barra per il valore</span></div>
    </div>` : ''}

    ${statPer === 'giorno' && r.tutti.length ? `<div class="section-t">Appuntamenti del giorno</div>
      <div class="card">${r.tutti.sort(byStart).map(a => `<div class="kv ${a.stato === 'disdetto' ? 'barrato' : ''}"><span>${fmtOra(new Date(a.inizio))} · ${esc((cliente(a.clienteId) || {}).nome || '')} · ${esc(a.servizioNome)}</span><b>${prezzoAppt(a) != null ? euro(prezzoAppt(a)) : '—'}</b></div>`).join('')}</div>` : ''}

    ${topSrv.length ? `<div class="section-t">Servizi che rendono di più</div>
    <div class="card">${topSrv.map(([n, v]) => `<div class="hb"><div class="hb-t"><span>${esc(n)} <small>×${v.n}</small></span><b>${v.conP ? euro(v.e) : '—'}</b></div><div class="hb-b"><i style="width:${v.e / maxSrv * 100}%"></i></div></div>`).join('')}</div>` : ''}

    ${topCli.length ? `<div class="section-t">Clienti migliori</div>
    <div class="card">${topCli.map(([id, v], i) => `<button class="kv kvb" data-cli="${id}"><span>${i + 1}. ${esc((cliente(id) || {}).nome || 'Cliente eliminata')} <small>· ${v.n} appuntament${v.n === 1 ? 'o' : 'i'}</small></span><b>${euro(v.e)}</b></button>`).join('')}</div>` : ''}

    ${!r.tutti.length ? `<div class="empty"><div class="ic">💶</div>Nessun appuntamento in questo periodo.</div>` : ''}
    <p class="hint" style="text-align:center;margin-top:16px">I totali sono calcolati dai prezzi degli appuntamenti (o del listino servizi). Le disdette non sono contate.</p>`;
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
      ${linkPrivacy() ? `<button class="btn ghost block small" data-act="vediPrivacy" style="margin-top:12px">📄 Vedi l'informativa</button>` : ''}
      <p class="hint">Testo standard per centri estetici: fallo controllare dal vostro consulente o commercialista. ${(() => { const n = db.clienti.filter(c => !c.privacy).length; return n ? `<br><b>${n}</b> client${n === 1 ? 'e' : 'i'} senza consenso: le trovi in Clienti → "Senza consenso privacy".` : ''; })()}</p>
    </div>

    <div class="section-t">Servizi</div>
    <div class="card" id="servizi">
      ${db.servizi.map(x => `<div class="srv2">
        <input class="n" data-srv="${x.id}" data-k="nome" value="${esc(x.nome)}" placeholder="Nome servizio">
        <label class="mini"><input data-srv="${x.id}" data-k="durata" type="number" inputmode="numeric" value="${x.durata}" min="5" step="5"><span>min</span></label>
        <label class="mini"><span>€</span><input data-srv="${x.id}" data-k="prezzo" type="text" inputmode="decimal" value="${x.prezzo ?? ''}" placeholder="prezzo"></label>
        <button data-act="delSrv" data-id="${x.id}" aria-label="Elimina">✕</button></div>`).join('')}
      <p class="hint">Nome, durata in minuti e prezzo. Il prezzo si propone da solo nei nuovi appuntamenti e serve per gli Incassi.</p>
      <button class="btn ghost block" data-act="addSrv" style="margin-top:10px">+ Aggiungi servizio</button>
    </div>

    <div class="section-t">Messaggi</div>
    <div class="card">
      <label style="margin-top:2px">Conferma (inviata appena prendi l'appuntamento)</label>
      <textarea data-set="msgConferma">${esc(s.msgConferma)}</textarea>
      <label>Promemoria (dalla sezione "Da ricordare")</label>
      <textarea data-set="msgPromemoria">${esc(s.msgPromemoria)}</textarea>
      <label>Posto libero (alle clienti in lista d'attesa)</label>
      <textarea data-set="msgAttesa">${esc(s.msgAttesa)}</textarea>
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
    s[el.dataset.k] = el.dataset.k === 'durata' ? Math.max(5, Number(el.value) || 30) : el.dataset.k === 'prezzo' ? numero(el.value) : el.value;
    clearTimeout(t); t = setTimeout(save, 300);
  }));
  $('#importFile').addEventListener('change', e => importa(e.target.files[0]));
}

/* =========================================================
   PANNELLI (dal basso)
   ========================================================= */
/* tastiera del telefono: il pannello si alza sopra la tastiera e il campo attivo resta in vista */
function adattaTastiera() {
  const vv = window.visualViewport; if (!vv) return;
  const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
  const r = document.documentElement.style;
  r.setProperty('--kb', kb + 'px');
  r.setProperty('--vvh', Math.round(vv.height) + 'px');
  document.body.classList.toggle('tastiera', kb > 80);
}
if (window.visualViewport) {
  visualViewport.addEventListener('resize', adattaTastiera);
  visualViewport.addEventListener('scroll', adattaTastiera);
  adattaTastiera();
}
document.addEventListener('focusin', e => {
  const el = e.target;
  if (!el.closest || !el.closest('#sheet') || !/INPUT|TEXTAREA|SELECT/.test(el.tagName)) return;
  [150, 450].forEach(t => setTimeout(() => { try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (x) { el.scrollIntoView(); } }, t));
});

/* tasto/gesto Indietro del telefono: chiude il pannello aperto, poi torna all'Agenda */
let ignoraPop = 0;
const statoStoria = () => (history.state && history.state.bc) || null;
function openSheet(html) {
  const s = $('#sheet');
  const giaAperto = s.classList.contains('on');
  s.innerHTML = '<button class="sheet-x" data-act="chiudi" aria-label="Chiudi">✕</button><div class="grab" data-act="chiudi"></div>' + html;
  s.scrollTop = 0;
  s.classList.add('on'); $('#backdrop').classList.add('on');
  if (!giaAperto && statoStoria() !== 'sheet') history.pushState({ bc: 'sheet' }, '');
}
function closeSheet(daIndietro) {
  const s = $('#sheet');
  const eraAperto = s.classList.contains('on');
  s.classList.remove('on'); $('#backdrop').classList.remove('on');
  if (eraAperto && !daIndietro && statoStoria() === 'sheet') { ignoraPop++; history.back(); }
}
function vaiTab(nuova) {
  tab = nuova;
  if (tab !== 'agenda' && statoStoria() !== 'tab') history.pushState({ bc: 'tab' }, '');
  else if (tab === 'agenda' && statoStoria() === 'tab') { ignoraPop++; history.back(); }
}
window.addEventListener('popstate', () => {
  if (ignoraPop) { ignoraPop--; return; }
  if ($('#sheet').classList.contains('on')) { closeSheet(true); render(); return; }
  if (tab !== 'agenda') { tab = 'agenda'; render(); window.scrollTo(0, 0); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#sheet').classList.contains('on')) { closeSheet(); render(); } });

/* ---------- nuovo / modifica appuntamento ---------- */
function defaultStart() {
  if (inizioProposto) { const p = inizioProposto; inizioProposto = null; return p; }
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
    <div class="row">
      <div><label>Durata (minuti)</label><input id="fDur" type="number" inputmode="numeric" min="5" step="5" value="${durata}"></div>
      <div><label>Prezzo (€)</label><input id="fPrezzo" type="text" inputmode="decimal" placeholder="—" value="${a ? (prezzoAppt(a) ?? '') : (numero((db.servizi[0] || {}).prezzo) ?? '')}"></div>
    </div>
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
    if (s) { $('#fDur').value = s.durata; $('#fPrezzo').value = numero(s.prezzo) ?? ''; } else $('#fSrvAltro').focus();
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
    const pz = numero($('#fPrezzo').value); if (pz == null) delete a.prezzo; else a.prezzo = pz;
    if (spostato) { a.stato = 'prenotato'; a.inviato = {}; }
  } else {
    a = { id: uid(), clienteId: c.id, servizioNome, inizio, durata, note: $('#fNote').value.trim(), stato: 'prenotato', inviato: {}, creato: new Date().toISOString() };
    const pz = numero($('#fPrezzo').value); if (pz != null) a.prezzo = pz;
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
    ${c.id ? `<button class="linkbtn" data-cli="${c.id}">✏️ Nel messaggio la chiamo "${esc(nomeMessaggio(c))}": cambia</button>` : ''}
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
    ${prezzoAppt(a) != null ? `<div class="kv"><span>Prezzo</span><b>${euro(prezzoAppt(a))}</b></div>` : ''}
    <div class="kv"><span>Cellulare</span><b>${esc(c.tel)}</b></div>
    ${a.note ? `<div class="kv"><span>Note</span><b>${esc(a.note)}</b></div>` : ''}
    <div class="kv"><span>Conferma inviata</span><b>${fatto(iv.conferma)}</b></div>
    <div class="kv"><span>Promemoria inviato</span><b>${fatto(iv.promemoria)}</b></div>
    <div class="grid2" style="margin-top:16px">
      <button class="btn" data-act="invia" data-tipo="conferma" data-id="${a.id}">📩 Conferma</button>
      <button class="btn" data-act="invia" data-tipo="promemoria" data-id="${a.id}">🔔 Promemoria</button>
      ${a.stato === 'disdetto'
        ? `<button class="btn ok" data-act="ripristina" data-id="${a.id}" style="grid-column:span 2">↺ Ripristina appuntamento</button>
           ${+new Date(a.inizio) > Date.now() ? `<button class="btn pri" data-act="proponi" data-id="${a.id}" style="grid-column:span 2">⏳ Proponi il posto alla lista d'attesa</button>` : ''}`
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
    <label>Come chiamarla nei messaggi</label><input id="cChiamata" value="${esc(c ? c.chiamata || '' : '')}" placeholder="${esc(c ? nomeMessaggio({ nome: c.nome }) : 'Es. Maria Grazia')}" autocapitalize="words">
    <p class="hint">Se lo lasci vuoto usa: <b id="cChiamataAuto">${esc(c ? nomeMessaggio({ nome: c.nome }) : '—')}</b>. Scrivilo tu per i doppi nomi o i soprannomi (es. "Mariagrazia", "Giò").</p>
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
        <button class="btn ghost" data-act="nuovaAttesa" data-id="${c.id}" style="grid-column:span 2">⏳ Metti in lista d'attesa</button>
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
  const chiamata = $('#cChiamata').value.trim().replace(/\s+/g, ' ');
  if (id) Object.assign(cliente(id), { nome, tel, note: $('#cNote').value.trim(), chiamata }, consensi);
  else db.clienti.push({ id: uid(), nome, tel, note: $('#cNote').value.trim(), chiamata, ...consensi });
  save(); closeSheet(); render(); toast('Cliente salvata');
}

/* ---------- lista d'attesa: inserimento e proposta posto ---------- */
function formAttesa(x, clienteId) {
  const c = x ? cliente(x.clienteId) : (clienteId ? cliente(clienteId) : null);
  const srvId = x ? ((db.servizi.find(s => s.nome === x.servizioNome) || {}).id || (x.servizioNome ? '__altro' : '__qualsiasi')) : '__qualsiasi';
  openSheet(`
    <h3>${x ? 'Modifica attesa' : 'Aggiungi alla lista d\'attesa'}</h3>
    <label>Cliente</label>
    <input id="wNome" list="dlClientiW" autocomplete="off" placeholder="Nome e cognome" value="${esc(c ? c.nome : '')}">
    <datalist id="dlClientiW">${db.clienti.map(y => `<option value="${esc(y.nome)}">`).join('')}</datalist>
    <label>Cellulare</label>
    <input id="wTel" type="tel" inputmode="tel" placeholder="333 1234567" value="${esc(c ? c.tel : '')}">
    <label>Servizio desiderato</label>
    <select id="wSrv">
      <option value="__qualsiasi" ${srvId === '__qualsiasi' ? 'selected' : ''}>Qualsiasi</option>
      ${db.servizi.map(s => `<option value="${s.id}" ${s.id === srvId ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}
      <option value="__altro" ${srvId === '__altro' ? 'selected' : ''}>Altro…</option>
    </select>
    <input id="wSrvAltro" placeholder="Scrivi il servizio" style="margin-top:8px;${srvId === '__altro' ? '' : 'display:none'}" value="${esc(srvId === '__altro' ? x.servizioNome : '')}">
    <div class="row">
      <div><label>Dal giorno (facoltativo)</label><input id="wDal" type="date" value="${x ? x.dal || '' : oggiISO()}"></div>
      <div><label>Al giorno (facoltativo)</label><input id="wAl" type="date" value="${x ? x.al || '' : ''}"></div>
    </div>
    <label>Fascia oraria</label>
    <select id="wFascia">${Object.entries(FASCE).map(([k, v]) => `<option value="${k}" ${(x ? x.fascia : 'qualsiasi') === k ? 'selected' : ''}>${v.nome}</option>`).join('')}</select>
    <label>Note (facoltative)</label>
    <input id="wNote" placeholder="Es. solo il sabato" value="${esc(x ? x.note || '' : '')}">
    <button class="btn pri block" data-act="salvaAttesa" data-id="${x ? x.id : ''}" style="margin-top:18px">${x ? 'Salva' : 'Aggiungi alla lista'}</button>
    ${x ? `<div class="grid2">
      <button class="btn ok" data-act="attesaFatta" data-id="${x.id}">✓ Sistemata</button>
      <button class="btn ghost" data-act="delAttesa" data-id="${x.id}" style="color:var(--ko)">🗑 Togli</button></div>` : ''}`);
  const wNome = $('#wNome'), wTel = $('#wTel');
  wNome.addEventListener('input', () => { const m = db.clienti.find(y => y.nome.toLowerCase() === wNome.value.trim().toLowerCase()); if (m) wTel.value = m.tel; });
  $('#wSrv').addEventListener('change', e => { $('#wSrvAltro').style.display = e.target.value === '__altro' ? '' : 'none'; });
}
function salvaAttesa(id) {
  const nome = $('#wNome').value.trim().replace(/\s+/g, ' ');
  const tel = $('#wTel').value.trim();
  if (!nome) return toast('Scrivi il nome della cliente');
  if (tel && !telValido(tel)) return toast('Controlla il numero di cellulare');
  const sv = $('#wSrv').value;
  const s = db.servizi.find(y => y.id === sv);
  const servizioNome = sv === '__qualsiasi' ? '' : (s ? s.nome : $('#wSrvAltro').value.trim());
  const dal = $('#wDal').value, al = $('#wAl').value;
  if (dal && al && al < dal) return toast('La data finale è prima di quella iniziale');
  let c = db.clienti.find(y => y.nome.toLowerCase() === nome.toLowerCase());
  if (!c) { c = { id: uid(), nome, tel, note: '' }; db.clienti.push(c); }
  else if (tel) c.tel = tel;
  db.attesa = db.attesa || [];
  const dati = { clienteId: c.id, servizioNome, dal, al, fascia: $('#wFascia').value, note: $('#wNote').value.trim() };
  if (id) Object.assign(db.attesa.find(y => y.id === id), dati);
  else db.attesa.push({ id: uid(), ...dati, stato: 'attiva', creato: new Date().toISOString(), offerte: {} });
  save(); closeSheet(); tab = 'clienti'; vistaCli = 'attesa'; render(); toast(id ? 'Salvato' : 'Aggiunta alla lista d\'attesa ⏳');
}

function proponiPosto(apptId) {
  const slot = appt(apptId); if (!slot) return;
  const d = new Date(slot.inizio);
  const cand = compatibili(slot);
  openSheet(`
    <h3>Si è liberato un posto</h3>
    <p class="lead"><b>${cap(fmtData(d))}, ${fmtOra(d)}</b> · ${slot.durata} min<br>${esc(slot.servizioNome)} di ${esc((cliente(slot.clienteId) || {}).nome || '')} è stato disdetto.</p>
    ${cand.length ? `<p class="lead" style="margin-top:-4px">Clienti in lista d'attesa adatte (${cand.length}). Scrivi a una o più, poi <b>Assegna</b> il posto a chi conferma.</p>
      ${cand.map(x => {
        const c = cliente(x.clienteId) || {};
        const finto = { clienteId: x.clienteId, servizioNome: x.servizioNome || slot.servizioNome, inizio: slot.inizio, durata: slot.durata };
        const txt = compila(db.settings.msgAttesa || MSG_ATTESA, finto);
        const giaScritto = x.offerte && x.offerte[slot.id];
        return `<div class="card prop">
          <div class="att-top"><b>${esc(c.nome)}</b>${giaScritto ? '<span class="chip confermato">Scritto ✓</span>' : ''}</div>
          <div class="att-info">${esc(x.servizioNome || 'Qualsiasi servizio')} · ${esc(periodoTesto(x))}${x.note ? ' · ' + esc(x.note) : ''}</div>
          <div class="grid2">
            ${telValido(c.tel) ? `<a class="btn wa small" href="${waUrl(c.tel, txt)}" target="_blank" rel="noopener" data-offerta="${x.id}|${slot.id}">${IC_WA} WhatsApp</a>
            <a class="btn sms small" href="${smsUrl(c.tel, txt)}" data-offerta="${x.id}|${slot.id}">${IC_SMS} SMS</a>`
            : `<button class="btn small" data-cli="${c.id || ''}" style="grid-column:span 2">📞 Manca il numero</button>`}
            <button class="btn pri small" data-act="assegna" data-id="${x.id}" data-slot="${slot.id}" style="grid-column:span 2">✓ Assegna a ${esc((c.nome || '').split(' ')[0])}</button>
          </div></div>`;
      }).join('')}`
    : `<div class="empty" style="padding:24px 10px"><div class="ic">⏳</div>Nessuna cliente in lista d'attesa per questo giorno e orario.</div>`}
    <button class="btn ghost block" data-act="chiudi" style="margin-top:10px">Chiudi</button>`);
}
function assegnaPosto(attesaId, slotId) {
  const x = (db.attesa || []).find(y => y.id === attesaId), slot = appt(slotId);
  if (!x || !slot) return;
  const servizioNome = x.servizioNome || slot.servizioNome;
  const srv = db.servizi.find(s => s.nome.toLowerCase() === servizioNome.toLowerCase());
  const nuovo = {
    id: uid(), clienteId: x.clienteId, servizioNome, inizio: slot.inizio,
    durata: srv ? srv.durata : slot.durata, note: 'Dalla lista d\'attesa', stato: 'prenotato', inviato: {}, creato: new Date().toISOString()
  };
  if (srv && srv.prezzo != null && srv.prezzo !== '') nuovo.prezzo = Number(srv.prezzo);
  db.appuntamenti.push(nuovo);
  x.stato = 'sistemata'; x.sistemata = new Date().toISOString(); x.appuntamentoId = nuovo.id;
  save();
  selDay = dayKey(new Date(nuovo.inizio)); tab = 'agenda'; render();
  sheetInvio(nuovo.id, 'conferma');
  toast('Posto assegnato ✓');
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
  const el = e.target.closest('[data-tab],[data-day],[data-appt],[data-cli],[data-act],[data-sent],[data-offerta]');
  if (!el) return;
  if (el.dataset.offerta) { // segna che alla cliente in attesa è stato proposto il posto
    const [aid, sid] = el.dataset.offerta.split('|');
    const y = (db.attesa || []).find(z => z.id === aid);
    if (y) { y.offerte = y.offerte || {}; y.offerte[sid] = new Date().toISOString(); save(); }
    return;
  }

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
  if (el.dataset.tab) { vaiTab(el.dataset.tab); if (tab === 'agenda') selDay = selDay || dayKey(new Date()); render(); window.scrollTo(0, 0); return; }
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
    case 'disdici': {
      const x = appt(id); x.stato = 'disdetto'; save(); render();
      if (compatibili(x).length) proponiPosto(id);
      else { closeSheet(); toast('Disdetto: il posto è libero'); }
      break;
    }
    case 'proponi': proponiPosto(id); break;
    case 'assegna': assegnaPosto(id, el.dataset.slot); break;
    case 'vistaCli': vistaCli = id; render(); break;
    case 'editAttesa': formAttesa((db.attesa || []).find(y => y.id === id)); break;
    case 'nuovaAttesa': formAttesa(null, id); break;
    case 'salvaAttesa': salvaAttesa(id); break;
    case 'attesaFatta': { const y = db.attesa.find(z => z.id === id); y.stato = 'sistemata'; y.sistemata = new Date().toISOString(); save(); closeSheet(); render(); toast('Tolta dalla lista ✓'); break; }
    case 'delAttesa': db.attesa = db.attesa.filter(z => z.id !== id); save(); closeSheet(); render(); toast('Tolta dalla lista'); break;
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
        db.settings.msgConferma = MSG_CONFERMA; db.settings.msgPromemoria = MSG_PROMEMORIA; db.settings.msgAttesa = MSG_ATTESA; save(); render(); toast('Testi ripristinati');
      } break;
    case 'export': esporta(); break;
    case 'filtroCli': filtroCli = id; render(); break;
    case 'vediPrivacy':
      openSheet(`<h3>Informativa privacy</h3>
        <p class="lead">Così la vedono le clienti quando aprono il link.</p>
        <iframe class="privacy-frame" src="${esc(linkPrivacy())}&dentro=1" title="Informativa privacy"></iframe>
        <button class="btn pri block" data-act="chiudi" style="margin-top:12px">Chiudi</button>`);
      break;
    case 'vistaAg': vistaAg = id; try { localStorage.setItem('beautyconcept.vista', id); } catch (x) {} render(); break;
    case 'settSposta': { const d = parseDay(selDay); d.setDate(d.getDate() + Number(id)); selDay = dayKey(d); render(); break; }
    case 'apriGiorno': selDay = id; vistaAg = 'giorno'; try { localStorage.setItem('beautyconcept.vista', 'giorno'); } catch (x) {} render(); break;
    case 'confermaSposta': {
      const x = appt(id); x.inizio = el.dataset.quando; x.stato = 'prenotato'; x.inviato = {};
      save(); selDay = dayKey(new Date(x.inizio)); render(); sheetInvio(id, 'conferma', true); break;
    }
    case 'statPer': statPer = id; statRif = new Date(); render(); break;
    case 'statSposta': statRif = spostaPeriodo(statPer, statRif, Number(id)); render(); break;
    case 'barra': toast(id); break;
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

$('#fab').addEventListener('click', () => (tab === 'clienti' ? (vistaCli === 'attesa' ? formAttesa(null) : sheetCliente(null)) : formAppt(null)));
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
    // se ho già provato ad aggiornare a questa versione da poco, non ricaricare di nuovo (niente cicli)
    let tent = null; try { tent = JSON.parse(sessionStorage.getItem('beautyconcept.agg') || 'null'); } catch (e) { /* ignora */ }
    if (tent && tent.v === v && Date.now() - tent.t < 10 * 60e3) return;
    if (!staLavorando()) { aggiornaOra(v); return; }
    if (avvisoAgg) return;
    avvisoAgg = true;
    const b = document.createElement('button');
    b.className = 'agg-banner';
    b.innerHTML = '✨ Nuova versione pronta · <b>tocca per aggiornare</b>';
    b.addEventListener('click', () => aggiornaOra(v));
    document.body.appendChild(b);
  } catch (e) { /* senza rete: riproverà */ }
}
function aggiornaOra(v) {
  try { sessionStorage.setItem('beautyconcept.agg', JSON.stringify({ v, t: Date.now() })); } catch (e) { /* ignora */ }
  salvaUI();
  if (window.BCAggiorna) window.BCAggiorna(); else location.reload();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) controllaAggiornamento(); });
setInterval(controllaAggiornamento, 15 * 60e3);
setTimeout(controllaAggiornamento, 5000);
