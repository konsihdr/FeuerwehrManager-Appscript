/**
 * Einrichtung – über das Menü der Tabelle, nicht über die Web-App.
 *
 * ## Das Henne-Ei-Problem
 *
 * Eine frische Anlage hat keinen Zugang, und ohne Zugang kann niemand einen anlegen.
 * Im SaaS-Produkt löste das der SQL-Editor des Projektinhabers. Hier ist es das Menü
 * „🚒 FeuerwehrManager“ in der Tabelle: Wer es sieht, hat die Tabelle geöffnet – und
 * wer die Tabelle bearbeiten darf, besitzt die Daten ohnehin.
 *
 * Eine Einrichtungsseite in der Web-App wäre bequemer und wäre die Tür, durch die der
 * Erste, der die Adresse findet, Administrator wird.
 *
 * ## Warum die Menüfunktionen trotzdem abgesichert sind
 *
 * Sie stehen ohne `_` am Ende im globalen Bereich – das Menü braucht das –, und
 * damit ließen sie sich auch über `google.script.run` aufrufen. `ui_()` wirft dort:
 * Außerhalb der geöffneten Tabelle gibt es keine Oberfläche.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🚒 FeuerwehrManager')
    .addItem('Einrichten / Blätter prüfen', 'menueEinrichten')
    .addItem('Administrator eintragen oder zurückholen …', 'menueAdministrator')
    .addSeparator()
    .addItem('Demo-Daten einspielen', 'menueDemo')
    .addItem('Adresse der Web-App anzeigen', 'menueAdresse')
    .addItem('Zwischenspeicher leeren', 'menueZwischenspeicher')
    .addToUi();
}

/**
 * Jemand hat im Blatt selbst etwas geändert: Der Zwischenspeicher weiß davon nichts.
 * Einfacher Auslöser, läuft bei jeder Eingabe von Hand.
 */
function onEdit() {
  try {
    Speicher_.erneuern(Object.keys(SCHEMA));
  } catch (e) {
    // Ein einfacher Auslöser darf nicht laut scheitern – er läuft bei jedem Tastendruck.
  }
}

/**
 * Dasselbe für Änderungen, die `onEdit` nicht sieht: Zeilen löschen, Blätter
 * umbenennen, Sortieren. Wird bei der Einrichtung als installierbarer Auslöser angelegt.
 */
function beiAenderung() {
  onEdit();
}

function ui_() {
  return SpreadsheetApp.getUi();
}

function menueEinrichten() {
  const ui = ui_();
  const bericht = einrichten_();
  ui.alert('FeuerwehrManager', bericht + '\n\nNächster Schritt: „Administrator eintragen …“, danach ' +
    '„Erweiterungen → Apps Script → Bereitstellen → Neue Bereitstellung → Web-App“.', ui.ButtonSet.OK);
}

/**
 * Blätter anlegen, fehlende Spalten ergänzen, Formate setzen. Beliebig oft
 * aufrufbar: Was da ist, bleibt, wie es ist.
 */
/**
 * Ein Blatt anlegen oder vervollständigen: fehlende Spalten hinten anfügen, alles als
 * Text formatieren, Kopfzeile fixieren, vor versehentlichem Bearbeiten warnen.
 */
function blattEinrichten_(ss, name) {
  const s = SCHEMA[name];
  const spalten = Object.keys(s.spalten);
  let sh = ss.getSheetByName(s.blatt);
  const neu = !sh;
  if (neu) sh = ss.insertSheet(s.blatt);
  const breiteVorher = sh.getLastColumn();
  const kopf = breiteVorher ? sh.getRange(1, 1, 1, breiteVorher).getValues()[0].map((k) => String(k).trim()) : [];
  let fehlen = [];
  if (!kopf.some((k) => k)) {
    sh.getRange(1, 1, 1, spalten.length).setValues([spalten]);
  } else {
    fehlen = spalten.filter((sp) => kopf.indexOf(sp) < 0);
    if (fehlen.length) sh.getRange(1, kopf.length + 1, 1, fehlen.length).setValues([fehlen]);
  }
  const breite = sh.getLastColumn();
  // Alles Text – sonst macht Google Tabellen aus „00123“ eine Zahl und aus „1-2“ ein Datum.
  sh.getRange(1, 1, sh.getMaxRows(), breite).setNumberFormat('@');
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, breite).setFontWeight('bold').setBackground('#eef1f7');
  // Ein Schutz, der nur warnt: Die Tabelle gehört der Wehr, und sie soll hineinsehen und
  // im Notfall auch eingreifen können. Aber nicht aus Versehen.
  if (!sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) {
    sh.protect()
      .setDescription('Wird von der FeuerwehrManager-App verwaltet. Änderungen von Hand umgehen Protokoll und Regeln.')
      .setWarningOnly(true);
  }
  return { sh: sh, neu: neu, fehlen: fehlen };
}

