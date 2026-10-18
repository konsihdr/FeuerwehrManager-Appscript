/**
 * Ein Vorgang: lesen, prüfen, ändern – und am Ende alles auf einmal schreiben.
 *
 * ## Was hier steht, war im SaaS-Produkt die Datenbank
 *
 * Fremdschlüssel, Eindeutigkeit, Pflichtfelder, „Standort nur per Buchung“, der
 * Protokoll-Trigger, die automatisch vergebenen Kennungen: PostgreSQL hat das für
 * jeden Zugriff erzwungen, egal woher er kam. Ein Tabellenblatt erzwingt nichts.
 * Deshalb läuft hier **jeder** Schreibzugriff durch diese Klasse, und sie liest ihre
 * Regeln aus `SCHEMA` – nicht aus der Fachfunktion, die gerade schreibt. Eine
 * Fachfunktion, die eine Regel vergisst, kann sie damit nicht umgehen.
 *
 * ## Ganz oder gar nicht
 *
 * Apps Script kennt keine Transaktionen. Was hier dem am nächsten kommt: Bis
 * `festschreiben()` ändert sich **nur der Speicher**. Wirft irgendetwas vorher – eine
 * verletzte Regel, ein Programmfehler –, ist im Blatt nichts passiert. Eine halbe
 * Buchung (Buchungszeile ohne Standortwechsel, oder umgekehrt) kann so nicht
 * entstehen; sie wäre die Sorte Fehler, die man der Historie nicht ansieht.
 *
 * Gleichzeitige Schreiber hält `mitSperre_()` in `10_Tuer.js` auseinander.
 *
 * ## Das Protokoll
 *
 * Entsteht beim Festschreiben aus den Änderungen selbst – dieselbe Idee wie der
 * Trigger `protokollieren()` im SaaS-Produkt: Eine Fachfunktion kann den Eintrag
 * nicht vergessen, und niemand kann sich herausschreiben. Bei Änderungen steht nur
 * der Unterschied darin, nicht die ganze Zeile – man sucht sonst die eine geänderte
 * Zahl zwischen zwanzig unveränderten.
 */

const EINZAHL_ = {
  mitglieder: 'Mitglied',
  lagerplaetze: 'Lagerplatz',
  geraetetypen: 'Gerätetyp',
  geraete: 'Gerät',
  pruefplaene: 'Prüfplan',
  pruefschritte: 'Prüfschritt',
  plan_stand: 'Fälligkeit',
  gruende: 'Umlagerungsgrund',
  buchungen: 'Buchung',
  pruefungen: 'Prüfung',
  satzarten: 'Satzart',
  satzart_teile: 'Satzart-Teil',
  saetze: 'Gerätesatz',
  satz_mitglieder: 'Satz-Bestückung',
  regeln: 'Regel',
  inventuren: 'Inventur',
  inventur_geraete: 'Inventur-Ergebnis',
  hallengeraete: 'Hallengerät',
  ausweise: 'Ausweis',
  qualiarten: 'Qualifikation',
  nachweise: 'Nachweis',
  einsaetze: 'Einsatz',
  einsatz_kraefte: 'Einsatzkraft',
  einsatz_eintraege: 'Tagebucheintrag',
  einstellungen: 'Einstellung',
};

const FELDNAMEN_ = {
  name: 'Name',
  email: 'Google-Adresse',
  kuerzel: 'Kürzel',
  rolle: 'Rolle',
  typ: 'Typ',
  geraetetyp_id: 'Gerätetyp',
  lagerplatz_id: 'Lagerplatz',
  status: 'Status',
  intervall_wert: 'Intervall',
  intervall_einheit: 'Einheit',
  titel: 'Titel',
  art: 'Art',
  ausloeser: 'Auslöser',
  satzart_id: 'Satzart',
  min_anzahl: 'Mindestanzahl',
  max_anzahl: 'Höchstanzahl',
  geprueft_am: 'Prüfdatum',
  ergebnis: 'Ergebnis',
  naechste_faellig: 'Fälligkeit',
  mitglied_id: 'Mitglied',
  art_id: 'Qualifikation',
  erworben_am: 'Erworben am',
  gueltig_bis: 'Gültig bis',
  bezeichnung: 'Bezeichnung',
  beginn: 'Beginn',
  einsatz_id: 'Einsatz',
  von: 'von',
  bis: 'bis',
};

