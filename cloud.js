/* =========================================================
   Beauty Concept – Cloud (Firebase)
   • Login dell'account del centro
   • Ogni modifica salvata online all'istante (funziona anche offline:
     si sincronizza appena torna internet)
   • Backup completo automatico ogni ora (se ci sono modifiche),
     con copie orarie degli ultimi 3 giorni e una al giorno per 30 giorni
   ========================================================= */
const VERSIONE_SDK = '10.12.2';
const CDN = `https://www.gstatic.com/firebasejs/${VERSIONE_SDK}/`;
const COLS = ['clienti', 'appuntamenti', 'servizi'];
const ORA = 36e5;
const MAX_ORARI = 72;          // ultime 72 copie (3 giorni)
const GIORNI_GIORNALIERI = 30; // più una copia al giorno per 30 giorni
const CHUNK = 250000;          // dimensione pezzi del backup (limite Firestore 1 MB per documento)
const LOCALE_BK = 'beautyconcept.backup.locale';
const FLAG_SYNC = 'beautyconcept.sync.uid'; // account già sincronizzato su questo telefono

const BC = window.BC;
const cfg = window.FIREBASE_CONFIG;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

let F = null, auth = null, fs = null, user = null, base = null;
let unsubs = [], pushT = null, timerBk = null, backupInCorso = false, caricamento = false;
let stato = 'off', mostraTutti = false;
const synced = { clienti: new Map(), appuntamenti: new Map(), servizi: new Map(), settings: '' };

/* ---------- indicatore nell'intestazione ---------- */
const TESTI = {
  ok: 'Salvato online',
  sync: 'Salvataggio…',
  offline: 'Offline · salvo appena torna internet',
  errore: 'Errore di salvataggio',
  off: ''
};
function setStato(s) {
  stato = s;
  const el = $('#cloudDot'); if (!el) return;
  el.hidden = s === 'off' || !user;
  el.className = 'cloud-dot ' + s;
  el.querySelector('span').textContent = s === 'ok' ? 'Salvato' : s === 'sync' ? 'Salvo…' : s === 'offline' ? 'Offline' : 'Errore';
}
$('#cloudDot').addEventListener('click', () => BC.toast(TESTI[stato] || ''));
const statoRete = () => setStato(navigator.onLine ? 'ok' : 'offline');

/* ---------- avvio ---------- */
async function init() {
  if (!cfg || !cfg.apiKey) { BC.afterRender = afterRender; afterRender(BC.vista()); return; }
  BC.afterRender = afterRender;
  if (caricamento) return;
  caricamento = true;
  try {
    const [a, b, c] = await Promise.all([
      import(CDN + 'firebase-app.js'),
      import(CDN + 'firebase-auth.js'),
      import(CDN + 'firebase-firestore.js')
    ]);
    F = { ...a, ...b, ...c };
  } catch (e) {
    caricamento = false;
    afterRender(BC.vista());
    return; // senza internet al primo avvio: l'app lavora sul telefono e riprova quando torna la rete
  }
  const app = F.initializeApp(cfg);
  auth = F.getAuth(app);
  auth.languageCode = 'it';
  try {
    fs = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  } catch (e) { fs = F.getFirestore(app); }

  F.onAuthStateChanged(auth, u => {
    if (u) { user = u; nascondiLogin(); avvia(); }
    else { user = null; ferma(); mostraLogin(); }
    afterRender(BC.vista());
  });
}

/* ---------- sincronizzazione ---------- */
async function avvia() {
  base = F.doc(fs, 'centri', user.uid);
  setStato('sync');
  BC.onSave = () => { clearTimeout(pushT); pushT = setTimeout(push, 400); };

  let snap = null;
  try { snap = await F.getDoc(F.doc(base, 'config', 'settings')); } catch (e) { snap = null; }
  const primoAvvio = snap && !snap.exists();
  // primo login su QUESTO telefono: i dati già presenti qui vanno uniti a quelli online, non persi
  const unisci = localStorage.getItem(FLAG_SYNC) !== user.uid;
  if (primoAvvio) {
    // account nuovo e vuoto: carica online quello che c'è già sul telefono
    COLS.forEach(c => synced[c].clear()); synced.settings = '';
    await push();
    localStorage.setItem(FLAG_SYNC, user.uid);
  }
  ascolta(!primoAvvio, unisci && !primoAvvio ? JSON.parse(JSON.stringify(BC.getDb())) : null);
  statoRete();

  clearInterval(timerBk);
  timerBk = setInterval(() => controllaBackup(), 5 * 60e3);
  setTimeout(() => controllaBackup(), 20e3);
}

