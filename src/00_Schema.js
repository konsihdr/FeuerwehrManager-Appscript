/**
 * Das Datenmodell – die eine Stelle, an der steht, welche Tabellen es gibt.
 *
 * Im SaaS-Produkt war das eine Sammlung von Migrationen mit Fremdschlüsseln,
 * Prüfbedingungen und Triggern. Ein Tabellenblatt kennt nichts davon. Was dort die
 * Datenbank erzwang, erzwingt hier `03_Vorgang.js` – und zwar aus genau dieser
 * Beschreibung heraus, nicht aus Regeln, die über die Fachfunktionen verstreut sind.
 *
 * Jede Tabelle ist ein Blatt. Zeile 1 trägt die Spaltennamen, und die Datenschicht
 * sucht ihre Spalten **am Namen**, nicht an der Position: Wer im Blatt eine Spalte
 * verschiebt oder eine eigene daneben stellt, zerbricht damit nichts.
 *
 * Spaltenarten:
 *   id     – Kennung, wird beim Anlegen vergeben
 *   text   – Zeichenkette
 *   zahl   – Ganzzahl (leer = null)
 *   bool   – im Blatt „ja“/„nein“, damit es lesbar bleibt
 *   datum  – „2026-10-17“
 *   zeit   – ISO-Zeitstempel
 *   json   – strukturierter Inhalt (Prüfschritte, Regelbedingungen)
 *   geheim – Text, der im Protokoll nie auftaucht (Abdrücke von Ausweis und Gerätegeheimnis)
 *   ref    – Verweis auf eine andere Tabelle, mit der Regel für das Löschen
 *
 * `wachsend: true` – eine Tabelle, die ohne Ende wächst (Buchungen, Prüfungen,
 * Protokoll). Sie wird zum Anhängen nie gelesen, auch nicht für eine Prüfung.
 */

const APP_VERSION = '0.3.0';

/*
 * Rollen sind keine Rangfolge, sondern Zuständigkeiten – aus dem SaaS-Produkt
 * (Ausbaustufe 11) übernommen:
 *
 *                 Technik (Geräte, Prüfungen)   Personal (Nachweise, G26.3, Einsätze)
 *   admin         schreiben                     schreiben, Arten festlegen
 *   kommandant    nur lesen                     schreiben, Arten festlegen
 *   geraetewart   schreiben                     schreiben – er gibt Atemschutz aus
 *   mitglied      umlagern, zählen              gar nicht
 *
 * Drüben las der Gerätewart die Qualifikationen nur. Hier trägt er sie auch ein: Die
 * Wehr hat es so gewollt (2026-10-17) – den Atemschutz betreut der Gerätewart, und er
 * soll die G26.3 nicht erst beim Kommandanten bestellen müssen.
 */
const ROLLEN = ['mitglied', 'geraetewart', 'kommandant', 'admin'];
const ALLE = ROLLEN;
const TECHNIK = ['geraetewart', 'admin'];
const PERSONAL = ['geraetewart', 'kommandant', 'admin'];
const FUEHRUNG = ['kommandant', 'admin'];
const VERWALTUNG = ['geraetewart', 'kommandant', 'admin'];
const NUR_ADMIN = ['admin'];

const STATUS = ['einsatzbereit', 'zu_reinigen', 'zur_pruefung', 'defekt', 'ausgemustert'];
const LAGERPLATZ_TYPEN = ['lager', 'fahrzeug', 'werkstatt', 'sonstige'];
const EINHEITEN = ['tage', 'monate', 'jahre'];
const SCHRITT_ARTEN = ['haken', 'messwert', 'text'];
/** Was ein Dienst sein kann. Stunden zählen je Art getrennt – ein Einsatz ist keine Übung. */
const EINSATZ_ARTEN = ['einsatz', 'uebung', 'wache', 'sonstiges'];

