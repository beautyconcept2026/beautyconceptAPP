'use strict';
/* =========================================================
   Beauty Concept – Numeri dalla rubrica del telefono
   • Importa la rubrica esportata (.vcf) e abbina i numeri
     alle clienti che ne sono senza
   • Su Android: pulsante "Prendi dalla rubrica" nella scheda cliente
   ========================================================= */
(function () {
  const BC = window.BC;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- lettura del file .vcf ---------- */
  function decodQP(s, charset) {
    const bytes = [];
    s = s.replace(/=\r?\n/g, '');
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '=' && /^[0-9A-F]{2}$/i.test(s.substr(i + 1, 2))) { bytes.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; }
      else bytes.push(s.charCodeAt(i));
    }
    try { return new TextDecoder(charset || 'utf-8').decode(new Uint8Array(bytes)); } catch (e) { return s; }
  }
  function leggiVcf(testo) {
    // righe spezzate: continuano con spazio, oppure (quoted-printable) finiscono con "="
    const righe = testo.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').replace(/=\r?\n/g, '=\u0000').split(/\r?\n/).map(r => r.replace(/=\u0000/g, '=\n'));
    const contatti = [];
    let c = null;
    for (const r of righe) {
      const up = r.toUpperCase();
      if (up === 'BEGIN:VCARD') { c = { fn: '', n: '', tel: [] }; continue; }
      if (up === 'END:VCARD') { if (c) contatti.push(c); c = null; continue; }
      if (!c) continue;
      const i = r.indexOf(':'); if (i < 0) continue;
      const testa = r.slice(0, i), parti = testa.split(';');
      const chiave = parti[0].replace(/^item\d+\./i, '').toUpperCase();
      let val = r.slice(i + 1);
      if (/ENCODING=QUOTED-PRINTABLE/i.test(testa)) {
        const cs = (testa.match(/CHARSET=([^;:]+)/i) || [])[1];
        val = decodQP(val, cs);
      }
      val = val.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
      if (chiave === 'FN') c.fn = val;
      else if (chiave === 'N') c.n = val.split(';').slice(0, 2).reverse().filter(Boolean).join(' ');
      else if (chiave === 'TEL') c.tel.push({ num: val, cell: /CELL|MOBILE|IPHONE/i.test(testa) });
    }
    return contatti
      .map(x => ({ nome: (x.fn || x.n || '').trim(), tel: sceltaNumero(x.tel) }))
      .filter(x => x.nome && x.tel);
  }
  function sceltaNumero(lista) {
    const pulito = t => t.replace(/[^\d+]/g, '');
    const cell = lista.find(t => /^(\+?39)?3\d{8,9}$/.test(pulito(t.num).replace(/^0039/, '+39')))
      || lista.find(t => t.cell) || lista[0];
    return cell ? pulito(cell.num) : '';
  }

  /* ---------- abbinamento nome cliente ↔ contatto ---------- */
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const parole = s => norm(s).split(' ').filter(w => w.length > 1);

  function abbina(clienti, contatti) {
    const voci = contatti.map(c => ({ ...c, chiave: norm(c.nome), set: new Set(parole(c.nome)) }));
    const perChiave = new Map();
    voci.forEach(v => { if (!perChiave.has(v.chiave)) perChiave.set(v.chiave, []); perChiave.get(v.chiave).push(v); });
    const sicuri = [], dubbi = [], nonTrovati = [];
    for (const cl of clienti) {
      const p = parole(cl.nome);
      if (!p.length) { nonTrovati.push(cl); continue; }
      // 1) stesso nome identico (anche con nome e cognome invertiti)
      let cand = (perChiave.get(norm(cl.nome)) || []).concat(perChiave.get(p.slice().reverse().join(' ')) || []);
      // 2) il contatto contiene tutte le parole del nome cliente (es. "Nadia Costa Estetica")
      if (!cand.length) cand = voci.filter(v => p.every(w => v.set.has(w)));
      // numeri diversi = candidati diversi
      const unici = [...new Map(cand.map(v => [v.tel.replace(/^\+?39/, ''), v])).values()];
      if (unici.length === 1 && p.length >= 2) sicuri.push({ cl, c: unici[0] });
      else if (unici.length >= 1) dubbi.push({ cl, cand: unici.slice(0, 8) });
      else nonTrovati.push(cl);
    }
    return { sicuri, dubbi, nonTrovati };
  }

  /* ---------- anteprima ---------- */
  function anteprima(contatti) {
    const db = BC.getDb();
    const senza = db.clienti.filter(c => !String(c.tel || '').replace(/\D/g, ''));
    if (!senza.length) return BC.toast('Tutte le clienti hanno già il numero ✓');
    const { sicuri, dubbi, nonTrovati } = abbina(senza, contatti);
    window.openSheet(`
      <h3>Numeri dalla rubrica</h3>
      <p class="lead">Ho letto <b>${contatti.length}</b> contatti. Su <b>${senza.length}</b> clienti senza numero:</p>
      <div class="kv"><span>✅ Abbinate con sicurezza</span><b>${sicuri.length}</b></div>
      <div class="kv"><span>🤔 Da controllare</span><b>${dubbi.length}</b></div>
      <div class="kv"><span>Non trovate in rubrica</span><b>${nonTrovati.length}</b></div>

      ${sicuri.length ? `<div class="section-t">Abbinate (togli la spunta se è sbagliata)</div>
      <div class="rb-box">${sicuri.map((x, i) => `
        <label class="rb-row"><input type="checkbox" data-s="${i}" checked>
          <span><b>${esc(x.cl.nome)}</b><small>${esc(x.c.nome)} · ${esc(x.c.tel)}</small></span></label>`).join('')}</div>` : ''}

      ${dubbi.length ? `<div class="section-t">Da controllare (scegli il contatto giusto)</div>
      <div class="rb-box">${dubbi.map((x, i) => `
        <div class="rb-row"><span><b>${esc(x.cl.nome)}</b>
          <select data-d="${i}" style="margin-top:6px;padding:9px 34px 9px 10px;font-size:14px">
            <option value="">— non associare —</option>
            ${x.cand.map((c, k) => `<option value="${k}">${esc(c.nome)} · ${esc(c.tel)}</option>`).join('')}
          </select></span></div>`).join('')}</div>` : ''}

      <button class="btn pri block" id="rbGo" style="margin-top:18px">Salva i numeri</button>
      <p class="hint" style="text-align:center">Vengono aggiunti solo alle clienti senza numero. I numeri già presenti non vengono toccati.</p>`);

    $('#rbGo').addEventListener('click', () => {
      let n = 0;
      document.querySelectorAll('[data-s]').forEach(ch => { if (ch.checked) { const x = sicuri[ch.dataset.s]; x.cl.tel = x.c.tel; n++; } });
      document.querySelectorAll('[data-d]').forEach(sel => { if (sel.value !== '') { const x = dubbi[sel.dataset.d]; x.cl.tel = x.cand[Number(sel.value)].tel; n++; } });
      BC.save(); window.closeSheet(); BC.render();
      BC.toast(n ? `Aggiunti ${n} numeri ✓` : 'Nessun numero aggiunto');
    });
  }

  async function leggiFile(file) {
    if (!file) return;
    try {
      const testo = await file.text();
      if (!/BEGIN:VCARD/i.test(testo)) throw new Error();
      const contatti = leggiVcf(testo);
      if (!contatti.length) return BC.toast('Nel file non ci sono contatti con numero');
      anteprima(contatti);
    } catch (e) { BC.toast('File non valido: serve il file .vcf della rubrica'); }
  }
  document.addEventListener('change', e => {
    if (e.target && e.target.id === 'vcfFile') { leggiFile(e.target.files[0]); e.target.value = ''; }
  });

  /* ---------- Android: scegli un contatto dalla rubrica ---------- */
  const pickerOk = 'contacts' in navigator && 'ContactsManager' in window;
  window.BCRubrica = {
    pickerOk,
    async scegli(input) {
      try {
        const [c] = await navigator.contacts.select(['name', 'tel'], { multiple: false });
        if (!c || !c.tel || !c.tel.length) return BC.toast('Il contatto non ha un numero');
        input.value = sceltaNumero(c.tel.map(t => ({ num: t, cell: false })));
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (e) { /* annullato */ }
    },
    leggiVcf, abbina // usati nei test
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-rubrica]');
    if (b) window.BCRubrica.scegli(document.getElementById(b.dataset.rubrica));
  });
})();
