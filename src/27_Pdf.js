/**
 * PDF-Ausgaben: Prüfnachweis, Arbeitsliste, Atemschutzliste, Einsatzbericht,
 * Dienstnachweis je Mitglied, Stundenübersicht.
 *
 * Das SaaS-Produkt schreibt seine PDFs Byte für Byte selbst (`pdf.ts`), nachdem
 * `window.print()` am zurückgekommenen Blatt gescheitert war: Adresse der Anwendung
 * quer über dem Nachweis, leere erste Seite, unten offene Tabellen. Die Lehre daraus
 * war nicht „selbst schreiben“, sondern „die Bytes bestimmen, nicht den Browser“.
 *
 * Hier gibt es dafür ein Werkzeug, das nichts kostet: Apps Script wandelt HTML auf dem
 * Server in PDF (`Blob.getAs`). Das Ergebnis hängt an keinem Browser, keiner
 * Druckeinstellung und keinem Häkchen bei „Hintergrundgrafiken“ – derselbe Nachweis
 * auf jedem Gerät. Der Konverter kann wenig CSS; die Vorlagen bleiben deshalb bei
 * Tabellen, Rahmen und Schriftgrößen.
 */

function esc_(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function datumDe_(iso) {
  if (!iso) return '–';
  const t = String(iso).slice(0, 10).split('-');
  return t.length === 3 ? t[2] + '.' + t[1] + '.' + t[0] : String(iso);
}

function intervallText_(wert, einheit) {
  if (wert === 1) return einheit === 'tage' ? 'täglich' : einheit === 'monate' ? 'monatlich' : 'jährlich';
  return 'alle ' + wert + ' ' + ({ tage: 'Tage', monate: 'Monate', jahre: 'Jahre' }[einheit] || einheit);
}

const STATUS_TEXT_ = {
  einsatzbereit: 'Einsatzbereit',
  zu_reinigen: 'Zu reinigen',
  zur_pruefung: 'Zur Prüfung',
  defekt: 'Defekt',
  ausgemustert: 'Ausgemustert',
};

const PDF_STIL_ = [
  'body{font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#111;margin:0}',
  'table{border-collapse:collapse;width:100%}',
  'td,th{padding:4pt 5pt;vertical-align:top;text-align:left}',
  '.kopf td{padding:0}',
  '.wehr{font-size:11pt;font-weight:bold}',
  '.titel{font-size:20pt;font-weight:bold}',
  '.grau{color:#666}',
  '.klein{font-size:8pt}',
  '.feld td{border-bottom:0.5pt solid #bbb}',
  '.feld .b{font-size:7pt;color:#666;text-transform:uppercase;letter-spacing:0.5pt;width:22%}',
  '.feld .w{font-weight:bold;width:28%}',
  '.ergebnis{border:1.5pt solid #111;padding:6pt 8pt;font-size:13pt;font-weight:bold}',
  '.liste th{font-size:7pt;text-transform:uppercase;letter-spacing:0.5pt;border-bottom:1pt solid #111;border-top:1pt solid #111}',
  '.liste td{border-bottom:0.5pt solid #bbb}',
  '.kasten{width:11pt;height:11pt;border:1pt solid #111;display:inline-block}',
  '.linie{border-bottom:0.75pt solid #111;height:22pt}',
].join('');

function pdfAusHtml_(titel, inhalt, dateiname) {
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc_(titel) + '</title>' +
    '<style>' + PDF_STIL_ + '</style></head><body>' + inhalt + '</body></html>';
  const blob = Utilities.newBlob(html, 'text/html', dateiname.replace(/\.pdf$/, '.html')).getAs('application/pdf');
  // Die Art aus dem Ergebnis, nicht behauptet: In der lokalen Vorschau gibt es keinen
  // Wandler, dort kommt das HTML zurück – und der Browser zeigt es dann statt es zu speichern.
  return { name: dateiname, mime: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()) };
}

function briefkopf_(v, titel, rechts) {
  const logo = v.einstellung('logo');
  return '<table class="kopf"><tr>' +
    (logo ? '<td style="width:70pt"><img src="' + esc_(logo) + '" style="max-width:62pt;max-height:40pt"></td>' : '') +
    '<td><div class="wehr">' + esc_(v.einstellung('wehr_name')) + '</div>' +
    '<div class="titel">' + esc_(titel) + '</div></td>' +
    '<td style="text-align:right" class="grau">' + rechts + '</td></tr></table>' +
    '<div style="border-bottom:1pt solid #111;margin:6pt 0 12pt"></div>';
}