class Vorgang_ {
  constructor(ich, schreibend) {
    this.ich = ich || null;
    this.schreibend = !!schreibend;
    this.t = {};
    this.ereignisse = [];
    this.buchungLaeuft = false;
    this.zeit = jetzt_();
    this.festgeschrieben = false;
  }

  // ─────────────────────────────── Lesen ───────────────────────────────

  /** Der Zustand einer Tabelle. `laden = false` reicht zum bloßen Anhängen. */
  zustand_(name, laden) {
    let t = this.t[name];
    if (t && (t.geladen || !laden)) return t;
    const schema = SCHEMA[name];
    pruefe_(schema, 'Unbekannte Tabelle: ' + name);
    if (!t) {
      t = this.t[name] = {
        name: name,
        schema: schema,
        schluessel: schema.schluessel || 'id',
        geladen: false,
        zeilen: [],
        nachId: new Map(),
        meta: new Map(),
        neu: [],
        geaendert: new Set(),
        geloescht: new Set(),
      };
    }
    if (!laden) return t;

    const roh = Speicher_.lesen(name, this.schreibend);
    const spalten = Object.keys(schema.spalten);
    const pos = {};
    spalten.forEach((s) => {
      pos[s] = roh.kopf.indexOf(s);
    });
    const fehlen = spalten.filter((s) => pos[s] < 0);
    pruefe_(!fehlen.length,
      'Im Blatt „' + schema.blatt + '“ fehlen die Spalten ' + fehlen.join(', ') +
      '. „FeuerwehrManager → Einrichten“ ergänzt sie.');

    const vorhanden = [];
    roh.werte.forEach((r, i) => {
      const id = r[pos[t.schluessel]];
      if (!id) return; // Leerzeile oder von Hand begonnene Zeile ohne Kennung
      const obj = {};
      spalten.forEach((s) => {
        obj[s] = this.ausZelle_(schema.spalten[s], r[pos[s]]);
      });
      vorhanden.push(obj);
      t.nachId.set(String(id), obj);
      t.meta.set(obj, { i: i, vorher: null });
    });
    // Was vor dem Laden schon angehängt wurde, bleibt dabei.
    t.zeilen = vorhanden.concat(t.zeilen);
    t.kopf = roh.kopf;
    t.pos = pos;
    t.geladen = true;
    return t;
  }

  alle(name) {
    return this.zustand_(name, true).zeilen;
  }

  finde(name, id) {
    if (id === null || id === undefined || id === '') return null;
    const t = this.zustand_(name, true);
    const obj = t.nachId.get(String(id));
    return obj && !t.geloescht.has(obj) ? obj : null;
  }

  hole(name, id) {
    const obj = this.finde(name, id);
    pruefe_(obj, (EINZAHL_[name] || name) + ' nicht gefunden – vielleicht hat es gerade jemand gelöscht.', 'nicht_gefunden');
    return obj;
  }

  wo(name, bedingung) {
    return this.alle(name).filter(bedingung);
  }

  einstellung(schluessel) {
    const z = this.finde('einstellungen', schluessel);
    const def = EINSTELLUNGEN[schluessel];
    return z && z.wert !== '' ? z.wert : def ? def.vorgabe : '';
  }

  // ─────────────────────────── Umwandlung ───────────────────────────

  art_(typ) {
    return typeof typ === 'string' ? typ : typ.art;
  }

  ausZelle_(typ, text) {
    const art = this.art_(typ);
    const t = text == null ? '' : String(text);
    switch (art) {
      case 'zahl': {
        if (t.trim() === '') return null;
        const n = Number(t.replace(',', '.'));
        return Number.isFinite(n) ? n : null;
      }
      case 'bool':
        return /^(ja|true|wahr|x|1)$/i.test(t.trim());
      case 'datum':
        return t ? t.slice(0, 10) : null;
      case 'zeit':
      case 'ref':
        return t || null;
      case 'json':
        if (!t) return null;
        try {
          return JSON.parse(t);
        } catch (e) {
          return null;
        }
      default:
        return t;
    }
  }

