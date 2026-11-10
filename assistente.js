/* =========================================================
   Beauty Concept – Assistente AI (Firebase AI Logic + Gemini)
   • Aiuta Sara a usare l'app e a scrivere messaggi per le clienti
   • NON invia dati dell'agenda o delle clienti: conosce solo la guida dell'app
   ========================================================= */
const VERSIONI_SDK = ['12.0.0', '11.10.0'];
// in ordine di preferenza: se Google ne ritira uno, si passa da soli al successivo
const MODELLI = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.8-flash', 'gemini-flash-latest'];
const KEY_MODELLO = 'beautyconcept.ai.modello';

const BC = window.BC;
const cfg = window.FIREBASE_CONFIG;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const GUIDA = `
Sei "Assistente Beauty Concept", l'aiutante di Sara, titolare del centro estetico Beauty Concept (Beauty & Nails Studio).
Rispondi SEMPRE in italiano, in modo semplice, caldo e breve (massimo 6-8 righe), con passaggi numerati quando spieghi come fare qualcosa.
Sara non è esperta di tecnologia: indica esattamente dove toccare, usando i nomi dei pulsanti tra virgolette.
Non conosci l'agenda né i dati delle clienti: se Sara chiede "chi ho domani" o simili, spiega gentilmente dove trovarlo nell'app (Agenda, Da ricordare, Clienti).
Se ti chiede di scrivere un messaggio per una cliente, scrivilo pronto da copiare, cordiale e professionale, con qualche emoji sobria, senza inventare prezzi o orari che lei non ti ha dato (usa segnaposto tipo [giorno] [ora] se mancano).
Se non sai qualcosa sull'app, dillo e suggerisci di chiedere a Davide (il marito, che gestisce l'app).
Non dare consigli medici: per pelle, allergie o reazioni suggerisci di sentire un medico/dermatologo.

GUIDA DELL'APP "Beauty Concept":
- In basso ci sono 4 schede: "Agenda", "Da ricordare" (campanella con numerino rosso), "Clienti", "Impostazioni". Il pulsante nero rotondo "+" crea un nuovo appuntamento (nella scheda Clienti crea una nuova cliente).
- In alto a destra "● Salvato" (verde) = tutto salvato online; "Offline" = senza internet, salva appena torna la rete; "Errore" = avvisare Davide.
- NUOVO APPUNTAMENTO: "+" → scrivi nome cliente (se esiste già, il numero si compila da solo) → cellulare → servizio → giorno e ora → durata → "Salva e invia conferma". Si apre il messaggio già scritto: toccare "Invia su WhatsApp", inviare, tornare nell'app e toccare "Invia SMS". La ✓ indica cosa è stato inviato.
- Il messaggio di conferma contiene un link: la cliente lo tocca e salva l'appuntamento nel suo calendario (su iPhone con avvisi 3 e 2 giorni prima).
- MODIFICARE/SPOSTARE: in Agenda toccare l'appuntamento → "✏️ Modifica" → cambiare → "Salva modifiche". Se cambia giorno/ora si apre il messaggio "Appuntamento spostato" da inviare.
- Nella scheda dell'appuntamento: "✓ Confermato", "✕ Disdetto" (libera il posto), "↺ Ripristina", "🗑 Elimina", "📩 Conferma" e "🔔 Promemoria" per rimandare i messaggi.
- DA RICORDARE: elenca gli appuntamenti delle prossime 72 ore non ancora confermati. Per ognuno: "WhatsApp" o "SMS" per mandare il promemoria (chiede di rispondere SÌ), poi "✓ Ha confermato" o "✕ Disdetto". Le ore (48/72/96) si cambiano in Impostazioni.
- Se una cliente non ha il numero compare "📞 Manca il numero: aggiungilo".
- CLIENTI: ricerca per nome o telefono; toccando una cliente: modificare nome/numero/note, "Scrivi" su WhatsApp, "Chiama", "+ Nuovo appuntamento per lei", vedere gli ultimi appuntamenti, "Elimina cliente". Su Android c'è "📇 Prendi dalla rubrica".
- NOME NEI MESSAGGI: l'app riconosce da sola i doppi nomi (Maria Grazia, Anna Maria…). Se il nome nel messaggio è sbagliato: scheda cliente → "Come chiamarla nei messaggi" → scriverlo (anche soprannomi) → Salva. Dal pannello di invio c'è anche il collegamento "✏️ Nel messaggio la chiamo …: cambia".
- Per unire una cliente doppia (es. "Nadia Costa 1/2"): aprire l'appuntamento → "Modifica" → correggere il nome con quello giusto → salvare; poi eliminare la cliente doppia da Clienti.
- IMPOSTAZIONI: nome, indirizzo e telefono WhatsApp del centro; ore per "Da ricordare"; elenco servizi con durata ("+ Aggiungi servizio", ✕ per togliere); testi dei messaggi di conferma e promemoria (parole automatiche: {nome} {servizio} {data} {ora} {centro} {indirizzo} {link}; "Ripristina testi originali").
- "Importa da Google Calendar": dal computer calendar.google.com → ⚙️ Impostazioni → Importa ed esporta → Esporta; poi in app scegliere il file .zip. Mostra un'anteprima; si può scegliere storico o solo futuri. Non crea doppioni se ripetuto.
- "Numeri dalla rubrica del telefono": esportare la rubrica (.vcf). Android: app Contatti → menu → Gestisci contatti → Esporta. iPhone: Contatti → Liste → tieni premuto "Tutti i contatti" → Esporta. Poi in app "Scegli il file della rubrica": abbina i numeri e chiede conferma.
- "Cloud e backup automatici": ogni modifica è salvata online subito; ogni ora si fa una copia completa (ultime 72 + una al giorno per 30 giorni). "Fai una copia adesso"; toccando una copia nell'elenco si torna a quel momento (prima viene salvata la situazione attuale). "Esci dall'account".
- "Backup su file": "Salva backup" / "Carica backup".
- AGENDA GIORNO/SETTIMANA: in alto in Agenda il selettore "Giorno | Settimana". Nella settimana: frecce ‹ › per cambiare settimana; toccare uno spazio vuoto crea un appuntamento a quel giorno e ora; TENERE PREMUTO un appuntamento e trascinarlo su un altro giorno/orario per spostarlo, poi "Sposta e avvisa la cliente" (si apre il messaggio "Appuntamento spostato"). Toccando il giorno in alto si apre la vista Giorno.
- LISTA D'ATTESA: in Clienti, in alto "Rubrica | Lista d'attesa". Con "+" (o dalla scheda cliente "⏳ Metti in lista d'attesa") si inserisce cliente, servizio, periodo (dal/al, facoltativi), fascia oraria (mattina, pomeriggio, sera) e note. Quando si segna un appuntamento "✕ Disdetto" si apre "Si è liberato un posto" con le clienti adatte: mandare WhatsApp/SMS e poi "✓ Assegna" a chi conferma (crea l'appuntamento e apre la conferma). Da un appuntamento disdetto c'è anche "⏳ Proponi il posto alla lista d'attesa". Toccando una cliente in lista: modificare, "✓ Sistemata" o "🗑 Togli".
- PREZZI E INCASSI: i prezzi dei servizi si mettono in Impostazioni → Servizi (casella €); nel nuovo appuntamento il prezzo si propone da solo e si può cambiare. La scheda "Incassi" in basso mostra Giorno/Settimana/Mese/Anno con le frecce: totale (incassato + ancora da fare), confronto col periodo prima, appuntamenti, clienti, scontrino medio, disdette, grafico (toccare una barra per il valore), servizi che rendono di più, clienti migliori. Le disdette non contano. Se compare "appuntamenti senza prezzo", impostare i prezzi dei servizi.
- PRIVACY: in Impostazioni → "Privacy (GDPR)" compilare titolare, P.IVA, email. Nella scheda cliente ci sono due spunte: consenso al trattamento dati e consenso alle offerte (si salva la data). "📄 Manda l'informativa su WhatsApp" invia il link all'informativa: quando la cliente risponde OK, spuntare e salvare. In Clienti il filtro "Senza consenso privacy" e il lucchetto 🔒 mostrano chi manca. Per dubbi legali rimandare al consulente/commercialista.
- Se l'app si blocca o non risponde: chiuderla del tutto e riaprirla; oppure in Impostazioni in fondo "🔄 Aggiorna app all'ultima versione" (non cancella i dati). Se appare un avviso rosso, fare uno screenshot e mandarlo a Davide.
- Per installare l'app: Android Chrome → ⋮ → "Installa app"; iPhone Safari → Condividi → "Aggiungi alla schermata Home".
- Accesso: email e password del centro; "Password dimenticata?" manda un'email per cambiarla.
`.trim();

