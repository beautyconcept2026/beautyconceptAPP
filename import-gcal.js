'use strict';
/* =========================================================
   Beauty Concept – Importazione da Google Calendar
   Legge il file esportato da Google (.zip o .ics) e riconosce
   gli appuntamenti scritti come:  Nome Cognome SERVIZIO IN MAIUSCOLO
   (eventuale telefono e prezzo vengono riconosciuti a parte)
   ========================================================= */
(function () {
  const BC = window.BC;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uidNuovo = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ---------- lettura .zip (senza librerie) ---------- */
  async function estraiIcsDaZip(buf) {
    const v = new DataView(buf), u8 = new Uint8Array(buf);
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) {
      if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('zip non valido');
    const n = v.getUint16(eocd + 10, true);
    let p = v.getUint32(eocd + 16, true);
    const testi = [];
    for (let k = 0; k < n; k++) {
      if (v.getUint32(p, true) !== 0x02014b50) break;
      const metodo = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
      const lNome = v.getUint16(p + 28, true), lExtra = v.getUint16(p + 30, true), lComm = v.getUint16(p + 32, true);
      const off = v.getUint32(p + 42, true);
      const nome = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + lNome));
      p += 46 + lNome + lExtra + lComm;
      if (!/\.ics$/i.test(nome)) continue;
      const inizio = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true);
      const dati = u8.subarray(inizio, inizio + size);
      if (metodo === 0) testi.push(new TextDecoder().decode(dati));
      else if (metodo === 8) {
        if (typeof DecompressionStream === 'undefined') throw new Error('nozip');
        const s = new Blob([dati]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        testi.push(await new Response(s).text());
      }
    }
    if (!testi.length) throw new Error('nessun .ics');
    return testi.join('\n');
  }

  /* ---------- lettura .ics ---------- */
  function leggiIcs(testo) {
    const righe = testo.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
    const eventi = [];
    let ev = null;
    for (const r of righe) {
      if (r === 'BEGIN:VEVENT') { ev = {}; continue; }
      if (r === 'END:VEVENT') { if (ev) eventi.push(ev); ev = null; continue; }
      if (!ev) continue;
      const i = r.indexOf(':'); if (i < 0) continue;
      const chiave = r.slice(0, i).split(';')[0].toUpperCase();
      const val = r.slice(i + 1);
      if (['SUMMARY', 'DTSTART', 'DTEND', 'DESCRIPTION', 'UID', 'STATUS'].includes(chiave) && !(chiave in ev)) {
        ev[chiave] = { val, param: r.slice(0, i) };
      }
    }
    return eventi;
  }
  const testoIcs = s => String(s || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();
  function dataIcs(x) {
    if (!x) return null;
    const m = /(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/.exec(x.val);
    if (!m) return null;
    if (!m[4]) return { tuttoGiorno: true };
    const n = m.slice(1, 7).map(Number);
    const d = m[7] ? new Date(Date.UTC(n[0], n[1] - 1, n[2], n[3], n[4], n[5])) : new Date(n[0], n[1] - 1, n[2], n[3], n[4], n[5]);
    return { d };
  }

  /* ---------- riconoscimento: nome, telefono, servizio ---------- */
  const TEL = /(?:\+?39[\s.]?)?3\d{2}[\s.]?\d{3}[\s.]?\d{3,4}|0\d{1,3}[\s.]?\d{5,8}/g;
  const maiuscola = w => /[A-ZÀ-Ý]{2}/.test(w) && w === w.toLocaleUpperCase('it-IT');
  const bello = s => { s = s.toLocaleLowerCase('it-IT'); return s.charAt(0).toLocaleUpperCase('it-IT') + s.slice(1); };
  function analizza(titolo) {
    const tel = (titolo.match(TEL) || [])[0] || '';
    const senzaTel = titolo.replace(TEL, ' ').replace(/\s+/g, ' ').trim();
    const w = senzaTel.split(' ');
    // il servizio inizia dalla prima parola in MAIUSCOLO, oppure da un numero/prezzo (es. "1/2 GAMBA", "€25")
    let i = w.findIndex((x, k) => k > 0 && (maiuscola(x) || /^[\d€+]/.test(x)));
    if (i < 0) return { nome: senzaTel, tel, servizio: '', note: '' };
    const nome = w.slice(0, i).join(' ').replace(/[.,;:\s]+$/, '');
    let servizio = w.slice(i).join(' ');
    const note = [];
    servizio = servizio.replace(/€\s?\d+(?:[.,]\d+)?|\b\d+(?:[.,]\d+)?\s?€|\btotale\b|\((?:carta|contanti|bancomat|pos)\)/gi, m => { note.push(m.trim()); return ' '; })
      .replace(/\s+/g, ' ').replace(/[\s+,-]+$/, '').trim();
    return { nome, tel: tel.replace(/\D/g, ''), servizio: servizio ? bello(servizio) : '', note: note.join(' ') };
  }

  /* ---------- analisi del file ---------- */
  function prepara(testo) {
    const db = BC.getDb();
    const giaImportati = new Set(db.appuntamenti.map(a => a.gcal).filter(Boolean));
    const chiaviEsistenti = new Set(db.appuntamenti.map(a => a.inizio + '|' + ((db.clienti.find(c => c.id === a.clienteId) || {}).nome || '').toLowerCase()));
    const app = [], esclusi = new Map();
    let doppi = 0;
    for (const ev of leggiIcs(testo)) {
      if (ev.STATUS && ev.STATUS.val === 'CANCELLED') continue;
      const titolo = testoIcs(ev.SUMMARY && ev.SUMMARY.val);
      const ini = dataIcs(ev.DTSTART);
      if (!ini || ini.tuttoGiorno || !titolo) continue; // eventi di tutto il giorno (ferie, viaggi…) esclusi
      const fin = dataIcs(ev.DTEND);
      const durata = fin && fin.d ? Math.round((fin.d - ini.d) / 6e4) : 60;
      const a = analizza(titolo);
      const voce = {
        uid: ev.UID ? ev.UID.val : titolo + ini.d.toISOString(),
        titolo, inizio: ini.d.toISOString(), durata: durata > 0 && durata <= 600 ? durata : 60,
        nome: a.nome, tel: a.tel, servizio: a.servizio,
        note: [a.note, testoIcs(ev.DESCRIPTION && ev.DESCRIPTION.val)].filter(Boolean).join(' · ').slice(0, 300)
      };
      if (giaImportati.has(voce.uid) || chiaviEsistenti.has(voce.inizio + '|' + voce.nome.toLowerCase())) { doppi++; continue; }
      if (a.servizio) app.push(voce);
      else {
        const k = titolo.trim();
        if (!esclusi.has(k)) esclusi.set(k, []);
        esclusi.get(k).push(voce);
      }
    }
    return { app, esclusi, doppi };
  }

  /* ---------- anteprima ---------- */
  let analisi = null;
  function mostraAnteprima() {
    const ora = Date.now();
    const { app, esclusi, doppi } = analisi;
    const futuri = app.filter(x => +new Date(x.inizio) >= ora).length;
    const clienti = new Set(app.map(x => x.nome.toLowerCase())).size;
    const conTel = new Set(app.filter(x => x.tel).map(x => x.nome.toLowerCase())).size;
    const gruppi = [...esclusi.entries()].sort((a, b) => b[1].length - a[1].length);
    const freq = {};
    app.forEach(x => { const k = x.servizio; (freq[k] = freq[k] || []).push(x.durata); });
    const top = Object.entries(freq).sort((a, b) => b[1].length - a[1].length).slice(0, 12);

    window.openSheet(`
      <h3>Importa da Google Calendar</h3>
      <p class="lead">Ho letto il calendario. Controlla e poi tocca <b>Importa</b>.</p>
      <div class="kv"><span>Appuntamenti riconosciuti</span><b>${app.length}</b></div>
      <div class="kv"><span>…di cui da oggi in poi</span><b>${futuri}</b></div>
      <div class="kv"><span>Clienti</span><b>${clienti}</b></div>
      <div class="kv"><span>Clienti con numero di telefono</span><b>${conTel}</b></div>
      ${doppi ? `<div class="kv"><span>Già presenti nell'app (saltati)</span><b>${doppi}</b></div>` : ''}

      <label>Cosa importare</label>
      <select id="gQuali">
        <option value="tutti">Tutti, anche i passati (storico delle clienti)</option>
        <option value="futuri">Solo da oggi in poi</option>
      </select>

      ${top.length ? `<label style="display:flex;gap:10px;align-items:flex-start;color:var(--txt);font-size:14px;margin-top:16px">
        <input type="checkbox" id="gServizi" checked style="width:20px;height:20px;flex:0 0 20px;margin-top:1px;accent-color:#1d1517">
        <span>Sostituisci l'elenco servizi con i suoi ${top.length} più usati<br><small style="color:var(--mut)">${top.slice(0, 5).map(([k]) => esc(k)).join(', ')}…</small></span>
      </label>` : ''}

      ${gruppi.length ? `
      <details style="margin-top:16px">
        <summary style="cursor:pointer;font-size:14px;color:var(--mut)">${gruppi.reduce((s, g) => s + g[1].length, 0)} eventi esclusi perché senza servizio (es. impegni personali). Tocca per vederli e recuperare quelli che sono clienti.</summary>
        <div style="max-height:260px;overflow:auto;margin-top:10px">
          ${gruppi.map(([k, v], i) => `
            <label style="display:flex;gap:10px;align-items:center;color:var(--txt);font-size:14px;margin:0;padding:8px 2px;border-bottom:1px solid var(--line)">
              <input type="checkbox" data-escl="${i}" style="width:18px;height:18px;flex:0 0 18px;accent-color:#1d1517">
              <span style="flex:1">${esc(k)}</span><small style="color:var(--mut)">${v.length}×</small>
            </label>`).join('')}
        </div>
      </details>` : ''}

      <button class="btn pri block" id="gGo" style="margin-top:18px">Importa</button>
      <p class="hint" style="text-align:center">Gli appuntamenti futuri risulteranno "Da confermare": riceveranno i promemoria come quelli nuovi. Puoi ripetere l'importazione: quelli già presenti vengono saltati.</p>`);

    $('#gGo').addEventListener('click', () => {
      const soloFuturi = $('#gQuali').value === 'futuri';
      const recuperati = [...document.querySelectorAll('[data-escl]:checked')]
        .flatMap(c => gruppi[Number(c.dataset.escl)][1].map(x => ({ ...x, servizio: x.servizio || 'Appuntamento' })));
      importa([...app, ...recuperati], soloFuturi, $('#gServizi') && $('#gServizi').checked ? top : null);
    });
  }

  /* ---------- importazione ---------- */
  function importa(voci, soloFuturi, servizi) {
    const db = BC.getDb();
    const ora = Date.now();
    const perNome = new Map(db.clienti.map(c => [c.nome.toLowerCase(), c]));
    let nuoviApp = 0, nuoviCli = 0;
    voci.sort((a, b) => a.inizio.localeCompare(b.inizio));
    for (const v of voci) {
      const futuro = +new Date(v.inizio) >= ora;
      if (soloFuturi && !futuro) continue;
      const nome = (v.nome || v.titolo).trim();
      let c = perNome.get(nome.toLowerCase());
      if (!c) { c = { id: uidNuovo(), nome, tel: v.tel || '', note: '' }; db.clienti.push(c); perNome.set(nome.toLowerCase(), c); nuoviCli++; }
      else if (v.tel && !c.tel) c.tel = v.tel;
      db.appuntamenti.push({
        id: uidNuovo(), clienteId: c.id, servizioNome: v.servizio, inizio: v.inizio, durata: v.durata,
        note: v.note || '', stato: futuro ? 'prenotato' : 'confermato', inviato: {},
        creato: new Date().toISOString(), gcal: v.uid
      });
      nuoviApp++;
    }
    if (servizi && servizi.length) {
      db.servizi = servizi.map(([nome, durate]) => {
        const s = durate.slice().sort((a, b) => a - b);
        return { id: uidNuovo(), nome, durata: s[Math.floor(s.length / 2)] || 60 };
      });
    }
    BC.save();
    window.closeSheet();
    BC.render();
    BC.toast(`Importati ${nuoviApp} appuntamenti e ${nuoviCli} nuove clienti ✓`);
  }

  /* ---------- scelta del file ---------- */
  async function leggiFile(file) {
    if (!file) return;
    BC.toast('Lettura del calendario…');
    try {
      const buf = await file.arrayBuffer();
      const u8 = new Uint8Array(buf, 0, 4);
      const isZip = u8[0] === 0x50 && u8[1] === 0x4b;
      const testo = isZip ? await estraiIcsDaZip(buf) : new TextDecoder().decode(buf);
      if (!/BEGIN:VCALENDAR/.test(testo)) throw new Error('non è un calendario');
      analisi = prepara(testo);
      if (!analisi.app.length && !analisi.esclusi.size) return BC.toast(analisi.doppi ? 'Questi appuntamenti sono già tutti nell\'app' : 'Nessun appuntamento trovato nel file');
      mostraAnteprima();
    } catch (e) {
      console.error(e);
      BC.toast(e.message === 'nozip' ? 'Questo telefono non apre lo .zip: estrai il file .ics e scegli quello' : 'File non valido: scegli il file esportato da Google Calendar');
    }
  }

  // il pulsante sta nelle Impostazioni (app.js)
  document.addEventListener('change', e => {
    if (e.target && e.target.id === 'gcalFile') { leggiFile(e.target.files[0]); e.target.value = ''; }
  });

  window.BCImport = { analizza, leggiIcs, prepara }; // usato nei test
})();