function ferma() {
  unsubs.forEach(u => u()); unsubs = [];
  clearInterval(timerBk); clearTimeout(pushT);
  BC.onSave = null; base = null;
  COLS.forEach(c => synced[c].clear()); synced.settings = '';
  setStato('off');
}

function ascolta(cloudVince, locale) {
  unsubs.forEach(u => u()); unsubs = [];
  let attesi = COLS.length + 1, aggiunti = 0;
  const fineUnione = () => {
    if (--attesi > 0) return;
    if (locale) {
      localStorage.setItem(FLAG_SYNC, user.uid);
      if (aggiunti) BC.toast(`Dati di questo telefono uniti a quelli online ✓`);
      push();
    }
  };
  COLS.forEach(col => {
    let primo = true;
    unsubs.push(F.onSnapshot(F.collection(base, col), { includeMetadataChanges: false }, snap => {
      const d = BC.getDb();
      if (primo && locale && snap.metadata && snap.metadata.fromCache) return; // aspetta i dati veri dal server
      if (primo && cloudVince) {
        d[col] = snap.docs.map(x => x.data());
        synced[col] = new Map(snap.docs.map(x => [x.id, JSON.stringify(x.data())]));
        if (locale && col !== 'servizi') {
          const ids = new Set(d[col].map(x => x.id));
          const extra = locale[col].filter(x => !ids.has(x.id));
          d[col].push(...extra); aggiunti += extra.length;
        }
        primo = false; aggiornaDaCloud(); fineUnione(); return;
      } else {
        snap.docChanges().forEach(ch => {
          const id = ch.doc.id;
          if (ch.type === 'removed') {
            d[col] = d[col].filter(x => x.id !== id);
            synced[col].delete(id);
          } else {
            const data = ch.doc.data();
            const i = d[col].findIndex(x => x.id === id);
            if (i >= 0) d[col][i] = data; else d[col].push(data);
            synced[col].set(id, JSON.stringify(data));
          }
        });
      }
      primo = false;
      aggiornaDaCloud();
    }, err => { console.error(err); setStato('errore'); }));
  });
  let primoSet = true;
  unsubs.push(F.onSnapshot(F.doc(base, 'config', 'settings'), { includeMetadataChanges: false }, s => {
    if (primoSet && locale && s.metadata && s.metadata.fromCache) return;
    const d = BC.getDb();
    if (!s.exists()) { if (primoSet) { primoSet = false; fineUnione(); } return; }
    const cloud = s.data();
    d.settings = { ...d.settings, ...cloud };
    synced.settings = JSON.stringify(d.settings);
    if (primoSet && locale) {
      // se online un campo è ancora quello di partenza e su questo telefono era stato compilato, tieni quello del telefono
      const def = BC.defaults().settings;
      Object.keys(locale.settings || {}).forEach(k => {
        const online = cloud[k], qui = locale.settings[k];
        if ((online === undefined || online === '' || online === def[k]) && qui !== undefined && qui !== '' && qui !== def[k]) { d.settings[k] = qui; aggiunti++; }
      });
    }
    aggiornaDaCloud();
    if (primoSet) { primoSet = false; fineUnione(); }
  }, err => { console.error(err); setStato('errore'); }));
}

