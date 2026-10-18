/**
 * Den Servercode so laden, wie Apps Script es tut: alle `.js`-Dateien aus `src/` in
 * Namensreihenfolge, in einem gemeinsamen globalen Bereich – hier ein `vm`-Kontext mit
 * der Attrappe der Google-Dienste.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SRC = process.env.FWM_SRC || path.join(WURZEL, 'src');
export const Attrappe = require('./attrappe.js');

export function serverDateien() {
  return fs.readdirSync(SRC).filter((f) => f.endsWith('.js')).sort();
}

export function htmlDateien() {
  const aus = {};
  fs.readdirSync(SRC).filter((f) => f.endsWith('.html')).forEach((f) => {
    aus[f.replace(/\.html$/, '')] = fs.readFileSync(path.join(SRC, f), 'utf8');
  });
  return aus;
}

export function serverCode() {
  return serverDateien().map((f) => `// ── ${f}\n` + fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n');
}

/** Eine frische Anlage: leere Tabelle, leerer Zwischenspeicher, keine Sitzungen. */
export function anlage(optionen = {}) {
  const a = Attrappe.attrappeErzeugen({ dateien: htmlDateien(), console: optionen.console || { log() {}, warn() {}, error: (...x) => (optionen.fehler || []).push(x.join(' ')) }, ...optionen });
  const ctx = vm.createContext({ ...a.dienste, TextEncoder, TextDecoder, Intl });
  vm.runInContext(serverCode(), ctx, { filename: 'server.js' });
  const lauf = (code) => vm.runInContext(code, ctx);
  const rufe = (token, name, args) => JSON.parse(ctx.aufruf(token, name, args || {}));
  return { ...a, ctx, lauf, rufe };
}

/**
 * Die Oberfläche ohne Bildschirm: der mitgeschickte gemeinsame Code und die Skripte, die
 * Änderungen vorhersagen (`js_grund`, `js_bausteine`, `js_sync`) oder Dateien lesen und
 * schreiben (`js_einsaetze`: das Einsatztagebuch, `js_schreibtisch`: CSV), in einem leeren
 * `vm`-Kontext – ohne DOM. Für den Abgleich „Vorhersage im Browser = Ergebnis auf dem
 * Server“ in `server.mjs`. Beim Laden fassen diese Skripte das DOM nicht an; wer es
 * doch tut, lässt diesen Aufruf scheitern.
 */
