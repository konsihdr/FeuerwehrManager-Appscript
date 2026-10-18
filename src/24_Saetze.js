/**
 * Gerätesätze: Vorlagen (Satzarten) und die Sätze selbst.
 *
 * Ein Satz ist eine Klammer um Geräte, die zusammen benutzt werden – ein
 * Atemschutzsatz aus Pressluftatmer, Maske, Lungenautomat und Flasche. Er hat einen
 * eigenen Barcode; wer ihn scannt, bucht alle Teile auf einmal. Einen eigenen
 * Standort hat er nicht: Er steht dort, wo seine Teile stehen – oder „verteilt“.
 */

function aktionenSaetze_() {
  return {
    'satzarten.speichern': {
      rollen: TECHNIK,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        const art = speichern_(v, 'satzarten', a, ['name', 'beschreibung']);
        if (Array.isArray(a.teile)) {
          const neu = a.teile.filter((t) => t && t.geraetetyp_id);
          const fehler = satzteilePruefen_(neu);
          pruefe_(!fehler, fehler);
          const typen = new Set(neu.map((t) => t.geraetetyp_id));
          const da = v.alle('satzart_teile').filter((t) => t.satzart_id === art.id);
          da.filter((t) => !typen.has(t.geraetetyp_id)).forEach((t) => v.loeschen('satzart_teile', t.id));
          neu.forEach((t) => {
            const werte = {
              min_anzahl: Number(t.min_anzahl),
              max_anzahl: Number(t.max_anzahl),
              bemerkung: t.bemerkung || '',
            };
            const vorhanden = da.find((x) => x.geraetetyp_id === t.geraetetyp_id);
            if (vorhanden) v.aendern('satzart_teile', vorhanden.id, werte);
            else v.einfuegen('satzart_teile', Object.assign({ satzart_id: art.id, geraetetyp_id: t.geraetetyp_id }, werte));
          });
        }
        return { id: art.id };
      },
    },

    'satzarten.loeschen': {
      rollen: TECHNIK,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        v.loeschen('satzarten', a.id);
        return true;
      },
    },

    'saetze.speichern': {
      rollen: TECHNIK,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        const werte = auswahl_(a, ['name', 'satzart_id', 'barcode', 'bemerkung']);
        if (a.id && !textOderLeer_(werte.barcode)) delete werte.barcode;
        if (werte.satzart_id === '') werte.satzart_id = null;
        const s = a.id ? v.aendern('saetze', a.id, werte) : v.einfuegen('saetze', Object.assign({ id: neueId_(a) }, werte));
        return { id: s.id };
      },
    },

    'saetze.loeschen': {
      rollen: TECHNIK,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        v.loeschen('saetze', a.id);
        return true;
      },
    },

    /**
     * Geräte in einen Satz stecken. Steckt eines schon in einem anderen, wechselt es –
     * ein Gerät gehört zu höchstens einem Satz, und wer es scannt, meint diesen.
     */
    'saetze.hinzufuegen': {
      rollen: TECHNIK,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        const satz = v.hole('saetze', a.satz);
        let neu = 0;
        let gewechselt = 0;
        (a.geraete || []).forEach((id) => {
          const g = v.hole('geraete', id);
          const da = v.alle('satz_mitglieder').find((m) => m.geraet_id === g.id);
          if (da && da.satz_id === satz.id) return;
          if (da) {
            v.loeschen('satz_mitglieder', da.id);
            gewechselt++;
          }
          v.einfuegen('satz_mitglieder', { satz_id: satz.id, geraet_id: g.id });
          neu++;
        });
        return { neu: neu, gewechselt: gewechselt };
      },
    },

    'saetze.entfernen': {
      rollen: TECHNIK,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        const ids = new Set((a.geraete || []).map(String));
        v.alle('satz_mitglieder')
          .filter((m) => m.satz_id === a.satz && ids.has(m.geraet_id))
          .forEach((m) => v.loeschen('satz_mitglieder', m.id));
        return true;
      },
    },
  };
}