function pruefnachweisPdf_(v, pruefungId) {
  const p = v.hole('pruefungen', pruefungId);
  const g = v.hole('geraete', p.geraet_id);
  const typ = v.finde('geraetetypen', g.geraetetyp_id);
  const plan = v.finde('pruefplaene', p.pruefplan_id);
  const stand = plan ? v.alle('plan_stand').find((s) => s.geraet_id === g.id && s.pruefplan_id === plan.id) : null;
  const bestanden = p.ergebnis === 'bestanden';
  const wert = stand && stand.abw_wert ? stand.abw_wert : plan ? plan.intervall_wert : null;
  const einheit = stand && stand.abw_einheit ? stand.abw_einheit : plan ? plan.intervall_einheit : null;
  const naechste = bestanden && wert ? datumPlus_(p.geprueft_am, wert, einheit) : null;

  let zeitpunkt = '';
  if (p.faellig_am) {
    const d = tageZwischen_(p.geprueft_am, p.faellig_am);
    if (d > 0) zeitpunkt = d + ' Tage vor Fälligkeit';
    if (d < 0) zeitpunkt = -d + ' Tage nach Fälligkeit';
  }

  const felder = [
    ['Gerät', g.bezeichnung || '–'],
    ['Gerätetyp', typ ? typ.name : '–'],
    ['Barcode', g.barcode],
    ['Seriennummer', g.seriennummer || '–'],
    ['Prüfplan', p.plan_name],
    ['Intervall', wert ? intervallText_(wert, einheit) : '–'],
    ['Geprüft am', datumDe_(p.geprueft_am) + (zeitpunkt ? '<br><span class="grau klein">' + esc_(zeitpunkt) + '</span>' : ''), true],
    ['Prüfer', p.benutzer_name || '–'],
    ['Nächste Fälligkeit', naechste ? datumDe_(naechste) : bestanden ? '–' : 'unverändert – bleibt fällig'],
    ['Status danach', p.status_danach ? STATUS_TEXT_[p.status_danach] || p.status_danach : 'unverändert'],
  ];
  let tabelle = '<table class="feld">';
  for (let i = 0; i < felder.length; i += 2) {
    tabelle += '<tr>';
    [felder[i], felder[i + 1]].forEach((f) => {
      if (!f) return;
      tabelle += '<td class="b">' + esc_(f[0]) + '</td><td class="w">' + (f[2] ? f[1] : esc_(f[1])) + '</td>';
    });
    tabelle += '</tr>';
  }
  tabelle += '</table>';

  const schritte = (p.schritte || []).map((s, i) => {
    let erg = '';
    if (s.art === 'haken') erg = s.ok === true ? 'in Ordnung' : s.ok === false ? 'BEANSTANDET' : '–';
    else erg = s.wert ? s.wert + (s.einheit ? ' ' + s.einheit : '') : '–';
    if (s.art === 'text') erg = s.wert ? 'siehe Bemerkung' : '–';
    const bemerkung = s.art === 'text' ? s.wert : s.notiz;
    return '<tr><td style="width:14pt">' + (i + 1) + '</td><td>' + esc_(s.titel) +
      (s.pflicht ? '' : ' <span class="grau klein">(optional)</span>') + '</td><td style="width:90pt;font-weight:bold">' +
      esc_(erg) + '</td><td style="width:170pt">' + esc_(bemerkung || '') + '</td></tr>';
  }).join('');

  const inhalt = briefkopf_(v, 'Prüfnachweis', esc_(g.barcode) + '<br>' + datumDe_(p.geprueft_am)) +
    tabelle +
    '<div style="height:12pt"></div>' +
    '<div class="ergebnis"><span class="grau klein" style="font-weight:normal">ERGEBNIS&nbsp;&nbsp;</span>' +
    (bestanden ? 'BESTANDEN' : 'NICHT BESTANDEN') + '</div>' +
    (schritte
      ? '<div style="height:14pt"></div><table class="liste"><tr><th>#</th><th>Prüfschritt</th><th>Ergebnis</th><th>Bemerkung</th></tr>' +
        schritte + '</table>'
      : '') +
    (p.bemerkung
      ? '<div style="height:12pt"></div><div class="klein grau">BEMERKUNG</div><div>' +
        esc_(p.bemerkung).replace(/\n/g, '<br>') + '</div>'
      : '') +
    '<div style="height:40pt"></div><table><tr>' +
    '<td style="width:45%"><div class="linie"></div><div class="klein grau">Ort, Datum</div></td><td></td>' +
    '<td style="width:45%"><div class="linie"></div><div class="klein grau">Unterschrift Prüfer (' + esc_(p.benutzer_name) + ')</div></td>' +
    '</tr></table>' +
    '<div style="height:20pt"></div><div class="klein grau">Erfasst am ' + esc_(datumZeitDe_(p.erfasst_am)) +
    ' · FeuerwehrManager ' + APP_VERSION + '</div>';

  return pdfAusHtml_('Prüfnachweis ' + g.barcode, inhalt,
    'Pruefnachweis_' + g.barcode.replace(/[^A-Za-z0-9-]/g, '_') + '_' + p.geprueft_am + '.pdf');
}

