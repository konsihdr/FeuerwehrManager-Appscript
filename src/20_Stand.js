/**
 * Der Datenstand, mit dem der Browser arbeitet.
 *
 * Ein Aufruf von `google.script.run` dauert selbst im besten Fall eine halbe Sekunde.
 * Eine Oberfläche, die für jede Liste, jeden Dialog und jeden Scan nachfragt, fühlt
 * sich deshalb zäh an, egal wie schnell sie zeichnet. Stattdessen holt der Browser
 * **einmal** alles, was eine Wehr an Stammdaten und Zuständen hat – das sind auch bei
 * tausend Geräten nur ein paar hundert Kilobyte –, und jede Änderung bringt den neuen
 * Stand in ihrer Antwort gleich mit.
 *
 * Was wächst, ohne dass es jemand täglich braucht – Buchungen, Prüfnachweise,
 * Protokoll –, bleibt draußen und wird geholt, wenn eine Geräteakte aufgeht.
 *
 * Einsatzberichte wachsen ebenso; von ihnen stehen nur die letzten zwei Jahre im Stand
 * (`einsatzStand_` in `29_Einsaetze.js`), das Tagebuch selbst nie.
 *
 * Die abgeleiteten Sichten (Arbeitsliste, Kennzahlen, Satzstand, Atemschutz) rechnet
 * `ableiten_` aus `05_Gemeinsam.js` – hier für den Stand, im Browser für die Vorhersage.
 */

const STAND_TABELLEN_ = [
  'einstellungen', 'mitglieder', 'lagerplaetze', 'geraetetypen', 'geraete', 'pruefplaene',
  'pruefschritte', 'plan_stand', 'gruende', 'satzarten', 'satzart_teile', 'saetze',
  'satz_mitglieder', 'regeln', 'inventuren', 'hallengeraete', 'ausweise',
];
const PERSONAL_TABELLEN_ = ['qualiarten', 'nachweise', 'einsaetze', 'einsatz_kraefte'];

function ichFuerBrowser_(ich) {
  return {
    id: ich.id,
    name: ich.name,
    email: ich.email,
    kuerzel: ich.kuerzel,
    rolle: ich.rolle,
    art: ich.art,
    mit: ich.mit || null,
    geraet: ich.geraet,
  };
}

function modulPersonal_(v) {
  return v.einstellung('modul_personal') !== 'nein';
}

/**
 * Personaldaten bekommt nur, wer sie braucht – und nie ein Hallengerät, auch nicht mit
 * dem Kürzel des Gerätewarts. Am Tablet in der Fahrzeughalle sieht jeder, der
 * vorbeigeht, was auf dem Bildschirm steht.
 */
function personalSichtbar_(v, ich) {
  return PERSONAL.indexOf(ich.rolle) >= 0 && ich.art !== 'halle' && modulPersonal_(v);
}

/**
 * Was `ableiten_` braucht, in der Form, die auch der Browser hat: Geräte mit ihrem
 * Satz, Lagerplätze mit der letzten Zählung. Kopien – `ableiten_` schreibt hinein.
 */
function grunddaten_(v) {
  const satzVon = {};
  v.alle('satz_mitglieder').forEach((m) => {
    satzVon[m.geraet_id] = m.satz_id;
  });
  const gezaehlt = {};
  v.alle('inventuren').forEach((i) => {
    if (i.beendet_am && i.lagerplatz_id && (!gezaehlt[i.lagerplatz_id] || i.beendet_am > gezaehlt[i.lagerplatz_id])) {
      gezaehlt[i.lagerplatz_id] = i.beendet_am;
    }
  });
  const einstellungen = {};
  Object.keys(EINSTELLUNGEN).forEach((k) => {
    if (k !== 'logo') einstellungen[k] = v.einstellung(k);
  });
  const kopie = (name) => v.alle(name).map((x) => Object.assign({}, x));
  return {
    heute: heute_(),
    einstellungen: einstellungen,
    lagerplaetze: v.alle('lagerplaetze').map((l) => Object.assign({}, l, { zuletzt_gezaehlt: gezaehlt[l.id] || null })),
    typen: kopie('geraetetypen'),
    geraete: v.alle('geraete').map((g) => Object.assign({}, g, { satz_id: satzVon[g.id] || null })),
    plaene: kopie('pruefplaene'),
    schritte: kopie('pruefschritte'),
    stand: kopie('plan_stand'),
    gruende: kopie('gruende'),
    satzarten: kopie('satzarten'),
    satzteile: kopie('satzart_teile'),
    saetze: kopie('saetze'),
    regeln: kopie('regeln'),
  };
}