let renderT;
function aggiornaDaCloud() {
  BC.saveLocal();
  clearTimeout(renderT);
  renderT = setTimeout(() => {
    const a = document.activeElement;
    // non ridisegnare mentre si sta scrivendo nella pagina (es. Impostazioni)
    if (a && $('#view').contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
    BC.render();
  }, 150);
}

function push() {
  if (!base) return;
  const d = BC.getDb();
  const ops = [];
  COLS.forEach(col => {
    const m = synced[col], visti = new Set();
    d[col].forEach(it => {
      visti.add(it.id);
      const pulito = JSON.parse(JSON.stringify(it));
      const s = JSON.stringify(pulito);
      if (m.get(it.id) !== s) { ops.push(b => b.set(F.doc(base, col, it.id), pulito)); m.set(it.id, s); }
    });
    [...m.keys()].forEach(id => {
      if (!visti.has(id)) { ops.push(b => b.delete(F.doc(base, col, id))); m.delete(id); }
    });
  });
  const st = JSON.stringify(d.settings);
  if (st !== synced.settings) { ops.push(b => b.set(F.doc(base, 'config', 'settings'), JSON.parse(st))); synced.settings = st; }
  if (!ops.length) return Promise.resolve();

  setStato(navigator.onLine ? 'sync' : 'offline');
  const lavori = [];
  for (let i = 0; i < ops.length; i += 400) {
    const b = F.writeBatch(fs);
    ops.slice(i, i + 400).forEach(f => f(b));
    lavori.push(b.commit());
  }
  // offline la scrittura resta in coda sul telefono e parte da sola quando torna la rete
  const tutto = Promise.all(lavori).then(statoRete).catch(e => { console.error(e); setStato('errore'); });
  return navigator.onLine ? tutto : Promise.resolve();
}

/* ---------- backup automatico ogni ora ---------- */
function impronta(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h.toString(36) + '.' + s.length; }
function fotografia() {
  const d = BC.getDb();
  return JSON.stringify({ settings: d.settings, servizi: d.servizi, clienti: d.clienti, appuntamenti: d.appuntamenti });
}

async function controllaBackup(forza = false, motivo = 'automatico') {
  if (!base || backupInCorso) return false;
  backupInCorso = true;
  try {
    const metaRef = F.doc(base, 'config', 'backup');
    let meta = {};
    try { const m = await F.getDoc(metaRef); meta = m.exists() ? m.data() : {}; } catch (e) { return false; }
    const ora = Date.now();
    const json = fotografia();
    const h = impronta(json);
    if (!forza && meta.ultimo && ora - meta.ultimo < ORA) return false; // passata meno di un'ora
    if (!forza && meta.hash === h) return false;                        // niente di nuovo: l'ultima copia è ancora valida

    const oggi = dayKey(new Date());
    const giornaliero = meta.giorno !== oggi;
    const d = BC.getDb();
    const parti = Math.max(1, Math.ceil(json.length / CHUNK));
    const ref = F.doc(base, 'backup', String(ora));
    const b = F.writeBatch(fs);
    b.set(ref, { at: ora, clienti: d.clienti.length, appuntamenti: d.appuntamenti.length, parti, giornaliero, motivo });
    for (let i = 0; i < parti; i++) b.set(F.doc(ref, 'parti', String(i)), { d: json.slice(i * CHUNK, (i + 1) * CHUNK) });
    b.set(metaRef, { ultimo: ora, hash: h, giorno: oggi }, { merge: true });
    const scritto = b.commit();
    try { localStorage.setItem(LOCALE_BK, JSON.stringify({ at: ora, json })); } catch (e) { /* spazio pieno */ }
    if (navigator.onLine) { await scritto; pulisci(); }
    if (BC.vista() === 'impostazioni') aggiornaBox();
    return true;
  } catch (e) {
    console.error(e); return false;
  } finally { backupInCorso = false; }
}

async function elencoBackup(max = 200) {
  const q = F.query(F.collection(base, 'backup'), F.orderBy('at', 'desc'), F.limit(max));
  const s = await F.getDocs(q);
  return s.docs.map(x => ({ id: x.id, ...x.data() }));
}

async function cancellaBackup(id) {
  const ref = F.doc(base, 'backup', id);
  const parti = await F.getDocs(F.collection(ref, 'parti'));
  const b = F.writeBatch(fs);
  parti.docs.forEach(p => b.delete(p.ref));
  b.delete(ref);
  await b.commit();
}

async function pulisci() {
  try {
    const lista = await elencoBackup(500);
    const limiteGiorni = Date.now() - GIORNI_GIORNALIERI * 864e5;
    const daTogliere = lista.filter((x, i) => i >= MAX_ORARI && !(x.giornaliero && x.at > limiteGiorni));
    for (const x of daTogliere) await cancellaBackup(x.id);
  } catch (e) { console.error(e); }
}

async function ripristina(id) {
  const ref = F.doc(base, 'backup', id);
  const [m, p] = await Promise.all([F.getDoc(ref), F.getDocs(F.collection(ref, 'parti'))]);
  if (!m.exists()) throw new Error('backup mancante');
  const json = p.docs.sort((a, b) => Number(a.id) - Number(b.id)).map(x => x.data().d).join('');
  const dati = JSON.parse(json);
  const quando = new Date(m.data().at).toLocaleString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  if (!confirm(`Ripristinare la copia di ${quando}?\n\nAgenda e clienti torneranno com'erano in quel momento. Prima salvo una copia della situazione attuale, così puoi sempre tornare indietro.`)) return;
  await controllaBackup(true, 'prima del ripristino');
  BC.setDb(dati);
  BC.save();
  BC.render();
  BC.toast('Copia ripristinata ✓');
}

/* ---------- schermata di accesso ---------- */
function mostraLogin() {
  if ($('#login')) return;
  const el = document.createElement('div');
  el.id = 'login';
  el.innerHTML = `
    <form class="login-card" novalidate>
      <img src="logo.png" alt="Beauty Concept" class="login-logo">
      <p class="login-studio">Beauty &amp; Nails Studio</p>
      <h2>Accedi all'agenda</h2>
      <label>Email</label>
      <input type="email" id="lEmail" autocomplete="username" inputmode="email" required>
      <label>Password</label>
      <input type="password" id="lPass" autocomplete="current-password" required>
      <p class="login-err" id="lErr"></p>
      <button class="btn pri block" type="submit" id="lGo">Accedi</button>
      <button class="btn ghost block small" type="button" id="lReset" style="margin-top:8px">Password dimenticata?</button>
      <p class="hint" style="text-align:center;margin-top:12px">Versione 1.7 · <a href="#" data-aggiorna style="color:var(--gold)">aggiorna app</a></p>
    </form>`;
  document.body.appendChild(el);
  const err = m => { $('#lErr').textContent = m; };
  el.querySelector('form').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('#lEmail').value.trim(), pass = $('#lPass').value;
    if (!email || !pass) return err('Inserisci email e password');
    $('#lGo').disabled = true; $('#lGo').textContent = 'Accesso…'; err('');
    try { await F.signInWithEmailAndPassword(auth, email, pass); }
    catch (x) {
      err(({
        'auth/invalid-credential': 'Email o password non corretti',
        'auth/wrong-password': 'Password non corretta',
        'auth/user-not-found': 'Account non trovato',
        'auth/invalid-email': 'Email non valida',
        'auth/too-many-requests': 'Troppi tentativi: riprova tra qualche minuto',
        'auth/network-request-failed': 'Serve internet per accedere'
      })[x.code] || 'Accesso non riuscito');
    } finally { const g = $('#lGo'); if (g) { g.disabled = false; g.textContent = 'Accedi'; } }
  });
  $('#lReset').addEventListener('click', async () => {
    const email = $('#lEmail').value.trim();
    if (!email) return err('Scrivi prima la tua email qui sopra');
    try { await F.sendPasswordResetEmail(auth, email); err(''); BC.toast('Ti abbiamo mandato un\'email per cambiare password'); }
    catch (x) { err('Impossibile inviare l\'email: controlla l\'indirizzo'); }
  });
}
function nascondiLogin() { const el = $('#login'); if (el) el.remove(); }

