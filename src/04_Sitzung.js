/**
 * Wer ruft an? Am Schreibtisch sagt es Google, in der Halle der Ausweis oder das Kürzel.
 *
 * ## Schreibtisch: das Firmenkonto
 *
 * Die Web-App läuft als ihr Eigentümer („Ausführen als: Ich“) und ist nur für die
 * eigene Workspace-Domain freigegeben („Zugriff: alle in …“). In genau dieser
 * Kombination nennt `Session.getActiveUser()` die Adresse des Besuchers – Google hat sie
 * geprüft, bevor der Aufruf überhaupt hier ankommt. Kein Kennwort, keine Sitzung, die
 * wir verwalten müssten: Wer im Blatt „Mitglieder“ mit seiner Adresse steht und aktiv
 * ist, ist drin, mit der Rolle, die dort steht – geprüft bei jedem Aufruf.
 *
 * Bis zum 2026-10-17 gab es hier Benutzername und Kennwort, weil Google die Adresse
 * außerhalb einer Domain nicht verrät. Im Firmen-Tenant tut es das; die eigene
 * Anmeldung wäre eine zweite Identität neben der, die die Firma schon verwaltet – mit
 * eigenem Kennwort, eigenem Zurücksetzen und ohne Austritt, wenn das Konto gesperrt wird.
 *
 * ## Halle: das Gerät plus Ausweis oder Kürzel
 *
 * Das Tablet an der Hallenwand ist mit irgendeinem Konto angemeldet, aber nicht mit dem
 * des Trupps, der gerade davorsteht. Ein als Hallengerät angemeldeter Browser fragt
 * deshalb nicht Google, sondern die Person: Ausweis scannen oder Kürzel eintippen. Das
 * gibt eine eigene Sitzung (Token), die nur für die Halle taugt.
 *
 * Der Unterschied zwischen beiden ist benannt: Der **Ausweis** ist ein Geheimnis (160 Bit),
 * das **Kürzel** ist eine Selbstauskunft – wer es kennt, kann es tippen. Am Hallengerät ist
 * das ein vertretbarer Tausch, wie die Unterschrift auf einer Liste an der Wand; das
 * Protokoll hält fest, womit sich jemand angemeldet hat. Je Gerät lässt sich das Kürzel
 * abschalten.
 */

const SITZUNG_PRAEFIX_ = 'sitzung:';
const MINUTE_ = 60 * 1000;
const RUHE_HALLE_GETEILT_ = 30 * MINUTE_;
const RUHE_HALLE_PERSOENLICH_ = 12 * 60 * MINUTE_;
const FEHLVERSUCHE_HALLE_ = 10;
const SPERRE_SEKUNDEN_ = 15 * 60;

