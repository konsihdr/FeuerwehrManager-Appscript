/**
 * Personal: Qualifikationsarten und Nachweise – damit Gerätewart und Kommandant die
 * G26.3 der Mannschaft im Blick behalten. Einsätze und Stunden: `29_Einsaetze.js`.
 *
 * Im SaaS-Produkt war das Modul abgeschaltet: G26.3 ist ein Gesundheitsdatum, und es auf
 * fremder Infrastruktur zu verarbeiten, war eine eigene Entscheidung (A2 drüben). Hier
 * liegt es in der Google-Tabelle der Firma, und die Wehr hat entschieden, dass es dort
 * liegen darf (2026-10-17). Ausschalten lässt es sich trotzdem: Einstellungen → Personal.
 *
 * Wer was darf, steht in `00_Schema.js`: Nachweise erfassen Gerätewart, Kommandant und
 * Administrator (`PERSONAL`), die Arten legt die Führung fest (`FUEHRUNG`). Nichts davon
 * geht am Hallengerät – keine Aktion hier trägt `halle`.
 */

function personalAn_(v) {
  pruefe_(modulPersonal_(v), 'Das Personalmodul ist ausgeschaltet (Einstellungen → Personal).');
}

function aktionenPersonal_() {
  return {
    'qualiarten.speichern': {
      rollen: FUEHRUNG,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        personalAn_(v);
        const werte = auswahl_(a, ['name', 'beschreibung', 'gueltig_wert', 'gueltig_einheit', 'atemschutz', 'aus_einsatz', 'aktiv']);
        if (werte.gueltig_wert === '') werte.gueltig_wert = null;
        if (werte.gueltig_einheit === '') werte.gueltig_einheit = null;
        const alt = a.id ? v.hole('qualiarten', a.id) : null;
        const fehler = qualiartPruefen_(Object.assign({}, alt || {}, werte));
        pruefe_(!fehler, fehler);
        if (alt) return { id: v.aendern('qualiarten', alt.id, werte).id };
        werte.position = v.alle('qualiarten').reduce((m, q) => Math.max(m, q.position || 0), 0) + 1;
        return { id: v.einfuegen('qualiarten', Object.assign({ id: neueId_(a) }, werte)).id };
      },
    },

    /** Geht nur, solange niemand einen Nachweis dieser Art hat – sonst stilllegen. */
    'qualiarten.loeschen': {
      rollen: FUEHRUNG,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        personalAn_(v);
        v.loeschen('qualiarten', a.id);
        return true;
      },
    },

    /**
     * Einen Nachweis erfassen oder berichtigen. Erneuert wird mit einem NEUEN Nachweis –
     * der alte bleibt als Beleg stehen, `nachweiseAktuell_` entscheidet, welcher heute gilt.
     * Ohne Angabe von „gültig bis“ rechnet der Server es aus der Art aus; der Browser
     * schickt es in aller Regel mit, weil dort der Vorschlag schon zu sehen war.
     */
    'nachweise.speichern': {
      rollen: PERSONAL,
      schreibend: true,
      stand: true,
      f: (v, a, ich) => {
        personalAn_(v);
        const werte = auswahl_(a, ['mitglied_id', 'art_id', 'erworben_am', 'gueltig_bis', 'bemerkung']);
        if (werte.gueltig_bis === '') werte.gueltig_bis = null;
        const alt = a.id ? v.hole('nachweise', a.id) : null;
        const voll = Object.assign({}, alt || {}, werte);
        const art = v.finde('qualiarten', voll.art_id);
        if (art && (!alt || voll.art_id !== alt.art_id)) pruefe_(art.aktiv, 'Die Qualifikation „' + art.name + '“ ist stillgelegt.');
        if (!alt && werte.gueltig_bis === undefined) voll.gueltig_bis = werte.gueltig_bis = nachweisBis_(art, voll.erworben_am) || null;
        const fehler = nachweisPruefen_(voll, art, heute_());
        pruefe_(!fehler, fehler);
        v.hole('mitglieder', voll.mitglied_id);
        if (alt) return { id: v.aendern('nachweise', alt.id, werte).id };
        werte.erfasst_von = ich.name;
        return { id: v.einfuegen('nachweise', Object.assign({ id: neueId_(a) }, werte)).id };
      },
    },

    'nachweise.loeschen': {
      rollen: PERSONAL,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        personalAn_(v);
        v.loeschen('nachweise', a.id);
        return true;
      },
    },

    'personal.pdf': {
      rollen: PERSONAL,
      f: (v) => {
        personalAn_(v);
        return personalPdf_(v);
      },
    },
  };
}