  inZelle_(typ, wert) {
    if (wert === null || wert === undefined) return '';
    switch (this.art_(typ)) {
      case 'bool':
        return wert ? 'ja' : 'nein';
      case 'json':
        return JSON.stringify(wert);
      default:
        return String(wert);
    }
  }

  /** Was eine Fachfunktion übergibt, in die Form bringen, die auch das Lesen liefert. */
  normal_(typ, wert) {
    const art = this.art_(typ);
    if (art === 'bool') return !!wert;
    if (art === 'json') return wert === undefined ? null : wert;
    if (wert === null || wert === undefined) return art === 'text' || art === 'geheim' ? '' : null;
    if (art === 'zahl') {
      if (wert === '') return null;
      const n = Number(String(wert).replace(',', '.'));
      pruefe_(Number.isFinite(n), 'Keine gültige Zahl: ' + wert);
      return Math.round(n);
    }
    if (art === 'ref' || art === 'zeit' || art === 'datum') {
      const t = String(wert).trim();
      return t === '' ? null : t;
    }
    return String(wert).trim();
  }

  leer_(typ) {
    const art = this.art_(typ);
    if (art === 'text' || art === 'geheim' || art === 'id') return '';
    if (art === 'bool') return false;
    return null;
  }

  roh_(t, obj, basis) {
    const r = basis ? basis.slice() : t.kopf.map(() => '');
    Object.keys(t.schema.spalten).forEach((s) => {
      r[t.pos[s]] = this.inZelle_(t.schema.spalten[s], obj[s]);
    });
    return r;
  }

  // ─────────────────────────────── Prüfen ───────────────────────────────

  pruefen_(t, obj) {
    const s = t.schema;
    (s.pflicht || []).forEach((f) => {
      const w = obj[f];
      pruefe_(!(w === null || w === undefined || w === ''),
        'Bitte „' + (FELDNAMEN_[f] || f) + '“ angeben.');
    });
    Object.keys(s.auswahl || {}).forEach((f) => {
      const w = obj[f];
      pruefe_(w === null || w === '' || s.auswahl[f].indexOf(w) >= 0,
        'Unzulässiger Wert für „' + (FELDNAMEN_[f] || f) + '“: ' + w);
    });
    Object.keys(s.spalten).forEach((f) => {
      const typ = s.spalten[f];
      const w = obj[f];
      if (this.art_(typ) === 'datum' && w) pruefe_(istDatum_(w), 'Kein gültiges Datum: ' + w);
      if (this.art_(typ) === 'ref' && w) {
        pruefe_(this.finde(typ.ziel, w),
          (EINZAHL_[typ.ziel] || typ.ziel) + ' existiert nicht (mehr).', 'nicht_gefunden');
      }
    });
    (s.eindeutig || []).forEach((regel) => {
      const felder = regel.spalten || [regel.spalte];
      const schluessel = (z) => felder.map((f) => (regel.klein ? normal_(z[f]) : String(z[f] == null ? '' : z[f]))).join('\u0001');
      if (felder.some((f) => obj[f] === null || obj[f] === undefined || String(obj[f]).trim() === '')) return;
      const k = schluessel(obj);
      const andere = t.zeilen.find((z) => z !== obj && schluessel(z) === k);
      pruefe_(!andere, regel.text, 'doppelt');
    });
  }

  // ─────────────────────────────── Schreiben ───────────────────────────────

