/**
 * Die Blätter lesen und schreiben – und dabei so selten wie möglich hinsehen.
 *
 * ## Warum ein Zwischenspeicher
 *
 * Ein Blatt zu lesen kostet in Apps Script je nach Tag 50 bis 300 ms. Die Oberfläche
 * braucht beim Start rund zwanzig Tabellen; das wären mehrere Sekunden, bevor
 * irgendetwas zu sehen ist – und das bei jedem Aufruf jedes Mitglieds. Im
 * `CacheService` liegen dieselben Werte nach dem ersten Lesen in drei Abrufen.
 *
 * ## Warum er nicht lügt
 *
 * Jede Tabelle hat eine **Revision**, und die Daten liegen unter ihrer Revision ab.
 * Wer schreibt, vergibt danach eine neue; die alten Einträge werden damit nicht
 * gelöscht, sondern nur nie wieder gefragt. Von Hand geändert wird das Blatt auch –
 * dafür setzen `onEdit` und `beiAenderung` in `30_Einrichtung.js` alle Revisionen
 * neu. Was sie nicht bemerken (ein anderes Skript, das in das Blatt schreibt), fällt
 * spätestens nach sechs Stunden aus dem Speicher.
 *
 * Geschrieben wird **nie** auf Grundlage des Zwischenspeichers: Ein schreibender
 * Vorgang liest unter der Sperre frisch aus dem Blatt (`frisch = true`).
 *
 * ## Warum alles als Text
 *
 * Jede Zelle hat das Zahlenformat „Nur Text“ (`@`). Ohne das macht Google Tabellen
 * aus dem Barcode „00123“ die Zahl 123, aus „1-2“ den 1. Februar und aus einem
 * Datum ein Objekt, das sich nicht an den Browser übergeben lässt. Die Umwandlung in
 * Zahlen und Wahrheitswerte übernimmt `03_Vorgang.js` anhand des Schemas.
 */

const CACHE_PRAEFIX_ = 'fwm1:';
const CACHE_DAUER_ = 21600; // sechs Stunden – das Höchstmaß des CacheService
const CACHE_STUECK_ = 30000; // Zeichen je Eintrag; 100 KB Grenze, Umlaute zählen doppelt
const CACHE_HOECHSTENS_ = 40; // Stücke je Tabelle; was größer ist, wird nicht zwischengespeichert

