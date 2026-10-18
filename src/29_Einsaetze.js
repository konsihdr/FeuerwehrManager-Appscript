/**
 * Einsätze und Dienste: der Bericht, wer dabei war, wie lange – und was daraus folgt.
 *
 * ## Woher die Berichte kommen
 *
 * An der Einsatzstelle führt die Wehr ihr Einsatztagebuch in einer eigenen Anwendung –
 * einer HTML-Datei, die offline auf dem Tablet läuft. Deren JSON-Export wird hier
 * übernommen: die Kopfdaten, das Tagebuch selbst als Abschrift, und aus „eingesetzt“ und
 * „abgerückt“ die Zeiten jeder Kraft. Gelesen wird die Datei im Browser (`tagebuchLesen`
 * in `js_einsaetze.html`), denn dort wird auch zugeordnet: welcher Name im Tagebuch welches
 * Mitglied ist, wer unter Atemschutz war. Hierher kommt das Ergebnis.
 *
 * Übungen und Wachen ohne Tagebuch werden von Hand erfasst – mit derselben Aktion.
 *
 * ## Was daraus folgt
 *
 * Stunden je Mitglied (`einsatzStunden_`), Nachweise aus Einsätzen unter Atemschutz
 * (`einsatzNachweise_`), Bericht und Dienstnachweis als PDF (`27_Pdf.js`).
 *
 * ## Was der Browser bekommt
 *
 * Berichte wachsen ohne Ende. Im Datenstand stehen die des laufenden und des vorigen
 * Jahres – genug für die Jahresauswertung im Januar. Ältere holt `einsaetze.jahr`, zum
 * Lesen. Das Tagebuch selbst steht nie im Stand; es kommt, wenn jemand den Bericht
 * aufschlägt.
 *
 * Wer darf: dieselben wie bei den Nachweisen (`PERSONAL`). Wer wann wo war, ist
 * Personalsache – am Hallengerät gibt es nichts davon.
 */

/** Ab wann Berichte im Datenstand stehen: der 1. Januar des Vorjahres. */
function einsatzZeitraum_(heute) {
  return (Number(String(heute).slice(0, 4)) - 1) + '-01-01';
}

/**
 * Der Teil des Datenstands, der zu den Einsätzen gehört. Für das, was älter ist, nur die
 * Jahre (für die Auswahl) und je Mitglied der letzte Dienst unter Atemschutz – den braucht
 * `einsatzNachweise_`, auch wenn er zwei Jahre zurückliegt.
 */
function einsatzStand_(v, heute) {
  const zeitraum = einsatzZeitraum_(heute);
  const drin = {};
  const archiv = {};
  const alt = {};
  v.alle('einsaetze').forEach((e) => {
    const tag = tagVon_(e.beginn);
    if (tag >= zeitraum) drin[e.id] = e;
    else {
      alt[e.id] = e;
      if (tag) archiv[tag.slice(0, 4)] = true;
    }
  });
  const vorher = {};
  const kraefte = [];
  v.alle('einsatz_kraefte').forEach((k) => {
    if (drin[k.einsatz_id]) kraefte.push(Object.assign({}, k));
    else atemschutzMerken_(vorher, alt[k.einsatz_id], k);
  });
  return {
    einsaetze: Object.keys(drin).map((id) => Object.assign({}, drin[id])),
    einsatzkraefte: kraefte,
    einsatzZeitraum: zeitraum,
    einsatzArchiv: Object.keys(archiv).sort().reverse(),
    atemschutzVorher: vorher,
  };
}

/**
 * Alles, was `personalAbleiten_` braucht – für die PDFs, mit allen Jahren. Dasselbe
 * Ergebnis wie im Datenstand: Dort steht das Ältere als `atemschutzVorher`.
 */
function personalDaten_(v) {
  return {
    heute: heute_(),
    einstellungen: { vorwarnung_personal_tage: v.einstellung('vorwarnung_personal_tage') },
    mitglieder: v.alle('mitglieder'),
    qualiarten: v.alle('qualiarten').slice().sort((a, b) => (a.position || 0) - (b.position || 0) || String(a.name).localeCompare(b.name)),
    nachweise: v.alle('nachweise'),
    einsaetze: v.alle('einsaetze'),
    einsatzkraefte: v.alle('einsatz_kraefte'),
    atemschutzVorher: {},
  };
}