  einfuegen(name, werte) {
    pruefe_(this.schreibend && !this.festgeschrieben, 'Lesender Vorgang kann nicht schreiben.');
    const schema = SCHEMA[name];
    // Wer weder eindeutig noch mit Kennung ist, muss zum Anhängen nicht gelesen werden.
    // Das spart bei jeder Buchung, die wachsende Buchungshistorie einzulesen. Bringt der
    // Browser die Kennung mit, wird gelesen – sonst fiele eine doppelt geschickte Anlage
    // nicht auf. Ausgenommen sind nur die Tabellen, die ohne Ende wachsen.
    const vonAussen = werte.id !== undefined && werte.id !== null && werte.id !== '';
    const laden = !!(schema.eindeutig || schema.kennung) || schema.schluessel || (vonAussen && !schema.wachsend);
    const t = this.zustand_(name, laden);
    const obj = {};
    Object.keys(schema.spalten).forEach((s) => {
      if (werte[s] !== undefined) obj[s] = this.normal_(schema.spalten[s], werte[s]);
      else if (schema.vorgaben && s in schema.vorgaben) obj[s] = schema.vorgaben[s];
      else obj[s] = this.leer_(schema.spalten[s]);
    });
    if (t.schluessel === 'id' && !obj.id) obj.id = Utilities.getUuid();
    if (schema.zeitstempel) {
      if (schema.zeitstempel.angelegt && !obj[schema.zeitstempel.angelegt]) obj[schema.zeitstempel.angelegt] = this.zeit;
      if (schema.zeitstempel.geaendert) obj[schema.zeitstempel.geaendert] = obj[schema.zeitstempel.geaendert] || this.zeit;
    }
    if (schema.kennung && !obj[schema.kennung.spalte]) obj[schema.kennung.spalte] = this.kennung_(t);
    if (t.geladen) {
      // `schon_da`: Ein Stapel aus dem Browser, der nach einer abgerissenen Antwort noch
      // einmal kommt, erkennt daran, dass dieser Teil schon geschrieben ist.
      pruefe_(!t.nachId.has(String(obj[t.schluessel])), 'Doppelte Kennung ' + obj[t.schluessel], 'schon_da');
    }
    t.zeilen.push(obj);
    t.nachId.set(String(obj[t.schluessel]), obj);
    t.neu.push(obj);
    this.pruefen_(t, obj);
    this.ereignisse.push({ art: 'anlegen', name: name, obj: obj, ts: this.zeit });
    return obj;
  }

  /**
   * Kennungen entstehen hier und nicht im Browser: Zwei gleichzeitige Anlagen
   * könnten sonst dieselbe ziehen, und ein Import müsste es nachbauen. Präfix aus
   * den Einstellungen, dahinter sechs zufällige Zeichen – wie im SaaS-Produkt.
   */
  kennung_(t) {
    const k = t.schema.kennung;
    const praefix = textOderLeer_(this.einstellung(k.einstellung)) || k.vorgabe;
    for (let i = 0; i < 20; i++) {
      const kandidat = praefix + '-' + bytesZuHex_(zufallsBytes_(3)).toUpperCase();
      if (!t.zeilen.some((z) => normal_(z[k.spalte]) === normal_(kandidat))) return kandidat;
    }
    throw new Fehler_('Es ließ sich keine freie Kennung finden (Präfix ' + praefix + ').');
  }

  aendern(name, id, werte) {
    pruefe_(this.schreibend && !this.festgeschrieben, 'Lesender Vorgang kann nicht schreiben.');
    const t = this.zustand_(name, true);
    const obj = this.hole(name, id);
    const schema = t.schema;

    /*
     * Der Standort eines Geräts ändert sich nur durch eine Buchung.
     *
     * Aus dem Wehr-Produkt übernommen, im SaaS-Produkt ein Trigger, hier eine Zeile
     * in der einzigen Stelle, durch die jeder Schreibzugriff geht. Ohne sie hätte die
     * Bewegungshistorie Lücken – und die ist der Zweck der ganzen Anwendung.
     */
    if (name === 'geraete' && 'lagerplatz_id' in werte && werte.lagerplatz_id !== obj.lagerplatz_id) {
      pruefe_(this.buchungLaeuft, 'Der Standort wird über eine Buchung geändert, nicht direkt.');
    }

    const vorher = Object.assign({}, obj);
    let anders = false;
    Object.keys(werte).forEach((k) => {
      if (!(k in schema.spalten) || k === t.schluessel) return;
      const neu = this.normal_(schema.spalten[k], werte[k]);
      if (JSON.stringify(neu) !== JSON.stringify(obj[k])) {
        obj[k] = neu;
        anders = true;
      }
    });
    if (!anders) return obj;
    if (schema.zeitstempel && schema.zeitstempel.geaendert) obj[schema.zeitstempel.geaendert] = this.zeit;
    this.pruefen_(t, obj);
    if (t.neu.indexOf(obj) < 0 && !t.geaendert.has(obj)) {
      t.meta.get(obj).vorher = vorher;
      t.geaendert.add(obj);
      this.ereignisse.push({ art: 'aendern', name: name, obj: obj, ts: this.zeit });
    }
    return obj;
  }

