/* =========================================================
   Beauty Concept – crea il file calendario (.ics) dell'appuntamento
   Usato sia dalla pagina cliente sia dal service worker, che lo
   restituisce come vero file "evento.ics": così iPhone mostra
   direttamente "Aggiungi al calendario".
   Promemoria inclusi: 3 giorni (72 h) e 2 giorni (48 h) prima.
   ========================================================= */
(function (g) {
  function icsDate(d) { return d.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'; }
  function icsTxt(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function fold(line) { // righe di max 75 caratteri, come richiede lo standard
    const out = []; let s = line;
    while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); }
    out.push(s); return out.join('\r\n');
  }
  // legge i dati dal link (?n=&s=&t=&m=&c=&a=&p=)
  function daParametri(search) {
    const q = new URLSearchParams(search);
    const t = q.get('t') || '';
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(t);
    if (!m) return null;
    const inizio = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
    const durata = Math.max(5, parseInt(q.get('m'), 10) || 60);
    const centro = q.get('c') || 'Beauty Concept';
    const servizio = q.get('s') || 'Appuntamento';
    const tel = (q.get('p') || '').replace(/\D/g, '');
    return {
      t, nome: q.get('n') || '', servizio, centro, indirizzo: q.get('a') || '', tel, durata,
      inizio, fine: new Date(inizio.getTime() + durata * 60000),
      titolo: servizio + ' · ' + centro,
      descr: 'Appuntamento da ' + centro + ': ' + servizio + '.' + (tel ? ' Per spostarlo contatta il centro: +' + tel : '')
    };
  }
  function crea(d) {
    const alarm = ore => ['BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsTxt('Promemoria: ' + d.titolo), 'TRIGGER:-PT' + ore + 'H', 'END:VALARM'];
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Beauty Concept//Agenda//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + d.t + '-' + encodeURIComponent(d.nome || 'cliente') + '@beautyconcept',
      'DTSTAMP:' + icsDate(new Date()),
      'DTSTART:' + icsDate(d.inizio),
      'DTEND:' + icsDate(d.fine),
      'SUMMARY:' + icsTxt(d.titolo),
      'DESCRIPTION:' + icsTxt(d.descr),
      d.indirizzo ? 'LOCATION:' + icsTxt(d.indirizzo) : null
    ].concat(alarm(72), alarm(48), ['END:VEVENT', 'END:VCALENDAR'])
      .filter(Boolean).map(fold).join('\r\n') + '\r\n';
  }
  g.BCIcs = { daParametri, crea, icsDate };
})(typeof self !== 'undefined' ? self : window);