const SUGGERIMENTI = [
  'Come sposto un appuntamento?',
  'Scrivi un messaggio per avvisare che sono in ritardo di 15 minuti',
  'Come mando il promemoria alle clienti?',
  'Scrivi un messaggio per le offerte di Natale',
  'Come aggiungo i numeri dalla rubrica?'
];

let ai = null, F = null, chat = null, modelloIdx = 0, storia = [], occupato = false;
const ATTESA = (window.__attesaTest || 25000); // ms massimi di attesa
const conTempo = (p, ms, msg) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(msg)), ms))]);

async function caricaSdk() {
  if (F) return F;
  let ultimoErr;
  for (const v of VERSIONI_SDK) {
    try {
      const base = `https://www.gstatic.com/firebasejs/${v}/`;
      const [a, b] = await conTempo(Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-ai.js')]), ATTESA, 'caricamento libreria AI non riuscito');
      F = { ...a, ...b };
      return F;
    } catch (e) { ultimoErr = e; }
  }
  throw ultimoErr || new Error('sdk');
}

function nuovoModello() {
  const salvato = localStorage.getItem(KEY_MODELLO);
  const i = MODELLI.indexOf(salvato);
  if (i >= 0 && modelloIdx === 0) modelloIdx = i;
  const model = F.getGenerativeModel(ai, {
    model: MODELLI[modelloIdx],
    systemInstruction: GUIDA,
    generationConfig: { temperature: 0.6, maxOutputTokens: 1200 }
  });
  chat = model.startChat({ history: storia });
}

async function prepara() {
  if (chat) return;
  await caricaSdk();
  const app = (F.getApps().find(a => a.name === 'assistente')) || F.initializeApp(cfg, 'assistente');
  ai = F.getAI(app, { backend: new F.GoogleAIBackend() });
  nuovoModello();
}

/* ---------- testo con un minimo di formattazione ---------- */
function formatta(t) {
  return esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/^\s*[-*•]\s+(.*)$/gm, '• $1')
    .replace(/\n/g, '<br>');
}