  /**
   * Löschen samt dem, was daran hängt – nach den Regeln aus dem Schema.
   *
   * Erst werden alle Verweise auf die Zeile gesucht. `restrict` bricht ab, bevor
   * irgendetwas gelöscht ist; `cascade` löscht mit, `null` leert den Verweis.
   */
  loeschen(name, id) {
    pruefe_(this.schreibend && !this.festgeschrieben, 'Lesender Vorgang kann nicht schreiben.');
    const t = this.zustand_(name, true);
    const obj = this.hole(name, id);
    const schluessel = String(obj[t.schluessel]);

    const folgen = [];
    Object.keys(SCHEMA).forEach((andere) => {
      const spalten = SCHEMA[andere].spalten;
      Object.keys(spalten).forEach((sp) => {
        const typ = spalten[sp];
        if (typeof typ !== 'object' || typ.ziel !== name) return;
        this.alle(andere).forEach((z) => {
          if (z[sp] !== schluessel || (andere === name && z === obj)) return;
          pruefe_(typ.beiLoeschen !== 'restrict',
            typ.text || ((EINZAHL_[name] || name) + ' wird noch verwendet.'), 'verwendet');
          folgen.push({ name: andere, z: z, sp: sp, regel: typ.beiLoeschen });
        });
      });
    });

    folgen.forEach((f) => {
      const tz = this.t[f.name];
      if (tz.geloescht.has(f.z)) return;
      if (f.regel === 'cascade') this.loeschen(f.name, f.z[tz.schluessel]);
      else {
        const werte = {};
        werte[f.sp] = null;
        this.aendern(f.name, f.z[tz.schluessel], werte);
      }
    });

    // Der lesbare Name jetzt, solange die Zeile (und was sie benennt) noch zu finden ist.
    let text = '';
    try {
      text = t.schema.titel ? t.schema.titel(obj, this) : '';
    } catch (e) {
      text = '';
    }
    t.geloescht.add(obj);
    t.zeilen = t.zeilen.filter((z) => z !== obj);
    if (t.neu.indexOf(obj) < 0) this.ereignisse.push({ art: 'loeschen', name: name, obj: obj, text: text, ts: this.zeit });
  }

  /**
   * Abweisen, aber trotzdem festschreiben – für die fehlgeschlagene Anmeldung, deren
   * Protokolleintrag sonst mit dem Fehler verworfen würde. Die Tür wirft den Fehler,
   * nachdem geschrieben ist.
   */
  ablehnen(text) {
    this.abgelehnt = new Fehler_(text);
    return null;
  }

  /** Ein Eintrag, der aus keiner Zeilenänderung folgt (fehlgeschlagene Anmeldung u. ä.). */
  protokollieren(aktion, art, id, text, details) {
    this.ereignisse.push({ art: 'frei', aktion: aktion, name: art, id: id, text: text, details: details || {}, ts: this.zeit });
  }

  // ─────────────────────────────── Festschreiben ───────────────────────────────

