/**
 * Die eine Tür zwischen Browser und Tabelle.
 *
 * Der Browser ruft genau eine Funktion auf: `aufruf(token, name, argumente)`. Hier
 * entscheidet sich, wer anruft (`Sitzung_.pruefen` – das Google-Konto, oder am
 * Hallengerät das Token aus Ausweis/Kürzel), ob er das darf (`rollen`), ob er es von dort
 * darf, wo er steht (`halle`), und ob geschrieben wird – dann unter der Sperre und in
 * einem `Vorgang_`, der am Ende als Ganzes festgeschrieben wird.
 *
 * Im SaaS-Produkt standen die Rechte in den Policies der Datenbank, „weil ohne API
 * dazwischen die Regel dort gelten muss, wo die Daten liegen“. Hier gibt es wieder
 * eine API dazwischen – und sie ist die einzige Stelle, durch die der Browser an die
 * Daten kommt: Die Web-App läuft als ihr Eigentümer, die Mitglieder haben auf die
 * Tabelle selbst keinen Zugriff. Damit ist diese Tabelle hier der Ort, an dem aus
 * einer Rolle ein Recht wird, und zwar der einzige.
 *
 * Jede Aktion beschreibt sich selbst:
 *
 *   rollen        – wer darf (fehlt es, ist die Aktion öffentlich – nur mit `oeffentlich`)
 *   oeffentlich   – ohne Mitgliedschaft (die Anmeldung am Hallengerät)
 *   schreibend    – läuft unter der Sperre und wird festgeschrieben
 *   stand         – die Antwort bringt den neuen Datenstand gleich mit; spart dem
 *                   Browser nach jeder Änderung einen zweiten Aufruf
 *   halle         – auch mit einer Anmeldung am Hallengerät (Ausweis/Kürzel) erlaubt
 *
 * Seit 0.2 gibt es daneben den **Stapel** (`aufruf(token, 'stapel', { ops })`): Die
 * Oberfläche zeigt eine Änderung sofort und schickt sie im Hintergrund, oft mehrere
 * auf einmal. Jede Änderung im Stapel geht durch dieselbe Prüfung wie ein einzelner
 * Aufruf und wird für sich festgeschrieben – eine abgelehnte nimmt die anderen nicht mit.
 */

/** Die Startseite. Wehrname und Logo kommen gleich mit – der Anmeldebildschirm braucht sie. */
function doGet() {
  const vorlage = HtmlService.createTemplateFromFile('index');
  let start = { version: APP_VERSION, wehr_name: '', wehr_zusatz: '', logo: '', eingerichtet: true };
  try {
    Speicher_.vergessen();
    const v = new Vorgang_(null, false);
    start.wehr_name = v.einstellung('wehr_name');
    start.wehr_zusatz = v.einstellung('wehr_zusatz');
    start.logo = v.einstellung('logo');
  } catch (e) {
    start.eingerichtet = false;
  }
  // `<` maskiert: Ein Wehrname mit „</script>“ beendete sonst den Skriptblock.
  vorlage.start = JSON.stringify(start).replace(/</g, '\\u003c');
  // Dieselben Ableitungen und Prüfungen wie hier – als Quelltext für den Browser.
  vorlage.gemeinsam = gemeinsamerCode_().replace(/<\/(script)/gi, '<\\/$1');
  return vorlage
    .evaluate()
    .setTitle(start.wehr_name ? start.wehr_name + ' · FeuerwehrManager' : 'FeuerwehrManager')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .addMetaTag('mobile-web-app-capable', 'yes')
    .addMetaTag('apple-mobile-web-app-capable', 'yes');
}