/** Eine Zeile der Abschrift. Frühere Fassungen kommen als Liste und stehen zeilenweise im Blatt. */
function eintragWerte_(t, einsatzId, i) {
  const zeit = textOderLeer_(t.zeit);
  pruefe_(istZeit_(zeit), 'Ein Tagebucheintrag hat keine gültige Uhrzeit.');
  const zeilen = (x) => (Array.isArray(x) ? x : []).map((y) => String(y == null ? '' : y).replace(/[\r\n]+/g, ' ').trim()).filter(Boolean).join('\n');
  return {
    einsatz_id: einsatzId,
    liste: t.liste === 'kraefte' ? 'kraefte' : 'tagebuch',
    zeit: zeit,
    text: String(t.text == null ? '' : t.text).slice(0, 5000),
    aktion: t.aktion === 'eingesetzt' || t.aktion === 'abgerückt' ? t.aktion : '',
    kommentar: String(t.kommentar == null ? '' : t.kommentar).slice(0, 2000),
    geloescht: !!t.geloescht,
    vorher: zeilen(t.vorher),
    zeit_vorher: zeilen(t.zeit_vorher),
    position: i + 1,
  };
}

function kraftAnlegen_(v, einsatzId, k) {
  const m = k.art !== 'mittel' && k.mitglied_id ? v.hole('mitglieder', k.mitglied_id) : null;
  const r = kraftWerte_(k, m);
  pruefe_(!r.fehler, r.fehler);
  return v.einfuegen('einsatz_kraefte', Object.assign({ id: neueId_(k), einsatz_id: einsatzId }, r.werte));
}

/**
 * Einen Bericht anlegen – mit Kräften und, aus dem Tagebuch, der Abschrift. Ersetzt er
 * einen früher übernommenen Stand desselben Tagebuchs (`ersetzt`), geht der alte samt
 * Kräften und Abschrift im selben Vorgang: ganz oder gar nicht.
 */
function einsatzAnlegen_(v, a, ich) {
  const werte = einsatzWerte_(a);
  const fehler = einsatzPruefen_(werte);
  pruefe_(!fehler, fehler);
  const kraefte = Array.isArray(a.kraefte) ? a.kraefte : [];
  const tagebuch = Array.isArray(a.tagebuch) ? a.tagebuch : [];
  pruefe_(kraefte.length <= 500 && tagebuch.length <= 5000, 'Zu viele Einträge für einen Bericht.');
  if (a.ersetzt) {
    const alt = v.finde('einsaetze', a.ersetzt);
    if (alt) v.loeschen('einsaetze', alt.id);
  }
  werte.quelle = a.quelle === 'einsatztagebuch' ? 'einsatztagebuch' : '';
  werte.quelle_kennung = textOderLeer_(a.quelle_kennung).slice(0, 120);
  // Gezählt wird, was im Tagebuch stand – ohne die Einträge „eingesetzt / abgerückt“.
  werte.tagebuch_eintraege = tagebuch.filter((t) => t.liste !== 'kraefte').length;
  werte.erfasst_von = ich ? ich.name : 'System';
  const e = v.einfuegen('einsaetze', Object.assign({ id: neueId_(a) }, werte));
  kraefte.forEach((k) => kraftAnlegen_(v, e.id, k));
  tagebuch.forEach((t, i) => v.einfuegen('einsatz_eintraege', eintragWerte_(t, e.id, i)));
  return e;
}