function standBauen_(ich) {
  const fingerabdruck = Speicher_.fingerabdruck();
  Speicher_.vorladen(STAND_TABELLEN_);
  const v = new Vorgang_(ich, false);
  const admin = ich.rolle === 'admin';
  const personal = personalSichtbar_(v, ich);
  if (personal) Speicher_.vorladen(PERSONAL_TABELLEN_);

  const ausweise = {};
  v.alle('ausweise').forEach((a) => {
    ausweise[a.mitglied_id] = a.ausgegeben_am;
  });
  const gesehen = admin ? Sitzung_.zuletztGesehen() : {};

  const d = grunddaten_(v);
  Object.assign(d, {
    version: APP_VERSION,
    rev: fingerabdruck,
    ich: ichFuerBrowser_(ich),
    wehr: { name: d.einstellungen.wehr_name, zusatz: d.einstellungen.wehr_zusatz, logo: v.einstellung('logo') },
    module: { personal: modulPersonal_(v) },
    inventurenOffen: v.alle('inventuren').filter((i) => !i.beendet_am).map((i) => ({
      id: i.id,
      lagerplatz_id: i.lagerplatz_id,
      benutzer_name: i.benutzer_name,
      begonnen_am: i.begonnen_am,
    })),
    // Adresse und Kürzel sieht nur der Administrator: Das Kürzel ist am Hallengerät eine
    // Anmeldung, und die Liste aller Kürzel muss nicht jedes Mitglied haben.
    mitglieder: v.alle('mitglieder').map((m) => {
      const sichtbar = { id: m.id, name: m.name, rolle: m.rolle, aktiv: m.aktiv };
      if (!admin) return sichtbar;
      return Object.assign(sichtbar, {
        email: m.email,
        kuerzel: m.kuerzel,
        ausweis_seit: ausweise[m.id] || null,
        zuletzt_gesehen: gesehen[m.id] || null,
      });
    }),
    hallengeraete: admin
      ? v.alle('hallengeraete').map((h) => ({
        id: h.id,
        name: h.name,
        geteilt: h.geteilt,
        abmelden_nach_min: h.abmelden_nach_min,
        kuerzel_erlaubt: h.kuerzel_erlaubt,
        gesperrt: h.gesperrt,
        angelegt_am: h.angelegt_am,
        angelegt_von: h.angelegt_von,
        zuletzt_genutzt: h.zuletzt_genutzt,
      }))
      : [],
    // Die Tabelle selbst – nur der Administrator bekommt den Verweis. Öffnen kann ihn
    // ohnehin nur, wer in Google Zugriff auf die Tabelle hat.
    tabelleUrl: admin ? Speicher_.tabellenblatt().getUrl() : '',
  });
  if (personal) {
    d.qualiarten = v.alle('qualiarten').map((x) => Object.assign({}, x));
    d.nachweise = v.alle('nachweise').map((x) => Object.assign({}, x));
    Object.assign(d, einsatzStand_(v, d.heute));
  }
  return ableiten_(d);
}

function aktionenStand_() {
  return {
    'daten.laden': {
      rollen: ALLE,
      halle: true,
      f: (v, a, ich) => standBauen_(ich),
    },
    /** Hat sich seit dem letzten Laden etwas geändert? Ein Abruf im Zwischenspeicher. */
    'daten.revision': {
      rollen: ALLE,
      halle: true,
      f: () => Speicher_.fingerabdruck(),
    },
  };
}
