/**
 * Mitglieder, Ausweise, Hallengeräte – Sache des Administrators.
 *
 * Ein Mitglied ist eine Google-Adresse aus dem Firmenkonto plus Rolle. Ein Kennwort gibt
 * es nicht mehr: Wer das Firmenkonto verliert, verliert damit auch den Zugang hier, ohne
 * dass jemand daran denken muss.
 */

/**
 * Google-Adresse und Kürzel prüfen und in Vergleichsform bringen – mit `mitgliedWerte_`
 * aus `05_Gemeinsam.js`, derselben Prüfung, die der Browser vor dem Speichern macht.
 */
function mitgliedFelder_(a) {
  const r = mitgliedWerte_(a);
  pruefe_(!r.fehler, r.fehler);
  return r.werte;
}

const KOPPLUNG_PRAEFIX_ = 'kopplung:';
const KOPPLUNG_DAUER_ = 15 * 60 * 1000;

function aktionenMitglieder_() {
  return {
    'mitglieder.speichern': {
      rollen: NUR_ADMIN,
      schreibend: true,
      stand: true,
      f: (v, a, ich) => {
        const werte = mitgliedFelder_(a);
        if (!a.id) {
          werte.aktiv = true;
          return { id: v.einfuegen('mitglieder', Object.assign({ id: neueId_(a) }, werte)).id };
        }
        const m = v.hole('mitglieder', a.id);
        const fehler = mitgliedAenderungPruefen_(v.alle('mitglieder'), m, werte, ich.id);
        pruefe_(!fehler, fehler);
        v.aendern('mitglieder', m.id, werte);
        if (werte.aktiv === false) Sitzung_.alleBeenden(m.id);
        return { id: m.id };
      },
    },

    'mitglieder.loeschen': {
      rollen: NUR_ADMIN,
      schreibend: true,
      stand: true,
      f: (v, a, ich) => {
        const m = v.hole('mitglieder', a.id);
        const fehler = mitgliedLoeschenPruefen_(v.alle('mitglieder'), m, ich.id);
        pruefe_(!fehler, fehler);
        // Buchungen, Prüfungen und Zählungen behalten den Namen als Momentaufnahme;
        // Nachweise gehören zur Person und gehen mit ihr.
        v.loeschen('mitglieder', m.id);
        Sitzung_.alleBeenden(m.id);
        return true;
      },
    },

    /**
     * Einen Ausweis ausgeben.
     *
     * 160 Bit Zufall, angezeigt genau einmal; gespeichert wird nur der Abdruck. Ein
     * Ausweis wird ausgegeben, nicht wiederhergestellt – wer seinen verliert, bekommt
     * einen neuen, und der alte gilt ab diesem Moment nicht mehr.
     *
     * Kein Salz, kein langsames Verfahren: Das schützt Geheimnisse, die ein Mensch
     * sich ausgedacht hat. 160 Bit aus dem Zufall haben keine wahrscheinlichen
     * Kandidaten – und die Anmeldung muss den Abdruck direkt nachschlagen können.
     */
    'ausweis.ausgeben': {
      rollen: NUR_ADMIN,
      schreibend: true,
      stand: true,
      f: (v, a, ich) => {
        const m = v.hole('mitglieder', a.mitglied);
        pruefe_(m.aktiv, 'Ein gesperrtes Mitglied bekommt keinen Ausweis.');
        v.alle('ausweise').filter((x) => x.mitglied_id === m.id).forEach((x) => v.loeschen('ausweise', x.id));
        const code = 'FW' + zufallsCode_(32);
        v.einfuegen('ausweise', { mitglied_id: m.id, code: sha256Hex_(code), ausgegeben_von: ich.name });
        return { code: code, name: m.name, kuerzel: m.kuerzel };
      },
    },

    'ausweis.zurueckziehen': {
      rollen: NUR_ADMIN,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        v.alle('ausweise').filter((x) => x.mitglied_id === a.mitglied).forEach((x) => v.loeschen('ausweise', x.id));
        return true;
      },
    },

    /**
     * Ein Telefon oder Tablet als Hallengerät anmelden.
     *
     * Das Geheimnis würfelt der Browser und legt es bei sich ab; hierher kommt es nur,
     * um seinen Abdruck zu speichern. Ohne dieses Geheimnis sind Ausweis und Kürzel
     * nichts wert – sie wirken nur an diesem Gerät.
     */
    'hallengeraet.anmelden': {
      rollen: NUR_ADMIN,
      schreibend: true,
      stand: true,
      f: (v, a, ich) => {
        const geheimnis = String(a.geheimnis || '');
        pruefe_(/^[A-Za-z0-9]{32,}$/.test(geheimnis), 'Das Gerätegeheimnis ist zu kurz.');
        const minuten = Number(a.abmelden_nach_min);
        pruefe_(!a.geteilt || (Number.isInteger(minuten) && minuten >= 1 && minuten <= 120),
          'Abmelden nach: 1 bis 120 Minuten.');
        const g = v.einfuegen('hallengeraete', {
          name: textOderLeer_(a.name) || 'Hallengerät',
          geheimnis: sha256Hex_(geheimnis),
          geteilt: !!a.geteilt,
          abmelden_nach_min: a.geteilt ? minuten : 0,
          kuerzel_erlaubt: a.kuerzel_erlaubt !== false,
          angelegt_von: ich.name,
        });
        return { id: g.id, name: g.name };
      },
    },

    /**
     * Ein Hallengerät aus der Ferne koppeln.
     *
     * Das Tablet an der Hallenwand ist mit einem Google-Konto angemeldet, das kein Mitglied
     * ist – also kommt dort niemand in die Einstellungen, um „Dieses Gerät anmelden“ zu
     * drücken. Stattdessen erzeugt der Administrator am Schreibtisch einen Code, und das
     * Tablet tauscht ihn gegen seine Anmeldung. Acht Zeichen, eine Viertelstunde gültig,
     * genau einmal; die Bremse beim Einlösen zählt für alle Geräte zusammen.
     */
    'hallengeraet.kopplung': {
      rollen: NUR_ADMIN,
      f: (v, a, ich) => {
        const minuten = Number(a.abmelden_nach_min);
        pruefe_(!a.geteilt || (Number.isInteger(minuten) && minuten >= 1 && minuten <= 120), 'Abmelden nach: 1 bis 120 Minuten.');
        const code = zufallsCode_(8);
        const bis = Date.now() + KOPPLUNG_DAUER_;
        Sitzung_.eigenschaften().setProperty(KOPPLUNG_PRAEFIX_ + sha256Hex_(code), JSON.stringify({
          name: textOderLeer_(a.name) || 'Hallengerät',
          geteilt: !!a.geteilt,
          abmelden_nach_min: a.geteilt ? minuten : 0,
          kuerzel_erlaubt: a.kuerzel_erlaubt !== false,
          von_id: ich.id,
          von: ich.name,
          bis: bis,
        }));
        return { code: code.slice(0, 4) + '-' + code.slice(4), bis: new Date(bis).toISOString() };
      },
    },

    'halle.koppeln': {
      oeffentlich: true,
      schreibend: true,
      f: (v, a) => {
        const bremse = Sitzung_.bremse('kfehl', 'alle', 10);
        pruefe_(!bremse.gesperrt(), 'Zu viele falsche Kopplungscodes. Bitte 15 Minuten warten.');
        const code = String(a.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const p = Sitzung_.eigenschaften();
        const k = KOPPLUNG_PRAEFIX_ + sha256Hex_(code);
        const roh = code ? p.getProperty(k) : null;
        const kopplung = roh ? JSON.parse(roh) : null;
        if (!kopplung || kopplung.bis < Date.now()) {
          if (roh) p.deleteProperty(k);
          bremse.fehlschlag();
          throw new Fehler_('Dieser Kopplungscode gilt nicht (mehr). Bitte am Schreibtisch einen neuen erzeugen.');
        }
        const geheimnis = String(a.geheimnis || '');
        pruefe_(/^[A-Za-z0-9]{32,}$/.test(geheimnis), 'Das Gerätegeheimnis ist zu kurz.');
        p.deleteProperty(k);
        // Im Protokoll steht der Administrator, der den Code erzeugt hat – er hat das Gerät zugelassen.
        v.ich = { id: kopplung.von_id, name: kopplung.von };
        const g = v.einfuegen('hallengeraete', {
          name: kopplung.name,
          geheimnis: sha256Hex_(geheimnis),
          geteilt: kopplung.geteilt,
          abmelden_nach_min: kopplung.abmelden_nach_min,
          kuerzel_erlaubt: kopplung.kuerzel_erlaubt,
          angelegt_von: kopplung.von,
        });
        bremse.loesen();
        return { name: g.name, geteilt: g.geteilt, kuerzel_erlaubt: g.kuerzel_erlaubt };
      },
    },

    'hallengeraet.aendern': {
      rollen: NUR_ADMIN,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        const werte = auswahl_(a, ['name', 'geteilt', 'abmelden_nach_min', 'kuerzel_erlaubt', 'gesperrt']);
        if (werte.geteilt === false) werte.abmelden_nach_min = 0;
        v.aendern('hallengeraete', a.id, werte);
        return true;
      },
    },

    'hallengeraet.loeschen': {
      rollen: NUR_ADMIN,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        v.loeschen('hallengeraete', a.id);
        return true;
      },
    },
  };
}
