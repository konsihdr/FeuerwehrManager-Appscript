/**
 * Das Protokoll lesen. Geschrieben wird es ausschließlich von `Vorgang_.festschreiben`.
 *
 * Neueste zuerst, in der Reihenfolge, in der die Zeilen angehängt wurden – nicht nach
 * Zeitstempel sortiert: Alle Einträge eines Vorgangs tragen denselben, und ihre
 * Reihenfolge erzählt, was zuerst geschah.
 */
function aktionenProtokoll_() {
  return {
    'protokoll.lesen': {
      rollen: VERWALTUNG,
      f: (v, a) => {
        const je = Math.min(Number(a.je) || 100, 500);
        const seite = Math.max(Number(a.seite) || 0, 0);
        const suche = normal_(a.suche);
        const alle = v.alle('protokoll').slice().reverse().filter((p) => {
          if (a.art && p.objekt_art !== a.art) return false;
          if (a.aktion && p.aktion !== a.aktion) return false;
          if (!suche) return true;
          return normal_([p.benutzer_name, p.objekt_text, p.aktion, JSON.stringify(p.details || {})].join(' ')).indexOf(suche) >= 0;
        });
        return { gesamt: alle.length, eintraege: alle.slice(seite * je, (seite + 1) * je) };
      },
    },
  };
}
