/**
 * Eine Vorschau, die ohne Google läuft: eine einzige HTML-Datei, in der der Servercode
 * gegen die Attrappe arbeitet und die Oberfläche darüber – dieselben Dateien wie in
 * Apps Script, nichts nachgebaut.
 *
 *   node test/vorschau.mjs            → dist/vorschau.html
 *
 * Zum Ansehen, Durchklicken und für die Browserprüfungen in `test/oberflaeche.mjs`.
 * Die Daten liegen im Browser (localStorage) und überstehen ein Neuladen.
 *
 * Was es nur hier gibt: Google. Wer „bei Google angemeldet“ ist, stellt ein Schalter am
 * linken Rand ein (oder `?als=anna` in der Adresse, für Bildschirmfotos ohne Klicken).
 * Zur Auswahl stehen vier Mitglieder und das Konto des Hallen-Tablets, das keines ist.
 *
 * Für die Browserprüfungen gibt es Griffe, die es in Apps Script nicht gibt:
 *   VORSCHAU.verzoegerung = 3000   – jeder Aufruf dauert so lange (Speichern im Hintergrund)
 *   VORSCHAU.offline = true        – jeder Aufruf scheitert wie ohne Netz
 *   VORSCHAU.als(email, aktion, a) – ein anderes Mitglied ändert etwas, an diesem Browser vorbei
 */
import fs from 'node:fs';
import path from 'node:path';
import { WURZEL, SRC, anlage, htmlDateien, serverCode } from './umgebung.mjs';

const DOMAIN = 'ff-musterstadt.example';
// [Kurzname, Google-Adresse, Beschreibung, Name, Rolle, Kürzel] – ohne Rolle: kein Mitglied
const ZUGAENGE = [
  ['anna', 'anna.brandt@' + DOMAIN, 'Administratorin', 'Anna Brandt', 'admin', 'AB'],
  ['ben', 'ben.schlauch@' + DOMAIN, 'Gerätewart', 'Ben Schlauch', 'geraetewart', 'BS'],
  ['carla', 'carla.funk@' + DOMAIN, 'Mitglied', 'Carla Funk', 'mitglied', 'CF'],
  ['dora', 'dora.wehrle@' + DOMAIN, 'Kommandantin', 'Dora Wehrle', 'kommandant', 'DW'],
  ['halle', 'halle@' + DOMAIN, 'Konto des Hallen-Tablets', '', '', ''],
];

/**
 * `artifact: true` – dieselbe Vorschau als Seite für ein claude.ai-Artifact: ohne eigenes
 * Gerüst (das legt der Betrachter darum), und Drucken/Herunterladen sagen, dass sie hier
 * nicht gehen, statt still nichts zu tun. In Apps Script gehen beide.
 */