/**
 * Ein Verweis samt dem, was beim Löschen des Ziels passiert:
 *
 *   restrict – das Ziel lässt sich nicht löschen, solange etwas darauf zeigt
 *   cascade  – die verweisende Zeile geht mit
 *   null     – der Verweis wird geleert, die Zeile bleibt (Buchungen tragen den
 *              Namen als Momentaufnahme und bleiben lesbar)
 *
 * `text` ist die Meldung für den Fall `restrict`. Sie steht hier und nicht in der
 * Fachfunktion, weil die Regel hier steht – und weil es sonst eine Meldung gäbe,
 * die zu einer Regel gehört, die jemand anders ändert.
 */
function ref_(ziel, beiLoeschen, text) {
  return { art: 'ref', ziel: ziel, beiLoeschen: beiLoeschen, text: text || '' };
}

const SCHEMA = {
  einstellungen: {
    blatt: 'Einstellungen',
    spalten: { schluessel: 'text', wert: 'text' },
    schluessel: 'schluessel',
    protokoll: true,
    titel: (z) => z.schluessel,
  },

  /*
   * Wer ein Mitglied ist, sagt Google: Die Adresse des Firmenkontos ist der Zugang am
   * Schreibtisch. Das Kürzel ist der Zugang am Hallengerät, wo niemand mit Handschuhen
   * eine Adresse tippt – neben dem Ausweis.
   */
  mitglieder: {
    blatt: 'Mitglieder',
    spalten: {
      id: 'id',
      name: 'text',
      email: 'text',
      kuerzel: 'text',
      rolle: 'text',
      aktiv: 'bool',
      angelegt_am: 'zeit',
    },
    pflicht: ['name', 'email', 'rolle'],
    auswahl: { rolle: ROLLEN },
    eindeutig: [
      { spalte: 'email', klein: true, text: 'Diese Google-Adresse ist schon eingetragen.' },
      // Leer zählt nicht: Wer kein Kürzel hat, meldet sich in der Halle mit dem Ausweis an.
      { spalte: 'kuerzel', klein: true, text: 'Dieses Kürzel hat schon jemand.' },
    ],
    vorgaben: { aktiv: true },
    zeitstempel: { angelegt: 'angelegt_am' },
    protokoll: true,
    titel: (z) => z.name,
  },

  lagerplaetze: {
    blatt: 'Lagerplätze',
    spalten: {
      id: 'id',
      name: 'text',
      code: 'text',
      typ: 'text',
      ober_id: ref_('lagerplaetze', 'restrict', 'Unter diesem Lagerplatz hängen noch andere.'),
      angelegt_am: 'zeit',
    },
    pflicht: ['name', 'typ'],
    auswahl: { typ: LAGERPLATZ_TYPEN },
    eindeutig: [{ spalte: 'code', klein: true, text: 'Diesen Code trägt schon ein anderer Lagerplatz.' }],
    vorgaben: { typ: 'lager' },
    kennung: { spalte: 'code', einstellung: 'barcode_praefix_lagerplaetze', vorgabe: 'LOC' },
    zeitstempel: { angelegt: 'angelegt_am' },
    protokoll: true,
    titel: (z) => z.name,
  },

  geraetetypen: {
    blatt: 'Gerätetypen',
    spalten: {
      id: 'id',
      name: 'text',
      hersteller: 'text',
      modell: 'text',
      beschreibung: 'text',
      angelegt_am: 'zeit',
    },
    pflicht: ['name'],
    eindeutig: [{ spalte: 'name', klein: true, text: 'Einen Gerätetyp mit diesem Namen gibt es schon.' }],
    zeitstempel: { angelegt: 'angelegt_am' },
    protokoll: true,
    titel: (z) => z.name,
  },

  geraete: {
    blatt: 'Geräte',
    spalten: {
      id: 'id',
      geraetetyp_id: ref_('geraetetypen', 'restrict', 'Es gibt noch Geräte dieses Typs.'),
      lagerplatz_id: ref_('lagerplaetze', 'restrict', 'An diesem Lagerplatz stehen noch Geräte.'),
      bezeichnung: 'text',
      seriennummer: 'text',
      barcode: 'text',
      status: 'text',
      bemerkung: 'text',
      angelegt_am: 'zeit',
      geaendert_am: 'zeit',
    },
    pflicht: ['geraetetyp_id', 'lagerplatz_id', 'status'],
    auswahl: { status: STATUS },
    eindeutig: [
      { spalte: 'barcode', klein: true, text: 'Diesen Barcode trägt schon ein anderes Gerät.' },
      // Leer zählt nicht: Geräte ohne eigene Bezeichnung kollidieren nicht miteinander.
      { spalte: 'bezeichnung', klein: true, text: 'Diese Bezeichnung trägt schon ein anderes Gerät.' },
    ],
    vorgaben: { status: 'einsatzbereit' },
    kennung: { spalte: 'barcode', einstellung: 'barcode_praefix_geraete', vorgabe: 'IT' },
    zeitstempel: { angelegt: 'angelegt_am', geaendert: 'geaendert_am' },
    protokoll: true,
    titel: (z) => z.bezeichnung ? z.bezeichnung + ' (' + z.barcode + ')' : z.barcode,
  },

  pruefplaene: {
    blatt: 'Prüfpläne',
    spalten: {
      id: 'id',
      geraetetyp_id: ref_('geraetetypen', 'cascade'),
      // Leer = Standardplan des Typs. Gesetzt = Sonderplan nur für dieses eine Gerät.
      geraet_id: ref_('geraete', 'cascade'),
      name: 'text',
      intervall_wert: 'zahl',
      intervall_einheit: 'text',
      beschreibung: 'text',
      angelegt_am: 'zeit',
    },
    pflicht: ['geraetetyp_id', 'name', 'intervall_wert', 'intervall_einheit'],
    auswahl: { intervall_einheit: EINHEITEN },
    zeitstempel: { angelegt: 'angelegt_am' },
    protokoll: true,
    titel: (z) => z.name,
  },

  pruefschritte: {
    blatt: 'Prüfschritte',
    spalten: {
      id: 'id',
      pruefplan_id: ref_('pruefplaene', 'cascade'),
      position: 'zahl',
      titel: 'text',
      beschreibung: 'text',
      art: 'text',
      einheit: 'text',
      pflicht: 'bool',
    },
    pflicht: ['pruefplan_id', 'titel', 'art'],
    auswahl: { art: SCHRITT_ARTEN },
    vorgaben: { position: 0, art: 'haken', pflicht: true },
    protokoll: true,
    titel: (z) => z.titel,
  },

  /*
   * Fälligkeit je Gerät × Prüfplan. Das ist der Stand, aus dem die Arbeitsliste
   * entsteht – nicht die letzte Prüfung. Eine Prüfung ist ein Nachweis über die
   * Vergangenheit, dies hier ist eine Zusage über die Zukunft.
   */
  plan_stand: {
    blatt: 'Fälligkeiten',
    spalten: {
      id: 'id',
      geraet_id: ref_('geraete', 'cascade'),
      pruefplan_id: ref_('pruefplaene', 'cascade'),
      naechste_faellig: 'datum',
      zuletzt_geprueft: 'datum',
      // Abweichendes Intervall nur für dieses Gerät. Wert und Einheit nur gemeinsam.
      abw_wert: 'zahl',
      abw_einheit: 'text',
      aktiv: 'bool',
    },
    pflicht: ['geraet_id', 'pruefplan_id', 'naechste_faellig'],
    vorgaben: { aktiv: true },
    eindeutig: [{ spalten: ['geraet_id', 'pruefplan_id'], text: 'Diese Zuordnung gibt es schon.' }],
    // Angelegt und gelöscht werden Fälligkeiten als Folge (neues Gerät, neuer Plan) –
    // das steht schon im Protokoll. Eine Änderung von Hand dagegen nicht.
    protokoll: ['aendern'],
    titel: (z, v) => titelVon_(v, 'geraete', z.geraet_id) + ' · ' + titelVon_(v, 'pruefplaene', z.pruefplan_id),
  },

  gruende: {
    blatt: 'Umlagerungsgründe',
    spalten: {
      id: 'id',
      name: 'text',
      beschreibung: 'text',
      status_danach: 'text',
      position: 'zahl',
      aktiv: 'bool',
    },
    pflicht: ['name'],
    auswahl: { status_danach: STATUS },
    eindeutig: [{ spalte: 'name', klein: true, text: 'Diesen Grund gibt es schon.' }],
    vorgaben: { position: 0, aktiv: true },
    protokoll: true,
    titel: (z) => z.name,
  },

  /*
   * Jede Standortänderung ist eine Zeile hier. Namen stehen als Momentaufnahme
   * daneben: Eine Buchung muss lesbar bleiben, wenn Mitglied, Grund oder Lagerplatz
   * längst gelöscht sind – sonst hat die Historie Löcher, die man ihr nicht ansieht.
   */
  buchungen: {
    blatt: 'Buchungen',
    spalten: {
      id: 'id',
      stapel_id: 'text',
      geraet_id: ref_('geraete', 'restrict', 'Das Gerät hat eine Bewegungshistorie – statt zu löschen bitte ausmustern.'),
      von_id: ref_('lagerplaetze', 'null'),
      von_name: 'text',
      nach_id: ref_('lagerplaetze', 'null'),
      nach_name: 'text',
      benutzer_id: ref_('mitglieder', 'null'),
      benutzer_name: 'text',
      grund_id: ref_('gruende', 'null'),
      grund_name: 'text',
      bemerkung: 'text',
      gebucht_am: 'zeit',
    },
    pflicht: ['geraet_id', 'nach_name'],
    zeitstempel: { angelegt: 'gebucht_am' },
    wachsend: true,
    protokoll: true,
    titel: (z, v) => titelVon_(v, 'geraete', z.geraet_id) + ': ' + (z.von_name || '–') + ' → ' + z.nach_name,
  },

  pruefungen: {
    blatt: 'Prüfungen',
    spalten: {
      id: 'id',
      geraet_id: ref_('geraete', 'restrict', 'Für das Gerät gibt es Prüfnachweise – statt zu löschen bitte ausmustern.'),
      pruefplan_id: ref_('pruefplaene', 'null'),
      plan_name: 'text',
      benutzer_id: ref_('mitglieder', 'null'),
      benutzer_name: 'text',
      geprueft_am: 'datum',
      ergebnis: 'text',
      bemerkung: 'text',
      faellig_am: 'datum',
      // Die abgearbeiteten Schritte als Momentaufnahme, nicht als Verweis: Ändert
      // jemand später die Checkliste, behauptete ein Verweis rückwirkend, es sei
      // etwas anderes geprüft worden, als unterschrieben wurde.
      schritte: 'json',
      status_danach: 'text',
      erfasst_am: 'zeit',
    },
    pflicht: ['geraet_id', 'geprueft_am', 'ergebnis'],
    auswahl: { ergebnis: ['bestanden', 'nicht_bestanden'] },
    wachsend: true,
    zeitstempel: { angelegt: 'erfasst_am' },
    protokoll: true,
    titel: (z, v) => titelVon_(v, 'geraete', z.geraet_id) + ': ' + z.plan_name + ' ' +
      (z.ergebnis === 'bestanden' ? 'bestanden' : 'nicht bestanden'),
  },

  satzarten: {
    blatt: 'Satzarten',
    spalten: { id: 'id', name: 'text', beschreibung: 'text' },
    pflicht: ['name'],
    eindeutig: [{ spalte: 'name', klein: true, text: 'Eine Satzart mit diesem Namen gibt es schon.' }],
    protokoll: true,
    titel: (z) => z.name,
  },

  satzart_teile: {
    blatt: 'Satzart-Teile',
    spalten: {
      id: 'id',
      satzart_id: ref_('satzarten', 'cascade'),
      geraetetyp_id: ref_('geraetetypen', 'restrict', 'Der Gerätetyp ist Teil einer Satzart.'),
      min_anzahl: 'zahl',
      max_anzahl: 'zahl',
      bemerkung: 'text',
    },
    pflicht: ['satzart_id', 'geraetetyp_id', 'min_anzahl', 'max_anzahl'],
    eindeutig: [{ spalten: ['satzart_id', 'geraetetyp_id'], text: 'Dieser Gerätetyp steht schon in der Satzart.' }],
    protokoll: true,
    titel: (z, v) => titelVon_(v, 'satzarten', z.satzart_id) + ': ' + titelVon_(v, 'geraetetypen', z.geraetetyp_id),
  },

  saetze: {
    blatt: 'Gerätesätze',
    spalten: {
      id: 'id',
      satzart_id: ref_('satzarten', 'restrict', 'Es gibt noch Sätze dieser Art.'),
      name: 'text',
      barcode: 'text',
      bemerkung: 'text',
      angelegt_am: 'zeit',
    },
    pflicht: ['name'],
    eindeutig: [{ spalte: 'barcode', klein: true, text: 'Diesen Barcode trägt schon ein anderer Satz.' }],
    kennung: { spalte: 'barcode', einstellung: 'barcode_praefix_saetze', vorgabe: 'SET' },
    zeitstempel: { angelegt: 'angelegt_am' },
    protokoll: true,
    titel: (z) => z.name,
  },

  satz_mitglieder: {
    blatt: 'Satz-Bestückung',
    spalten: {
      id: 'id',
      satz_id: ref_('saetze', 'cascade'),
      geraet_id: ref_('geraete', 'cascade'),
      seit: 'zeit',
    },
    pflicht: ['satz_id', 'geraet_id'],
    // Ein Gerät steckt in höchstens einem Satz.
    eindeutig: [{ spalte: 'geraet_id', text: 'Das Gerät steckt schon in einem anderen Satz.' }],
    zeitstempel: { angelegt: 'seit' },
    protokoll: true,
    titel: (z, v) => titelVon_(v, 'saetze', z.satz_id) + ' · ' + titelVon_(v, 'geraete', z.geraet_id),
  },

  regeln: {
    blatt: 'Regeln',
    spalten: {
      id: 'id',
      name: 'text',
      beschreibung: 'text',
      ausloeser: 'text',
      bedingungen: 'json',
      aktionen: 'json',
      position: 'zahl',
      aktiv: 'bool',
    },
    pflicht: ['name', 'ausloeser'],
    auswahl: { ausloeser: ['umlagerung', 'pruefung'] },
    vorgaben: { position: 0, aktiv: true },
    protokoll: true,
    titel: (z) => z.name,
  },

  inventuren: {
    blatt: 'Inventuren',
    spalten: {
      id: 'id',
      // `null` statt `restrict`: Ein gelöschter Lagerplatz darf ein altes Zählergebnis
      // nicht festhalten – der Name steht als Momentaufnahme daneben.
      lagerplatz_id: ref_('lagerplaetze', 'null'),
      lagerplatz_name: 'text',
      benutzer_id: ref_('mitglieder', 'null'),
      benutzer_name: 'text',
      begonnen_am: 'zeit',
      beendet_am: 'zeit',
      gefunden: 'zahl',
      fehlt: 'zahl',
      fremd: 'zahl',
      korrigiert: 'bool',
      bemerkung: 'text',
    },
    pflicht: ['lagerplatz_name'],
    vorgaben: { gefunden: 0, fehlt: 0, fremd: 0, korrigiert: false },
    zeitstempel: { angelegt: 'begonnen_am' },
    protokoll: true,
    titel: (z) => 'Inventur ' + z.lagerplatz_name,
  },

  inventur_geraete: {
    blatt: 'Inventur-Ergebnisse',
    spalten: {
      id: 'id',
      inventur_id: ref_('inventuren', 'cascade'),
      geraet_id: ref_('geraete', 'restrict', 'Das Gerät steht in einem Zählergebnis – statt zu löschen bitte ausmustern.'),
      ergebnis: 'text',
      // Bei „fremd“: wo es laut Bestand lag, BEVOR geradegebucht wurde.
      von_id: ref_('lagerplaetze', 'null'),
      von_name: 'text',
    },
    pflicht: ['inventur_id', 'geraet_id', 'ergebnis'],
    auswahl: { ergebnis: ['gefunden', 'fehlt', 'fremd'] },
    wachsend: true,
    // Die Einzelzeilen stehen im Zählergebnis; jede einzeln zu protokollieren hieße,
    // aus einem Zählgang vierzig Protokolleinträge zu machen.
    protokoll: false,
  },

  hallengeraete: {
    blatt: 'Hallengeräte',
    spalten: {
      id: 'id',
      name: 'text',
      geheimnis: 'geheim',
      geteilt: 'bool',
      abmelden_nach_min: 'zahl',
      // Anmeldung mit dem Kürzel statt des Ausweises – je Gerät abschaltbar.
      kuerzel_erlaubt: 'bool',
      gesperrt: 'bool',
      angelegt_am: 'zeit',
      angelegt_von: 'text',
      zuletzt_genutzt: 'zeit',
    },
    pflicht: ['name', 'geheimnis'],
    eindeutig: [{ spalte: 'geheimnis', text: 'Dieses Gerät ist schon angemeldet.' }],
    vorgaben: { geteilt: true, abmelden_nach_min: 3, kuerzel_erlaubt: true, gesperrt: false },
    zeitstempel: { angelegt: 'angelegt_am' },
    protokoll: true,
    protokollOhne: ['zuletzt_genutzt'],
    titel: (z) => z.name,
  },

  ausweise: {
    blatt: 'Ausweise',
    spalten: {
      id: 'id',
      mitglied_id: ref_('mitglieder', 'cascade'),
      code: 'geheim',
      ausgegeben_am: 'zeit',
      ausgegeben_von: 'text',
    },
    pflicht: ['mitglied_id', 'code'],
    // Ein Ausweis je Mitglied. Wer einen neuen bekommt, verliert den alten.
    eindeutig: [{ spalte: 'mitglied_id', text: 'Das Mitglied hat schon einen Ausweis.' }],
    zeitstempel: { angelegt: 'ausgegeben_am' },
    protokoll: true,
    titel: (z, v) => 'Ausweis ' + titelVon_(v, 'mitglieder', z.mitglied_id),
  },

  /*
   * Qualifikationsarten: „G26.3 gilt 36 Monate“ – eine Aussage über die Art, nicht über
   * eine Person. Stammdaten, aber Personalsache (SaaS 1q). Was Nachweise trägt, wird
   * stillgelegt statt gelöscht: Ein Nachweis ohne seine Art wäre ein Beleg, der nicht
   * mehr sagt, worüber.
   */
  qualiarten: {
    blatt: 'Qualifikationsarten',
    spalten: {
      id: 'id',
      name: 'text',
      beschreibung: 'text',
      // Leer = läuft nicht ab (Lehrgang). Wert und Einheit nur gemeinsam.
      gueltig_wert: 'zahl',
      gueltig_einheit: 'text',
      // Voraussetzung für Atemschutz: Wer eine davon nicht gültig hat, ist nicht tauglich.
      atemschutz: 'bool',
      // Erbracht durch einen Einsatz oder eine Übung unter Atemschutz. Solche Nachweise
      // werden nicht erfasst, sondern aus den Einsatzberichten abgeleitet (`einsatzNachweise_`).
      aus_einsatz: 'bool',
      position: 'zahl',
      aktiv: 'bool',
      angelegt_am: 'zeit',
    },
    pflicht: ['name'],
    auswahl: { gueltig_einheit: EINHEITEN },
    eindeutig: [{ spalte: 'name', klein: true, text: 'Eine Qualifikation mit diesem Namen gibt es schon.' }],
    vorgaben: { atemschutz: false, aus_einsatz: false, position: 0, aktiv: true },
    zeitstempel: { angelegt: 'angelegt_am' },
    protokoll: true,
    titel: (z) => z.name,
  },

  /*
   * Ein Nachweis je Erwerb: „Max hat seine G26.3 am 19.08. gemacht“. Erneuern heißt, einen
   * neuen dazuzulegen – der alte bleibt als Beleg. Was davon heute gilt, entscheidet
   * `nachweiseAktuell_`. Das Ablaufdatum wird gespeichert, nicht gerechnet: Bei der G26.3
   * hängt es am Alter, und maßgeblich ist, was auf der Bescheinigung steht.
   */
  nachweise: {
    blatt: 'Nachweise',
    spalten: {
      id: 'id',
      // Gehört zur Person: geht mit ihr.
      mitglied_id: ref_('mitglieder', 'cascade'),
      art_id: ref_('qualiarten', 'restrict', 'Für diese Qualifikation gibt es Nachweise – statt zu löschen bitte stilllegen.'),
      erworben_am: 'datum',
      gueltig_bis: 'datum',
      bemerkung: 'text',
      erfasst_von: 'text',
      erfasst_am: 'zeit',
    },
    pflicht: ['mitglied_id', 'art_id', 'erworben_am'],
    zeitstempel: { angelegt: 'erfasst_am' },
    protokoll: true,
    titel: (z, v) => titelVon_(v, 'qualiarten', z.art_id) + ' · ' + titelVon_(v, 'mitglieder', z.mitglied_id),
  },

  /*
   * Ein Dienst der Wehr: Einsatz, Übung, Brandsicherheitswache. Geschrieben wird der
   * Bericht meist an der Einsatzstelle, im Einsatztagebuch (eigene Anwendung, JSON-Export);
   * hier wird er übernommen, ergänzt und ausgewertet. `quelle_kennung` ist der Zeitpunkt,
   * zu dem das Tagebuch begonnen wurde – daran erkennt die App ein zweites Übernehmen.
   */
  einsaetze: {
    blatt: 'Einsätze',
    spalten: {
      id: 'id',
      art: 'text',
      nummer: 'text',
      stichwort: 'text',
      bezeichnung: 'text',
      ort: 'text',
      einsatzleiter: 'text',
      beginn: 'zeit',
      ende: 'zeit',
      bericht: 'text',
      quelle: 'text',
      quelle_kennung: 'text',
      tagebuch_eintraege: 'zahl',
      erfasst_von: 'text',
      erfasst_am: 'zeit',
    },
    pflicht: ['art', 'bezeichnung', 'beginn'],
    auswahl: { art: EINSATZ_ARTEN },
    // Leer zählt nicht: Von Hand erfasste Berichte haben keine Quelle.
    eindeutig: [{ spalte: 'quelle_kennung', text: 'Dieses Einsatztagebuch ist schon übernommen.' }],
    vorgaben: { art: 'einsatz', tagebuch_eintraege: 0 },
    zeitstempel: { angelegt: 'erfasst_am' },
    protokoll: true,
    titel: (z) => (z.nummer ? z.nummer + ' ' : '') + z.bezeichnung,
  },

  /*
   * Wer (oder was) wann dabei war – eine Zeile je Zeitraum. Wer zwischendurch abrückt und
   * wiederkommt, hat zwei. Daraus entstehen die Stunden und der Atemschutz-Nachweis.
   * Gastkräfte und Fahrzeuge stehen ohne Mitglied da, nur mit Namen.
   */
  einsatz_kraefte: {
    blatt: 'Einsatzkräfte',
    spalten: {
      id: 'id',
      einsatz_id: ref_('einsaetze', 'cascade'),
      // `null`: Wer die Wehr verlässt, verschwindet nicht aus alten Berichten – der Name
      // steht als Momentaufnahme daneben.
      mitglied_id: ref_('mitglieder', 'null'),
      name: 'text',
      art: 'text',
      von: 'zeit',
      bis: 'zeit',
      atemschutz: 'bool',
      funktion: 'text',
    },
    pflicht: ['einsatz_id', 'name', 'art', 'von', 'bis'],
    auswahl: { art: ['person', 'mittel'] },
    vorgaben: { art: 'person', atemschutz: false },
    protokoll: true,
    titel: (z, v) => titelVon_(v, 'einsaetze', z.einsatz_id) + ' · ' + z.name,
  },

  /*
   * Das Einsatztagebuch selbst, wie es an der Einsatzstelle geführt wurde: jeder Eintrag
   * mit seiner Uhrzeit, Gestrichenes und frühere Fassungen eingeschlossen. Eine Abschrift,
   * keine Arbeitsliste – geändert wird hier nichts, und es geht nicht in den Datenstand.
   */
  einsatz_eintraege: {
    blatt: 'Einsatztagebuch',
    spalten: {
      id: 'id',
      einsatz_id: ref_('einsaetze', 'cascade'),
      liste: 'text',
      zeit: 'zeit',
      text: 'text',
      aktion: 'text',
      kommentar: 'text',
      geloescht: 'bool',
      // Frühere Fassungen und Uhrzeiten, je Zeile eine.
      vorher: 'text',
      zeit_vorher: 'text',
      position: 'zahl',
    },
    pflicht: ['einsatz_id', 'liste', 'zeit'],
    auswahl: { liste: ['tagebuch', 'kraefte'] },
    vorgaben: { geloescht: false, position: 0 },
    wachsend: true,
    // Steht im Protokoll als Teil des Einsatzes – zweihundert Einträge je Einsatz einzeln
    // zu protokollieren, hieße das Protokoll mit einer Abschrift zu füllen.
    protokoll: false,
  },

  protokoll: {
    blatt: 'Protokoll',
    spalten: {
      id: 'id',
      ts: 'zeit',
      benutzer_id: 'text',
      benutzer_name: 'text',
      aktion: 'text',
      objekt_art: 'text',
      objekt_id: 'text',
      objekt_text: 'text',
      details: 'json',
    },
    // Das Protokoll protokolliert sich nicht selbst.
    protokoll: false,
    nurAnhaengen: true,
    wachsend: true,
  },
};