const Sitzung_ = {
  eigenschaften() {
    return PropertiesService.getScriptProperties();
  },

  schluessel(token) {
    return SITZUNG_PRAEFIX_ + sha256Hex_(token).slice(0, 40);
  },

  anlegen(werte) {
    const token = base32_(zufallsBytes_(32));
    const jetzt = Date.now();
    this.eigenschaften().setProperty(this.schluessel(token), JSON.stringify(Object.assign({ s: jetzt, z: jetzt }, werte)));
    return token;
  },

  /** Abgelaufene Hallensitzungen entfernen. Läuft bei jeder Anmeldung mit – das genügt. */
  aufraeumen() {
    const p = this.eigenschaften();
    const alle = p.getProperties();
    const jetzt = Date.now();
    Object.keys(alle).forEach((k) => {
      if (k.indexOf(SITZUNG_PRAEFIX_) !== 0) return;
      try {
        const s = JSON.parse(alle[k]);
        if (jetzt - s.z > s.l) p.deleteProperty(k);
      } catch (e) {
        p.deleteProperty(k);
      }
    });
  },

  /** Alle Hallensitzungen eines Mitglieds beenden – nach dem Entfernen oder Sperren. */
  alleBeenden(mitgliedId) {
    const p = this.eigenschaften();
    const alle = p.getProperties();
    Object.keys(alle).forEach((k) => {
      if (k.indexOf(SITZUNG_PRAEFIX_) !== 0) return;
      try {
        if (JSON.parse(alle[k]).m === mitgliedId) p.deleteProperty(k);
      } catch (e) {
        // nichts
      }
    });
  },

  abgemeldet(text) {
    return new Fehler_(text || 'Die Sitzung am Hallengerät ist abgelaufen – bitte neu anmelden.', 'abgemeldet');
  },

  /** Die Adresse des Google-Kontos, das gerade anruft – oder leer. */
  googleAdresse() {
    try {
      return normal_(Session.getActiveUser().getEmail());
    } catch (e) {
      return '';
    }
  },

  /**
   * Wann jemand zuletzt da war – für die Mitgliederliste. In den Skripteigenschaften und
   * höchstens alle zehn Minuten geschrieben: Eine Zeile im Blatt je Seitenaufruf wäre
   * ein Schreibvorgang unter der Sperre, nur um eine Uhrzeit festzuhalten.
   */
  gesehen(mitgliedId) {
    const p = this.eigenschaften();
    const k = 'gesehen:' + mitgliedId;
    const vorher = p.getProperty(k);
    if (!vorher || Date.now() - Date.parse(vorher) > 10 * MINUTE_) p.setProperty(k, jetzt_());
  },

  zuletztGesehen() {
    const alle = this.eigenschaften().getProperties();
    const aus = {};
    Object.keys(alle).forEach((k) => {
      if (k.indexOf('gesehen:') === 0) aus[k.slice(8)] = alle[k];
    });
    return aus;
  },

  /**
   * Wer ruft an? Mit Token: eine Hallensitzung. Ohne: das Google-Konto.
   * Wirft `abgemeldet` (Hallensitzung vorbei) oder `kein_zugang` (Konto ist kein Mitglied).
   */
  pruefen(token) {
    if (token) return this.halle(token);
    const adresse = this.googleAdresse();
    pruefe_(adresse,
      'Kein Google-Konto erkannt. Die Web-App muss mit „Ausführen als: Ich“ und „Zugriff: alle in Ihrer Domain“ bereitgestellt sein.',
      'kein_zugang');
    const v = new Vorgang_(null, false);
    const m = v.alle('mitglieder').find((x) => normal_(x.email) === adresse);
    if (!m || !m.aktiv) {
      throw new Fehler_(adresse + (m ? ' ist hier gesperrt.' : ' ist hier nicht als Mitglied eingetragen.') +
        ' Ein Administrator der Wehr kann das unter „Mitglieder“ ändern.', 'kein_zugang');
    }
    this.gesehen(m.id);
    return { id: m.id, name: m.name, email: m.email, kuerzel: m.kuerzel, rolle: m.rolle, art: 'google', schluessel: null, geraet: null };
  },

  halle(token) {
    const schluessel = this.schluessel(token);
    const roh = this.eigenschaften().getProperty(schluessel);
    if (!roh) throw this.abgemeldet();
    const s = JSON.parse(roh);
    const jetzt = Date.now();
    const beenden = (text) => {
      this.eigenschaften().deleteProperty(schluessel);
      return this.abgemeldet(text);
    };
    if (jetzt - s.z > s.l) throw beenden();

    const v = new Vorgang_(null, false);
    const m = v.finde('mitglieder', s.m);
    if (!m || !m.aktiv) throw beenden('Dieser Zugang ist nicht mehr aktiv.');
    const geraet = v.finde('hallengeraete', s.g);
    if (!geraet || geraet.gesperrt) throw beenden('Dieses Gerät ist gesperrt.');
    if (s.x === 'kuerzel') {
      if (!geraet.kuerzel_erlaubt) throw beenden('An diesem Gerät gilt nur noch der Ausweis.');
    } else {
      const ausweis = v.alle('ausweise').find((x) => x.mitglied_id === m.id);
      if (!ausweis || ausweis.id !== s.w) throw beenden('Der Ausweis gilt nicht mehr.');
    }

    // Nicht bei jedem Aufruf schreiben: Die Eigenschaften haben ein Tageskontingent.
    if (jetzt - s.z > Math.min(10 * MINUTE_, s.l / 6)) {
      s.z = jetzt;
      this.eigenschaften().setProperty(schluessel, JSON.stringify(s));
    }
    return {
      id: m.id,
      name: m.name,
      email: m.email,
      kuerzel: m.kuerzel,
      rolle: m.rolle,
      art: 'halle',
      mit: s.x === 'kuerzel' ? 'kuerzel' : 'ausweis',
      schluessel: schluessel,
      geraet: { id: geraet.id, name: geraet.name, geteilt: geraet.geteilt, abmelden_nach_min: geraet.abmelden_nach_min },
    };
  },

  /**
   * Die Bremse gegen Raten am Hallengerät. Gezählt wird am Gerät, nicht am Mitglied:
   * Ein falscher Code gehört zu niemandem – dieselbe Einsicht wie im SaaS-Produkt.
   */
  bremse(art, wer, grenze) {
    const c = CacheService.getScriptCache();
    const k = CACHE_PRAEFIX_ + art + ':' + sha256Hex_(normal_(wer)).slice(0, 24);
    return {
      gesperrt: () => Number(c.get(k) || 0) >= grenze,
      fehlschlag: () => c.put(k, String(Number(c.get(k) || 0) + 1), SPERRE_SEKUNDEN_),
      loesen: () => c.remove(k),
    };
  },
};