function datumZeitDe_(iso) {
  if (!iso) return '–';
  return Utilities.formatDate(new Date(iso), zeitzone_(), 'dd.MM.yyyy HH:mm');
}

/**
 * Die Arbeitsliste zum Mitnehmen in die Werkstatt – mit dem, wofür man sie ausdruckt:
 * einem Kästchen je Zeile und einer Linie zum Abzeichnen. Der Wart hakt auf Papier
 * ab und erfasst hinterher. Am Bildschirm fehlt beides, deshalb ist es kein Ausdruck
 * der Bildschirmansicht, sondern ein eigenes Blatt (SaaS A13, zweiter Punkt).
 */
function arbeitslistePdf_(v, tage) {
  const heute = heute_();
  const grenze = Number.isFinite(tage) ? tage : Number(v.einstellung('vorwarnung_pruefung_tage')) || 30;
  const liste = ableiten_(grunddaten_(v)).arbeitsliste
    .filter((a) => a.art !== 'pruefung' || a.tage <= grenze)
    .sort((x, y) => (x.art === 'pruefung' ? x.tage : -9999) - (y.art === 'pruefung' ? y.tage : -9999));

  const zeilen = liste.map((a) => {
    const g = v.finde('geraete', a.geraet_id);
    const typ = v.finde('geraetetypen', g.geraetetyp_id);
    const ort = v.finde('lagerplaetze', g.lagerplatz_id);
    let faellig;
    let aufgabe;
    if (a.art === 'pruefung') {
      const plan = v.finde('pruefplaene', a.plan_id);
      faellig = datumDe_(a.faellig) + '<br><span class="klein grau">' +
        (a.tage < 0 ? -a.tage + ' Tage überfällig' : a.tage === 0 ? 'heute' : 'in ' + a.tage + ' Tagen') + '</span>';
      aufgabe = esc_(plan ? plan.name : 'Prüfung') + '<br><span class="klein grau">' +
        esc_(intervallText_(a.intervall_wert, a.intervall_einheit)) + '</span>';
    } else {
      faellig = '<b>sofort</b>';
      aufgabe = a.art === 'reinigung' ? 'Reinigen' : 'Reparatur';
    }
    return '<tr><td style="width:16pt"><span class="kasten">&nbsp;</span></td><td style="width:62pt">' + faellig +
      '</td><td>' + aufgabe + '</td><td><b>' + esc_(g.bezeichnung || typ.name) + '</b><br><span class="klein grau">' +
      esc_((g.bezeichnung ? typ.name + ' · ' : '') + g.barcode) + '</span></td><td>' + esc_(ort ? ort.name : '') +
      '</td><td style="width:90pt"><div class="linie" style="height:16pt"></div></td></tr>';
  }).join('');

  const inhalt = briefkopf_(v, 'Arbeitsliste',
    'Stand ' + datumDe_(heute) + '<br>' + liste.length + ' Vorgänge · Prüfungen bis ' + grenze + ' Tage') +
    (zeilen
      ? '<table class="liste"><tr><th></th><th>Fällig</th><th>Aufgabe</th><th>Gerät</th><th>Standort</th><th>Erledigt / Kürzel</th></tr>' +
        zeilen + '</table>'
      : '<p>Nichts zu tun.</p>') +
    '<div style="height:16pt"></div><div class="klein grau">Abgehakte Prüfungen bitte in der Anwendung erfassen – ' +
    'erst dann verschiebt sich der Termin und es entsteht ein Nachweis.</div>';

  return pdfAusHtml_('Arbeitsliste', inhalt, 'Arbeitsliste_' + heute + '.pdf');
}