function aktionenEinsaetze_() {
  return {
    /**
     * Anlegen (mit Kräften und Tagebuch) oder die Kopfdaten ändern. Kräfte einzeln
     * ändern geht über `einsatzkraefte.speichern`, die Abschrift gar nicht.
     */
    'einsaetze.speichern': {
      rollen: PERSONAL,
      schreibend: true,
      stand: true,
      f: (v, a, ich) => {
        personalAn_(v);
        if (!a.id) return { id: einsatzAnlegen_(v, a, ich).id };
        const alt = v.hole('einsaetze', a.id);
        const werte = einsatzWerte_(a);
        const fehler = einsatzPruefen_(Object.assign({}, alt, werte));
        pruefe_(!fehler, fehler);
        return { id: v.aendern('einsaetze', alt.id, werte).id };
      },
    },

    /** Samt Kräften und Abschrift – und damit auch den Nachweisen, die daraus folgten. */
    'einsaetze.loeschen': {
      rollen: PERSONAL,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        personalAn_(v);
        v.loeschen('einsaetze', a.id);
        return true;
      },
    },

    'einsatzkraefte.speichern': {
      rollen: PERSONAL,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        personalAn_(v);
        const alt = a.id ? v.hole('einsatz_kraefte', a.id) : null;
        const einsatz = v.hole('einsaetze', alt ? alt.einsatz_id : a.einsatz_id);
        const voll = Object.assign({}, alt || {}, auswahl_(a, ['mitglied_id', 'name', 'art', 'von', 'bis', 'atemschutz', 'funktion']));
        const m = voll.art !== 'mittel' && voll.mitglied_id ? v.hole('mitglieder', voll.mitglied_id) : null;
        const r = kraftWerte_(voll, m);
        pruefe_(!r.fehler, r.fehler);
        if (alt) return { id: v.aendern('einsatz_kraefte', alt.id, r.werte).id };
        return { id: v.einfuegen('einsatz_kraefte', Object.assign({ id: neueId_(a), einsatz_id: einsatz.id }, r.werte)).id };
      },
    },

    'einsatzkraefte.loeschen': {
      rollen: PERSONAL,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        personalAn_(v);
        v.loeschen('einsatz_kraefte', a.id);
        return true;
      },
    },

    /** Die Abschrift des Tagebuchs – erst, wenn jemand den Bericht aufschlägt. */
    'einsaetze.tagebuch': {
      rollen: PERSONAL,
      f: (v, a) => {
        personalAn_(v);
        const e = v.hole('einsaetze', a.id);
        const liste = (x) => (x ? String(x).split('\n') : []);
        return v.alle('einsatz_eintraege')
          .filter((t) => t.einsatz_id === e.id)
          .sort((x, y) => (x.position || 0) - (y.position || 0))
          .map((t) => ({
            liste: t.liste,
            zeit: t.zeit,
            text: t.text,
            aktion: t.aktion,
            kommentar: t.kommentar,
            geloescht: t.geloescht,
            vorher: liste(t.vorher),
            zeit_vorher: liste(t.zeit_vorher),
          }));
      },
    },

    /** Ein älteres Jahr, das nicht im Datenstand steht – zum Lesen. */
    'einsaetze.jahr': {
      rollen: PERSONAL,
      f: (v, a) => {
        personalAn_(v);
        const jahr = String(a.jahr || '');
        pruefe_(/^\d{4}$/.test(jahr), 'Ungültiges Jahr.');
        const einsaetze = v.alle('einsaetze').filter((e) => tagVon_(e.beginn).slice(0, 4) === jahr);
        const ids = {};
        einsaetze.forEach((e) => {
          ids[e.id] = true;
        });
        return {
          jahr: jahr,
          einsaetze: einsaetze.map((e) => Object.assign({}, e)),
          kraefte: v.alle('einsatz_kraefte').filter((k) => ids[k.einsatz_id]).map((k) => Object.assign({}, k)),
        };
      },
    },

    'einsaetze.pdf': {
      rollen: PERSONAL,
      f: (v, a) => {
        personalAn_(v);
        return einsatzberichtPdf_(v, a.id);
      },
    },

    'einsaetze.stundenPdf': {
      rollen: PERSONAL,
      f: (v, a) => {
        personalAn_(v);
        return stundenPdf_(v, String(a.jahr || heute_().slice(0, 4)));
      },
    },

    'personal.nachweisPdf': {
      rollen: PERSONAL,
      f: (v, a) => {
        personalAn_(v);
        return dienstnachweisPdf_(v, a.mitglied_id, String(a.jahr || heute_().slice(0, 4)), a.qualifikationen !== false);
      },
    },
  };
}
