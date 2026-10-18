/**
 * Der Inventurgang: Platz wählen, zählen, abschließen – Befund.
 *
 * Zählen ist die Arbeit der Mannschaft, nicht nur der Technik. Der Browser schickt
 * nur die Fundliste; was fehlt und was fremd ist, rechnet `abschliessen` – in einem
 * Vorgang, ganz oder gar nicht. In einer Halle aus Stahlbeton reißt die Verbindung,
 * und ein halbes Ergebnis sähe aus wie ein ganzes.
 *
 * Ein Zählergebnis ist ein Nachweis: Es lässt sich weder ändern noch löschen. Wer
 * sich verzählt hat, zählt neu; der alte Gang bleibt daneben stehen.
 */

/** Der Grund „Inventur“ – Stammdatum wie jeder andere, wird angelegt, wenn er fehlt. */
function grundInventur_(v) {
  const da = v.alle('gruende').find((g) => g.name === GRUND_INVENTUR);
  if (da) return da.aktiv ? da : null;
  return v.einfuegen('gruende', {
    name: GRUND_INVENTUR,
    beschreibung: 'Beim Zählen am falschen Platz gefunden und geradegebucht.',
    position: 90,
  });
}

function aktionenInventur_() {
  return {
    /**
     * Einen Gang beginnen – oder den offenen an diesem Platz fortsetzen. Wer am
     * geteilten Gerät abgemeldet wurde, käme sonst mit einem zweiten zurück: zwei
     * halbe Ergebnisse für denselben Platz, beide falsch.
     */
    'inventur.beginnen': {
      rollen: ALLE,
      halle: true,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        const ort = v.hole('lagerplaetze', a.lagerplatz);
        const offen = v.alle('inventuren').find((i) => i.lagerplatz_id === ort.id && !i.beendet_am);
        if (offen) return { id: offen.id, fortgesetzt: true };
        const i = v.einfuegen('inventuren', {
          id: neueId_(a),
          lagerplatz_id: ort.id,
          lagerplatz_name: ort.name,
          benutzer_id: v.ich.id,
          benutzer_name: v.ich.name,
        });
        return { id: i.id, fortgesetzt: false };
      },
    },

    'inventur.abschliessen': {
      rollen: ALLE,
      halle: true,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        const inv = v.hole('inventuren', a.id);
        pruefe_(!inv.beendet_am, 'Dieser Zählgang ist schon abgeschlossen.');
        const ort = v.finde('lagerplaetze', inv.lagerplatz_id);
        pruefe_(ort, 'Den Lagerplatz dieses Zählgangs gibt es nicht mehr.');

        // Derselbe Befund, den der Browser schon angezeigt hat (`inventurBefund_`).
        const liste = inventurBefund_(v.alle('geraete'), ort.id, (a.gefunden || []).map(String));

        ['gefunden', 'fehlt'].forEach((erg) => liste[erg].forEach((id) => {
          v.einfuegen('inventur_geraete', { inventur_id: inv.id, geraet_id: id, ergebnis: erg });
        }));
        liste.fremd.forEach((id) => {
          const g = v.finde('geraete', id);
          const von = v.finde('lagerplaetze', g.lagerplatz_id);
          v.einfuegen('inventur_geraete', {
            inventur_id: inv.id,
            geraet_id: id,
            ergebnis: 'fremd',
            von_id: von ? von.id : null,
            von_name: von ? von.name : '',
          });
        });

        // Geradebuchen läuft durch `umlagern_` – mit Buchungszeile, Regeln und Protokoll.
        // Ohne Folge-Status: Wo ein Gerät liegt, sagt nichts über seinen Zustand.
        let korrigiert = false;
        if (a.korrigieren && liste.fremd.length) {
          const grund = grundInventur_(v);
          umlagern_(v, liste.fremd, ort.id, grund ? grund.id : null, 'Inventur ' + ort.name);
          korrigiert = true;
        }

        /*
         * Nicht Gefundenes bleibt ohne Einstellung, wo es laut Bestand steht – etwas zu
         * behaupten, das niemand geprüft hat, wäre schlimmer als die offene Meldung. Mit
         * einem Platz „Vermisst“ behauptet der Bestand nichts mehr, sondern sagt:
         * niemand weiß, wo es ist. Je Gang abwählbar.
         */
        let vermisst = 0;
        const vermisstCode = textOderLeer_(v.einstellung('inventur_vermisst_code'));
        if (a.vermisst && vermisstCode && liste.fehlt.length) {
          const ziel = v.alle('lagerplaetze').find((l) => normal_(l.code) === normal_(vermisstCode));
          pruefe_(ziel, 'Den eingestellten Platz für Vermisstes („' + vermisstCode + '“) gibt es nicht.');
          if (ziel.id !== ort.id) {
            const grund = grundInventur_(v);
            vermisst = umlagern_(v, liste.fehlt, ziel.id, grund ? grund.id : null,
              'Bei der Inventur in ' + ort.name + ' nicht gefunden').gebucht;
          }
        }

        v.aendern('inventuren', inv.id, {
          beendet_am: v.zeit,
          gefunden: liste.gefunden.length,
          fehlt: liste.fehlt.length,
          fremd: liste.fremd.length,
          korrigiert: korrigiert,
          bemerkung: textOderLeer_(a.bemerkung),
        });
        return Object.assign({ id: inv.id, vermisstGebucht: vermisst }, liste);
      },
    },

    'inventur.verlauf': {
      rollen: ALLE,
      f: (v, a) => v.alle('inventuren')
        .filter((i) => i.beendet_am && (!a.lagerplatz || i.lagerplatz_id === a.lagerplatz))
        .sort((x, y) => (x.beendet_am < y.beendet_am ? 1 : -1))
        .slice(0, 100),
    },

    'inventur.ergebnis': {
      rollen: ALLE,
      halle: true,
      f: (v, a) => {
        const inv = v.hole('inventuren', a.id);
        return {
          inventur: inv,
          zeilen: v.alle('inventur_geraete').filter((z) => z.inventur_id === inv.id),
        };
      },
    },
  };
}