/**
 * Die Atemschutzliste: wer heute unter Atemschutz darf, und was demnächst abläuft.
 *
 * Für den Aushang in der Wache und für den Einsatzleiter, der vor dem Einsatz wissen
 * will, wen er schicken kann. Aufgeführt sind die Atemschutzgeräteträger – wer gar
 * keinen Nachweis einer Atemschutz-Art hat, gehört nicht auf diese Liste. Je Art steht
 * der aktuelle Nachweis, nicht die ersetzten.
 */
function personalPdf_(v) {
  const d = personalDaten_(v);
  const heute = d.heute;
  const mitglieder = d.mitglieder.filter((m) => m.aktiv);
  const arten = d.qualiarten;
  d.mitglieder = mitglieder;
  const p = personalAbleiten_(d);
  // Mit den Nachweisen aus Einsätzen – dieselbe Rechnung wie in der Übersicht.
  const aktuell = nachweiseAktuell_(d.nachweise.concat(p.ausEinsatz));
  const atemschutz = arten.filter((a) => a.atemschutz && a.aktiv);
  const traeger = mitglieder
    .filter((m) => p.atemschutz[m.id] !== 'keiner')
    .sort((a, b) => String(a.name).localeCompare(b.name));
  const ZUSTAND = { tauglich: 'tauglich', abgelaufen: 'NICHT – abgelaufen', unvollstaendig: 'NICHT – unvollständig' };

  const zelle = (n) => {
    if (!n) return '<td class="grau">fehlt</td>';
    if (!n.gueltig_bis) return '<td>' + datumDe_(n.erworben_am) + '<br><span class="klein grau">unbefristet</span></td>';
    const tage = tageZwischen_(heute, n.gueltig_bis);
    const text = tage < 0 ? '<b>abgelaufen</b>' : tage <= p.vorwarnung ? 'noch ' + tage + ' Tage' : '';
    return '<td>bis ' + datumDe_(n.gueltig_bis) + (text ? '<br><span class="klein">' + text + '</span>' : '') + '</td>';
  };
  const zeilen = traeger.map((m) => {
    const eigene = aktuell[m.id] || {};
    const z = p.atemschutz[m.id];
    return '<tr><td><b>' + esc_(m.name) + '</b></td>' + atemschutz.map((a) => zelle(eigene[a.id])).join('') +
      '<td style="font-weight:bold">' + esc_(ZUSTAND[z] || z) + '</td></tr>';
  }).join('');

  const artName = {};
  arten.forEach((a) => {
    artName[a.id] = a.name;
  });
  const name = {};
  mitglieder.forEach((m) => {
    name[m.id] = m.name;
  });
  const ablauf = p.faellig.map((f) => '<tr><td>' + datumDe_(f.gueltig_bis) + '<br><span class="klein grau">' +
    (f.tage < 0 ? -f.tage + ' Tage abgelaufen' : f.tage === 0 ? 'heute' : 'in ' + f.tage + ' Tagen') + '</span></td><td>' +
    esc_(name[f.mitglied_id] || '') + '</td><td>' + esc_(artName[f.art_id] || '') + '</td></tr>').join('');

  const inhalt = briefkopf_(v, 'Atemschutz', 'Stand ' + datumDe_(heute) + '<br>' + p.tauglich + ' von ' + traeger.length + ' tauglich') +
    (atemschutz.length
      ? (zeilen
        ? '<table class="liste"><tr><th>Name</th>' + atemschutz.map((a) => '<th>' + esc_(a.name) + '</th>').join('') +
          '<th>Unter Atemschutz</th></tr>' + zeilen + '</table>'
        : '<p>Noch niemand mit einem Nachweis für Atemschutz.</p>')
      : '<p>Keine Qualifikation ist als Voraussetzung für Atemschutz markiert.</p>') +
    (ablauf
      ? '<div style="height:16pt"></div><div class="wehr">Läuft in den nächsten ' + p.vorwarnung + ' Tagen ab oder ist abgelaufen</div>' +
        '<div style="height:4pt"></div><table class="liste"><tr><th>Gültig bis</th><th>Name</th><th>Nachweis</th></tr>' + ablauf + '</table>'
      : '') +
    '<div style="height:16pt"></div><div class="klein grau">Maßgeblich ist das Datum auf der Bescheinigung. ' +
    'Diese Liste enthält Gesundheitsdaten – bitte nicht offen aushängen, wo Fremde sie sehen.</div>';

  return pdfAusHtml_('Atemschutz', inhalt, 'Atemschutz_' + heute + '.pdf');
}