/* ---------- interfaccia ---------- */
function apri() {
  window.openSheet(`
    <div class="ai-head">
      <div class="ai-avatar">✨</div>
      <div><h3 style="margin:0">Assistente</h3><p class="lead" style="margin:0">Chiedimi come usare l'app o fatti scrivere un messaggio</p></div>
    </div>
    <div class="ai-msgs" id="aiMsgs">
      ${storia.length ? '' : `<div class="ai-bolla ai-bot">Ciao Sara! 🌸 Sono qui per aiutarti con l'app. Puoi scrivermi una domanda o toccare un suggerimento.</div>`}
    </div>
    <div class="ai-chips" id="aiChips">${storia.length ? '' : SUGGERIMENTI.map(s => `<button class="ai-chip">${esc(s)}</button>`).join('')}</div>
    <form class="ai-form" id="aiForm">
      <textarea id="aiTesto" rows="1" placeholder="Scrivi o detta col microfono 🎤"></textarea>
      <button class="btn pri" id="aiInvia" aria-label="Invia">➤</button>
    </form>
    <p class="hint" style="text-align:center;margin-top:8px">Non scrivere qui dati personali delle clienti (salute, numeri…). Le risposte sono generate da un'AI: possono contenere errori.</p>`);
  // ridisegna la conversazione già fatta
  const box = $('#aiMsgs');
  storia.forEach(m => aggiungiBolla(m.role === 'user' ? 'utente' : 'bot', m.parts.map(p => p.text).join(''), box));
  scorri();
  const ta = $('#aiTesto');
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !/Android|iPhone|iPad/i.test(navigator.userAgent)) { e.preventDefault(); invia(); } });
  $('#aiForm').addEventListener('submit', e => { e.preventDefault(); invia(); });
  $('#aiChips').addEventListener('click', e => { const c = e.target.closest('.ai-chip'); if (c) { ta.value = c.textContent; invia(); } });
}

function aggiungiBolla(tipo, testo, box = $('#aiMsgs')) {
  const d = document.createElement('div');
  d.className = 'ai-bolla ' + (tipo === 'utente' ? 'ai-utente' : 'ai-bot');
  d.innerHTML = tipo === 'utente' ? esc(testo).replace(/\n/g, '<br>') : formatta(testo);
  if (tipo !== 'utente' && testo) aggiungiAzioni(d, testo);
  box.appendChild(d);
  return d;
}
function aggiungiAzioni(d, testo) {
  const a = document.createElement('div');
  a.className = 'ai-azioni';
  a.innerHTML = `<button type="button" data-ai="copia">📋 Copia</button>${navigator.share ? '<button type="button" data-ai="condividi">↗️ Condividi</button>' : ''}`;
  a.addEventListener('click', async e => {
    const b = e.target.closest('[data-ai]'); if (!b) return;
    if (b.dataset.ai === 'copia') {
      try { await navigator.clipboard.writeText(testo); BC.toast('Copiato ✓'); } catch (x) { BC.toast('Tieni premuto sul testo per copiarlo'); }
    } else { try { await navigator.share({ text: testo }); } catch (x) { /* annullato */ } }
  });
  d.appendChild(a);
}
function scorri() { const s = $('#sheet'); if (s) s.scrollTop = s.scrollHeight; }

