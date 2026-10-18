/**
 * Die Oberfläche im echten Browser – an der Vorschau, in der Server und Oberfläche
 * zusammen laufen (`vorschau.mjs`).
 *
 * Geprüft wird, was ein Mensch tut: anmelden, klicken, scannen (eintippen), buchen –
 * und was dabei herauskommt. Dazu zwei Dinge, die man nicht durch Hinsehen prüft:
 *
 *   - Die gedruckten Barcodes und der QR-Code des Ausweises werden von **zbar**
 *     gelesen, einem fremden Leser. Dieselbe Überlegung wie im SaaS-Produkt: Ein
 *     selbst geschriebener Code, geprüft von einem selbst geschriebenen Leser, bewiese
 *     nur, dass sich beide einig sind.
 *   - Jeder Fehler auf der Konsole lässt die Prüfung fallen.
 *
 *   node test/oberflaeche.mjs          (braucht chromium und zbarimg)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { browserStarten } from './browser.mjs';
import { vorschauBauen } from './vorschau.mjs';
import { tagebuchBeispiel } from './umgebung.mjs';

const ORDNER = fs.mkdtempSync(path.join(os.tmpdir(), 'fwm-oberflaeche-'));
const SEITE = path.join(ORDNER, 'vorschau.html');
fs.writeFileSync(SEITE, vorschauBauen());
const URL_ = 'file://' + SEITE;
const FOTOS = process.env.FOTOS || ORDNER;

let gesamt = 0;
const fehlschlaege = [];
let abschnitt = '';
const pruefe = (b, text, zusatz) => {
  gesamt++;
  if (!b) fehlschlaege.push(abschnitt + ': ' + text + (zusatz !== undefined ? '  → ' + JSON.stringify(zusatz).slice(0, 300) : ''));
};

function zbar(datei) {
  try {
    return execFileSync('zbarimg', ['--raw', '-q', datei], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  } catch (e) {
    return [];
  }
}
const zbarDa = (() => {
  try {
    execFileSync('zbarimg', ['--version']);
    return true;
  } catch (e) {
    return false;
  }
})();

async function teil(name, optionen, arbeit) {
  abschnitt = name;
  const b = await browserStarten(optionen);
  try {
    await arbeit(b);
  } catch (e) {
    fehlschlaege.push(name + ': ABBRUCH ' + e.message);
    try {
      await b.foto(path.join(FOTOS, 'abbruch-' + name.replace(/\W+/g, '_') + '.png'));
    } catch (x) {
      // nichts
    }
  }
  pruefe(!b.fehler.length, 'keine Fehler auf der Konsole', b.fehler);
  await b.schliessen();
}

const meldungen = (b) => b.werte(`[...document.querySelectorAll('.meldung span')].map(x => x.textContent)`);

// ─────────────────────────────── Schreibtisch ───────────────────────────────

await teil('Jede Seite des Schreibtischs', { breite: 1400, hoehe: 900 }, async (b) => {
  await b.laden(URL_ + '?als=anna');
  await b.warte('document.querySelector(".admin")');
  await b.ruhe();
  const seiten = [['', 'Aktionsliste'], ['geraete', 'Geräte'], ['saetze', 'Gerätesätze'], ['typen', 'Gerätetypen & Prüfpläne'], ['lagerplaetze', 'Lagerplätze'],
    ['gruende', 'Umlagerungsgründe'], ['etiketten', 'Etiketten'], ['personal', 'Atemschutz & Nachweise'], ['einsaetze', 'Einsätze & Stunden'], ['qualifikationen', 'Qualifikationsarten'],
    ['mitglieder', 'Mitglieder'], ['protokoll', 'Protokoll'], ['import', 'Import & Export'], ['regeln', 'Regeln'], ['einstellungen', 'Einstellungen']];
  for (const [pfad, titel] of seiten) {
    await b.werte(`location.hash = '#/${pfad}'`);
    await b.ruhe(250);
    const h1 = await b.werte(`(document.querySelector('.inhalt h1') || {}).textContent`);
    pruefe(h1 === titel, '/' + pfad + ' zeigt „' + titel + '“', h1);
    const aktiv = await b.werte(`(document.querySelector('.nav a.aktiv') || {}).textContent`);
    pruefe(aktiv && aktiv.indexOf(titel) === 0, 'Navigation markiert ' + titel, aktiv);
  }
  await b.werte(`location.hash = '#/'`);
  await b.ruhe();
  const kacheln = await b.werte(`[...document.querySelectorAll('.kachel-wert')].map(x => x.textContent)`);
  pruefe(JSON.stringify(kacheln.slice(0, 6)) === JSON.stringify(['4', '6', '33', '4', '1', '1']), 'Kacheln der Demo-Daten', kacheln);
  await b.foto(path.join(FOTOS, 'schreibtisch.png'));
});

await teil('Geräteakte folgt der Adresse', { breite: 1400, hoehe: 900 }, async (b) => {
  await b.laden(URL_ + '?als=anna#/geraete');
  await b.warte('document.querySelector("tbody tr")');
  await b.ruhe();
  await b.werte(`[...document.querySelectorAll('tbody tr')].find(tr => tr.textContent.includes('PA01')).click()`);
  await b.warte('document.querySelector(".modal")');
  await b.ruhe();
  const id = await b.werte(`Z.daten.geraete.find(g => g.bezeichnung === 'PA01').id`);
  pruefe((await b.werte('location.hash')) === '#/geraete/' + id, 'Adresse trägt die Akte');
  await b.klick('Bewegungen', '.modal');
  await b.warte(`document.querySelector('.modal tbody') && document.querySelector('.modal tbody').textContent.includes('Umräumen')`);
  pruefe(true, 'Bewegungen geladen');
  // Die Akte ersetzt den Verlaufseintrag (sonst führte „Zurück“ durch jede Akte, die
  // man unterwegs aufgeschlagen hat). Wer die Seite wechselt, nimmt sie nicht mit.
  pruefe((await b.werte('history.length')) === 2, 'kein eigener Verlaufseintrag für die Akte', await b.werte('history.length'));
  await b.werte(`location.hash = '#/saetze'`);
  await b.ruhe();
  pruefe(!(await b.werte(`!!document.querySelector('.modal')`)), 'Seitenwechsel schließt die Akte');
  // Direkt aufgerufen – etwa aus einem verschickten Verweis.
  await b.laden(URL_ + '#/geraete/' + id);
  await b.warte('document.querySelector(".modal")');
  pruefe((await b.werte(`document.querySelector('.modal h2').textContent`)).startsWith('PA01'), 'Akte aus der Adresse geöffnet');
  await b.werte(`document.querySelector('.modal .schliessen').click()`);
  await b.ruhe();
  pruefe((await b.werte('location.hash')) === '#/geraete', 'Schließen nimmt die Akte aus der Adresse');
});

await teil('Prüfung erfassen', { breite: 1400, hoehe: 900 }, async (b) => {
  await b.laden(URL_ + '?als=ben');
  await b.warte('document.querySelector(".admin")');
  await b.ruhe();
  // Die erste überfällige Prüfung mit Checkliste: PA01, Halbjahresprüfung.
  await b.werte(`[...document.querySelectorAll('tbody tr')].find(tr => tr.textContent.includes('PA01')).querySelector('.btn-primary').click()`);
  await b.warte('document.querySelector(".schritt")');
  const gesperrt = await b.werte(`[...document.querySelectorAll('.modal-fuss button')].pop().disabled`);
  pruefe(gesperrt, 'Speichern gesperrt, solange Pflichtschritte offen sind');
  pruefe((await b.werte(`document.querySelector('.modal-fuss').textContent`)).includes('Noch 4 Pflichtschritte offen'), 'sagt warum');
  await b.werte(`[...document.querySelectorAll('button.wahl')].filter(x => x.textContent === 'In Ordnung').forEach(x => x.click())`);
  for (const f of await b.werte(`[...document.querySelectorAll('.schritt-wert input')].map(x => x.id)`)) await b.tippe('#' + f, '296');
  pruefe(!(await b.werte(`[...document.querySelectorAll('.modal-fuss button')].pop().disabled`)), 'alles erledigt: Speichern frei');
  await b.klick('Prüfung speichern');
  await b.warte('!document.querySelector(".modal")');
  await b.ruhe();
  const st = await b.werte(`(() => { const g = Z.daten.geraete.find(x => x.bezeichnung === 'PA01'); const p = Z.daten.plaene.find(x => x.name === 'Halbjahresprüfung' && x.geraetetyp_id === g.geraetetyp_id); return Z.daten.stand.find(s => s.geraet_id === g.id && s.pruefplan_id === p.id); })()`);
  pruefe(st.zuletzt_geprueft === (await b.werte('Z.daten.heute')), 'Termin fortgeschrieben', st);
  pruefe((await meldungen(b)).includes('Prüfung erfasst.'), 'Meldung');
  pruefe(!(await b.werte(`document.querySelector('tbody').textContent.includes('PA01')`)), 'PA01 ist von der Aktionsliste');
});

await teil('Umlagern mehrerer Geräte', { breite: 1400, hoehe: 900 }, async (b) => {
  await b.laden(URL_ + '?als=anna#/geraete');
  await b.warte('document.querySelector("tbody tr")');
  await b.ruhe();
  for (const bez of ['B01', 'B02', 'C01']) await b.werte(`[...document.querySelectorAll('tbody tr')].find(tr => tr.querySelector('strong').textContent === '${bez}').querySelector('input[type=checkbox]').click()`);
  await b.ruhe();
  pruefe((await b.werte(`document.querySelector('.filterleiste strong') && document.querySelector('.filterleiste strong').textContent`)) === '3 gewählt', 'drei gewählt');
  await b.klick('Umlagern', '.filterleiste');
  await b.warte('document.querySelector("#f-nach")');
  pruefe(await b.werte(`[...document.querySelectorAll('.modal-fuss button')].pop().disabled`), 'ohne Ziel kein Buchen');
  await b.werte(`(() => { const s = document.querySelector('#f-nach'); s.value = [...s.options].find(o => o.text.startsWith('Werkstatt')).value; s.dispatchEvent(new Event('change', { bubbles: true })); const g = document.querySelector('#f-grund'); g.value = [...g.options].find(o => o.text.startsWith('Einsatz')).value; g.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await b.klick('3 Geräte buchen');
  await b.warte('!document.querySelector(".modal")');
  await b.ruhe();
  const stati = await b.werte(`['B01','B02','C01'].map(x => Z.daten.geraete.find(g => g.bezeichnung === x).status)`);
  pruefe(stati.every((s) => s === 'zu_reinigen'), 'Einsatz → zu reinigen', stati);
  pruefe((await meldungen(b)).includes('3 Geräte gebucht.'), 'Meldung');
  pruefe((await b.werte(`document.querySelectorAll('tbody tr.gewaehlt').length`)) === 0, 'Auswahl aufgehoben');
});

await teil('Rollen in der Oberfläche', { breite: 1400, hoehe: 900 }, async (b) => {
  await b.laden(URL_ + '?als=carla');
  await b.warte('document.querySelector(".admin")');
  await b.ruhe();
  const nav = await b.werte(`[...document.querySelectorAll('.nav a')].map(a => a.textContent)`);
  pruefe(!nav.some((n) => /Protokoll|Regeln|Gerätetypen|Lagerplätze/.test(n)), 'Mitglied sieht keine Technik-Seiten', nav);
  await b.werte(`location.hash = '#/protokoll'`);
  await b.ruhe();
  pruefe((await b.werte('location.hash')) === '#/', 'verschlossene Seite führt zur Aktionsliste');
  pruefe(!(await b.werte(`[...document.querySelectorAll('tbody .btn-primary')].some(x => x.textContent === 'Prüfung erfassen')`)), 'kein „Prüfung erfassen“');
  pruefe(await b.werte(`[...document.querySelectorAll('tbody .btn-primary')].some(x => x.textContent === 'Gereinigt')`), 'aber „Gereinigt“');
});

await teil('Telefon: Tabellen werden Karten', { breite: 390, hoehe: 844, mobil: true }, async (b) => {
  await b.laden(URL_ + '?als=anna&halle=0#/geraete');
  await b.warte('document.querySelector("tbody tr")');
  await b.ruhe();
  pruefe((await b.werte(`getComputedStyle(document.querySelector('table.tabelle-karten tr')).display`)) === 'block', 'Zeilen sind Blöcke');
  pruefe((await b.werte(`getComputedStyle(document.querySelector('table.tabelle-karten td:nth-child(3)'), '::before').content`)).includes('Barcode'), 'Beschriftung aus data-label');
  pruefe((await b.werte('document.documentElement.scrollWidth <= window.innerWidth + 1')), 'kein waagerechtes Scrollen');
  await b.foto(path.join(FOTOS, 'telefon-geraete.png'));
});

// ─────────────────────────────── Speichern im Hintergrund ───────────────────────────────

const sync = (b) => b.werte(`document.querySelector('.sync-anzeige').dataset.zustand`);

await teil('Im Hintergrund: sofort zu sehen, danach in der Tabelle', { breite: 1400, hoehe: 900 }, async (b) => {
  await b.laden(URL_ + '?als=anna');
  await b.warte('document.querySelector(".admin")');
  await b.ruhe();
  await b.werte('VORSCHAU.verzoegerung = 2500');
  const zeilen = () => b.werte(`[...document.querySelectorAll('tbody tr')].filter(tr => tr.textContent.includes('Gereinigt')).length`);
  const vorher = await zeilen();
  const pa02 = await b.werte(`Z.daten.geraete.find(g => g.bezeichnung === 'PA02').id`);
  const start = Date.now();
  await b.werte(`[...document.querySelectorAll('tbody tr')].find(tr => tr.textContent.includes('PA02') && tr.textContent.includes('Gereinigt')).querySelector('.btn-primary').click()`);
  const dauer = Date.now() - start;
  pruefe((await zeilen()) === vorher - 1, 'sofort von der Liste', { vorher, nachher: await zeilen() });
  pruefe(dauer < 1000, 'ohne Warten (' + dauer + ' ms)');
  pruefe((await sync(b)) === 'sendet', 'Anzeige: speichert', await sync(b));
  pruefe((await b.werte(`Z.basis.geraete.find(g => g.id === '${pa02}').status`)) === 'zu_reinigen', 'Server weiß es noch nicht');
  await b.warte(`document.querySelector('.sync-anzeige').dataset.zustand === 'ruhig'`, 8000);
  pruefe((await b.werte(`Z.basis.geraete.find(g => g.id === '${pa02}').status`)) === 'einsatzbereit', 'jetzt auch auf dem Server');
  pruefe((await zeilen()) === vorher - 1, 'und bleibt von der Liste');
  // Drei Klicks schnell hintereinander gehen als EIN Stapel hinaus.
  // Mitzählen, wie viele Änderungen je Stapel hinausgehen.
  await b.werte('VORSCHAU.verzoegerung = 800');
  await b.werte(`(() => { const r = google.script.run; const w = r.withSuccessHandler; window.__stapel = []; google.script.run = Object.assign({}, r, { withSuccessHandler(f) { const x = w.call(r, f); const fh = x.withFailureHandler; return Object.assign({}, x, { withFailureHandler(g) { const y = fh.call(x, g); const auf = y.aufruf; return Object.assign({}, y, { aufruf(...a) { if (a[1] === 'stapel') window.__stapel.push(a[2].ops.length); return auf.apply(y, a); } }); } }); } }); })()`);
  for (const bez of ['C01', 'C02', 'C03']) await b.werte(`sofort('betrieb.statusSetzen', { geraete: [Z.daten.geraete.find(g => g.bezeichnung === '${bez}').id], status: 'zur_pruefung' })`);
  await b.warte(`document.querySelector('.sync-anzeige').dataset.zustand === 'ruhig'`, 8000);
  pruefe(JSON.stringify(await b.werte('window.__stapel')) === '[3]', 'ein Stapel mit drei Änderungen', await b.werte('window.__stapel'));
});

await teil('Ohne Netz: wartet im Browser, übersteht Neuladen, geht danach hinaus', { breite: 390, hoehe: 844, mobil: true }, async (b) => {
  await b.laden(URL_ + '?als=carla#/halle');
  await b.warte('document.querySelector(".halle")');
  await b.ruhe();
  await b.werte('VORSCHAU.offline = true');
  await b.tippe('#scan-umlagern', 'IT-HELM-0002', true);
  await b.klick('Weiter mit 1 Gerät');
  await b.klick('Lager Hauptwache');
  await b.klick('Umräumen');
  await b.klick('nach Lager Hauptwache buchen');
  const lager = await b.werte(`Z.daten.lagerplaetze.find(l => l.code === 'LOC-LAGER').id`);
  pruefe((await b.werte(`Z.daten.geraete.find(g => g.bezeichnung === 'HELM02').lagerplatz_id`)) === lager, 'gebucht – zu sehen');
  await b.warte(`document.querySelector('.sync-anzeige').dataset.zustand === 'offline'`, 8000);
  pruefe((await b.werte(`Object.keys(localStorage).filter(k => k.startsWith('fwm.warteschlange.')).length`)) === 1, 'in der Ablage des Browsers');
  pruefe((await b.werte(`document.querySelector('.sync-anzeige').textContent`)) === 'Offline · 1', 'Anzeige in der Halle: kurz', await b.werte(`document.querySelector('.sync-anzeige').textContent`));
  pruefe((await b.werte(`document.querySelector('.sync-anzeige').getAttribute('aria-label')`)) === 'Offline · 1 Änderung wartet', '… und ausgeschrieben für Vorleser');
  // Neu laden – mit Netz. Die Buchung geht beim Start hinaus.
  await b.laden(URL_ + '?als=carla&neu=1#/halle');
  await b.warte('document.querySelector(".halle")');
  await b.warte(`Z.basis && Z.basis.geraete.find(g => g.bezeichnung === 'HELM02').lagerplatz_id === '${lager}'`, 8000);
  pruefe(true, 'nach dem Neuladen auf dem Server');
  pruefe((await b.werte(`Object.keys(localStorage).filter(k => k.startsWith('fwm.warteschlange.')).length`)) === 0, 'Ablage wieder leer');
  pruefe((await sync(b)) === 'ruhig', 'Anzeige: gespeichert');
});

await teil('Abgelehnt: zurückgenommen, mit Begründung und „Nochmal öffnen“', { breite: 1400, hoehe: 900 }, async (b) => {
  await b.laden(URL_ + '?als=anna#/typen');
  await b.warte('document.querySelector(".stamm-eintrag")');
  await b.ruhe();
  // Ben legt „Hebekissen“ an – von einem anderen Gerät, Anna sieht es noch nicht.
  const r = await b.werte(`VORSCHAU.als('ben.schlauch@ff-musterstadt.example', 'typen.speichern', { name: 'Hebekissen' })`);
  pruefe(r.ok, 'Ben hat angelegt', r);
  await b.werte('VORSCHAU.verzoegerung = 1500');
  await b.klick('Neuer Gerätetyp');
  await b.tippe('#f-name', 'Hebekissen');
  await b.klick('Speichern', '.modal-fuss');
  pruefe(!(await b.werte(`!!document.querySelector('.modal')`)), 'Dialog sofort zu');
  pruefe((await b.werte(`Z.daten.typen.filter(t => t.name === 'Hebekissen').length`)) === 1, 'erst einmal da');
  await b.warte(`[...document.querySelectorAll('.meldung span')].some(x => x.textContent.includes('Nicht gespeichert'))`, 8000);
  const text = await b.werte(`[...document.querySelectorAll('.meldung span')].map(x => x.textContent).find(t => t.includes('Nicht gespeichert'))`);
  pruefe(text === 'Nicht gespeichert – Gerätetyp: Einen Gerätetyp mit diesem Namen gibt es schon.', 'Begründung des Servers', text);
  pruefe((await b.werte(`Z.daten.typen.filter(t => t.name === 'Hebekissen').length`)) === 1, 'jetzt Bens – Annas zurückgenommen');
  await b.klick('Nochmal öffnen');
  await b.warte(`document.querySelector('.modal .fehlertext')`);
  pruefe((await b.werte(`document.querySelector('#f-name').value`)) === 'Hebekissen', 'mit Annas Eingabe');
  pruefe((await b.werte(`document.querySelector('.modal .fehlertext').textContent`)).includes('gibt es schon'), 'und der Begründung');
  // Jetzt weiß der Browser es selbst: Er lehnt ab, ohne zu fragen.
  await b.klick('Speichern', '.modal-fuss');
  pruefe((await b.werte(`!!document.querySelector('.modal .fehlertext')`)) && (await sync(b)) === 'ruhig', 'im Browser abgelehnt, nichts geschickt');
});

await teil('Was andere ändern, kommt von selbst', { breite: 1400, hoehe: 900 }, async (b) => {
  await b.laden(URL_ + '?als=anna');
  await b.warte('document.querySelector(".admin")');
  await b.ruhe();
  const zeigt = () => b.werte(`[...document.querySelectorAll('tbody tr')].some(tr => tr.textContent.includes('FL03') && tr.textContent.includes('Gereinigt'))`);
  pruefe(await zeigt(), 'FL03 ist zu reinigen');
  const id = await b.werte(`Z.daten.geraete.find(g => g.bezeichnung === 'FL03').id`);
  await b.werte(`VORSCHAU.als('carla.funk@ff-musterstadt.example', 'betrieb.gereinigt', { geraet: '${id}' })`);
  pruefe(await zeigt(), 'ohne Abfrage noch da');
  await b.werte('nachfragen()');
  await b.warte(`!${'[...document.querySelectorAll("tbody tr")].some(tr => tr.textContent.includes("FL03") && tr.textContent.includes("Gereinigt"))'}`);
  pruefe(true, 'nach der Abfrage weg');
});

// ─────────────────────────────── Personal ───────────────────────────────

await teil('Personal: G26.3 erneuern, sofort tauglich', { breite: 1400, hoehe: 900 }, async (b) => {
  await b.laden(URL_ + '?als=ben');
  await b.warte('document.querySelector(".admin")');
  await b.ruhe();
  const nav = await b.werte(`[...document.querySelectorAll('.nav a')].find(a => a.textContent.includes('Atemschutz')).textContent`);
  pruefe(nav === 'Atemschutz & Nachweise3', 'Gerätewart: Personal mit drei offenen Nachweisen', nav);
  pruefe((await b.werte(`document.querySelector('.inhalt').textContent`)).includes('Nachweise (1 abgelaufen, 2 laufen in 60 Tagen ab)'), 'Aktionsliste nennt die Nachweise');
  await b.werte(`location.hash = '#/personal'`);
  await b.warte(`document.querySelector('.inhalt h1') && document.querySelector('.inhalt h1').textContent === 'Atemschutz & Nachweise'`);
  await b.ruhe();
  const zeile = `[...document.querySelectorAll('tbody tr')].find(tr => tr.textContent.includes('Tom Leiter'))`;
  pruefe((await b.werte(`${zeile}.querySelector('.badge').textContent`)) === 'abgelaufen', 'Tom: abgelaufen');
  await b.werte(`${zeile}.querySelector('strong').click()`);
  await b.warte(`document.querySelector('.modal h2') && document.querySelector('.modal h2').textContent === 'Tom Leiter'`);
  pruefe((await b.werte('location.hash')).startsWith('#/personal/'), 'Personalakte in der Adresse');
  pruefe((await b.werte(`document.querySelector('.modal .hinweisbox').textContent`)).includes('G26.3 abgelaufen'), 'sagt, was fehlt');
  await b.werte(`[...document.querySelectorAll('.modal tbody tr')].find(tr => tr.textContent.includes('G26.3')).querySelector('button').click()`);
  await b.warte(`document.querySelector('#f-gueltig_bis')`);
  const soll = await b.werte(`datumPlus_(Z.daten.heute, 36, 'monate')`);
  pruefe((await b.werte(`document.querySelector('#f-gueltig_bis').value`)) === soll, 'gültig bis vorgeschlagen: 36 Monate', soll);
  pruefe((await b.werte(`document.querySelector('.modal .infobox').textContent`)).includes('bleibt als Beleg stehen'), 'der alte bleibt Beleg');
  await b.klick('Speichern', '.modal-fuss');
  await b.warte(`[...document.querySelectorAll('.modal h2')].length === 1`);
  pruefe((await b.werte(`[...document.querySelectorAll('.modal .badge')][0].textContent`)) === 'tauglich', 'in der Akte sofort tauglich');
  await b.klick('Verlauf zeigen');
  pruefe((await b.werte(`document.querySelector('.modal').textContent`)).includes('ersetzt'), 'der alte im Verlauf: ersetzt');
  await b.warte(`document.querySelector('.sync-anzeige').dataset.zustand === 'ruhig'`, 8000);
  const tom = await b.werte(`Z.basis.mitglieder.find(m => m.name === 'Tom Leiter').id`);
  pruefe((await b.werte(`Z.basis.personal.atemschutz['${tom}']`)) === 'tauglich', 'auch auf dem Server');
  await b.foto(path.join(FOTOS, 'personal.png'));
});

await teil('Personal: Rollen in der Oberfläche', { breite: 1400, hoehe: 900 }, async (b) => {
  await b.laden(URL_ + '?als=carla');
  await b.warte('document.querySelector(".admin")');
  pruefe(!(await b.werte(`[...document.querySelectorAll('.nav a')].some(a => a.textContent.includes('Atemschutz') || a.textContent.includes('Einsätze'))`)), 'Mitglied: kein Personal, keine Einsätze');
  await b.werte(`location.hash = '#/personal'`);
  await b.ruhe();
  pruefe((await b.werte('location.hash')) === '#/', 'Mitglied: /personal führt zur Aktionsliste');
  await b.laden(URL_ + '?als=dora');
  await b.warte('document.querySelector(".admin")');
  await b.ruhe();
  const nav = await b.werte(`[...document.querySelectorAll('.nav a')].map(a => a.textContent)`);
  pruefe(nav.some((n) => n.startsWith('Atemschutz')) && nav.some((n) => n.startsWith('Einsätze')) && nav.some((n) => n.startsWith('Qualifikationsarten')) && nav.some((n) => n.startsWith('Protokoll')), 'Kommandantin: Personal, Einsätze und Protokoll', nav);
  pruefe(!nav.some((n) => /Gerätetypen|Lagerplätze|Regeln/.test(n)), 'Kommandantin: keine Technik-Stammdaten', nav);
  pruefe((await b.werte(`document.querySelector('.benutzer-rolle').textContent`)) === 'Kommandant', 'Rolle im Kopf');
  await b.werte(`location.hash = '#/qualifikationen'`);
  await b.ruhe();
  pruefe(await b.werte(`[...document.querySelectorAll('button')].some(x => x.textContent.includes('Neue Qualifikation'))`), 'Kommandantin legt Arten an');
  await b.werte(`location.hash = '#/geraete'`);
  await b.ruhe();
  pruefe(!(await b.werte(`[...document.querySelectorAll('button')].some(x => x.textContent.includes('Neues Gerät'))`)), 'Kommandantin: Technik nur lesen');
  await b.laden(URL_ + '?als=ben#/qualifikationen');
  await b.warte(`document.querySelector('.inhalt h1')`);
  await b.ruhe();
  pruefe(!(await b.werte(`[...document.querySelectorAll('button')].some(x => x.textContent.includes('Neue Qualifikation'))`)), 'Gerätewart: Arten nur lesen');
});

// ─────────────────────────────── Einsätze ───────────────────────────────

await teil('Einsätze: Einsatztagebuch übernehmen, Stunden, Nachweis', { breite: 1400, hoehe: 900 }, async (b) => {
  const datei = path.join(ORDNER, 'Einsatztagebuch_Kellerbrand_Muehlweg_3.json');
  fs.writeFileSync(datei, JSON.stringify(tagebuchBeispiel(), null, 2));
  await b.laden(URL_ + '?als=dora#/einsaetze');
  await b.warte(`document.querySelector('.inhalt h1') && document.querySelector('.inhalt h1').textContent === 'Einsätze & Stunden'`);
  await b.ruhe();
  // Das Jahr des Brands aus der Demo (vor fünf Tagen – im Januar ist das noch das alte).
  await b.werte(`(() => { const e = Z.daten.einsaetze.find(x => x.bezeichnung === 'Wohnungsbrand Lindenstraße 12'); ui('einsaetze').jahr = tagVon_(e.beginn).slice(0, 4); zeichnen(); })()`);
  await b.ruhe();
  pruefe((await b.werte(`document.querySelector('tbody').textContent`)).includes('Wohnungsbrand Lindenstraße 12'), 'Demo-Bericht in der Liste');
  await b.foto(path.join(FOTOS, 'einsaetze.png'));

  await b.datei('#tagebuch-datei', datei);
  await b.warte(`document.querySelector('.modal h2') && document.querySelector('.modal h2').textContent === 'Einsatztagebuch übernehmen'`);
  const ziel = (name) => b.werte(`(() => { const tr = [...document.querySelectorAll('.modal tbody tr')].find(t => t.querySelector('strong').textContent === ${JSON.stringify(name)}); return tr.querySelector('select').value; })()`);
  const id = (name) => b.werte(`Z.daten.mitglieder.find(m => m.name === ${JSON.stringify(name)}).id`);
  pruefe((await ziel('Brenner, Max')) === 'm:' + (await id('Max Brenner')), '„Brenner, Max“ ist Max Brenner');
  pruefe((await ziel('LF 10')) === 'mittel' && (await ziel('Gerda Gast (DRK)')) === 'gast', 'Fahrzeug und Gastkraft erkannt');
  pruefe((await b.werte(`document.querySelector('#f-bezeichnung').value`)) === 'Kellerbrand Mühlweg 3', 'Bezeichnung aus dem Tagebuch');
  pruefe((await b.werte(`document.querySelector('#f-beginn').value`)).endsWith('T20:14'), 'Beginn aus Alarmzeit', await b.werte(`document.querySelector('#f-beginn').value`));
  const haken = (name) => `[...document.querySelectorAll('.modal tbody tr')].find(t => t.querySelector('strong').textContent === ${JSON.stringify(name)}).querySelector('input[type=checkbox]')`;
  pruefe(await b.werte(`${haken('Brenner, Max')}.checked`), 'Max: „unter PA“ im Kommentar – Atemschutz vorgeschlagen');
  pruefe(!(await b.werte(`${haken('Lena Wasser')}.checked`)), 'Lena: kein Vorschlag');
  await b.werte(`${haken('Lena Wasser')}.click()`);
  pruefe((await b.werte(`document.querySelector('.modal').textContent`)).includes('ohne Abrücken'), 'wer nie abrückte, ist markiert');
  await b.foto(path.join(FOTOS, 'tagebuch-uebernehmen.png'));
  await b.werte('VORSCHAU.verzoegerung = 1500');
  await b.klick('Übernehmen', '.modal-fuss');
  await b.warte(`document.querySelector('.modal h2') && document.querySelector('.modal h2').textContent === 'Kellerbrand Mühlweg 3'`);
  pruefe((await b.werte('location.hash')).startsWith('#/einsaetze/'), 'Bericht sofort offen, in der Adresse');
  pruefe((await sync(b)) === 'sendet', 'gespeichert wird im Hintergrund', await sync(b));
  const kraefte = await b.werte(`[...document.querySelectorAll('.modal tbody tr')].map(tr => tr.querySelector('strong').textContent)`);
  pruefe(JSON.stringify(kraefte.slice().sort()) === JSON.stringify(['Gerda Gast (DRK)', 'Lena Wasser', 'Max Brenner', 'Paul Pumpe', 'Paul Pumpe', 'Tom Leiter']), 'Kräfte: Paul zweimal, Max mit seinem Namen', kraefte);
  await b.warte(`document.querySelector('.sync-anzeige').dataset.zustand === 'ruhig'`, 8000);
  const e = await b.werte(`Z.basis.einsaetze.find(x => x.bezeichnung === 'Kellerbrand Mühlweg 3')`);
  pruefe(e && e.tagebuch_eintraege === 7 && e.quelle === 'einsatztagebuch', 'auf dem Server, mit den sieben Einträgen des Tagebuchs', e);
  await b.klick('Einsatztagebuch', '.modal .reiter');
  await b.warte(`document.querySelectorAll('.modal .tagebuch-zeile').length === 7`);
  pruefe((await b.werte(`document.querySelector('.modal .tagebuch-zeile.gestrichen').textContent`)).includes('Hydrant'), 'Gestrichenes durchgestrichen');
  pruefe((await b.werte(`document.querySelector('.modal .tagebuch').textContent`)).includes('vorher: Eintreffen'), 'frühere Fassung zu sehen');
  await b.foto(path.join(FOTOS, 'einsatzbericht.png'));
  await b.werte(`document.querySelector('.modal .schliessen').click()`);
  await b.ruhe();

  // Stunden: Lena war vom Ausrücken bis zum Ende dabei – und unter Atemschutz.
  await b.klick('Stunden je Mitglied');
  pruefe((await b.werte(`[...document.querySelectorAll('tbody tr')].find(tr => tr.textContent.includes('Lena Wasser')).textContent`)).includes('×'), 'Lena: unter Atemschutz gezählt');
  const lena = await id('Lena Wasser');
  await b.werte(`location.hash = '#/personal/${lena}'`);
  await b.warte(`document.querySelector('.modal h2') && document.querySelector('.modal h2').textContent === 'Lena Wasser'`);
  const zeile = await b.werte(`[...document.querySelectorAll('.modal tbody tr')].find(tr => tr.textContent.includes('Einsatz oder Übung unter Atemschutz')).textContent`);
  pruefe(zeile.includes('aus dem Bericht') && zeile.includes('Kellerbrand Mühlweg 3'), 'Nachweis aus dem Bericht, mit Verweis', zeile);
  pruefe((await b.werte(`document.querySelector('.modal').textContent`)).includes('Dienstnachweis (PDF)'), 'Dienstnachweis in der Personalakte');
  await b.werte(`document.querySelector('.modal .schliessen').click()`);
  await b.ruhe();

  // Dieselbe Datei noch einmal: erkannt – ersetzen nur mit Haken.
  await b.werte(`location.hash = '#/einsaetze'`);
  await b.ruhe();
  await b.datei('#tagebuch-datei', datei);
  await b.warte(`document.querySelector('.modal .hinweisbox')`);
  pruefe((await b.werte(`document.querySelector('.modal .hinweisbox').textContent`)).includes('schon übernommen'), 'schon übernommen');
  pruefe(await b.werte(`[...document.querySelectorAll('.modal-fuss button')].pop().disabled`), 'Übernehmen gesperrt');
  await b.werte(`document.querySelector('#f-ersetzen').click()`);
  pruefe(!(await b.werte(`[...document.querySelectorAll('.modal-fuss button')].pop().disabled`)), 'mit Haken: ersetzen');
  await b.werte(`document.querySelector('.modal .schliessen').click()`);
  await b.ruhe();

  // Die Liste fürs Tagebuch: eine Angabe je Zeile, wie es „CSV ↑“ erwartet.
  await b.werte(`window.__dl = []; herunterladen = (n, m, t) => window.__dl.push([n, t])`);
  await b.klick('Mitglieder.csv');
  const [name, text] = await b.werte('window.__dl[0]');
  pruefe(name === 'Mitglieder.csv' && text.split('\r\n').includes('Max Brenner') && text.split('\r\n').includes('Dora Wehrle') && text.endsWith('\r\n'), 'Mitglieder.csv', text);
});

await teil('Einsätze: Übung von Hand, Bericht schreiben', { breite: 1400, hoehe: 900 }, async (b) => {
  await b.laden(URL_ + '?als=ben#/einsaetze');
  await b.warte(`document.querySelector('.inhalt h1') && document.querySelector('.inhalt h1').textContent === 'Einsätze & Stunden'`);
  await b.ruhe();
  await b.klick('Bericht erfassen');
  pruefe((await b.werte(`document.querySelector('#f-art').value`)) === 'uebung', 'von Hand: zuerst Übung');
  await b.tippe('#f-bezeichnung', 'Übung Wasserförderung');
  for (const name of ['Jana Schaum', 'Paul Pumpe']) {
    await b.werte(`document.querySelector('#f-dabei-' + Z.daten.mitglieder.find(m => m.name === ${JSON.stringify(name)}).id).click()`);
  }
  pruefe((await b.werte(`document.querySelector('.modal-fuss').textContent`)).includes('Ende angeben'), 'ohne Ende keine Stunden');
  const ende = await b.werte(`(() => { const v = document.querySelector('#f-beginn').value; const d = new Date(v); d.setHours(d.getHours() + 2); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); })()`);
  await b.tippe('#f-ende', ende);
  await b.klick('Speichern', '.modal-fuss');
  await b.warte(`document.querySelector('.modal h2') && document.querySelector('.modal h2').textContent === 'Übung Wasserförderung'`);
  pruefe((await b.werte(`document.querySelectorAll('.modal tbody tr').length`)) === 2, 'zwei Teilnehmer');
  pruefe((await b.werte(`document.querySelector('.modal .detail-raster').textContent`)).includes('4 h'), 'vier Personenstunden', await b.werte(`document.querySelector('.modal .detail-raster').textContent`));
  await b.klick('Bericht schreiben', '.modal');
  await b.tippe('#f-bericht', 'Wasserförderung über lange Wegstrecke, zwei Pumpen in Reihe.');
  await b.klick('Speichern', '.modal-fuss');
  await b.warte(`[...document.querySelectorAll('.modal h2')].length === 1 && document.querySelector('.modal .detail-raster').textContent.includes('zwei Pumpen in Reihe')`);
  pruefe(true, 'Bericht sofort im Bericht');
  await b.warte(`document.querySelector('.sync-anzeige').dataset.zustand === 'ruhig'`, 8000);
  pruefe((await b.werte(`Z.basis.einsaetze.find(e => e.bezeichnung === 'Übung Wasserförderung').bericht`)).includes('zwei Pumpen'), 'auch auf dem Server');
});

// ─────────────────────────────── Halle ───────────────────────────────

await teil('Halle: scannen, Satz, Ziel, buchen', { breite: 390, hoehe: 844, mobil: true }, async (b) => {
  await b.laden(URL_ + '?als=carla');
  await b.warte('document.querySelector(".halle")');
  pruefe((await b.werte('location.hash')) === '#/halle', 'Telefon landet in der Halle (Weiche)');
  await b.tippe('#scan-umlagern', 'it-pa-0002', true);
  await b.tippe('#scan-umlagern', 'SET-AS-0001', true);
  await b.tippe('#scan-umlagern', 'LOC-LF10', true);
  await b.tippe('#scan-umlagern', 'QUATSCH', true);
  const liste = await b.werte(`document.querySelectorAll('.halle-liste li').length`);
  pruefe(liste === 6, 'PA02 und fünf Teile von Satz 1', liste);
  pruefe((await meldungen(b)).includes('Unbekannter Code: QUATSCH'), 'unbekannter Code gemeldet');
  pruefe((await b.werte(`document.querySelector('.halle-fuss-notiz').textContent`)).includes('LF 10'), 'Lagerplatz-Etikett wird Ziel');
  await b.klick('Weiter mit 6 Geräten');
  await b.klick('Übung');
  await b.klick('nach LF 10 buchen');
  await b.ruhe();
  pruefe((await meldungen(b)).some((m) => m.includes('1 Gerät gebucht, 5 standen schon dort.')), 'gebucht', await meldungen(b));
  pruefe((await b.werte(`Z.daten.geraete.find(g => g.bezeichnung === 'PA02').status`)) === 'einsatzbereit', 'Übung → einsatzbereit');
  await b.foto(path.join(FOTOS, 'halle.png'));
});

await teil('Halle: Zählen mit Befund', { breite: 390, hoehe: 844, mobil: true }, async (b) => {
  await b.laden(URL_ + '?als=carla#/halle/zaehlen');
  await b.warte('document.querySelector(".halle")');
  await b.ruhe();
  await b.tippe('#scan-zaehlen-platz', 'LOC-MTW', true);
  await b.warte(`document.querySelector('#scan-zaehlen')`);
  for (const c of ['IT-LOESCH-0001', 'IT-HELM-0003']) await b.tippe('#scan-zaehlen', c, true);
  await b.klick('Zählung abschließen');
  await b.klick('Zählung abschließen', '.halle-fuss');
  await b.warte(`document.querySelector('.halle-frage') && document.querySelector('.halle-frage').textContent.startsWith('Befund')`);
  const zahlen = await b.werte(`[...document.querySelectorAll('.halle-zahlen strong')].map(x => x.textContent)`);
  pruefe(JSON.stringify(zahlen) === '["1","2","1"]', 'gefunden 1, fehlen 2, fremd 1', zahlen);
  pruefe((await b.werte(`Z.daten.geraete.find(g => g.bezeichnung === 'HELM03').lagerplatz_id === Z.daten.lagerplaetze.find(l => l.code === 'LOC-MTW').id`)), 'fremder Helm geradegebucht');
  pruefe((await b.werte(`Z.daten.geraete.find(g => g.bezeichnung === 'HELM01').lagerplatz_id === Z.daten.lagerplaetze.find(l => l.code === 'LOC-VERMISST').id`)), 'fehlender Helm nach „Vermisst“');
});

// ─────────────────────────────── Codes, von zbar gelesen ───────────────────────────────

await teil('Etiketten: Code 128, von zbar gelesen', { breite: 1400, hoehe: 1000 }, async (b) => {
  if (!zbarDa) {
    pruefe(true, 'zbarimg fehlt – übersprungen');
    return;
  }
  await b.laden(URL_ + '?als=anna#/etiketten');
  await b.warte('document.querySelector(".stamm-eintrag")');
  await b.ruhe();
  const codes = ['IT-PA-0001', 'IT-FLASCHE-0004', 'IT-SCHL-B-0003'];
  for (const c of codes) await b.werte(`[...document.querySelectorAll('label.stamm-eintrag')].find(l => l.textContent.includes('${c}')).querySelector('input').click()`);
  await b.ruhe();
  const n = await b.werte(`document.querySelectorAll('.etikett').length`);
  pruefe(n === 3, 'drei Etiketten', n);
  for (let i = 0; i < 3; i++) {
    const datei = await b.fotoVon(`.etikett:nth-child(${i + 1}) svg`, path.join(FOTOS, 'etikett-' + i + '.png'), 3);
    const gelesen = zbar(datei);
    const soll = await b.werte(`document.querySelectorAll('.etikett-code')[${i}].textContent`);
    pruefe(gelesen.length === 1 && gelesen[0] === soll, 'zbar liest ' + soll, gelesen);
  }
  // Lagerplätze und Sätze
  await b.klick('Sätze', '.reiter');
  await b.werte(`document.querySelector('label.stamm-eintrag input').click()`);
  await b.ruhe();
  const satz = zbar(await b.fotoVon('.etikett svg', path.join(FOTOS, 'etikett-satz.png'), 3));
  pruefe(satz[0] === 'SET-AS-0001', 'Satz-Etikett', satz);
});

await teil('Ausweis: QR von zbar gelesen', { breite: 1400, hoehe: 1000 }, async (b) => {
  await b.laden(URL_ + '?als=anna#/mitglieder');
  await b.warte('document.querySelector("tbody tr")');
  await b.ruhe();
  await b.werte(`[...document.querySelectorAll('tbody tr')].find(tr => tr.textContent.includes('Carla')).querySelector('button[title="Ausweis ausgeben"]').click()`);
  await b.warte('document.querySelector(".ausweis-qr svg")');
  const code = await b.werte(`document.querySelector('.ausweis-code').textContent`);
  pruefe(/^FW[A-Z2-9]{32}$/.test(code), 'Ausweiscode', code);
  if (zbarDa) {
    const gelesen = zbar(await b.fotoVon('.ausweis-qr svg', path.join(FOTOS, 'ausweis-qr.png'), 2));
    pruefe(gelesen[0] === code, 'zbar liest den QR-Code', gelesen);
  }
});

await teil('Hallen-Tablet: koppeln, dann Kürzel oder Ausweis', { breite: 1000, hoehe: 900 }, async (b) => {
  // Am Schreibtisch: Anna gibt Carla einen Ausweis und erzeugt einen Kopplungscode.
  await b.laden(URL_ + '?als=anna#/mitglieder');
  await b.warte('document.querySelector("tbody tr")');
  await b.ruhe();
  await b.werte(`[...document.querySelectorAll('tbody tr')].find(tr => tr.textContent.includes('Carla')).querySelector('button[title="Ausweis ausgeben"]').click()`);
  await b.warte('document.querySelector(".ausweis-code")');
  const ausweis = await b.werte(`document.querySelector('.ausweis-code').textContent`);
  await b.klick('Fertig');
  await b.werte(`location.hash = '#/einstellungen'`);
  await b.ruhe();
  await b.klick('Gerät koppeln');
  await b.tippe('#f-name', 'Tablet Wand');
  await b.klick('Code erzeugen', '.modal-fuss');
  await b.warte(`[...document.querySelectorAll('.modal h2')].some(x => x.textContent.startsWith('Kopplungscode'))`);
  const kopplung = await b.werte(`[...document.querySelectorAll('.modal-inhalt div')].map(x => x.textContent).find(t => /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(t))`);
  pruefe(!!kopplung, 'Kopplungscode angezeigt', kopplung);

  // Das Tablet: bei Google mit einem Konto ohne Mitgliedschaft.
  await b.laden(URL_ + '?als=halle#/');
  await b.warte(`document.querySelector('.hinweisbox')`);
  pruefe((await b.werte(`document.querySelector('.hinweisbox').textContent`)).includes('halle@ff-musterstadt.example ist hier nicht als Mitglied eingetragen'), 'kein Zugang, mit der Adresse');
  await b.klick('Dieses Gerät als Hallengerät einrichten');
  await b.tippe('#kopplungscode', kopplung.toLowerCase());
  await b.werte(`document.querySelector('form').requestSubmit()`);
  await b.warte('document.querySelector("#ausweis-scan")');
  pruefe((await b.werte(`document.querySelector('.anmeldung h2').textContent`)) === 'Tablet Wand', 'Anmeldebildschirm des Hallengeräts');

  // Kürzel
  await b.tippe('#ausweis-scan', 'XY', true);
  await b.warte(`document.querySelector('.fehlertext')`);
  pruefe((await b.werte(`document.querySelector('.fehlertext').textContent`)) === 'Ausweis oder Kürzel nicht erkannt.', 'unbekanntes Kürzel');
  await b.tippe('#ausweis-scan', 'cf', true);
  await b.warte('document.querySelector(".halle")');
  await b.ruhe();
  pruefe((await b.werte(`document.querySelector('.halle-kopf-text strong').textContent`)) === 'Carla Funk · CF', 'als Carla in der Halle');
  pruefe((await b.werte(`document.querySelector('.halle-kopf-text span').textContent`)).includes('per Kürzel'), 'Kopf sagt: per Kürzel');
  pruefe((await b.werte(`document.querySelector('.halle-wechsel').textContent`)).includes('Abmelden'), 'kein Weg zum Schreibtisch, nur Abmelden');
  await b.werte(`location.hash = '#/mitglieder'`);
  await b.ruhe();
  pruefe((await b.werte('location.hash')) === '#/halle', 'Hallensitzung bleibt in der Halle');
  await b.tippe('#scan-umlagern', 'IT-HELM-0003', true);
  await b.klick('Weiter mit 1 Gerät');
  await b.klick('MTW');
  await b.klick('Übung');
  await b.klick('nach MTW buchen');
  await b.ruhe();
  pruefe((await meldungen(b)).some((m) => m.startsWith('1 Gerät gebucht')), 'mit Kürzel gebucht', await meldungen(b));

  // Abmelden → wieder der Anmeldebildschirm des Geräts, nicht das Konto des Tablets
  await b.klick('Abmelden');
  await b.warte('document.querySelector("#ausweis-scan")');
  await b.tippe('#ausweis-scan', ausweis, true);
  await b.warte('document.querySelector(".halle")');
  await b.ruhe();
  pruefe((await b.werte(`document.querySelector('.halle-kopf-text span').textContent`)).includes('per Ausweis'), 'mit dem Ausweis angemeldet');
});

await teil('Neues Mitglied: erst kein Zugang, nach der Aufnahme drin', { breite: 1200, hoehe: 900 }, async (b) => {
  await b.laden(URL_ + '?als=dieter.druck@ff-musterstadt.example');
  await b.warte(`document.querySelector('.hinweisbox')`);
  pruefe((await b.werte(`document.querySelector('.hinweisbox').textContent`)).startsWith('dieter.druck@ff-musterstadt.example ist hier nicht als Mitglied eingetragen'), 'kein Zugang');
  await b.laden(URL_ + '?als=anna#/mitglieder');
  await b.warte('document.querySelector("tbody tr")');
  await b.ruhe();
  await b.klick('Mitglied aufnehmen');
  await b.tippe('#f-name', 'Dieter Druck');
  pruefe((await b.werte(`document.querySelector('#f-kuerzel').value`)) === 'DD', 'Kürzel aus dem Namen vorgeschlagen');
  await b.tippe('#f-email', 'Dieter.Druck@ff-musterstadt.example');
  await b.klick('Speichern', '.modal-fuss');
  await b.warte('!document.querySelector(".modal")');
  pruefe((await b.werte(`document.querySelector('tbody').textContent`)).includes('dieter.druck@ff-musterstadt.example'), 'sofort in der Liste, Adresse klein');
  // Erst wenn „Gespeichert“ dasteht, ist er in der Tabelle – vorher wüsste Google nichts von ihm.
  await b.warte(`document.querySelector('.sync-anzeige').dataset.zustand === 'ruhig'`);
  await b.laden(URL_ + '?als=dieter.druck@ff-musterstadt.example');
  await b.warte('document.querySelector(".admin")');
  pruefe((await b.werte(`document.querySelector('.benutzer-name').textContent`)) === 'Dieter Druck', 'drin als Dieter');
  pruefe(!(await b.werte(`[...document.querySelectorAll('.kopfzeile button')].some(x => x.textContent.includes('Abmelden'))`)), 'kein „Abmelden“ am Schreibtisch');
});

await teil('Dunkles Thema', { breite: 1400, hoehe: 900, dunkel: true }, async (b) => {
  await b.laden(URL_ + '?als=anna');
  await b.warte('document.querySelector(".admin")');
  await b.ruhe();
  const hg = await b.werte(`getComputedStyle(document.body).backgroundColor`);
  pruefe(hg === 'rgb(15, 19, 28)', 'dunkler Grund', hg);
  await b.foto(path.join(FOTOS, 'dunkel.png'));
});

if (fehlschlaege.length) {
  console.log('\n✗ ' + fehlschlaege.length + ' von ' + gesamt + ' Prüfungen fehlgeschlagen:\n');
  fehlschlaege.forEach((f) => console.log('  • ' + f));
  console.log('\nBildschirmfotos: ' + FOTOS);
  process.exitCode = 1;
} else {
  console.log('✓ ' + gesamt + ' Prüfungen im Browser bestanden' + (zbarDa ? ' (Codes von zbar gelesen).' : ' (ohne zbar).'));
  if (!process.env.FOTOS) fs.rmSync(ORDNER, { recursive: true, force: true });
}