const Speicher_ = {
  memo: {},
  ss: null,

  /** Zu Beginn jedes Aufrufs: nichts aus einem früheren mitnehmen. */
  vergessen() {
    this.memo = {};
    this.ss = null;
  },

  tabellenblatt() {
    if (!this.ss) {
      this.ss = SpreadsheetApp.getActiveSpreadsheet();
      pruefe_(this.ss, 'Die Anwendung ist an kein Tabellenblatt gebunden. Das Skript gehört in „Erweiterungen → Apps Script“ der Tabelle.');
    }
    return this.ss;
  },

  /**
   * Ein Blatt, das das Schema kennt, die Tabelle aber noch nicht hat, wird angelegt.
   *
   * Das ist der Weg für neue Fassungen: 0.2 brachte „Qualifikationsarten“ und „Nachweise“
   * mit, und wer nach `clasp push` die Web-App öffnet, soll nicht erst „Einrichten“
   * suchen müssen. Ein leeres Blatt anzulegen verändert nichts, was schon da war; zwei
   * gleichzeitige Aufrufe, die es beide anlegen wollen, scheitern höchstens einmal
   * still am Namen.
   */
  blatt(name) {
    const titel = SCHEMA[name].blatt;
    const ss = this.tabellenblatt();
    let sh = ss.getSheetByName(titel);
    if (!sh) {
      try {
        sh = blattEinrichten_(ss, name).sh;
      } catch (e) {
        sh = ss.getSheetByName(titel);
      }
    }
    pruefe_(sh, 'Das Blatt „' + titel + '“ fehlt. In der Tabelle „FeuerwehrManager → Einrichten“ ausführen.');
    return sh;
  },

  /**
   * Eine Zelle als Text. Mit dem Textformat sind es ohnehin Zeichenketten; was ein
   * Mensch von Hand in eine anders formatierte Zelle getippt hat, kommt hier aber als
   * Zahl, Datum oder Wahrheitswert an.
   */
  zelle(wert) {
    if (wert === null || wert === undefined) return '';
    if (wert instanceof Date) {
      if (isNaN(wert.getTime())) return '';
      return Utilities.formatDate(wert, zeitzone_(), "yyyy-MM-dd'T'HH:mm:ss.SSSXXX");
    }
    if (wert === true) return 'ja';
    if (wert === false) return 'nein';
    return String(wert);
  },

  /** Kopfzeile und Datenzeilen einer Tabelle, als Text. */
  lesen(name, frisch) {
    const da = this.memo[name];
    if (da && (!frisch || da.frisch)) return da;
    if (!frisch) {
      this.vorladen([name]);
      return this.memo[name];
    }
    return this.ausBlatt(name);
  },

  ausBlatt(name, ergaenzt) {
    const sh = this.blatt(name);
    const zeilen = sh.getLastRow();
    const spalten = sh.getLastColumn();
    pruefe_(zeilen >= 1 && spalten >= 1,
      'Dem Blatt „' + SCHEMA[name].blatt + '“ fehlt die Kopfzeile. „FeuerwehrManager → Einrichten“ legt sie an.');
    const alle = sh.getRange(1, 1, zeilen, spalten).getValues();
    const kopf = alle[0].map((k) => String(k).trim());
    // Eine neue Fassung bringt auch neue Spalten mit (0.3: „aus_einsatz“ bei den
    // Qualifikationsarten). Sie werden hinten angefügt, wie es „Einrichten“ täte – einmal.
    if (!ergaenzt && !this.vollstaendig(name, kopf)) {
      blattEinrichten_(this.tabellenblatt(), name);
      return this.ausBlatt(name, true);
    }
    const werte = alle.slice(1).map((z) => z.map((w) => this.zelle(w)));
    this.memo[name] = { kopf: kopf, werte: werte, frisch: true };
    return this.memo[name];
  },

  vollstaendig(name, kopf) {
    return Object.keys(SCHEMA[name].spalten).every((s) => kopf.indexOf(s) >= 0);
  },

  // ─────────────────────────── Zwischenspeicher ───────────────────────────

  cache() {
    return CacheService.getScriptCache();
  },

  /** Die Revision je Tabelle. Fehlt eine, wird sie angelegt. */
  revisionen(namen) {
    const schluessel = namen.map((n) => CACHE_PRAEFIX_ + 'rev:' + n);
    const da = this.cache().getAll(schluessel);
    const revs = {};
    const neu = {};
    namen.forEach((n, i) => {
      revs[n] = da[schluessel[i]];
      if (!revs[n]) {
        revs[n] = Utilities.getUuid().slice(0, 8);
        neu[schluessel[i]] = revs[n];
      }
    });
    if (Object.keys(neu).length) this.cache().putAll(neu, CACHE_DAUER_);
    return revs;
  },

  /** Nach dem Schreiben – oder wenn jemand im Blatt selbst etwas geändert hat. */
  erneuern(namen) {
    const neu = {};
    namen.forEach((n) => {
      neu[CACHE_PRAEFIX_ + 'rev:' + n] = Utilities.getUuid().slice(0, 8);
    });
    this.cache().putAll(neu, CACHE_DAUER_);
  },

  /** Für die Abfrage „hat sich etwas geändert?“ – ein Abruf statt zwanzig Blätter. */
  fingerabdruck() {
    const namen = Object.keys(SCHEMA).filter((n) => n !== 'protokoll');
    const revs = this.revisionen(namen);
    return namen.map((n) => revs[n]).join('.');
  },

  /**
   * Mehrere Tabellen auf einmal holen: erst aus dem Zwischenspeicher, den Rest aus
   * den Blättern. Drei Abrufe für alles, was schon da ist.
   */
  vorladen(namen) {
    const fehlen = namen.filter((n) => !this.memo[n]);
    if (!fehlen.length) return;
    const revs = this.revisionen(fehlen);
    const kopfSchluessel = fehlen.map((n) => CACHE_PRAEFIX_ + 'd:' + n + ':' + revs[n]);
    const koepfe = this.cache().getAll(kopfSchluessel);

    const stueckSchluessel = [];
    const plan = {};
    fehlen.forEach((n, i) => {
      const anzahl = Number(koepfe[kopfSchluessel[i]] || 0);
      if (!anzahl) return;
      plan[n] = [];
      for (let k = 0; k < anzahl; k++) {
        const s = kopfSchluessel[i] + ':' + k;
        plan[n].push(s);
        stueckSchluessel.push(s);
      }
    });
    const stuecke = stueckSchluessel.length ? this.cache().getAll(stueckSchluessel) : {};

    const ablegen = {};
    fehlen.forEach((n, i) => {
      if (plan[n] && plan[n].every((s) => typeof stuecke[s] === 'string')) {
        try {
          const daten = JSON.parse(plan[n].map((s) => stuecke[s]).join(''));
          // Abgelegt von einer älteren Fassung, der eine Spalte fehlt: dann aus dem Blatt.
          if (this.vollstaendig(n, daten.kopf)) {
            this.memo[n] = { kopf: daten.kopf, werte: daten.werte, frisch: false };
            return;
          }
        } catch (e) {
          // Ein zerrissener Eintrag ist kein Grund für einen Fehler – dann eben frisch.
        }
      }
      const gelesen = this.ausBlatt(n);
      if (n !== 'protokoll') this.fuerAblage(ablegen, kopfSchluessel[i], gelesen);
    });
    if (Object.keys(ablegen).length) {
      try {
        this.cache().putAll(ablegen, CACHE_DAUER_);
      } catch (e) {
        console.warn('Zwischenspeicher voll: ' + e);
      }
    }
  },

  fuerAblage(ablegen, schluessel, daten) {
    const text = JSON.stringify({ kopf: daten.kopf, werte: daten.werte });
    const anzahl = Math.ceil(text.length / CACHE_STUECK_);
    if (anzahl > CACHE_HOECHSTENS_) return;
    for (let k = 0; k < anzahl; k++) {
      ablegen[schluessel + ':' + k] = text.slice(k * CACHE_STUECK_, (k + 1) * CACHE_STUECK_);
    }
    ablegen[schluessel] = String(anzahl);
  },

  // ─────────────────────────────── Schreiben ───────────────────────────────

  /**
   * Änderungen in ein Blatt bringen. `plan`:
   *   geaendert – [{ i, roh }]  Datenzeile i (0 = erste unter dem Kopf) bekommt `roh`
   *   neu       – [roh]         wird unten angehängt
   *   geloescht – [i]           wird entfernt
   *
   * Reihenfolge: ändern, anhängen, löschen. Gelöscht wird von unten nach oben – dann
   * verschiebt keine Löschung die Zeilennummern, die noch dran sind.
   */
  schreiben(name, plan) {
    const m = this.memo[name];
    pruefe_(m && m.frisch, 'Geschrieben wird nur, was frisch gelesen wurde (' + name + ').');
    const sh = this.blatt(name);
    const breite = m.kopf.length;

    if (plan.geaendert.length) {
      plan.geaendert.forEach((g) => {
        m.werte[g.i] = g.roh;
      });
      const idx = plan.geaendert.map((g) => g.i).sort((a, b) => a - b);
      const von = idx[0];
      const bis = idx[idx.length - 1];
      // Ein zusammenhängender Block ist ein Aufruf statt vieler. Liegen die Zeilen
      // weit auseinander, wäre der Block aber größtenteils Unverändertes.
      if (bis - von + 1 <= Math.max(25, idx.length * 3)) {
        sh.getRange(von + 2, 1, bis - von + 1, breite).setNumberFormat('@').setValues(m.werte.slice(von, bis + 1));
      } else {
        idx.forEach((i) => sh.getRange(i + 2, 1, 1, breite).setNumberFormat('@').setValues([m.werte[i]]));
      }
    }

    if (plan.neu.length) {
      this.anhaengenAn(sh, plan.neu, breite);
      plan.neu.forEach((r) => m.werte.push(r));
    }

    if (plan.geloescht.length) {
      const idx = plan.geloescht.slice().sort((a, b) => b - a);
      // Ein Blatt darf nicht ohne Zeilen unter dem Kopf dastehen.
      if (sh.getMaxRows() - idx.length <= 1) sh.insertRowsAfter(sh.getMaxRows(), 10);
      let i = 0;
      while (i < idx.length) {
        let j = i;
        while (j + 1 < idx.length && idx[j + 1] === idx[j] - 1) j++;
        sh.deleteRows(idx[j] + 2, j - i + 1);
        i = j + 1;
      }
      idx.forEach((k) => m.werte.splice(k, 1));
    }
  },

  /** Unten anhängen – auch an Blätter, die nicht gelesen wurden (Protokoll). */
  anhaengen(name, zeilen) {
    if (!zeilen.length) return;
    const sh = this.blatt(name);
    const lesenKopf = () => sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map((k) => String(k).trim());
    let kopf = lesenKopf();
    // Fehlt eine Spalte, ginge ihr Wert hier still verloren.
    if (!this.vollstaendig(name, kopf)) {
      blattEinrichten_(this.tabellenblatt(), name);
      kopf = lesenKopf();
    }
    this.anhaengenAn(sh, zeilen.map((z) => kopf.map((k) => (k in z ? z[k] : ''))), kopf.length);
  },

  anhaengenAn(sh, roh, breite) {
    const start = sh.getLastRow() + 1;
    const fehlen = start + roh.length - 1 - sh.getMaxRows();
    if (fehlen > 0) sh.insertRowsAfter(sh.getMaxRows(), fehlen + 50);
    sh.getRange(start, 1, roh.length, breite).setNumberFormat('@').setValues(roh);
  },

  /** Nach einem Vorgang: neue Revisionen, und das Geschriebene gleich ablegen. */
  abschliessen(namen) {
    if (!namen.length) return;
    this.erneuern(namen);
    const daten = namen.filter((n) => n !== 'protokoll' && this.memo[n]);
    if (!daten.length) return;
    const revs = this.revisionen(daten);
    const ablegen = {};
    daten.forEach((n) => this.fuerAblage(ablegen, CACHE_PRAEFIX_ + 'd:' + n + ':' + revs[n], this.memo[n]));
    try {
      this.cache().putAll(ablegen, CACHE_DAUER_);
    } catch (e) {
      console.warn('Zwischenspeicher voll: ' + e);
    }
  },
};