// ─────────────────────────────── Einsätze ───────────────────────────────

const EINSATZ_ART_TEXT_ = { einsatz: 'Einsatz', uebung: 'Übung', wache: 'Brandsicherheitswache', sonstiges: 'Sonstiger Dienst' };
const EINSATZ_ART_MEHRZAHL_ = { einsatz: 'Einsätze', uebung: 'Übungen', wache: 'Wachen', sonstiges: 'Sonstige' };
const BERICHT_TITEL_ = { einsatz: 'Einsatzbericht', uebung: 'Übungsbericht', wache: 'Bericht Brandsicherheitswache', sonstiges: 'Dienstbericht' };

/** Uhrzeit – und das Datum dazu, wenn es nicht der Tag ist, an dem es begann. */
function zeitDe_(iso, tag) {
  if (!iso) return '–';
  const d = new Date(iso);
  return Utilities.formatDate(d, zeitzone_(), tagVon_(iso) === tag ? 'HH:mm' : 'dd.MM. HH:mm');
}

function feldTabelle_(felder) {
  let t = '<table class="feld">';
  for (let i = 0; i < felder.length; i += 2) {
    t += '<tr>';
    [felder[i], felder[i + 1]].forEach((f) => {
      if (!f) return;
      t += '<td class="b">' + esc_(f[0]) + '</td><td class="w">' + esc_(f[1]) + '</td>';
    });
    t += '</tr>';
  }
  return t + '</table>';
}

/**
 * Der Bericht zum Ablegen: Kopfdaten, was geschah, wer mit welchem Fahrzeug dabei war –
 * und die Abschrift des Einsatztagebuchs, Gestrichenes durchgestrichen. Wie drüben das
 * Tagebuch selbst: Was einmal eingetragen war, bleibt sichtbar.
 */
