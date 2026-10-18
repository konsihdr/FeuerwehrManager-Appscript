/**
 * Stammdaten: Lagerplätze, Gerätetypen, Prüfpläne und -schritte, Geräte, Gründe,
 * Einstellungen.
 *
 * Die Prüfungen auf Eindeutigkeit, Pflichtfelder und Verweise stehen nicht hier,
 * sondern im Schema – `Vorgang_` wendet sie bei jedem Schreiben an. Was hier steht,
 * sind die Regeln, die sich nicht als Spalteneigenschaft ausdrücken lassen.
 */

/** Nur die Felder übernehmen, die der Aufrufer ändern darf. */
function auswahl_(a, felder) {
  const aus = {};
  felder.forEach((f) => {
    if (a[f] !== undefined) aus[f] = a[f];
  });
  return aus;
}

function speichern_(v, tabelle, a, felder) {
  const werte = auswahl_(a, felder);
  return a.id ? v.aendern(tabelle, a.id, werte) : v.einfuegen(tabelle, Object.assign({ id: neueId_(a) }, werte));
}

function aktionenStammdaten_() {
  return {
    // ─────────────────────────────── Lagerplätze ───────────────────────────────

    'lagerplaetze.speichern': {
      rollen: TECHNIK,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        const werte = auswahl_(a, ['name', 'code', 'typ', 'ober_id']);
        // Ein geleerter Code beim Ändern heißt „behalten“, nicht „neu würfeln“: Das
        // Etikett klebt schon.
        if (a.id && !textOderLeer_(werte.code)) delete werte.code;
        // Kein Platz darf (über Umwege) unter sich selbst hängen.
        pruefe_(!(werte.ober_id && a.id && lagerplatzZyklus_(v.alle('lagerplaetze'), a.id, werte.ober_id)),
          'Ein Lagerplatz kann nicht unter sich selbst hängen.');
        const l = a.id ? v.aendern('lagerplaetze', a.id, werte) : v.einfuegen('lagerplaetze', Object.assign({ id: neueId_(a) }, werte));
        return { id: l.id };
      },
    },

    'lagerplaetze.loeschen': {
      rollen: TECHNIK,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        v.loeschen('lagerplaetze', a.id);
        return true;
      },
    },

    // ─────────────────────────────── Gerätetypen ───────────────────────────────

    'typen.speichern': {
      rollen: TECHNIK,
      schreibend: true,
      stand: true,
      f: (v, a) => ({ id: speichern_(v, 'geraetetypen', a, ['name', 'hersteller', 'modell', 'beschreibung']).id }),
    },

    'typen.loeschen': {
      rollen: TECHNIK,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        v.loeschen('geraetetypen', a.id);
        return true;
      },
    },

    // ─────────────────────────────── Prüfpläne ───────────────────────────────

    'plaene.speichern': {
      rollen: TECHNIK,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        const werte = auswahl_(a, ['geraetetyp_id', 'geraet_id', 'name', 'intervall_wert', 'intervall_einheit', 'beschreibung']);
        pruefe_(!(Number(werte.intervall_wert) <= 0), 'Das Intervall muss größer als null sein.');
        if (!a.id) {
          if (werte.geraet_id) {
            // Ein Sonderplan hängt am Typ seines Geräts – sonst fände ihn niemand.
            werte.geraetetyp_id = v.hole('geraete', werte.geraet_id).geraetetyp_id;
          }
          const p = v.einfuegen('pruefplaene', Object.assign({ id: neueId_(a) }, werte));
          planVerteilen_(v, p);
          return { id: p.id };
        }
        const alt = v.hole('pruefplaene', a.id);
        pruefe_(!werte.geraetetyp_id || werte.geraetetyp_id === alt.geraetetyp_id,
          'Ein Prüfplan wechselt nicht den Gerätetyp. Bitte am anderen Typ neu anlegen.');
        delete werte.geraet_id;
        const vorher = { wert: alt.intervall_wert, einheit: alt.intervall_einheit };
        const p = v.aendern('pruefplaene', a.id, werte);
        // Ein korrigiertes Intervall verschiebt die Termine gleich (`planIntervallFolgen_`).
        if (vorher.wert !== p.intervall_wert || vorher.einheit !== p.intervall_einheit) {
          planIntervallFolgen_(p, v.alle('plan_stand')).forEach((s) => v.aendern('plan_stand', s.id, { naechste_faellig: s.naechste_faellig }));
        }
        return { id: p.id };
      },
    },

    'plaene.loeschen': {
      rollen: TECHNIK,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        v.loeschen('pruefplaene', a.id);
        return true;
      },
    },

    /**
     * Die Checkliste eines Plans als Ganzes ersetzen. Die Reihenfolge der Liste ist die
     * Reihenfolge der Schritte. Schon erfasste Prüfungen berührt das nicht – sie tragen
     * ihre Schritte als Momentaufnahme.
     */
    'schritte.speichern': {
      rollen: TECHNIK,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        const plan = v.hole('pruefplaene', a.plan_id);
        const liste = Array.isArray(a.schritte) ? a.schritte : [];
        const bleiben = new Set(liste.filter((s) => s.id).map((s) => String(s.id)));
        v.alle('pruefschritte')
          .filter((s) => s.pruefplan_id === plan.id && !bleiben.has(s.id))
          .forEach((s) => v.loeschen('pruefschritte', s.id));
        liste.forEach((s, i) => {
          const werte = auswahl_(s, ['titel', 'beschreibung', 'art', 'einheit', 'pflicht']);
          werte.position = i + 1;
          if (werte.art !== 'messwert') werte.einheit = '';
          if (s.id) {
            const da = v.hole('pruefschritte', s.id);
            pruefe_(da.pruefplan_id === plan.id, 'Der Schritt gehört zu einem anderen Plan.');
            v.aendern('pruefschritte', s.id, werte);
          } else {
            werte.pruefplan_id = plan.id;
            werte.id = neueId_(s);
            v.einfuegen('pruefschritte', werte);
          }
        });
        return true;
      },
    },

    // ─────────────────────────────── Geräte ───────────────────────────────

    'geraete.speichern': {
      rollen: TECHNIK,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        if (!a.id) {
          const g = v.einfuegen('geraete', Object.assign({ id: neueId_(a) }, auswahl_(a, [
            'geraetetyp_id', 'lagerplatz_id', 'bezeichnung', 'seriennummer', 'barcode', 'status', 'bemerkung',
          ])));
          faelligkeitenAnlegen_(v, g.id);
          return { id: g.id };
        }
        const werte = auswahl_(a, ['geraetetyp_id', 'bezeichnung', 'seriennummer', 'barcode', 'status', 'bemerkung']);
        if (!textOderLeer_(werte.barcode)) delete werte.barcode;
        const alt = v.hole('geraete', a.id);
        const typVorher = alt.geraetetyp_id;
        v.aendern('geraete', a.id, werte);
        if (typVorher !== alt.geraetetyp_id) faelligkeitenAnlegen_(v, a.id);
        return { id: a.id };
      },
    },

    'geraete.loeschen': {
      rollen: TECHNIK,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        v.loeschen('geraete', a.id);
        return true;
      },
    },

    /** Was in der Geräteakte steht und nicht im Datenstand: Prüfungen, Bewegungen, Zählungen. */
    'geraete.akte': {
      rollen: ALLE,
      f: (v, a) => {
        const g = v.hole('geraete', a.id);
        const absteigend = (feld) => (x, y) => (x[feld] < y[feld] ? 1 : x[feld] > y[feld] ? -1 : 0);
        const zaehlungen = v.alle('inventur_geraete')
          .filter((z) => z.geraet_id === g.id)
          .map((z) => {
            const inv = v.finde('inventuren', z.inventur_id);
            return {
              ergebnis: z.ergebnis,
              lagerplatz_name: inv ? inv.lagerplatz_name : '',
              von_name: z.von_name,
              benutzer_name: inv ? inv.benutzer_name : '',
              beendet_am: inv ? inv.beendet_am : null,
            };
          })
          .sort(absteigend('beendet_am'));
        return {
          pruefungen: v.alle('pruefungen').filter((p) => p.geraet_id === g.id).sort(absteigend('geprueft_am')),
          buchungen: v.alle('buchungen').filter((b) => b.geraet_id === g.id).sort(absteigend('gebucht_am')).slice(0, 200),
          zaehlungen: zaehlungen.slice(0, 50),
        };
      },
    },

    /**
     * Geräte aus einer Tabelle übernehmen – ganz oder gar nicht.
     *
     * Ein halber Import ist schlimmer als keiner: Man weiß hinterher nicht, welche
     * Zeilen drin sind, und der zweite Versuch scheitert an den doppelten Barcodes der
     * ersten Hälfte. Deshalb erst alle Zeilen prüfen, dann alle Fehler auf einmal
     * melden – mit Zeilennummer.
     */
    'geraete.import': {
      rollen: TECHNIK,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        const zeilen = Array.isArray(a.zeilen) ? a.zeilen : [];
        pruefe_(zeilen.length, 'Keine Zeilen zum Übernehmen.');
        pruefe_(zeilen.length <= 2000, 'Höchstens 2000 Zeilen auf einmal.');
        const fehler = [];
        let typenNeu = 0;
        const typNach = (name) => v.alle('geraetetypen').find((t) => normal_(t.name) === normal_(name));
        const ortNach = (wert) => v.alle('lagerplaetze').find((l) => normal_(l.code) === normal_(wert)) ||
          v.alle('lagerplaetze').find((l) => normal_(l.name) === normal_(wert));
        zeilen.forEach((z, i) => {
          const nr = 'Zeile ' + (i + 2) + ': ';
          try {
            let typ = typNach(z.typ);
            if (!typ && textOderLeer_(z.typ) && a.typenAnlegen) {
              typ = v.einfuegen('geraetetypen', { name: z.typ });
              typenNeu++;
            }
            pruefe_(typ, 'Gerätetyp „' + textOderLeer_(z.typ) + '“ unbekannt.');
            const ort = ortNach(z.lagerplatz);
            pruefe_(ort, 'Lagerplatz „' + textOderLeer_(z.lagerplatz) + '“ unbekannt.');
            const status = textOderLeer_(z.status).toLowerCase().replace(/ü/g, 'ue').replace(/\s+/g, '_') || 'einsatzbereit';
            const g = v.einfuegen('geraete', {
              geraetetyp_id: typ.id,
              lagerplatz_id: ort.id,
              bezeichnung: z.bezeichnung,
              seriennummer: z.seriennummer,
              barcode: z.barcode,
              status: status,
              bemerkung: z.bemerkung,
            });
            faelligkeitenAnlegen_(v, g.id);
          } catch (e) {
            if (!(e instanceof Fehler_)) throw e;
            fehler.push(nr + e.message);
          }
        });
        if (fehler.length) {
          throw new Fehler_('Nichts übernommen. ' + fehler.length + ' Zeile(n) mit Fehlern:\n' +
            fehler.slice(0, 15).join('\n') + (fehler.length > 15 ? '\n…' : ''));
        }
        return { angelegt: zeilen.length, typenNeu: typenNeu };
      },
    },

    // ─────────────────────────────── Gründe ───────────────────────────────

    'gruende.speichern': {
      rollen: TECHNIK,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        const werte = auswahl_(a, ['name', 'beschreibung', 'status_danach', 'aktiv']);
        if (!werte.status_danach) werte.status_danach = '';
        if (!a.id) {
          werte.position = v.alle('gruende').reduce((m, g) => Math.max(m, g.position || 0), 0) + 1;
          return { id: v.einfuegen('gruende', Object.assign({ id: neueId_(a) }, werte)).id };
        }
        return { id: v.aendern('gruende', a.id, werte).id };
      },
    },

    'gruende.verschieben': {
      rollen: TECHNIK,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        const liste = v.alle('gruende').slice().sort((x, y) => (x.position || 0) - (y.position || 0));
        const i = liste.findIndex((g) => g.id === a.id);
        const j = i + (a.richtung < 0 ? -1 : 1);
        pruefe_(i >= 0, 'Grund nicht gefunden.');
        if (j < 0 || j >= liste.length) return true;
        const tausch = liste[i];
        liste[i] = liste[j];
        liste[j] = tausch;
        liste.forEach((g, k) => v.aendern('gruende', g.id, { position: k + 1 }));
        return true;
      },
    },

    'gruende.loeschen': {
      rollen: TECHNIK,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        v.loeschen('gruende', a.id);
        return true;
      },
    },

    // ─────────────────────────────── Einstellungen ───────────────────────────────

    'einstellungen.speichern': {
      rollen: NUR_ADMIN,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        const werte = a.werte || {};
        Object.keys(werte).forEach((k) => {
          const r = einstellungPruefen_(k, werte[k], EINSTELLUNGEN, v.alle('lagerplaetze'));
          pruefe_(!r.fehler, r.fehler);
          einstellungSetzen_(v, k, r.wert);
        });
        return true;
      },
    },

    /**
     * Das Logo als Daten-Adresse in einer Zelle.
     *
     * Eine Zelle fasst 50 000 Zeichen. Der Browser verkleinert das Bild vorher auf
     * Briefkopfgröße; dabei kommen erfahrungsgemäß 10 bis 30 KB heraus. Abgelegt in
     * Google Drive wäre mehr Platz – aber dann bräuchte die Web-App Zugriff auf das
     * ganze Drive des Eigentümers, für ein Bild von der Größe einer Briefmarke.
     */
    'einstellungen.logo': {
      rollen: NUR_ADMIN,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        const daten = String(a.logo || '');
        pruefe_(daten === '' || /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(daten), 'Nur PNG oder JPEG.');
        pruefe_(daten.length <= 48000, 'Das Bild ist auch verkleinert noch zu groß (höchstens etwa 35 KB).');
        einstellungSetzen_(v, 'logo', daten);
        return true;
      },
    },
  };
}

function einstellungSetzen_(v, schluessel, wert) {
  if (v.finde('einstellungen', schluessel)) v.aendern('einstellungen', schluessel, { wert: wert });
  else v.einfuegen('einstellungen', { schluessel: schluessel, wert: wert });
}