  festschreiben() {
    pruefe_(!this.festgeschrieben, 'Vorgang ist schon festgeschrieben.');
    this.festgeschrieben = true;
    const protokoll = this.protokollZeilen_();
    const geschrieben = [];

    Object.keys(this.t).forEach((name) => {
      const t = this.t[name];
      const neu = t.neu.filter((o) => !t.geloescht.has(o));
      const geaendert = Array.from(t.geaendert).filter((o) => !t.geloescht.has(o));
      const geloescht = Array.from(t.geloescht).filter((o) => t.neu.indexOf(o) < 0);
      if (!neu.length && !geaendert.length && !geloescht.length) return;

      if (!t.geladen) {
        Speicher_.anhaengen(name, neu.map((o) => {
          const z = {};
          Object.keys(t.schema.spalten).forEach((s) => {
            z[s] = this.inZelle_(t.schema.spalten[s], o[s]);
          });
          return z;
        }));
      } else {
        const werte = Speicher_.memo[name].werte;
        Speicher_.schreiben(name, {
          geaendert: geaendert.map((o) => ({ i: t.meta.get(o).i, roh: this.roh_(t, o, werte[t.meta.get(o).i]) })),
          neu: neu.map((o) => this.roh_(t, o)),
          geloescht: geloescht.map((o) => t.meta.get(o).i),
        });
      }
      geschrieben.push(name);
    });

    if (protokoll.length) {
      Speicher_.anhaengen('protokoll', protokoll);
      geschrieben.push('protokoll');
    }
    if (geschrieben.length) {
      SpreadsheetApp.flush();
      // Nicht geladene Tabellen haben kein vollständiges Abbild im Speicher; ihre
      // nächste Lesung muss aus dem Blatt kommen – und darf das Angehängte nicht ein
      // zweites Mal dazuzählen.
      geschrieben.forEach((n) => {
        if (this.t[n] && !this.t[n].geladen) {
          delete Speicher_.memo[n];
          delete this.t[n];
        }
      });
      delete Speicher_.memo.protokoll;
      Speicher_.abschliessen(geschrieben);
    }
    return geschrieben;
  }

  sauber_(schema, obj) {
    const aus = {};
    const ohne = (schema.protokollOhne || []).concat(['id']);
    if (schema.zeitstempel) ohne.push(schema.zeitstempel.angelegt, schema.zeitstempel.geaendert);
    Object.keys(schema.spalten).forEach((s) => {
      if (ohne.indexOf(s) >= 0 || this.art_(schema.spalten[s]) === 'geheim') return;
      const w = obj[s];
      if (w === null || w === '' || w === undefined) return;
      aus[s] = w;
    });
    return aus;
  }

  protokollZeilen_() {
    const zeilen = [];
    const wer = this.ich ? { id: this.ich.id, name: this.ich.name } : { id: '', name: 'System' };
    this.ereignisse.forEach((e) => {
      let aktion;
      let details;
      let objId;
      let text = '';
      if (e.art === 'frei') {
        aktion = e.aktion;
        details = e.details;
        objId = e.id || '';
        text = e.text || '';
      } else {
        const t = this.t[e.name];
        const schema = t.schema;
        if (!schema.protokoll) return;
        if (Array.isArray(schema.protokoll) && schema.protokoll.indexOf(e.art) < 0) return;
        if (e.art === 'anlegen') {
          if (t.geloescht.has(e.obj)) return;
          aktion = 'anlegen';
          details = { angelegt: this.sauber_(schema, e.obj) };
        } else if (e.art === 'aendern') {
          if (t.geloescht.has(e.obj)) return;
          const vorher = t.meta.get(e.obj).vorher;
          const diff = {};
          Object.keys(schema.spalten).forEach((s) => {
            if ((schema.protokollOhne || []).indexOf(s) >= 0) return;
            if (schema.zeitstempel && s === schema.zeitstempel.geaendert) return;
            if (JSON.stringify(vorher[s]) === JSON.stringify(e.obj[s])) return;
            diff[s] = this.art_(schema.spalten[s]) === 'geheim' ? ['…', 'neu gesetzt'] : [vorher[s], e.obj[s]];
          });
          if (!Object.keys(diff).length) return;
          aktion = 'aendern';
          details = { aenderungen: diff };
        } else {
          aktion = 'loeschen';
          details = { geloescht: this.sauber_(schema, e.obj) };
        }
        objId = String(e.obj[t.schluessel]);
        try {
          text = e.text !== undefined ? e.text : schema.titel ? schema.titel(e.obj, this) : '';
        } catch (fehler) {
          text = '';
        }
      }
      zeilen.push({
        id: Utilities.getUuid(),
        ts: e.ts || this.zeit,
        benutzer_id: wer.id,
        benutzer_name: wer.name,
        aktion: aktion,
        objekt_art: e.name,
        objekt_id: objId,
        objekt_text: text || '',
        details: JSON.stringify(details || {}),
      });
    });
    return zeilen;
  }
}