export function browserKontext(gemeinsam) {
  const html = htmlDateien();
  const ablage = new Map();
  const ctx = vm.createContext({
    window: { START: {}, addEventListener() {} },
    localStorage: {
      getItem: (k) => (ablage.has(k) ? ablage.get(k) : null),
      setItem: (k, v) => ablage.set(k, String(v)),
      removeItem: (k) => ablage.delete(k),
    },
    crypto: globalThis.crypto,
    structuredClone: globalThis.structuredClone,
    console,
  });
  vm.runInContext(gemeinsam, ctx, { filename: 'gemeinsam.js' });
  for (const name of ['js_grund', 'js_bausteine', 'js_sync', 'js_einsaetze', 'js_schreibtisch']) {
    for (const [, code] of html[name].matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(code, ctx, { filename: name + '.html' });
  }
  return {
    ctx,
    lauf: (code) => vm.runInContext(code, ctx),
    /** Eine Änderung auf eine Kopie des Stands anwenden und das Abgeleitete neu rechnen. */
    vorhersage(stand, name, args) {
      ctx.__ein = JSON.stringify({ stand, name, args });
      return JSON.parse(vm.runInContext(`(() => {
        const e = JSON.parse(__ein);
        const d = kopie(e.stand);
        const vorschau = anwenden(d, { name: e.name, args: e.args });
        ableiten_(d);
        return JSON.stringify({ d: d, vorschau: vorschau === undefined ? null : vorschau });
      })()`, ctx));
    },
  };
}

/**
 * Ein Export des Einsatztagebuchs (github.com/konsihdr/Feuerwehreinsatztagebuch,
 * `formatVersion` 1), wie ihn „Speichern (JSON)“ schreibt – zwei Tage vor `jetzt`, damit er
 * immer im Zeitraum liegt, den der Browser bekommt. Mit allem, was das Tagebuch kann:
 * gestrichene Einträge, berichtigter Text, berichtigte Uhrzeit, ein Name, der umbenannt
 * wurde, jemand, der zwischendurch abrückt, und einer, der nie abrückt.
 */
export function tagebuchBeispiel(jetzt = new Date()) {
  const tag = new Date(jetzt.getTime() - 2 * 86400000);
  const um = (h, m, s = 0) => new Date(tag.getFullYear(), tag.getMonth(), tag.getDate(), h, m, s).toISOString();
  const datum = [tag.getFullYear(), String(tag.getMonth() + 1).padStart(2, '0'), String(tag.getDate()).padStart(2, '0')].join('-');
  let n = 0;
  const id = () => 'lx' + (++n).toString(36) + '-abc' + n;
  const eintrag = (zeit, text, extra = {}) => ({ id: id(), zeit, text, geloescht: false, history: [], zeitHistory: [], ...extra });
  const kraft = (zeit, einheit, aktion, extra = {}) => ({ id: id(), zeit, einheit, aktion, kommentar: '', geloescht: false, history: [], zeitHistory: [], ...extra });
  return {
    formatVersion: 1,
    meta: {
      einsatzbezeichnung: 'Kellerbrand Mühlweg 3',
      einsatzort: 'Mühlweg 3',
      einsatzstichwort: 'B2 – Kellerbrand',
      einsatznummer: 'E-' + tag.getFullYear() + '-131',
      einsatzleiter: 'Tom Leiter',
      datum: datum,
      alarmzeit: '20:14',
    },
    tagebuch: [
      eintrag(um(20, 14, 5), 'Alarmierung B2 Kellerbrand'),
      eintrag(um(20, 19, 40), 'LF 10 ausgerückt'),
      eintrag(um(20, 26, 12), 'Eintreffen, Rauch aus Kellerfenster', { history: [{ text: 'Eintreffen', zeit: um(20, 27) }] }),
      eintrag(um(20, 29, 3), 'Trupp unter PA in den Keller'),
      eintrag(um(20, 31, 0), 'Wasserversorgung über Hydrant', { geloescht: true }),
      eintrag(um(20, 48, 30), 'Feuer aus', { zeitHistory: [{ zeit: um(20, 51), geaendertAm: um(21, 2) }] }),
      eintrag(um(21, 34, 10), 'Einsatzende'),
    ],
    kraefte: [
      kraft(um(20, 19, 40), 'Tom Leiter', 'eingesetzt', { kommentar: 'Gruppenführer' }),
      kraft(um(20, 19, 41), 'Brenner, Max', 'eingesetzt', { kommentar: 'Angriffstrupp unter PA' }),
      kraft(um(20, 19, 42), 'Lena Wasser', 'eingesetzt', { kommentar: 'Maschinistin' }),
      kraft(um(20, 19, 45), 'LF 10', 'eingesetzt'),
      // Erst falsch geschrieben, dann berichtigt – es zählt der berichtigte Name.
      kraft(um(20, 22, 0), 'Paul Pumpe', 'eingesetzt', { history: [{ text: 'Paul Pumpr', zeit: um(20, 23) }] }),
      kraft(um(20, 40, 0), 'Paul Pumpe', 'abgerückt'),
      kraft(um(20, 55, 0), 'Paul Pumpe', 'eingesetzt'),
      // Versehentlich angehakt und gestrichen: zählt nicht.
      kraft(um(20, 24, 0), 'Sven Funke', 'eingesetzt', { geloescht: true }),
      kraft(um(20, 30, 0), 'Gerda Gast (DRK)', 'eingesetzt'),
      kraft(um(21, 10, 0), 'Gerda Gast (DRK)', 'abgerückt'),
      kraft(um(21, 30, 0), 'Tom Leiter', 'abgerückt'),
      kraft(um(21, 31, 0), 'Brenner, Max', 'abgerückt'),
      kraft(um(21, 31, 30), 'LF 10', 'abgerückt'),
      // Lena rückt nie ab: bis zum Einsatzende.
    ],
    erstelltAm: um(20, 14, 0),
    zuletztGeaendert: um(21, 34, 20),
  };
}