function einsatzberichtPdf_(v, id) {
  const e = v.hole('einsaetze', id);
  const tag = tagVon_(e.beginn);
  const kraefte = v.alle('einsatz_kraefte').filter((k) => k.einsatz_id === e.id)
    .sort((a, b) => String(a.von).localeCompare(String(b.von)) || String(a.name).localeCompare(String(b.name)));
  const personen = kraefte.filter((k) => k.art === 'person');
  const mittel = kraefte.filter((k) => k.art === 'mittel');
  const summe = einsatzSumme_(kraefte);
  const tagebuch = v.alle('einsatz_eintraege').filter((t) => t.einsatz_id === e.id && t.liste === 'tagebuch')
    .sort((a, b) => String(a.zeit).localeCompare(String(b.zeit)) || (a.position || 0) - (b.position || 0));

  const felder = [
    ['Art', EINSATZ_ART_TEXT_[e.art] || e.art],
    ['Nummer', e.nummer || '–'],
    ['Stichwort', e.stichwort || '–'],
    ['Einsatzort', e.ort || '–'],
    ['Beginn', datumZeitDe_(e.beginn)],
    ['Ende', e.ende ? datumZeitDe_(e.ende) : '–'],
    ['Dauer', e.ende ? dauerText_(minuten_(e.beginn, e.ende)) : '–'],
    ['Einsatzleitung', e.einsatzleiter || '–'],
    ['Kräfte', summe.personen + ' Personen' + (summe.atemschutz ? ', ' + summe.atemschutz + ' unter Atemschutz' : '')],
    ['Personenstunden', stundenText_(summe.minuten)],
  ];
  const zeile = (k, mitAtemschutz) => '<tr><td><b>' + esc_(k.name) + '</b>' + (k.funktion ? '<br><span class="klein grau">' + esc_(k.funktion) + '</span>' : '') +
    '</td><td>' + zeitDe_(k.von, tag) + '</td><td>' + zeitDe_(k.bis, tag) + '</td><td>' + dauerText_(minuten_(k.von, k.bis)) + '</td>' +
    (mitAtemschutz ? '<td>' + (k.atemschutz ? 'ja' : '') + '</td>' : '') + '</tr>';
  const eintrag = (t) => {
    const alt = t.zeit_vorher ? String(t.zeit_vorher).split('\n').map((z) => '<br><span class="klein grau"><s>' + zeitDe_(z, tag) + '</s></span>').join('') : '';
    const vorher = t.vorher ? String(t.vorher).split('\n').map((x) => '<br><span class="klein grau">vorher: ' + esc_(x) + '</span>').join('') : '';
    const text = t.geloescht ? '<s>' + esc_(t.text) + '</s> <span class="klein grau">(gestrichen)</span>' : esc_(t.text);
    return '<tr><td style="width:62pt">' + zeitDe_(t.zeit, tag) + alt + '</td><td>' + text + vorher + '</td></tr>';
  };

  const inhalt = briefkopf_(v, BERICHT_TITEL_[e.art] || 'Bericht', esc_(e.nummer || '') + (e.nummer ? '<br>' : '') + datumDe_(tag)) +
    '<div style="font-size:14pt;font-weight:bold;margin-bottom:8pt">' + esc_(e.bezeichnung) + '</div>' +
    feldTabelle_(felder) +
    '<div style="height:12pt"></div><div class="klein grau">BERICHT</div>' +
    (e.bericht ? '<div>' + esc_(e.bericht).replace(/\n/g, '<br>') + '</div>' : '<div class="grau">Kein Bericht geschrieben.</div>') +
    (personen.length
      ? '<div style="height:14pt"></div><table class="liste"><tr><th>Einsatzkraft</th><th>von</th><th>bis</th><th>Dauer</th><th>Atemschutz</th></tr>' +
        personen.map((k) => zeile(k, true)).join('') + '</table>'
      : '') +
    (mittel.length
      ? '<div style="height:12pt"></div><table class="liste"><tr><th>Fahrzeug / Gerät</th><th>von</th><th>bis</th><th>Dauer</th></tr>' +
        mittel.map((k) => zeile(k, false)).join('') + '</table>'
      : '') +
    (tagebuch.length
      ? '<div style="height:16pt"></div><div class="wehr">Einsatztagebuch</div><div style="height:4pt"></div>' +
        '<table class="liste"><tr><th>Zeit</th><th>Ereignis</th></tr>' + tagebuch.map(eintrag).join('') + '</table>'
      : '') +
    '<div style="height:36pt"></div><table><tr>' +
    '<td style="width:45%"><div class="linie"></div><div class="klein grau">Ort, Datum</div></td><td></td>' +
    '<td style="width:45%"><div class="linie"></div><div class="klein grau">Einsatzleitung' + (e.einsatzleiter ? ' (' + esc_(e.einsatzleiter) + ')' : '') + '</div></td>' +
    '</tr></table>' +
    '<div style="height:16pt"></div><div class="klein grau">' +
    (e.quelle === 'einsatztagebuch' ? 'Aus dem Einsatztagebuch übernommen am ' : 'Erfasst am ') + esc_(datumZeitDe_(e.erfasst_am)) +
    (e.erfasst_von ? ' von ' + esc_(e.erfasst_von) : '') + ' · FeuerwehrManager ' + APP_VERSION + '</div>';

  return pdfAusHtml_(BERICHT_TITEL_[e.art] || 'Bericht', inhalt,
    (BERICHT_TITEL_[e.art] || 'Bericht').replace(/\W+/g, '_') + '_' + tag + (e.nummer ? '_' + e.nummer.replace(/[^A-Za-z0-9-]/g, '_') : '') + '.pdf');
}

/** Je Dienst ein Mitglied: frühestes „von“, spätestes „bis“, die Minuten zusammen. */
function dienstZeilen_(einsaetze, kraefte, mitgliedId) {
  const je = {};
  kraefte.forEach((k) => {
    if (k.mitglied_id !== mitgliedId || k.art !== 'person') return;
    const x = (je[k.einsatz_id] = je[k.einsatz_id] || { einsatz_id: k.einsatz_id, von: k.von, bis: k.bis, minuten: 0, atemschutz: false, funktion: [] });
    if (String(k.von) < String(x.von)) x.von = k.von;
    if (String(k.bis) > String(x.bis)) x.bis = k.bis;
    x.minuten += minuten_(k.von, k.bis);
    if (k.atemschutz) x.atemschutz = true;
    if (k.funktion && x.funktion.indexOf(k.funktion) < 0) x.funktion.push(k.funktion);
  });
  const nach = {};
  einsaetze.forEach((e) => {
    nach[e.id] = e;
  });
  return Object.keys(je).filter((id) => nach[id]).map((id) => Object.assign(je[id], { einsatz: nach[id] }))
    .sort((a, b) => String(a.von).localeCompare(String(b.von)));
}

