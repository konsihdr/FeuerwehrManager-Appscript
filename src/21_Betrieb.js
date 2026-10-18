/**
 * Betrieb: umlagern, Regeln anwenden, Zustände abhaken, Bewegungen nachlesen.
 */

/**
 * Geräte an einen Ort buchen.
 *
 * Die eine Stelle, an der Geräte den Platz wechseln – vom Schreibtisch, aus der
 * Halle, beim Geradebuchen nach der Inventur, aus den Demo-Daten. Eine zweite
 * Stelle wäre eine Bewegung ohne Buchungszeile, ohne Regelauswertung, ohne
 * Protokoll. `Vorgang_.aendern` lässt sie gar nicht erst zu.
 *
 * Geräte, die schon am Ziel stehen, werden übersprungen und gezählt: „6 gebucht,
 * 2 standen schon dort“ ist eine Auskunft, kein Fehler.
 */
function umlagern_(v, geraetIds, nachId, grundId, bemerkung) {
  const nach = v.hole('lagerplaetze', nachId);
  const grund = grundId ? v.hole('gruende', grundId) : null;
  pruefe_(!grund || grund.aktiv, 'Der Grund „' + (grund && grund.name) + '“ ist stillgelegt.');
  const ids = Array.from(new Set((geraetIds || []).map(String)));
  pruefe_(ids.length, 'Keine Geräte gewählt.');
  const stapel = Utilities.getUuid();
  let gebucht = 0;
  let schonDa = 0;

  ids.forEach((id) => {
    const g = v.hole('geraete', id);
    if (g.lagerplatz_id === nach.id) {
      schonDa++;
      return;
    }
    const von = v.finde('lagerplaetze', g.lagerplatz_id);
    v.einfuegen('buchungen', {
      stapel_id: stapel,
      geraet_id: g.id,
      von_id: von ? von.id : null,
      von_name: von ? von.name : '',
      nach_id: nach.id,
      nach_name: nach.name,
      benutzer_id: v.ich ? v.ich.id : null,
      benutzer_name: v.ich ? v.ich.name : 'System',
      grund_id: grund ? grund.id : null,
      grund_name: grund ? grund.name : '',
      bemerkung: textOderLeer_(bemerkung),
    });
    const werte = { lagerplatz_id: nach.id };
    const status = statusNachGrund_(g.status, grund);
    if (status !== g.status) werte.status = status;
    v.buchungLaeuft = true;
    try {
      v.aendern('geraete', g.id, werte);
    } finally {
      v.buchungLaeuft = false;
    }
    regelnAnwenden_(v, 'umlagerung', g.id, { grund: grund ? grund.name : '', zielTyp: nach.typ });
    gebucht++;
  });
  return { gebucht: gebucht, schonDa: schonDa, stapel: stapel };
}

/**
 * Regeln anwenden: „Wenn … dann …“, eingestellt von der Wehr.
 *
 * Was eine Regel tut, rechnet `regelnPlan_` (`05_Gemeinsam.js`) – dieselbe Funktion, mit
 * der der Browser es vorhersagt. Die Änderungen laufen im Namen dessen, der den Anlass
 * ausgelöst hat; im Protokoll steht sein Name, und das ist richtig: Er hat gebucht, die
 * Regel ist die Folge.
 */
function regelnAnwenden_(v, ausloeser, geraetId, kontext) {
  const g = v.hole('geraete', geraetId);
  const plan = regelnPlan_(v.alle('regeln'), ausloeser, g, kontext, v.alle('plan_stand'), heute_());
  if (Object.keys(plan.geraet).length) v.aendern('geraete', g.id, plan.geraet);
  plan.stand.forEach((s) => v.aendern('plan_stand', s.id, { naechste_faellig: s.naechste_faellig }));
  return plan.treffer;
}

function geraeteTitel_(g) {
  return g ? g.bezeichnung || g.barcode : '';
}

function aktionenBetrieb_() {
  return {
    'betrieb.umlagern': {
      rollen: ALLE,
      halle: true,
      schreibend: true,
      stand: true,
      f: (v, a) => umlagern_(v, a.geraete, a.nach, a.grund || null, a.bemerkung),
    },

    /*
     * Gereinigt: der eine Zustandswechsel, den jedes Mitglied darf.
     *
     * Nach dem Einsatz waschen nicht die Gerätewarte die Schläuche, sondern der Trupp.
     * Eine allgemeine Statusänderung bleibt der Technik vorbehalten – das hier ist der
     * schmale Durchlass: nur von `zu_reinigen` nach `einsatzbereit`, nichts sonst.
     */
    'betrieb.gereinigt': {
      rollen: ALLE,
      halle: true,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        const g = v.hole('geraete', a.geraet);
        pruefe_(g.status === 'zu_reinigen', geraeteTitel_(g) + ' steht nicht auf „zu reinigen“.');
        v.aendern('geraete', g.id, { status: 'einsatzbereit' });
        return true;
      },
    },

    'betrieb.statusSetzen': {
      rollen: TECHNIK,
      halle: true,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        pruefe_(STATUS.indexOf(a.status) >= 0, 'Unbekannter Status.');
        const ids = Array.isArray(a.geraete) ? a.geraete : [a.geraet];
        ids.forEach((id) => {
          const g = v.hole('geraete', id);
          const werte = { status: a.status };
          if (textOderLeer_(a.bemerkung)) werte.bemerkung = (g.bemerkung ? g.bemerkung + '\n' : '') + textOderLeer_(a.bemerkung);
          v.aendern('geraete', g.id, werte);
        });
        return ids.length;
      },
    },

    /** Eine Regel speichern – beschnitten von `regelBereinigen_` (`05_Gemeinsam.js`). */
    'regeln.speichern': {
      rollen: NUR_ADMIN,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        const r = regelBereinigen_(a);
        pruefe_(!r.fehler, r.fehler);
        const bedingungen = r.bedingungen;
        const aktionen = r.aktionen;
        if (bedingungen.geraetetyp) v.hole('geraetetypen', bedingungen.geraetetyp);
        aktionen.forEach((x) => {
          if (x.plan) v.hole('pruefplaene', x.plan);
        });
        const werte = {
          name: a.name,
          beschreibung: a.beschreibung,
          ausloeser: a.ausloeser,
          bedingungen: bedingungen,
          aktionen: aktionen,
          aktiv: a.aktiv !== false,
          position: Number(a.position) || 0,
        };
        return { id: (a.id ? v.aendern('regeln', a.id, werte) : v.einfuegen('regeln', Object.assign({ id: neueId_(a) }, werte))).id };
      },
    },

    'regeln.loeschen': {
      rollen: NUR_ADMIN,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        v.loeschen('regeln', a.id);
        return true;
      },
    },

    /** Bewegungen – für die Geräteakte, einen Lagerplatz oder alle, neueste zuerst. */
    'betrieb.buchungen': {
      rollen: ALLE,
      f: (v, a) => {
        const je = Math.min(Number(a.je) || 50, 500);
        const seite = Math.max(Number(a.seite) || 0, 0);
        const alle = v.alle('buchungen')
          .filter((b) => (!a.geraet || b.geraet_id === a.geraet) &&
            (!a.lagerplatz || b.von_id === a.lagerplatz || b.nach_id === a.lagerplatz))
          .sort((x, y) => (x.gebucht_am < y.gebucht_am ? 1 : x.gebucht_am > y.gebucht_am ? -1 : 0));
        return { gesamt: alle.length, eintraege: alle.slice(seite * je, (seite + 1) * je) };
      },
    },
  };
}