export function vorschauBauen(optionen = {}) {
  const html = htmlDateien();
  const attrappe = fs.readFileSync(path.join(WURZEL, 'test', 'attrappe.js'), 'utf8');
  const dienste = ['SpreadsheetApp', 'CacheService', 'PropertiesService', 'LockService', 'Utilities', 'Session', 'ScriptApp', 'HtmlService'];
  // Was `doGet` als Quelltext mitschickt – hier einmal beim Bauen erzeugt, aus demselben Servercode.
  const gemeinsam = anlage().lauf('gemeinsamerCode_()');

  const kern = `
(function () {
  'use strict';
  var SPEICHER = 'fwm-vorschau.v3';
  var ZUGAENGE = ${JSON.stringify(ZUGAENGE)};
  function lesen(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function schreiben(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* nichts */ } }
  var A = Attrappe.attrappeErzeugen({ console: console });
  var gelesen = null;
  try { gelesen = JSON.parse(localStorage.getItem(SPEICHER) || 'null'); } catch (e) { gelesen = null; }
  if (gelesen) {
    A.mappe.einspielen(gelesen.mappe);
    (gelesen.eigenschaften || []).forEach(function (p) { A.eigenschaften.set(p[0], p[1]); });
  }
  // Der Server in einem eigenen Bereich: Seine Namen auf oberster Ebene sollen sich mit
  // denen der Oberfläche nicht treffen – in Apps Script leben beide auch getrennt.
  var SERVER = (function (${dienste.join(', ')}) {
${serverCode()}
    return {
      aufruf: aufruf,
      einrichten: einrichten_,
      demo: demoEinspielen_,
      mitglied: function (email, name, rolle, kuerzel) {
        mitSperre_(function () {
          Speicher_.vergessen();
          var v = new Vorgang_(null, true);
          v.einfuegen('mitglieder', { name: name, email: email, kuerzel: kuerzel, rolle: rolle });
          v.festschreiben();
        });
      },
      start: function () {
        Speicher_.vergessen();
        var v = new Vorgang_(null, false);
        return { version: APP_VERSION, wehr_name: v.einstellung('wehr_name'), wehr_zusatz: v.einstellung('wehr_zusatz'), logo: v.einstellung('logo'), eingerichtet: true };
      },
    };
  })(${dienste.map((d) => 'A.dienste.' + d).join(', ')});

  function sichern() {
    try {
      localStorage.setItem(SPEICHER, JSON.stringify({ mappe: A.mappe.abzug(), eigenschaften: Array.from(A.eigenschaften.entries()) }));
    } catch (e) { /* Vorschau ohne Speicher: gilt bis zum Neuladen */ }
  }

  if (!gelesen) {
    SERVER.einrichten();
    ZUGAENGE.forEach(function (z) { if (z[4]) SERVER.mitglied(z[1], z[3], z[4], z[5]); });
    SERVER.demo();
    sichern();
  }

  window.START = SERVER.start();

  // Wer ist „bei Google angemeldet“? ?als= in der Adresse, sonst die gemerkte Wahl, sonst Anna.
  var als = new URLSearchParams(location.search).get('als');
  if (als) {
    var treffer = ZUGAENGE.filter(function (z) { return z[0] === als; })[0];
    schreiben('fwm-vorschau.als', als.indexOf('@') > 0 ? als : treffer ? treffer[1] : als + '@${DOMAIN}');
    var halle = new URLSearchParams(location.search).get('halle');
    if (halle !== null) schreiben('fwm.halle', halle === '1' ? 'true' : 'false');
  }
  var konto = lesen('fwm-vorschau.als') || ZUGAENGE[0][1];
  A.setzeNutzer(konto);

  window.VORSCHAU = {
    konto: konto,
    verzoegerung: 0,
    offline: false,
    /** Ein anderes Mitglied ändert etwas – wie von einem zweiten Gerät aus. */
    als: function (email, name, args) {
      A.setzeNutzer(email);
      try {
        return JSON.parse(SERVER.aufruf(null, name, args || {}));
      } finally {
        A.setzeNutzer(konto);
        sichern();
      }
    },
    wechseln: function (email) {
      schreiben('fwm-vorschau.als', email);
      schreiben('fwm.sitzung', null);
      location.reload();
    },
    zuruecksetzen: function () {
      try {
        Object.keys(localStorage).filter(function (k) { return k.indexOf('fwm') === 0; }).forEach(function (k) { localStorage.removeItem(k); });
      } catch (e) { /* nichts */ }
      location.hash = '';
      location.reload();
    },
  };

  // Der Schalter am linken Rand – gibt es nur in der Vorschau.
  function schalter() {
    var offen = false;
    var rand = document.createElement('div');
    rand.setAttribute('style', 'position:fixed;left:0;top:38%;z-index:600;display:flex;align-items:flex-start;font:13px system-ui,sans-serif');
    function zeichnenSchalter() {
      rand.innerHTML = '';
      var lasche = document.createElement('button');
      lasche.textContent = 'Vorschau';
      lasche.setAttribute('style', 'writing-mode:vertical-rl;transform:rotate(180deg);padding:12px 6px;border:1px solid var(--n-300);border-left:none;border-radius:8px 0 0 8px;background:var(--n-900);color:var(--n-0);cursor:pointer;font:600 12px system-ui,sans-serif;letter-spacing:0.06em');
      lasche.onclick = function () { offen = !offen; zeichnenSchalter(); };
      rand.appendChild(lasche);
      if (!offen) return;
      var feld = document.createElement('div');
      feld.setAttribute('style', 'background:var(--n-0);color:var(--n-900);border:1px solid var(--n-300);border-radius:0 12px 12px 0;padding:12px 14px;box-shadow:var(--schatten-lg);width:250px');
      var t = document.createElement('div');
      t.textContent = 'Bei Google angemeldet als:';
      t.setAttribute('style', 'font-weight:650;margin-bottom:8px');
      feld.appendChild(t);
      ZUGAENGE.forEach(function (z) {
        var b = document.createElement('button');
        b.setAttribute('style', 'display:block;width:100%;text-align:left;margin:0 0 6px;padding:7px 10px;border-radius:8px;cursor:pointer;font:inherit;border:1px solid ' + (z[1] === konto ? 'var(--rot-600);background:var(--rot-50)' : 'var(--n-300);background:var(--n-0)') + ';color:var(--n-900)');
        b.innerHTML = '<strong></strong><br><span style="color:var(--n-500);font-size:12px"></span>';
        b.firstChild.textContent = z[3] || 'Hallen-Tablet';
        b.lastChild.textContent = z[2] + (z[5] ? ' · ' + z[5] : '');
        b.onclick = function () { window.VORSCHAU.wechseln(z[1]); };
        feld.appendChild(b);
      });
      var hinweis = document.createElement('div');
      hinweis.setAttribute('style', 'color:var(--n-500);font-size:12px;margin:6px 0 8px');
      hinweis.textContent = lesen('fwm.hallengeraet') ? 'Dieser Browser ist ein Hallengerät – angemeldet wird hier mit Ausweis oder Kürzel (AB, BS, CF, DW).' : 'In Apps Script sagt Google, wer angemeldet ist. Hier ist es dieser Schalter.';
      feld.appendChild(hinweis);
      function knopf(text, f) {
        var b = document.createElement('button');
        b.textContent = text;
        b.setAttribute('style', 'margin:0 6px 0 0;padding:5px 9px;border-radius:7px;border:1px solid var(--n-300);background:var(--n-0);color:var(--n-800);cursor:pointer;font:inherit;font-size:12px');
        b.onclick = f;
        feld.appendChild(b);
      }
      if (lesen('fwm.hallengeraet')) knopf('Kein Hallengerät mehr', function () { ['fwm.hallengeraet', 'fwm.hallengeraet.name', 'fwm.hallengeraet.kuerzel', 'fwm.sitzung'].forEach(function (k) { schreiben(k, null); }); location.reload(); });
      knopf('Alles zurücksetzen', function () { window.VORSCHAU.zuruecksetzen(); });
      rand.appendChild(feld);
    }
    zeichnenSchalter();
    document.body.appendChild(rand);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schalter);
  else setTimeout(schalter, 0);
  sichern();

  // google.script.run – asynchron wie das Original, mit spürbarer Verzögerung.
  function laeufer(erfolg, fehler) {
    return {
      withSuccessHandler: function (f) { return laeufer(f, fehler); },
      withFailureHandler: function (f) { return laeufer(erfolg, f); },
      aufruf: function () {
        var args = JSON.parse(JSON.stringify(Array.prototype.slice.call(arguments)));
        var v = window.VORSCHAU || {};
        if (v.offline) {
          setTimeout(function () { if (fehler) fehler(new Error('NetworkError: Verbindung unterbrochen')); }, 60);
          return;
        }
        setTimeout(function () {
          var antwort;
          try {
            antwort = SERVER.aufruf.apply(null, args);
          } catch (e) {
            if (fehler) fehler(e);
            return;
          }
          sichern();
          if (erfolg) erfolg(antwort);
        }, v.verzoegerung || 120 + Math.random() * 180);
      },
    };
  }
  window.google = { script: { run: laeufer(null, null) } };
})();
`;

  const clientDateien = ['js_grund', 'js_bausteine', 'js_sync', 'js_dialoge', 'js_schreibtisch', 'js_personal', 'js_einsaetze', 'js_halle', 'js_start'];
  const gemeinsamBlock = '<script>\n' + gemeinsam.replace(/<\/(script)/gi, '<\\/$1') + '\n</script>';
  if (optionen.artifact) {
    const nachtrag = `<script>
window.print = function () { meldung.info('Drucken geht in dieser Vorschau nicht – in Apps Script schon.'); };
herunterladen = function (name) { meldung.info(name + ': Herunterladen geht in dieser Vorschau nicht – in Apps Script schon.'); };
</script>`;
    return `<title>FeuerwehrManager Vorschau</title>
${html.stil}
<div id="app"><div class="laden">Lädt …</div></div>
<div class="fortschritt" id="fortschritt"></div>
<div class="meldungen" id="meldungen" aria-live="polite"></div>
<script>
${attrappe}
</script>
<script>
${kern.replace(/<\/script>/gi, '<\\/script>')}
</script>
${gemeinsamBlock}
${clientDateien.map((d) => html[d]).join('\n')}
${nachtrag}
`;
  }
  const seite = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>FeuerwehrManager Vorschau</title>
${html.stil}
</head>
<body>
<div id="app"><div class="laden">Lädt …</div></div>
<div class="fortschritt" id="fortschritt"></div>
<div class="meldungen" id="meldungen" aria-live="polite"></div>
<script>
${attrappe}
</script>
<script>
${kern.replace(/<\/script>/gi, '<\\/script>')}
</script>
${gemeinsamBlock}
${clientDateien.map((d) => html[d]).join('\n')}
</body>
</html>
`;
  return seite;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const artifact = process.argv.includes('--artifact');
  const ziel = path.join(WURZEL, 'dist');
  fs.mkdirSync(ziel, { recursive: true });
  const datei = path.join(ziel, artifact ? 'vorschau-artifact.html' : 'vorschau.html');
  fs.writeFileSync(datei, vorschauBauen({ artifact }));
  console.log(datei + ' (' + Math.round(fs.statSync(datei).size / 1024) + ' KB)');
  void SRC;
}