/**
 * Der Nachweis für ein Mitglied: wann es im Dienst war, wie lange, wie oft unter
 * Atemschutz – und auf Wunsch der Stand seiner Qualifikationen. Ohne sie für Stellen, die
 * Gesundheitsdaten nichts angehen (der Arbeitgeber, der eine Freistellung bescheinigt
 * haben will).
 */
function dienstnachweisPdf_(v, mitgliedId, jahr, mitQualifikationen) {
  const m = v.hole('mitglieder', mitgliedId);
  pruefe_(/^\d{4}$/.test(jahr), 'Ungültiges Jahr.');
  const d = personalDaten_(v);
  const imJahr = d.einsaetze.filter((e) => tagVon_(e.beginn).slice(0, 4) === jahr);
  const zeilen = dienstZeilen_(imJahr, d.einsatzkraefte, m.id);
  const st = einsatzStunden_(imJahr, d.einsatzkraefte, jahr).find((x) => x.mitglied_id === m.id);
  const summe = EINSATZ_ARTEN.map((art) => '<tr><td>' + esc_(EINSATZ_ART_TEXT_[art]) + '</td><td style="text-align:right">' +
    (st ? st.arten[art].anzahl : 0) + '</td><td style="text-align:right">' + stundenText_(st ? st.arten[art].minuten : 0) + '</td></tr>').join('') +
    '<tr><td><b>Zusammen</b></td><td style="text-align:right"><b>' + (st ? st.dienste : 0) + '</b></td><td style="text-align:right"><b>' +
    stundenText_(st ? st.minuten : 0) + '</b></td></tr>';
  const liste = zeilen.map((x) => '<tr><td style="width:56pt">' + datumDe_(tagVon_(x.von)) + '</td><td>' + esc_(EINSATZ_ART_TEXT_[x.einsatz.art] || x.einsatz.art) +
    '</td><td><b>' + esc_(x.einsatz.bezeichnung) + '</b>' + (x.einsatz.nummer ? '<br><span class="klein grau">' + esc_(x.einsatz.nummer) + '</span>' : '') +
    (x.funktion.length ? '<br><span class="klein grau">' + esc_(x.funktion.join(', ')) + '</span>' : '') + '</td><td>' +
    zeitDe_(x.von, tagVon_(x.von)) + '–' + zeitDe_(x.bis, tagVon_(x.von)) + '</td><td style="text-align:right">' + dauerText_(x.minuten) + '</td><td>' +
    (x.atemschutz ? 'ja' : '') + '</td></tr>').join('');

  let quali = '';
  if (mitQualifikationen) {
    const p = personalAbleiten_(d);
    const aktuell = nachweiseAktuell_(d.nachweise.concat(p.ausEinsatz))[m.id] || {};
    const arten = d.qualiarten.filter((a) => a.aktiv || aktuell[a.id]);
    const ZUSTAND = { tauglich: 'atemschutztauglich', abgelaufen: 'nicht atemschutztauglich – abgelaufen', unvollstaendig: 'nicht atemschutztauglich – unvollständig', keiner: 'kein Atemschutzgeräteträger' };
    quali = '<div style="height:16pt"></div><div class="wehr">Qualifikationen · Stand ' + datumDe_(d.heute) + '</div>' +
      '<div class="klein" style="margin:2pt 0 4pt">' + esc_(ZUSTAND[p.atemschutz[m.id]] || '') + '</div>' +
      '<table class="liste"><tr><th>Qualifikation</th><th>erworben</th><th>gültig bis</th></tr>' +
      arten.map((a) => {
        const n = aktuell[a.id];
        return '<tr><td>' + esc_(a.name) + (n && n.abgeleitet ? '<br><span class="klein grau">aus den Einsatzberichten</span>' : '') + '</td><td>' +
          (n ? datumDe_(n.erworben_am) : '<span class="grau">–</span>') + '</td><td>' +
          (n ? (n.gueltig_bis ? datumDe_(n.gueltig_bis) + (n.gueltig_bis < d.heute ? ' <b>abgelaufen</b>' : '') : 'unbefristet') : '') + '</td></tr>';
      }).join('') + '</table>';
  }

  const inhalt = briefkopf_(v, 'Dienstnachweis ' + jahr, esc_(m.name) + '<br>Stand ' + datumDe_(d.heute)) +
    '<div style="font-size:14pt;font-weight:bold;margin-bottom:8pt">' + esc_(m.name) + '</div>' +
    '<table class="liste" style="width:60%"><tr><th>Dienst</th><th style="text-align:right">Anzahl</th><th style="text-align:right">Stunden</th></tr>' + summe + '</table>' +
    (st && st.atemschutz ? '<div class="klein" style="margin-top:4pt">Davon ' + st.atemschutz + '× unter Atemschutz.</div>' : '') +
    '<div style="height:14pt"></div>' +
    (liste
      ? '<table class="liste"><tr><th>Datum</th><th>Art</th><th>Dienst</th><th>Zeit</th><th style="text-align:right">Dauer</th><th>Atemschutz</th></tr>' + liste + '</table>'
      : '<p>In diesem Jahr keine Dienste erfasst.</p>') +
    quali +
    '<div style="height:36pt"></div><table><tr>' +
    '<td style="width:45%"><div class="linie"></div><div class="klein grau">Ort, Datum</div></td><td></td>' +
    '<td style="width:45%"><div class="linie"></div><div class="klein grau">Kommandant / Wehrführung</div></td>' +
    '</tr></table>' +
    '<div style="height:16pt"></div><div class="klein grau">Aus den Einsatzberichten der Wehr · FeuerwehrManager ' + APP_VERSION +
    (mitQualifikationen ? ' · Enthält Gesundheitsdaten (G26.3) – nur für das Mitglied und die Wehrführung.' : '') + '</div>';

  return pdfAusHtml_('Dienstnachweis ' + m.name, inhalt, 'Dienstnachweis_' + jahr + '_' + m.name.replace(/[^\p{L}\p{N}]+/gu, '_') + '.pdf');
}