/** Für die Protokolltexte: der lesbare Name einer Zeile, auch wenn es sie nicht mehr gibt. */
function titelVon_(v, tabelle, id) {
  const z = v.finde(tabelle, id);
  return z && SCHEMA[tabelle].titel ? SCHEMA[tabelle].titel(z, v) : '–';
}

/** Die Einstellungen, die die Anwendung kennt – mit Vorgabe und Grenzen. */
const EINSTELLUNGEN = {
  wehr_name: { art: 'text', vorgabe: 'Freiwillige Feuerwehr', titel: 'Name der Wehr' },
  wehr_zusatz: { art: 'text', vorgabe: 'Lager & Prüfwesen', titel: 'Zusatz' },
  vorwarnung_pruefung_tage: {
    art: 'zahl', vorgabe: '30', min: 1, max: 365,
    titel: 'Vorwarnzeit für Prüfungen',
    hinweis: 'So viele Tage im Voraus erscheint eine Prüfung in der Aktionsliste.',
  },
  barcode_praefix_geraete: { art: 'text', vorgabe: 'IT', titel: 'Barcode-Präfix Geräte' },
  barcode_praefix_lagerplaetze: { art: 'text', vorgabe: 'LOC', titel: 'Barcode-Präfix Lagerplätze' },
  barcode_praefix_saetze: { art: 'text', vorgabe: 'SET', titel: 'Barcode-Präfix Gerätesätze' },
  inventur_vermisst_code: {
    art: 'text', vorgabe: '',
    titel: 'Nicht gefundene Geräte umbuchen nach',
    hinweis: 'Code eines Lagerplatzes („Vermisst“). Leer = nicht gefundene Geräte bleiben, wo sie laut Bestand stehen.',
  },
  modul_personal: {
    art: 'schalter', vorgabe: 'ja',
    titel: 'Personalmodul',
    hinweis: 'Qualifikationen, Atemschutztauglichkeit (G26.3), Einsätze und Stunden – für Gerätewart, Kommandant und Administrator.',
  },
  vorwarnung_personal_tage: {
    art: 'zahl', vorgabe: '60', min: 1, max: 365,
    titel: 'Vorwarnzeit für Nachweise',
    hinweis: 'So viele Tage im Voraus erscheint ein ablaufender Nachweis (etwa die G26.3) in der Aktionsliste.',
  },
  logo: { art: 'bild', vorgabe: '', titel: 'Logo' },
};

/** Der Grund, den die Anwendung selbst benutzt. Stammdatum, sichtbar und stilllegbar. */
const GRUND_INVENTUR = 'Inventur';