function aktionenSitzung_() {
  return {
    /*
     * Anmeldung am Hallengerät: Gerät UND (Ausweis ODER Kürzel).
     *
     * Ein Feld für beides – gescannt kommt der Ausweiscode, getippt das Kürzel. Erst der
     * Ausweis (ein Geheimnis, nachgeschlagen über seinen Abdruck), dann das Kürzel, wenn
     * das Gerät es erlaubt. Die Meldungen bleiben stumpf: Jede Unterscheidung (gibt es
     * nicht / gesperrt / falsches Gerät) wäre eine Auskunft über andere.
     */
    'halle.anmelden': {
      oeffentlich: true,
      schreibend: true,
      stand: true,
      f: (v, a) => {
        const geheimnis = String(a.geraet || '');
        const geraet = geheimnis
          ? v.alle('hallengeraete').find((g) => g.geheimnis === sha256Hex_(geheimnis))
          : null;
        if (!geraet || geraet.gesperrt) throw new Fehler_('Dieses Gerät ist nicht (mehr) als Hallengerät angemeldet.', 'geraet_unbekannt');
        const bremse = Sitzung_.bremse('hfehl', geraet.id, FEHLVERSUCHE_HALLE_);
        pruefe_(!bremse.gesperrt(), 'Zu viele Fehlversuche an diesem Gerät. Bitte 15 Minuten warten.');

        const code = String(a.code || '').trim();
        let m = null;
        let ausweis = null;
        if (code) {
          ausweis = v.alle('ausweise').find((x) => x.code === sha256Hex_(code.toUpperCase())) || null;
          if (ausweis) m = v.finde('mitglieder', ausweis.mitglied_id);
          else if (geraet.kuerzel_erlaubt) m = v.alle('mitglieder').find((x) => x.kuerzel && normal_(x.kuerzel) === normal_(code)) || null;
        }
        if (!m || !m.aktiv) {
          bremse.fehlschlag();
          v.protokollieren('anmeldung_fehlgeschlagen', 'hallengeraete', geraet.id, geraet.name, { eingabe: ausweis ? 'Ausweis' : 'nicht erkannt' });
          return v.ablehnen(geraet.kuerzel_erlaubt ? 'Ausweis oder Kürzel nicht erkannt.' : 'Ausweis nicht erkannt.');
        }
        bremse.loesen();
        Sitzung_.aufraeumen();
        Sitzung_.gesehen(m.id);
        v.aendern('hallengeraete', geraet.id, { zuletzt_genutzt: v.zeit });
        // Im Protokoll, wer sich womit angemeldet hat – beim Kürzel ist das die einzige
        // Spur, dass die Angabe eine Selbstauskunft war.
        v.ich = { id: m.id, name: m.name };
        v.protokollieren('anmeldung', 'mitglieder', m.id, m.name, { geraet: geraet.name, mit: ausweis ? 'Ausweis' : 'Kürzel' });
        return {
          token: Sitzung_.anlegen({
            m: m.id,
            a: 'halle',
            g: geraet.id,
            w: ausweis ? ausweis.id : null,
            x: ausweis ? 'ausweis' : 'kuerzel',
            l: geraet.geteilt ? RUHE_HALLE_GETEILT_ : RUHE_HALLE_PERSOENLICH_,
          }),
        };
      },
    },

    'sitzung.abmelden': {
      rollen: ALLE,
      halle: true,
      f: (v, a, ich) => {
        if (ich.schluessel) Sitzung_.eigenschaften().deleteProperty(ich.schluessel);
        return true;
      },
    },
  };
}
