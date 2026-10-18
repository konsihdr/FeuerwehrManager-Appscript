/**
 * Prüfwesen: Fälligkeiten anlegen, Prüfungen erfassen, Nachweise ausgeben.
 */

/**
 * Für ein Gerät alle Pläne seines Typs anlegen – und die geräteeigenen dazu. Was dabei
 * entsteht, rechnet `faelligkeitenPlan_` (`05_Gemeinsam.js`), damit der Browser ein neues
 * Gerät sofort mit seinen Terminen zeigen kann.
 */
function faelligkeitenAnlegen_(v, geraetId) {
  const g = v.hole('geraete', geraetId);
  const plan = faelligkeitenPlan_(g, v.alle('pruefplaene'), v.alle('plan_stand'), heute_());
  plan.an.forEach((id) => v.aendern('plan_stand', id, { aktiv: true }));
  plan.neu.forEach((s) => v.einfuegen('plan_stand', s));
  plan.aus.forEach((id) => v.aendern('plan_stand', id, { aktiv: false }));
}

function planVerteilen_(v, plan) {
  planVerteilenPlan_(plan, v.alle('geraete'), v.alle('plan_stand'), heute_()).forEach((s) => v.einfuegen('plan_stand', s));
}

/*
 * Was nach einer Prüfung mit dem Status passiert, entscheidet `statusNachPruefung_` in
 * `05_Gemeinsam.js` – und zwar dort und nicht im Dialog: Im SaaS-Produkt blieb der Status
 * einfach stehen, „nach einer bestandenen Prüfung passiert nichts“ war dort der
 * sichtbarste offene Punkt (A13). Der Dialog zeigt nur an, was der Server tun wird.
 */

/**
 * Nachweis schreiben und Termin fortschreiben – in einem Vorgang.
 *
 * Getrennt ginge beides schief: ein Nachweis ohne Terminverschiebung (das Gerät
 * bleibt fällig, obwohl geprüft) oder ein verschobener Termin ohne Nachweis. Das
 * zweite ist das schlimmere.
 *
 * Aus dem Browser kommen nur **Ergebnisse**, nie Titel: Die Bezeichnung jedes Schritts
 * wird hier aus dem Plan geholt. Ein Nachweis, dessen Text der Browser bestimmt,
 * wäre fälschbar.
 */
function pruefungErfassen_(v, a) {
  const g = v.hole('geraete', a.geraet);
  const plan = v.hole('pruefplaene', a.plan);
  pruefe_(plan.geraetetyp_id === g.geraetetyp_id && (!plan.geraet_id || plan.geraet_id === g.id),
    'Dieser Prüfplan gehört nicht zu diesem Gerät.');
  pruefe_(['bestanden', 'nicht_bestanden'].indexOf(a.ergebnis) >= 0, 'Bitte ein Ergebnis wählen.');
  const heute = heute_();
  const datum = a.datum || heute;
  pruefe_(istDatum_(datum), 'Kein gültiges Prüfdatum.');
  pruefe_(datum <= heute, 'Das Prüfdatum liegt in der Zukunft.');

  const eingaben = {};
  (Array.isArray(a.schritte) ? a.schritte : []).forEach((e) => {
    if (e && e.id) eingaben[String(e.id)] = e;
  });
  const schritte = v.alle('pruefschritte')
    .filter((s) => s.pruefplan_id === plan.id)
    .sort((x, y) => (x.position || 0) - (y.position || 0))
    .map((s) => {
      const e = eingaben[s.id] || {};
      return {
        titel: s.titel,
        art: s.art,
        einheit: s.einheit || '',
        pflicht: !!s.pflicht,
        ok: e.ok === true ? true : e.ok === false ? false : null,
        wert: textOderLeer_(e.wert).slice(0, 200),
        notiz: textOderLeer_(e.notiz).slice(0, 500),
      };
    });
  if (a.ergebnis === 'bestanden') {
    const offen = schritte.filter((s) => s.pflicht && (s.art === 'haken' ? s.ok !== true : !s.wert));
    pruefe_(!offen.length, 'Noch ' + offen.length + ' Pflichtschritt' + (offen.length === 1 ? '' : 'e') +
      ' offen – oder als „nicht bestanden“ erfassen.');
  }

  const stand = v.alle('plan_stand').find((s) => s.geraet_id === g.id && s.pruefplan_id === plan.id);
  const folgen = pruefungFolgen_(g, plan, stand, a.ergebnis, datum, a.status_danach);
  const danach = folgen.danach;
  pruefe_(danach === 'unveraendert' || STATUS.indexOf(danach) >= 0, 'Unbekannter Status.');

  const pruefung = v.einfuegen('pruefungen', {
    id: neueId_(a),
    geraet_id: g.id,
    pruefplan_id: plan.id,
    plan_name: plan.name,
    benutzer_id: v.ich ? v.ich.id : null,
    benutzer_name: v.ich ? v.ich.name : 'System',
    geprueft_am: datum,
    ergebnis: a.ergebnis,
    bemerkung: textOderLeer_(a.bemerkung),
    faellig_am: stand ? stand.naechste_faellig : null,
    schritte: schritte,
    status_danach: danach === 'unveraendert' ? '' : danach,
  });

  // Eine nachgetragene ältere Prüfung schiebt den Termin nicht zurück (`pruefungFolgen_`).
  if (folgen.stand) v.aendern('plan_stand', stand.id, folgen.stand);
  if (folgen.status) v.aendern('geraete', g.id, { status: folgen.status });
  regelnAnwenden_(v, 'pruefung', g.id, { ergebnis: a.ergebnis });
  return { id: pruefung.id };
}

function aktionenPruefungen_() {
  return {
    'pruefungen.erfassen': {
      rollen: TECHNIK,
      schreibend: true,
      stand: true,
      f: (v, a) => pruefungErfassen_(v, a),
    },

    /** Den Termin von Hand setzen, ein abweichendes Intervall, den Plan für ein Gerät abschalten. */
    'faelligkeit.aendern': {
      rollen: TECHNIK,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        const s = v.hole('plan_stand', a.id);
        const r = faelligkeitWerte_(s, v.finde('pruefplaene', s.pruefplan_id), a);
        pruefe_(!r.fehler, r.fehler);
        v.aendern('plan_stand', s.id, r.werte);
        return true;
      },
    },

    'pruefungen.nachweis': {
      rollen: ALLE,
      f: (v, a) => pruefnachweisPdf_(v, a.id),
    },

    'arbeitsliste.pdf': {
      rollen: TECHNIK,
      f: (v, a) => arbeitslistePdf_(v, Number(a.tage)),
    },
  };
}