async function invia() {
  const ta = $('#aiTesto');
  const testo = (ta.value || '').trim();
  if (!testo || occupato) return;
  if (!navigator.onLine) return BC.toast('Serve internet per l\'assistente');
  occupato = true;
  ta.value = ''; ta.style.height = 'auto';
  const chips = $('#aiChips'); if (chips) chips.innerHTML = '';
  aggiungiBolla('utente', testo);
  const bolla = aggiungiBolla('bot', '');
  bolla.innerHTML = '<span class="ai-pensa"><i></i><i></i><i></i></span>';
  scorri();
  try {
    await prepara();
    let risposta = '';
    for (let tentativo = 0; tentativo < MODELLI.length; tentativo++) {
      try {
        try {
          // risposta "in diretta", ma con un tempo massimo
          const res = await conTempo(chat.sendMessageStream(testo), ATTESA, 'tempo');
          const it = res.stream[Symbol.asyncIterator]();
          while (true) {
            const { value, done } = await conTempo(it.next(), ATTESA, 'tempo');
            if (done) break;
            risposta += value.text();
            bolla.innerHTML = formatta(risposta);
            scorri();
          }
        } catch (e) {
          if (!(e && e.message === 'tempo') || risposta) throw e;
          // nessuna risposta in tempo: riprova senza diretta
          bolla.innerHTML = '<span class="ai-pensa"><i></i><i></i><i></i></span> <small style="color:var(--mut)">ci sto mettendo un po\'…</small>';
          nuovoModello();
          const r = await conTempo(chat.sendMessage(testo), ATTESA * 2, 'tempo');
          risposta = r.response.text();
        }
        localStorage.setItem(KEY_MODELLO, MODELLI[modelloIdx]);
        break;
      } catch (e) {
        const msg = String(e && (e.message || e));
        // modello non disponibile: prova il successivo
        if (/not found|404|not supported|unsupported model|no longer available|model|tempo/i.test(msg) && modelloIdx < MODELLI.length - 1 && !risposta) {
          modelloIdx++; localStorage.removeItem(KEY_MODELLO); nuovoModello(); continue;
        }
        throw e;
      }
    }
    storia.push({ role: 'user', parts: [{ text: testo }] }, { role: 'model', parts: [{ text: risposta }] });
    if (storia.length > 20) storia = storia.slice(-20);
    bolla.innerHTML = formatta(risposta || 'Non ho una risposta, prova a riformulare la domanda.');
    if (risposta) aggiungiAzioni(bolla, risposta);
  } catch (e) {
    console.error(e);
    const m = String(e && (e.message || e));
    const testoErr = /api.*(not|has not been) (been )?(used|enabled)|SERVICE_DISABLED|PERMISSION_DENIED|ai-logic|firebasevertexai|firebaseml|API_NOT_ENABLED|403/i.test(m)
      ? '⚙️ L\'assistente non è ancora attivo. Davide deve attivarlo in Firebase (sezione AI Logic → Gemini Developer API).'
      : /quota|429|RESOURCE_EXHAUSTED/i.test(m)
        ? '⏳ Troppe domande in poco tempo: riprova tra un minuto.'
        : m === 'tempo'
          ? '⌛ L\'assistente non ha risposto in tempo. Riprova tra poco; se succede ancora, manda uno screenshot a Davide.'
          : '😕 Non riesco a rispondere ora. Riprova tra poco; se succede ancora, manda uno screenshot a Davide.';
    bolla.innerHTML = esc(testoErr) + '<br><small style="color:var(--mut);word-break:break-all">Dettaglio: ' + esc(m.slice(0, 220)) + ' · ' + esc(MODELLI[modelloIdx]) + '</small>';
    chat = null; // al prossimo messaggio riparte pulito
  } finally {
    occupato = false; scorri();
  }
}

/* ---------- pulsante ✨ nell'intestazione ---------- */
const btn = document.getElementById('aiBtn');
if (btn && cfg && cfg.apiKey) {
  btn.hidden = false;
  btn.addEventListener('click', apri);
}