/** Für die Vorlage: eine Datei des Projekts einbinden. */
function einbinden_(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

let AKTIONEN_ = null;

function aktionen_() {
  if (!AKTIONEN_) {
    AKTIONEN_ = Object.assign(
      {},
      aktionenSitzung_(),
      aktionenStand_(),
      aktionenBetrieb_(),
      aktionenStammdaten_(),
      aktionenPruefungen_(),
      aktionenSaetze_(),
      aktionenInventur_(),
      aktionenMitglieder_(),
      aktionenPersonal_(),
      aktionenEinsaetze_(),
      aktionenProtokoll_(),
    );
  }
  return AKTIONEN_;
}

/**
 * Schreibende Vorgänge nacheinander.
 *
 * Ohne Sperre liest der zweite Schreiber den Stand, bevor der erste geschrieben hat,
 * und überschreibt dessen Zeilen mit seiner veralteten Fassung. Mit Sperre wartet er
 * – bei einer Wehr mit vierzig Mitgliedern Sekundenbruchteile.
 */
function mitSperre_(arbeit) {
  const sperre = LockService.getScriptLock();
  if (!sperre.tryLock(30000)) {
    throw new Fehler_('Gerade wird zu viel gleichzeitig gebucht – bitte noch einmal versuchen.', 'gesperrt');
  }
  try {
    return arbeit();
  } finally {
    sperre.releaseLock();
  }
}

/** Darf `ich` diese Aktion – und von dort, wo er steht? */
function berechtigt_(aktion, ich) {
  pruefe_(aktion.rollen.indexOf(ich.rolle) >= 0, 'Dafür fehlt die Berechtigung.', 'verboten');
  // Eine Anmeldung am Hallengerät taugt für die Halle, nicht für die Verwaltung – auch
  // beim Administrator. Wer das Hallengerät erwischt und ein Kürzel kennt, kann damit
  // buchen und zählen, aber niemanden aufnehmen und keinen Ausweis ausgeben.
  if (ich.art === 'halle' && !aktion.halle) {
    throw new Fehler_('Das geht nur mit dem eigenen Google-Konto, nicht am Hallengerät.', 'verboten');
  }
}

function fehlerAntwort_(e, name) {
  if (e instanceof Fehler_) return { ok: false, fehler: e.message, code: e.code };
  console.error('Aufruf ' + name + ' scheiterte: ' + (e && e.stack ? e.stack : e));
  return { ok: false, fehler: 'Interner Fehler: ' + (e && e.message ? e.message : String(e)), code: 'intern' };
}

const STAPEL_HOECHSTENS_ = 50;

/**
 * Was der Browser im Hintergrund gesammelt hat – nacheinander, unter einer Sperre.
 *
 * Jede Änderung trägt eine Kennung (`op`), die der Browser vergibt. Was damit schon
 * geschrieben ist, steht sechs Stunden im Zwischenspeicher: Reißt die Antwort ab, und
 * der Browser schickt denselben Stapel noch einmal, wird nichts doppelt gebucht – die
 * Antwort kommt aus dem Speicher. Fällt eine Anlage trotzdem doppelt an (Speicher
 * geräumt), erkennt sie `schon_da` an ihrer eigenen Kennung.
 *
 * Abgelehnte Änderungen werden NICHT vermerkt: Der Browser nimmt sie zurück und schickt
 * sie nicht wieder. Für sie gibt es nichts zu wiederholen.
 */
function stapel_(token, argumente) {
  const ops = Array.isArray(argumente.ops) ? argumente.ops : [];
  pruefe_(ops.length <= STAPEL_HOECHSTENS_, 'Zu viele Änderungen auf einmal.');
  const ich = Sitzung_.pruefen(token);
  const cache = CacheService.getScriptCache();
  const schluessel = ops.map((o) => CACHE_PRAEFIX_ + 'op:' + String(o && o.op).slice(0, 64));
  const erledigt = ops.length ? cache.getAll(schluessel) : {};
  const merken = {};
  const ergebnisse = [];
  mitSperre_(() => {
    ops.forEach((o, i) => {
      const k = schluessel[i];
      if (typeof erledigt[k] === 'string') {
        ergebnisse.push({ op: o.op, ok: true, ergebnis: JSON.parse(erledigt[k]), wiederholt: true });
        return;
      }
      const args = o && o.args && typeof o.args === 'object' ? o.args : {};
      try {
        pruefe_(o && typeof o.op === 'string' && o.op, 'Änderung ohne Kennung.');
        const aktion = aktionen_()[o.name];
        pruefe_(aktion, 'Unbekannte Aktion: ' + o.name);
        pruefe_(aktion.schreibend && !aktion.oeffentlich && aktion.rollen, 'Gehört nicht in einen Stapel: ' + o.name);
        berechtigt_(aktion, ich);
        const v = new Vorgang_(ich, true);
        const r = aktion.f(v, args, ich);
        v.festschreiben();
        if (v.abgelehnt) throw v.abgelehnt;
        const ergebnis = r === undefined ? null : r;
        ergebnisse.push({ op: o.op, ok: true, ergebnis: ergebnis });
        merken[k] = JSON.stringify(ergebnis);
      } catch (e) {
        if (e instanceof Fehler_ && e.code === 'schon_da' && args.neu_id) {
          ergebnisse.push({ op: o.op, ok: true, ergebnis: { id: String(args.neu_id).toLowerCase() }, wiederholt: true });
          return;
        }
        ergebnisse.push(Object.assign({ op: o && o.op }, fehlerAntwort_(e, o && o.name)));
      }
    });
  });
  if (Object.keys(merken).length) {
    try {
      cache.putAll(merken, CACHE_DAUER_);
    } catch (e) {
      console.warn('Stapel nicht vermerkt: ' + e);
    }
  }
  return { ergebnisse: ergebnisse, stand: standBauen_(ich) };
}

/**
 * Der einzige Einstieg für den Browser.
 *
 * Antwortet immer mit einer JSON-Zeichenkette, nie mit einem Objekt: `google.script.run`
 * lässt ein Objekt, in dem irgendwo ein `Date` steckt, kommentarlos zu `null` werden.
 * Eine Zeichenkette kommt an, wie sie abgeschickt wurde.
 */
function aufruf(token, name, argumente) {
  Speicher_.vergessen();
  const beginn = Date.now();
  try {
    const a = argumente && typeof argumente === 'object' ? argumente : {};
    if (name === 'stapel') {
      const r = stapel_(token, a);
      return JSON.stringify({ ok: true, ergebnis: r.ergebnisse, stand: r.stand, ms: Date.now() - beginn });
    }
    const aktion = aktionen_()[name];
    pruefe_(aktion, 'Unbekannte Aktion: ' + name);
    pruefe_(aktion.oeffentlich || aktion.rollen, 'Aktion ohne Rechteangabe: ' + name);

    let ich = null;
    if (!aktion.oeffentlich) {
      ich = Sitzung_.pruefen(token);
      berechtigt_(aktion, ich);
    }

    let ergebnis;
    if (aktion.schreibend) {
      ergebnis = mitSperre_(() => {
        const v = new Vorgang_(ich, true);
        const r = aktion.f(v, a, ich);
        v.festschreiben();
        if (v.abgelehnt) throw v.abgelehnt;
        return r;
      });
    } else {
      ergebnis = aktion.f(new Vorgang_(ich, false), a, ich);
    }

    const antwort = { ok: true, ergebnis: ergebnis === undefined ? null : ergebnis };
    if (aktion.stand) {
      // Nach der Anmeldung am Hallengerät gibt es `ich` erst jetzt.
      const wer = ergebnis && ergebnis.token ? Sitzung_.pruefen(ergebnis.token) : ich;
      if (wer) antwort.stand = standBauen_(wer);
    }
    antwort.ms = Date.now() - beginn;
    return JSON.stringify(antwort);
  } catch (e) {
    return JSON.stringify(fehlerAntwort_(e, name));
  }
}