/* ---------- riquadro nelle Impostazioni ---------- */
function afterRender(tab) { if (tab === 'impostazioni') aggiornaBox(); }

const fmtQuando = t => {
  const d = new Date(t), oggi = dayKey(new Date()), ieri = dayKey(new Date(Date.now() - 864e5));
  const g = dayKey(d) === oggi ? 'Oggi' : dayKey(d) === ieri ? 'Ieri' : d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${g}, ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
};

async function aggiornaBox() {
  const el = $('#cloudBox'); if (!el) return;
  if (!cfg || !cfg.apiKey) {
    el.innerHTML = `<div class="warnbox" style="margin:0">Cloud non ancora attivo: i dati sono solo su questo telefono. Va inserita la configurazione Firebase.</div>`;
    return;
  }
  if (!F) {
    el.innerHTML = `<div class="warnbox" style="margin:0">Cloud in attesa di internet. Intanto i dati restano salvati sul telefono.</div>`;
    return;
  }
  if (!user) { el.innerHTML = `<p class="hint" style="margin:0">Accedi per attivare il salvataggio online.</p>`; return; }

  el.innerHTML = `
    <div class="okbox" style="margin-top:0;word-break:normal">✓ Collegato come <b>${esc(user.email)}</b><br>Ogni modifica viene salvata online all'istante. Ogni ora viene fatta anche una copia completa.</div>
    <div class="kv"><span>Ultima copia</span><b id="bkUlt">…</b></div>
    <button class="btn block" id="bkOra" style="margin-top:12px">🛟 Fai una copia adesso</button>
    <label style="margin-top:18px">Copie disponibili (tocca per tornare a quel momento)</label>
    <div id="bkList"><p class="hint">Caricamento…</p></div>
    <button class="btn ghost block small" id="bkEsci" style="margin-top:14px">Esci dall'account</button>`;

  $('#bkOra').addEventListener('click', async e => {
    e.currentTarget.disabled = true;
    const ok = await controllaBackup(true, 'manuale');
    BC.toast(ok ? 'Copia salvata ✓' : (navigator.onLine ? 'Copia non riuscita, riprova' : 'Copia salvata: verrà caricata appena torna internet'));
    aggiornaBox();
  });
  $('#bkEsci').addEventListener('click', async () => {
    if (!confirm('Uscire dall\'account? I dati restano al sicuro online; da questo telefono verranno tolti finché non rientri.')) return;
    await F.signOut(auth);
    BC.reset(); BC.saveLocal(); localStorage.removeItem(FLAG_SYNC); BC.render();
  });

  try {
    const lista = await elencoBackup(mostraTutti ? 200 : 12);
    const ult = $('#bkUlt'); if (ult) ult.textContent = lista.length ? fmtQuando(lista[0].at) : 'nessuna';
    const box = $('#bkList'); if (!box) return;
    box.innerHTML = lista.length ? lista.map(x => `
      <button class="bk" data-bk="${x.id}">
        <span><b>${fmtQuando(x.at)}</b>${x.motivo && x.motivo !== 'automatico' ? ` · <i>${esc(x.motivo)}</i>` : ''}<br>
        <small>${x.clienti} clienti · ${x.appuntamenti} appuntamenti</small></span>
        <em>Ripristina</em>
      </button>`).join('') + (!mostraTutti && lista.length >= 12 ? `<button class="btn ghost block small" id="bkTutti" style="margin-top:8px">Mostra tutte le copie</button>` : '')
      : `<p class="hint">La prima copia verrà fatta a breve.</p>`;
    box.querySelectorAll('[data-bk]').forEach(b => b.addEventListener('click', async () => {
      try { await ripristina(b.dataset.bk); } catch (e) { BC.toast('Ripristino non riuscito: serve internet'); }
    }));
    const t = $('#bkTutti'); if (t) t.addEventListener('click', () => { mostraTutti = true; aggiornaBox(); });
  } catch (e) {
    const box = $('#bkList'); if (box) box.innerHTML = `<p class="hint">Elenco copie disponibile quando c'è internet.</p>`;
    const ult = $('#bkUlt'); if (ult) ult.textContent = '—';
  }
}

/* ---------- rete ---------- */
window.addEventListener('online', () => { if (cfg && !F) init(); else if (user) { statoRete(); controllaBackup(); } });
window.addEventListener('offline', () => { if (user) setStato('offline'); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && user) controllaBackup(); });

init();