/** Für den Jahresbericht: Dienste und Stunden aller Mitglieder, mit der Summe darunter. */
function stundenPdf_(v, jahr) {
  pruefe_(/^\d{4}$/.test(jahr), 'Ungültiges Jahr.');
  const d = personalDaten_(v);
  const imJahr = d.einsaetze.filter((e) => tagVon_(e.beginn).slice(0, 4) === jahr);
  const stunden = {};
  einsatzStunden_(imJahr, d.einsatzkraefte, jahr).forEach((x) => {
    stunden[x.mitglied_id] = x;
  });
  const mitglieder = d.mitglieder.filter((m) => m.aktiv || stunden[m.id]).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const zelle = (x, art) => (x && x.arten[art].anzahl ? x.arten[art].anzahl + ' · ' + stundenText_(x.arten[art].minuten) : '<span class="grau">–</span>');
  const zeilen = mitglieder.map((m) => {
    const x = stunden[m.id];
    return '<tr><td><b>' + esc_(m.name) + '</b></td>' + EINSATZ_ARTEN.map((art) => '<td>' + zelle(x, art) + '</td>').join('') +
      '<td style="text-align:right"><b>' + (x ? stundenText_(x.minuten) : '–') + '</b></td><td style="text-align:right">' + (x && x.atemschutz ? x.atemschutz : '') + '</td></tr>';
  }).join('');
  const gesamt = imJahr.reduce((s, e) => s + einsatzSumme_(d.einsatzkraefte.filter((k) => k.einsatz_id === e.id)).minuten, 0);
  const anzahl = (art) => imJahr.filter((e) => e.art === art).length;

  const inhalt = briefkopf_(v, 'Dienststunden ' + jahr, 'Stand ' + datumDe_(d.heute) + '<br>' +
    EINSATZ_ARTEN.filter((a) => anzahl(a)).map((a) => anzahl(a) + ' ' + (anzahl(a) === 1 ? EINSATZ_ART_TEXT_[a] : EINSATZ_ART_MEHRZAHL_[a])).join(' · ')) +
    '<table class="liste"><tr><th>Name</th>' + EINSATZ_ARTEN.map((a) => '<th>' + esc_(EINSATZ_ART_MEHRZAHL_[a]) + '</th>').join('') +
    '<th style="text-align:right">Stunden</th><th style="text-align:right">Atemschutz</th></tr>' + zeilen + '</table>' +
    '<div style="height:10pt"></div><div><b>Personenstunden zusammen: ' + stundenText_(gesamt) + '</b> <span class="klein grau">(mit Gastkräften)</span></div>' +
    '<div style="height:16pt"></div><div class="klein grau">Je Feld: Anzahl · Stunden. Aus den Einsatzberichten der Wehr · FeuerwehrManager ' + APP_VERSION + '</div>';

  return pdfAusHtml_('Dienststunden ' + jahr, inhalt, 'Dienststunden_' + jahr + '.pdf');
}