function einrichten_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const neu = [];
  const ergaenzt = [];
  Object.keys(SCHEMA).forEach((name) => {
    const r = blattEinrichten_(ss, name);
    if (r.neu) neu.push(SCHEMA[name].blatt);
    if (r.fehlen.length) ergaenzt.push(SCHEMA[name].blatt + ': ' + r.fehlen.join(', '));
  });

  // Das leere Startblatt einer neuen Tabelle stört nur.
  ss.getSheets().forEach((sh) => {
    const unseres = Object.keys(SCHEMA).some((n) => SCHEMA[n].blatt === sh.getName());
    if (!unseres && sh.getLastRow() === 0 && sh.getLastColumn() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });

  // Der Auslöser für Änderungen von Hand – genau einmal.
  if (!ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === 'beiAenderung')) {
    ScriptApp.newTrigger('beiAenderung').forSpreadsheet(ss).onChange().create();
  }

  Speicher_.vergessen();
  Speicher_.erneuern(Object.keys(SCHEMA));
  mitSperre_(() => {
    const v = new Vorgang_(null, true);
    grundInventur_(v);
    v.festschreiben();
  });

  const teile = [];
  teile.push(neu.length ? 'Neu angelegt: ' + neu.join(', ') + '.' : 'Alle Blätter sind vorhanden.');
  if (ergaenzt.length) teile.push('Ergänzte Spalten: ' + ergaenzt.join('; ') + '.');
  return teile.join('\n');
}

/**
 * Den ersten Administrator eintragen – oder einen Zugang zurückholen.
 *
 * Gibt es die Adresse schon, wird sie wieder aktiver Administrator. Das ist der
 * Notausgang, wenn niemand mehr hineinkommt: Wer die Tabelle öffnen darf, darf das auch.
 * Leer gelassen, trägt sich ein, wer das Menü gerade bedient.
 */
function menueAdministrator() {
  const ui = ui_();
  einrichten_();
  const frage = (titel, text) => {
    const r = ui.prompt(titel, text, ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) throw new Fehler_('abgebrochen', 'abbruch');
    return r.getResponseText().trim();
  };
  try {
    const selbst = Sitzung_.googleAdresse();
    const email = (frage('Administrator', 'Google-Adresse aus dem Firmenkonto' +
      (selbst ? ' (leer lassen für ' + selbst + ')' : '') + ':') || selbst).toLowerCase();
    const name = frage('Administrator', 'Name (z. B. „Anna Brandt“):');
    const kuerzel = frage('Administrator', 'Kürzel für die Anmeldung am Hallengerät (z. B. „AB“, darf leer bleiben):');
    const ergebnis = mitSperre_(() => {
      Speicher_.vergessen();
      const v = new Vorgang_(null, true);
      const werte = mitgliedFelder_({ email: email, name: name || email, kuerzel: kuerzel, rolle: 'admin', aktiv: true });
      const da = v.alle('mitglieder').find((m) => normal_(m.email) === werte.email);
      if (da) v.aendern('mitglieder', da.id, { rolle: 'admin', aktiv: true });
      else v.einfuegen('mitglieder', werte);
      v.festschreiben();
      return da ? 'ist wieder aktiver Administrator' : 'ist als Administrator eingetragen';
    });
    ui.alert('FeuerwehrManager', email + ' ' + ergebnis + '.', ui.ButtonSet.OK);
  } catch (e) {
    if (e instanceof Fehler_ && e.code === 'abbruch') return;
    ui.alert('FeuerwehrManager', e.message, ui.ButtonSet.OK);
  }
}

function menueDemo() {
  const ui = ui_();
  const r = ui.alert('Demo-Daten',
    'Füllt die Tabelle mit einem Bestand, mit dem sichtbar gearbeitet wurde: 8 Lagerplätze, ' +
    '10 Gerätetypen, 33 Geräte, Buchungen, Prüfungen, Sätze, Regeln – und sechs erfundene ' +
    'Mitglieder (…@demo.invalid) mit Atemschutz-Nachweisen.\n\n' +
    'Nur in eine leere Tabelle – Demo-Geräte, die sich mit einem echten Bestand mischen, ' +
    'lassen sich hinterher nicht mehr davon trennen. Fortfahren?', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;
  try {
    einrichten_();
    ui.alert('Demo-Daten', demoEinspielen_(), ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Demo-Daten', e.message, ui.ButtonSet.OK);
  }
}

function menueAdresse() {
  const ui = ui_();
  const url = ScriptApp.getService().getUrl();
  ui.alert('Adresse der Web-App', url
    ? url + '\n\nDiese Adresse an die Mitglieder geben – sie melden sich mit ihrem Firmenkonto an. Am Telefon: im Browser öffnen, „Zum Startbildschirm hinzufügen“.'
    : 'Noch nicht bereitgestellt.\n\nErweiterungen → Apps Script → Bereitstellen → Neue Bereitstellung → Typ „Web-App“, ' +
      'Ausführen als „Ich“, Zugriff „Alle in Ihrer Domain“.', ui.ButtonSet.OK);
}

function menueZwischenspeicher() {
  const ui = ui_();
  Speicher_.erneuern(Object.keys(SCHEMA));
  ui.alert('FeuerwehrManager', 'Der Zwischenspeicher ist geleert. Die Web-App liest beim nächsten Aufruf frisch aus den Blättern.', ui.ButtonSet.OK);
}
