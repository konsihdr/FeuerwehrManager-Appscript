/**
 * Gemeinsam mit dem Browser: was aus den Daten folgt, und die Regeln, die beide Seiten
 * gleich anwenden müssen.
 *
 * ## Warum diese Funktionen zweimal laufen
 *
 * Seit 0.2 wartet die Oberfläche nicht mehr auf die Tabelle. Wer umlagert, sieht das
 * Gerät sofort am neuen Platz; gespeichert wird im Hintergrund (`js_sync.html`). Dafür
 * muss der Browser vorhersagen, was der Server gleich tun wird – welchen Status das
 * Gerät nach dem Grund „Einsatz“ hat, welche Prüfung eine Regel sofort fällig stellt,
 * wie die Arbeitsliste danach aussieht.
 *
 * Eine zweite Fassung dieser Regeln im Browser wäre eine zweite Wahrheit, und die
 * erste Änderung an der einen ließe die andere stehen. Deshalb schickt `doGet` den
 * **Quelltext dieser Funktionen** mit (`gemeinsamerCode_`): Der Browser rechnet mit
 * denselben Zeilen wie der Server. Was er vorhersagt, kann vom Ergebnis nur abweichen,
 * wenn sich zwischendurch jemand anders eingemischt hat – dann gilt beim nächsten
 * Abgleich das des Servers.
 *
 * ## Die Regel für diese Datei
 *
 * **Kein Apps Script und keine Namen von außerhalb** – nur die Funktionen in
 * `GEMEINSAM_` und die Konstanten, die `gemeinsamerCode_` mitschickt (`STATUS`,
 * `EINHEITEN`, `LAGERPLATZ_TYPEN`, `EINSATZ_ARTEN`, im Browser dazu `VORGABEN_`). Die Suite prüft das zweifach:
 * Sie sucht nach Aufrufen fremder `…_`-Funktionen und lässt alles in einem leeren
 * Kontext laufen. Prüfungen geben deshalb einen Text zurück statt zu werfen – `Fehler_`
 * gibt es nur auf dem Server, der Browser hat seine eigenen.
 *
 * Eingabe ist der Datenstand in der Form, die auch der Browser hat: Geräte mit
 * `satz_id`, Fälligkeiten als `stand`, Sätze mit ihren Grunddaten.
 */

// ─────────────────────────────── Datum ───────────────────────────────

function istDatum_(text) {
  return typeof text === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(text);
}

/** Ganze Tage von `von` bis `bis` (beide „yyyy-MM-dd“). Negativ = liegt zurück. */
function tageZwischen_(von, bis) {
  const utc = (iso) => {
    const t = String(iso).slice(0, 10).split('-').map(Number);
    return Date.UTC(t[0], t[1] - 1, t[2]);
  };
  return Math.round((utc(bis) - utc(von)) / 86400000);
}

/**
 * Ein Intervall auf ein Datum addieren. In UTC gerechnet, weil ein Datum hier keine
 * Uhrzeit hat – mit Ortszeit verschöbe die Sommerzeit den Tag. Monatsenden werden
 * gekappt: 31. Januar + 1 Monat ist der 28. (oder 29.) Februar, nicht der 3. März.
 */
function datumPlus_(iso, wert, einheit) {
  const t = String(iso).slice(0, 10).split('-').map(Number);
  if (einheit === 'tage') {
    return new Date(Date.UTC(t[0], t[1] - 1, t[2] + wert)).toISOString().slice(0, 10);
  }
  const monate = einheit === 'jahre' ? wert * 12 : wert;
  const ziel = new Date(Date.UTC(t[0], t[1] - 1 + monate, t[2]));
  if (ziel.getUTCDate() !== t[2]) ziel.setUTCDate(0);
  return ziel.toISOString().slice(0, 10);
}

// ─────────────────────────────── Status und Regeln ───────────────────────────────

/**
 * Was nach der Prüfung mit dem Gerät passiert, wenn niemand etwas anderes sagt.
 *
 *   bestanden       – aus der Werkstatt oder der Reparatur zurück: einsatzbereit.
 *                     War es nur „zu reinigen“, bleibt es das; die Prüfung wäscht nichts.
 *   nicht bestanden – defekt.
 *
 * Ausgemustert bleibt ausgemustert. Wer bewusst nichts ändern will, wählt
 * „unverändert“ – ein eigener Wert, damit er sich von „nichts angegeben“ unterscheidet.
 */
function statusNachPruefung_(aktuell, ergebnis) {
  if (aktuell === 'ausgemustert') return aktuell;
  if (ergebnis === 'nicht_bestanden') return 'defekt';
  return aktuell === 'zur_pruefung' || aktuell === 'defekt' ? 'einsatzbereit' : aktuell;
}

/**
 * Der Status nach einer Buchung mit diesem Grund. `defekt` und `ausgemustert` bleiben
 * stehen: Das sind bewusste Aussagen über das Gerät. Eine Buchung „Übung“ darf ein
 * defektes Gerät nicht gesundschreiben.
 */
function statusNachGrund_(status, grund) {
  if (!grund || !grund.status_danach || status === 'defekt' || status === 'ausgemustert') return status;
  return grund.status_danach;
}

/**
 * Was die Regeln der Wehr nach einem Anlass mit einem Gerät tun – als Plan, nicht als Tat.
 * Der Server schreibt ihn mit `Vorgang_`, der Browser in seinen Datenstand.
 *
 * Bedingungen, die der Anlass nicht kennt, sind nie erfüllt – eine Regel mit Bedingung
 * „Grund: Einsatz“ greift bei keiner Prüfung. Die Aktionen wirken nacheinander: Setzt
 * die erste „defekt“, schreibt die zweite das Gerät nicht wieder gesund.
 */
function regelnPlan_(regeln, ausloeser, g, kontext, stand, heute) {
  const passend = (regeln || [])
    .filter((r) => r.aktiv && r.ausloeser === ausloeser)
    .sort((a, b) => (a.position || 0) - (b.position || 0) || String(a.name).localeCompare(String(b.name)));
  let status = g.status;
  let bemerkung = g.bemerkung || '';
  const faellig = {};
  let treffer = 0;
  passend.forEach((r) => {
    const b = r.bedingungen || {};
    if (b.grund && b.grund !== kontext.grund) return;
    if (b.zielTyp && b.zielTyp !== kontext.zielTyp) return;
    if (b.ergebnis && b.ergebnis !== kontext.ergebnis) return;
    if (b.geraetetyp && b.geraetetyp !== g.geraetetyp_id) return;
    (r.aktionen || []).forEach((a) => {
      if (a.art === 'status_setzen' && STATUS.indexOf(a.status) >= 0) {
        if (status !== 'defekt' && status !== 'ausgemustert') status = a.status;
      } else if (a.art === 'pruefung_faellig') {
        stand
          .filter((s) => s.geraet_id === g.id && s.aktiv && (faellig[s.id] || s.naechste_faellig) > heute && (!a.plan || s.pruefplan_id === a.plan))
          .forEach((s) => {
            faellig[s.id] = heute;
          });
      } else if (a.art === 'notiz' && String(a.text || '').trim()) {
        bemerkung = (bemerkung ? bemerkung + '\n' : '') + String(a.text).trim();
      }
    });
    treffer++;
  });
  const geraet = {};
  if (status !== g.status) geraet.status = status;
  if (bemerkung !== (g.bemerkung || '')) geraet.bemerkung = bemerkung;
  return {
    geraet: geraet,
    stand: Object.keys(faellig).map((id) => ({ id: id, naechste_faellig: faellig[id] })),
    treffer: treffer,
  };
}

/**
 * Eine Regel auf das beschneiden, was `regelnPlan_` versteht – eine Bedingung, die
 * niemand auswertet, sähe in der Liste aus wie eine, die gilt. Ob Gerätetyp und Prüfplan
 * existieren, prüft der Server danach selbst.
 */
function regelBereinigen_(a) {
  const roh = a.bedingungen || {};
  const bedingungen = {};
  if (a.ausloeser === 'umlagerung') {
    if (String(roh.grund || '').trim()) bedingungen.grund = String(roh.grund).trim();
    if (LAGERPLATZ_TYPEN.indexOf(roh.zielTyp) >= 0) bedingungen.zielTyp = roh.zielTyp;
  }
  if (a.ausloeser === 'pruefung' && ['bestanden', 'nicht_bestanden'].indexOf(roh.ergebnis) >= 0) bedingungen.ergebnis = roh.ergebnis;
  if (roh.geraetetyp) bedingungen.geraetetyp = roh.geraetetyp;
  const aktionen = [];
  const liste = Array.isArray(a.aktionen) ? a.aktionen : [];
  for (let i = 0; i < liste.length; i++) {
    const x = liste[i] || {};
    if (x.art === 'status_setzen') {
      if (STATUS.indexOf(x.status) < 0) return { fehler: 'Status setzen: bitte einen Status wählen.' };
      aktionen.push({ art: 'status_setzen', status: x.status });
    } else if (x.art === 'pruefung_faellig') {
      aktionen.push(x.plan ? { art: 'pruefung_faellig', plan: x.plan } : { art: 'pruefung_faellig' });
    } else if (x.art === 'notiz') {
      if (!String(x.text || '').trim()) return { fehler: 'Notiz: bitte einen Text angeben.' };
      aktionen.push({ art: 'notiz', text: String(x.text).trim() });
    } else {
      return { fehler: 'Unbekannte Aktion: ' + x.art };
    }
  }
  if (!aktionen.length) return { fehler: 'Eine Regel ohne Aktion tut nichts.' };
  return { bedingungen: bedingungen, aktionen: aktionen };
}

// ─────────────────────────────── Prüfwesen ───────────────────────────────

/**
 * Was eine erfasste Prüfung am Termin und am Status ändert.
 *
 * Nur eine bestandene Prüfung schiebt den Termin – und eine nachgetragene ältere schiebt
 * ihn nicht zurück. `danach` ist der Status, den die Prüfung festhält (auch „unveraendert“);
 * `status` nur dann gesetzt, wenn er sich wirklich ändert.
 */
function pruefungFolgen_(g, plan, stand, ergebnis, datum, statusDanach) {
  const folgen = { stand: null, status: null, danach: null };
  if (ergebnis === 'bestanden' && stand && (!stand.zuletzt_geprueft || datum >= stand.zuletzt_geprueft)) {
    folgen.stand = {
      naechste_faellig: datumPlus_(datum, stand.abw_wert || plan.intervall_wert, stand.abw_einheit || plan.intervall_einheit),
      zuletzt_geprueft: datum,
    };
  }
  let danach = statusDanach || 'auto';
  if (danach === 'auto') danach = statusNachPruefung_(g.status, ergebnis);
  folgen.danach = danach;
  if (danach !== 'unveraendert' && danach !== g.status) folgen.status = danach;
  return folgen;
}

/**
 * Für ein Gerät alle Pläne seines Typs – und die geräteeigenen dazu.
 *
 * Läuft beim Anlegen und beim Typwechsel. Pläne eines fremden Typs werden abgeschaltet,
 * nicht gelöscht: Ihr Stand („zuletzt geprüft am …“) bleibt lesbar, und wer den Typ
 * zurückstellt, bekommt ihn wieder. Der erste Termin ist heute plus Intervall – ein
 * Gerät, das gerade angelegt wird, ist in aller Regel neu oder gerade durchgesehen.
 */
function faelligkeitenPlan_(g, plaene, stand, heute) {
  const eigene = stand.filter((s) => s.geraet_id === g.id);
  const plan = { neu: [], an: [], aus: [] };
  plaene
    .filter((p) => p.geraetetyp_id === g.geraetetyp_id && (!p.geraet_id || p.geraet_id === g.id))
    .forEach((p) => {
      const da = eigene.find((s) => s.pruefplan_id === p.id);
      if (da) {
        if (!da.aktiv) plan.an.push(da.id);
        return;
      }
      plan.neu.push({
        geraet_id: g.id,
        pruefplan_id: p.id,
        naechste_faellig: datumPlus_(heute, p.intervall_wert, p.intervall_einheit),
        aktiv: true,
      });
    });
  eigene.forEach((s) => {
    const p = plaene.find((x) => x.id === s.pruefplan_id);
    if (s.aktiv && (!p || p.geraetetyp_id !== g.geraetetyp_id)) plan.aus.push(s.id);
  });
  return plan;
}

/**
 * Ein neuer Plan gilt für alle Geräte seines Typs – ein geräteeigener nur für das eine.
 * Sonst bekäme die ganze Baureihe eine Ausnahme, die für ein Exemplar gedacht war.
 */
function planVerteilenPlan_(plan, geraete, stand, heute) {
  return geraete
    .filter((g) => g.geraetetyp_id === plan.geraetetyp_id && g.status !== 'ausgemustert' && (!plan.geraet_id || g.id === plan.geraet_id))
    .filter((g) => !stand.some((s) => s.geraet_id === g.id && s.pruefplan_id === plan.id))
    .map((g) => ({
      geraet_id: g.id,
      pruefplan_id: plan.id,
      naechste_faellig: datumPlus_(heute, plan.intervall_wert, plan.intervall_einheit),
      aktiv: true,
    }));
}

/**
 * Ein korrigiertes Intervall soll wirken, nicht erst nach der nächsten Prüfung. Wer
 * „6 Jahre“ statt „6 Monate“ eingetragen hatte, erwartet, dass die Termine folgen.
 * Neu berechnet wird, wo eine letzte Prüfung bekannt ist und kein geräteeigenes
 * Intervall gilt – sonst gibt es nichts, wovon man rechnen könnte.
 */
function planIntervallFolgen_(plan, stand) {
  return stand
    .filter((s) => s.pruefplan_id === plan.id && s.zuletzt_geprueft && !s.abw_wert)
    .map((s) => ({ id: s.id, naechste_faellig: datumPlus_(s.zuletzt_geprueft, plan.intervall_wert, plan.intervall_einheit) }));
}

/**
 * Termin von Hand, abweichendes Intervall, Plan abschalten. Wert und Einheit gehören
 * zusammen: „7“ ohne Einheit ist keine Abweichung, sondern eine halb gespeicherte. Mit
 * dem Intervall verschiebt sich der nächste Termin – sonst wirkte die Abweichung erst
 * nach der nächsten Prüfung, und das sieht niemand.
 */
function faelligkeitWerte_(s, plan, a) {
  const werte = {};
  if ('naechste_faellig' in a) {
    if (!istDatum_(a.naechste_faellig)) return { fehler: 'Kein gültiges Datum.' };
    werte.naechste_faellig = a.naechste_faellig;
  }
  if ('aktiv' in a) werte.aktiv = !!a.aktiv;
  if ('abw_wert' in a || 'abw_einheit' in a) {
    const wert = a.abw_wert === '' || a.abw_wert == null ? null : Number(a.abw_wert);
    const einheit = a.abw_einheit || null;
    if ((wert === null) !== (einheit === null)) {
      return { fehler: 'Abweichendes Intervall: Wert und Einheit angeben – oder beides leer lassen.' };
    }
    if (!(wert === null || (Number.isInteger(wert) && wert > 0 && EINHEITEN.indexOf(einheit) >= 0))) return { fehler: 'Ungültiges Intervall.' };
    werte.abw_wert = wert;
    werte.abw_einheit = einheit;
    if (s.zuletzt_geprueft && !('naechste_faellig' in a) && plan) {
      werte.naechste_faellig = datumPlus_(s.zuletzt_geprueft, wert || plan.intervall_wert, einheit || plan.intervall_einheit);
    }
  }
  return { werte: werte };
}

// ─────────────────────────────── Stammdaten ───────────────────────────────

/** Hinge der Platz `id` (über Umwege) unter sich selbst, wenn er unter `oberId` käme? */
function lagerplatzZyklus_(lagerplaetze, id, oberId) {
  let ober = oberId;
  const gesehen = {};
  while (ober) {
    if (ober === id) return true;
    if (gesehen[ober]) return false;
    gesehen[ober] = true;
    const o = lagerplaetze.find((l) => l.id === ober);
    ober = o ? o.ober_id : null;
  }
  return false;
}

function satzteilePruefen_(teile) {
  const typen = {};
  for (let i = 0; i < teile.length; i++) {
    const t = teile[i];
    if (typen[t.geraetetyp_id]) return 'Ein Gerätetyp steht doppelt in der Vorlage.';
    typen[t.geraetetyp_id] = true;
    if (!(Number(t.min_anzahl) >= 0 && Number(t.max_anzahl) >= 1 && Number(t.min_anzahl) <= Number(t.max_anzahl))) {
      return 'Anzahl: mindestens 0, höchstens 1 oder mehr, und das Minimum nicht über dem Maximum.';
    }
  }
  return '';
}

/**
 * Eine Einstellung prüfen und in ihre gespeicherte Form bringen. `defs` ist die
 * Beschreibung aus `EINSTELLUNGEN` – auf dem Server direkt, im Browser über `VORGABEN_`.
 */
function einstellungPruefen_(k, roh, defs, lagerplaetze) {
  const def = defs[k];
  if (!def || def.art === 'bild') return { fehler: 'Unbekannte Einstellung: ' + k };
  let wert = roh == null ? '' : String(roh).trim();
  if (def.art === 'zahl') {
    const n = Number(wert);
    if (!(Number.isInteger(n) && n >= def.min && n <= def.max)) {
      return { fehler: def.titel + ': eine ganze Zahl von ' + def.min + ' bis ' + def.max + '.' };
    }
    wert = String(n);
  }
  if (def.art === 'schalter' && wert !== 'ja' && wert !== 'nein') return { fehler: def.titel + ': ja oder nein.' };
  if (k === 'inventur_vermisst_code' && wert &&
    !lagerplaetze.some((l) => String(l.code || '').trim().toLowerCase() === wert.toLowerCase())) {
    return { fehler: 'Einen Lagerplatz mit dem Code „' + wert + '“ gibt es nicht.' };
  }
  return { wert: wert };
}

// ─────────────────────────────── Mitglieder ───────────────────────────────

/**
 * Google-Adresse und Kürzel in die Form bringen, in der sie verglichen werden: die
 * Adresse klein, das Kürzel groß – so steht es auch auf dem Namensschild.
 */
function mitgliedWerte_(a) {
  const werte = {};
  ['name', 'email', 'kuerzel', 'rolle', 'aktiv'].forEach((f) => {
    if (a[f] !== undefined) werte[f] = a[f];
  });
  if (werte.email !== undefined) {
    werte.email = String(werte.email == null ? '' : werte.email).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(werte.email)) return { fehler: 'Bitte die Google-Adresse aus dem Firmenkonto angeben.' };
  }
  if (werte.kuerzel !== undefined) {
    werte.kuerzel = String(werte.kuerzel == null ? '' : werte.kuerzel).trim().toUpperCase();
    if (!(werte.kuerzel === '' || /^[A-Z0-9ÄÖÜ.-]{1,12}$/.test(werte.kuerzel))) {
      return { fehler: 'Kürzel: bis zu 12 Buchstaben oder Ziffern, ohne Leerzeichen.' };
    }
  }
  return { werte: werte };
}

/**
 * Eine Wehr ohne aktiven Administrator ist eine Wehr, in die niemand mehr hineinkommt –
 * außer über die Tabelle selbst.
 */
function letzterAdmin_(mitglieder, ohneId) {
  return !mitglieder.some((m) => m.id !== ohneId && m.aktiv && m.rolle === 'admin');
}

function mitgliedAenderungPruefen_(mitglieder, m, werte, ichId) {
  const bleibtAdmin = (werte.rolle || m.rolle) === 'admin' && (werte.aktiv === undefined ? m.aktiv : !!werte.aktiv);
  if (m.rolle === 'admin' && !bleibtAdmin && letzterAdmin_(mitglieder, m.id)) {
    return 'Das ist der letzte aktive Administrator. Erst einen anderen dazu ernennen.';
  }
  if (m.id === ichId && werte.aktiv === false) return 'Den eigenen Zugang sperrt man nicht selbst.';
  if (m.id === ichId && werte.email !== undefined && werte.email !== String(m.email || '').trim().toLowerCase()) {
    return 'Die eigene Adresse ändert man nicht selbst – sonst ist man im selben Moment draußen.';
  }
  return '';
}

function mitgliedLoeschenPruefen_(mitglieder, m, ichId) {
  if (m.id === ichId) return 'Den eigenen Zugang löscht man nicht selbst.';
  if (m.rolle === 'admin' && letzterAdmin_(mitglieder, m.id)) return 'Das ist der letzte aktive Administrator.';
  return '';
}

// ─────────────────────────────── Personal ───────────────────────────────

function qualiartPruefen_(werte) {
  const wert = werte.gueltig_wert === '' || werte.gueltig_wert == null ? null : Number(werte.gueltig_wert);
  const einheit = werte.gueltig_einheit || null;
  if ((wert === null) !== (einheit === null)) {
    return 'Gültigkeit: Zahl und Einheit angeben – oder beides leer lassen, wenn sie nicht abläuft.';
  }
  if (wert !== null && !(Number.isInteger(wert) && wert > 0 && EINHEITEN.indexOf(einheit) >= 0)) {
    return 'Gültigkeit: eine ganze Zahl größer null.';
  }
  return '';
}

/**
 * Bis wann ein Nachweis gilt, wenn niemand etwas anderes einträgt. Nur ein Vorschlag:
 * Bei der G26.3 hängt die Frist am Alter, und maßgeblich ist das Datum auf der
 * Bescheinigung. Gespeichert wird deshalb das Datum, nicht die Rechnung.
 */
function nachweisBis_(art, erworben) {
  return art && art.gueltig_wert && art.gueltig_einheit && istDatum_(erworben)
    ? datumPlus_(erworben, art.gueltig_wert, art.gueltig_einheit)
    : '';
}

function nachweisPruefen_(werte, art, heute) {
  if (!art) return 'Bitte eine Qualifikation wählen.';
  if (!istDatum_(werte.erworben_am)) return 'Bitte angeben, wann der Nachweis erworben wurde.';
  if (werte.erworben_am > heute) return 'Das Erwerbsdatum liegt in der Zukunft.';
  if (werte.gueltig_bis && !istDatum_(werte.gueltig_bis)) return 'Kein gültiges Datum bei „gültig bis“.';
  if (werte.gueltig_bis && werte.gueltig_bis < werte.erworben_am) return '„Gültig bis“ liegt vor dem Erwerb.';
  if (art.gueltig_wert && !werte.gueltig_bis) return art.name + ' läuft ab – bitte „gültig bis“ angeben.';
  return '';
}

/**
 * Je (Mitglied, Art) zählt für jede Aussage über heute genau EIN Nachweis: unbefristet
 * schlägt befristet, sonst das späteste Ablaufdatum, bei Gleichstand das spätere
 * Erwerbsdatum. Die übrigen bleiben als Beleg stehen, behaupten aber nichts mehr.
 *
 * Übernommen aus dem SaaS-Produkt (1j): Dort galt jeder, der seine G26.3 je hatte
 * verlängern müssen, für immer als abgelaufen – der alte Beleg sagte es, und niemand
 * widersprach.
 */
function nachweiseAktuell_(nachweise) {
  const aktuell = {};
  nachweise.forEach((n) => {
    const m = (aktuell[n.mitglied_id] = aktuell[n.mitglied_id] || {});
    const da = m[n.art_id];
    if (!da) {
      m[n.art_id] = n;
      return;
    }
    let besser;
    if (!n.gueltig_bis !== !da.gueltig_bis) besser = !n.gueltig_bis;
    else if (String(n.gueltig_bis || '') !== String(da.gueltig_bis || '')) besser = String(n.gueltig_bis) > String(da.gueltig_bis);
    else besser = String(n.erworben_am || '') > String(da.erworben_am || '');
    if (besser) m[n.art_id] = n;
  });
  return aktuell;
}

/**
 * Atemschutz und ablaufende Nachweise.
 *
 * Atemschutztauglich ist, wer für JEDE aktive Art mit „Voraussetzung für Atemschutz“
 * einen gültigen aktuellen Nachweis hat – typisch G26.3, Lehrgang und Belastungsübung.
 *
 *   tauglich       – alles da, nichts abgelaufen
 *   abgelaufen     – mindestens einer davon ist abgelaufen
 *   unvollstaendig – einer fehlt ganz
 *   keiner         – gar keiner: kein Atemschutzgeräteträger
 *
 * In der Aktionsliste steht jeder aktuelle befristete Nachweis aktiver Mitglieder, der
 * innerhalb der Vorwarnzeit abläuft oder schon abgelaufen ist – nicht die ersetzten.
 */
function personalAbleiten_(d) {
  const heute = d.heute;
  const vorwarnung = Number(d.einstellungen.vorwarnung_personal_tage) || 60;
  const ausEinsatz = einsatzNachweise_(d);
  const aktuell = nachweiseAktuell_((d.nachweise || []).concat(ausEinsatz));
  const artNach = {};
  (d.qualiarten || []).forEach((a) => {
    artNach[a.id] = a;
  });
  const pflicht = (d.qualiarten || []).filter((a) => a.atemschutz && a.aktiv).map((a) => a.id);
  const atemschutz = {};
  const faellig = [];
  (d.mitglieder || []).forEach((m) => {
    const eigene = aktuell[m.id] || {};
    const da = pflicht.filter((id) => eigene[id]);
    let zustand = 'keiner';
    if (da.length) {
      if (da.some((id) => eigene[id].gueltig_bis && eigene[id].gueltig_bis < heute)) zustand = 'abgelaufen';
      else if (da.length < pflicht.length) zustand = 'unvollstaendig';
      else zustand = 'tauglich';
    }
    atemschutz[m.id] = zustand;
    if (!m.aktiv) return;
    Object.keys(eigene).forEach((artId) => {
      const n = eigene[artId];
      const art = artNach[artId];
      if (!n.gueltig_bis || !art || !art.aktiv) return;
      const tage = tageZwischen_(heute, n.gueltig_bis);
      if (tage <= vorwarnung) {
        faellig.push({ id: n.id, mitglied_id: m.id, art_id: artId, gueltig_bis: n.gueltig_bis, tage: tage, abgelaufen: tage < 0 });
      }
    });
  });
  faellig.sort((a, b) => a.tage - b.tage);
  const aktuelleIds = {};
  Object.keys(aktuell).forEach((m) => Object.keys(aktuell[m]).forEach((a) => {
    aktuelleIds[aktuell[m][a].id] = true;
  }));
  const zaehle = (z) => (d.mitglieder || []).filter((m) => m.aktiv && atemschutz[m.id] === z).length;
  return {
    atemschutz: atemschutz,
    aktuell: aktuelleIds,
    ausEinsatz: ausEinsatz,
    faellig: faellig,
    vorwarnung: vorwarnung,
    tauglich: zaehle('tauglich'),
    traeger: (d.mitglieder || []).filter((m) => m.aktiv && atemschutz[m.id] !== 'keiner').length,
    abgelaufen: faellig.filter((f) => f.abgelaufen).length,
    bald: faellig.filter((f) => !f.abgelaufen).length,
  };
}

// ─────────────────────────────── Einsätze ───────────────────────────────

function istZeit_(text) {
  return typeof text === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text) && Number.isFinite(Date.parse(text));
}

/**
 * Der Kalendertag eines Zeitpunkts in der Ortszeit – nicht in UTC: Der Einsatz um 0:30 an
 * Neujahr gehört ins neue Jahr, auch wenn es in London noch das alte ist.
 */
function tagVon_(iso) {
  const d = new Date(iso);
  if (!iso || isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function minuten_(von, bis) {
  const a = Date.parse(von);
  const b = Date.parse(bis);
  return Number.isFinite(a) && Number.isFinite(b) && b > a ? Math.round((b - a) / 60000) : 0;
}

/** „2:45 h“ – für einen Zeitraum. */
function dauerText_(minuten) {
  return Math.floor(minuten / 60) + ':' + String(minuten % 60).padStart(2, '0') + ' h';
}

/** „31,5 h“ – für eine Summe. */
function stundenText_(minuten) {
  return String(Math.round(minuten / 6) / 10).replace('.', ',') + ' h';
}

/** Die Kopfdaten eines Berichts in ihrer gespeicherten Form. */
function einsatzWerte_(a) {
  const werte = {};
  ['art', 'nummer', 'stichwort', 'bezeichnung', 'ort', 'einsatzleiter', 'beginn', 'ende', 'bericht'].forEach((f) => {
    if (a[f] !== undefined) werte[f] = f === 'bericht' ? String(a[f] == null ? '' : a[f]).replace(/\s+$/, '') : String(a[f] == null ? '' : a[f]).trim();
  });
  if (werte.ende === '') werte.ende = null;
  return werte;
}

function einsatzPruefen_(w) {
  if (EINSATZ_ARTEN.indexOf(w.art) < 0) return 'Bitte angeben, was es war: Einsatz, Übung, Wache oder sonstiger Dienst.';
  if (!String(w.bezeichnung || '').trim()) return 'Bitte eine Bezeichnung angeben, etwa „Wohnungsbrand Lindenstraße“.';
  if (!istZeit_(w.beginn)) return 'Bitte angeben, wann es begann.';
  if (w.ende && !istZeit_(w.ende)) return 'Kein gültiges Ende.';
  if (w.ende && Date.parse(w.ende) < Date.parse(w.beginn)) return 'Das Ende liegt vor dem Beginn.';
  // Eine Zelle der Tabelle fasst 50 000 Zeichen.
  if (String(w.bericht || '').length > 40000) return 'Der Bericht ist zu lang (höchstens 40 000 Zeichen).';
  return '';
}

/**
 * Eine Einsatzkraft in ihrer gespeicherten Form. Ein Mitglied trägt seinen Namen als
 * Momentaufnahme; Gastkräfte und Fahrzeuge haben nur den Namen. Unter Atemschutz kann nur
 * ein Mensch gewesen sein.
 */
function kraftWerte_(k, mitglied) {
  const art = k.art === 'mittel' ? 'mittel' : k.art === 'person' || k.art === undefined ? 'person' : '';
  if (!art) return { fehler: 'Unbekannte Art der Einsatzkraft.' };
  const werte = {
    art: art,
    mitglied_id: art === 'person' && mitglied ? mitglied.id : null,
    name: art === 'person' && mitglied ? mitglied.name : String(k.name == null ? '' : k.name).trim(),
    von: String(k.von || '').trim(),
    bis: String(k.bis || '').trim(),
    atemschutz: art === 'person' && !!k.atemschutz,
    funktion: String(k.funktion == null ? '' : k.funktion).trim(),
  };
  if (!werte.name) return { fehler: 'Bitte einen Namen angeben.' };
  if (!istZeit_(werte.von) || !istZeit_(werte.bis)) return { fehler: werte.name + ': bitte angeben, von wann bis wann.' };
  if (Date.parse(werte.bis) < Date.parse(werte.von)) return { fehler: werte.name + ': „bis“ liegt vor „von“.' };
  if (minuten_(werte.von, werte.bis) > 7 * 24 * 60) return { fehler: werte.name + ': mehr als eine Woche am Stück – bitte die Zeiten prüfen.' };
  return { werte: werte };
}

/**
 * Den letzten Dienst unter Atemschutz je Mitglied fortschreiben. Es zählen Einsätze und
 * Übungen; eine Brandsicherheitswache unter Atemschutz gibt es praktisch nicht. Bei zwei
 * am selben Tag entscheidet die Kennung – nur damit Server und Browser denselben nehmen.
 */
function atemschutzMerken_(letzter, einsatz, k) {
  if (!einsatz || !k.atemschutz || !k.mitglied_id || k.art !== 'person') return;
  if (einsatz.art !== 'einsatz' && einsatz.art !== 'uebung') return;
  const tag = tagVon_(k.von);
  const da = letzter[k.mitglied_id];
  if (!da || tag > da.datum || (tag === da.datum && einsatz.id > da.einsatz_id)) letzter[k.mitglied_id] = { datum: tag, einsatz_id: einsatz.id };
}

/**
 * Nachweise, die aus den Einsatzberichten folgen – für jede aktive Art mit „aus_einsatz“
 * der letzte Einsatz oder die letzte Übung unter Atemschutz.
 *
 * Abgeleitet, nicht erfasst: Wer nach dem Einsatz den Bericht übernimmt, hat den Nachweis
 * damit schon erbracht. Eine zweite Liste, die jemand nachtragen müsste, wäre nach einem
 * Monat unvollständig (SaaS, Entscheidung vom 2026-08-07). Und wer einen Bericht berichtigt
 * oder löscht, berichtigt den Nachweis gleich mit.
 *
 * `d.atemschutzVorher` bringt der Server für alles mit, was älter ist als der Zeitraum, den
 * der Browser bekommt (`einsatzZeitraum`) – sonst verlöre, wer zwei Jahre kein Atemschutz
 * getragen hat, seinen Nachweis im Browser früher als auf dem Server.
 */
function einsatzNachweise_(d) {
  const arten = (d.qualiarten || []).filter((a) => a.aus_einsatz && a.aktiv);
  if (!arten.length || !d.einsaetze) return [];
  const letzter = {};
  Object.keys(d.atemschutzVorher || {}).forEach((m) => {
    letzter[m] = d.atemschutzVorher[m];
  });
  const einsatzNach = {};
  d.einsaetze.forEach((e) => {
    einsatzNach[e.id] = e;
  });
  (d.einsatzkraefte || []).forEach((k) => atemschutzMerken_(letzter, einsatzNach[k.einsatz_id], k));
  const aus = [];
  Object.keys(letzter).sort().forEach((m) => {
    const x = letzter[m];
    if (!x.datum || x.datum > d.heute) return;
    arten.forEach((a) => aus.push({
      id: 'einsatz:' + a.id + ':' + m,
      mitglied_id: m,
      art_id: a.id,
      erworben_am: x.datum,
      gueltig_bis: nachweisBis_(a, x.datum) || null,
      einsatz_id: x.einsatz_id,
      abgeleitet: true,
    }));
  });
  return aus;
}

/**
 * Was ein Dienst an Kräften und Stunden hatte. Personenstunden zählen nur Menschen;
 * wer zweimal dabei war, zählt einmal als Person, aber mit beiden Zeiträumen.
 */
function einsatzSumme_(kraefte) {
  const personen = {};
  const summe = { personen: 0, mitglieder: 0, minuten: 0, atemschutz: 0, mittel: 0 };
  const mittel = {};
  kraefte.forEach((k) => {
    if (k.art === 'mittel') {
      mittel[k.name] = true;
      return;
    }
    const wer = k.mitglied_id || 'name:' + k.name;
    if (!personen[wer]) personen[wer] = { mitglied: !!k.mitglied_id, atemschutz: false };
    if (k.atemschutz) personen[wer].atemschutz = true;
    summe.minuten += minuten_(k.von, k.bis);
  });
  Object.keys(personen).forEach((p) => {
    summe.personen++;
    if (personen[p].mitglied) summe.mitglieder++;
    if (personen[p].atemschutz) summe.atemschutz++;
  });
  summe.mittel = Object.keys(mittel).length;
  return summe;
}

/**
 * Stunden je Mitglied in einem Jahr, getrennt nach Art des Dienstes. Gezählt wird, was
 * der Bericht sagt: Je Dienst einmal, mit allen Zeiträumen zusammen.
 */
function einsatzStunden_(einsaetze, kraefte, jahr) {
  const einsatzNach = {};
  einsaetze.forEach((e) => {
    if (!jahr || tagVon_(e.beginn).slice(0, 4) === String(jahr)) einsatzNach[e.id] = e;
  });
  const je = {};
  kraefte.forEach((k) => {
    const e = einsatzNach[k.einsatz_id];
    if (!e || k.art !== 'person' || !k.mitglied_id) return;
    let m = je[k.mitglied_id];
    if (!m) {
      m = je[k.mitglied_id] = { mitglied_id: k.mitglied_id, minuten: 0, dienste: 0, atemschutz: 0, arten: {}, gesehen: {}, unterAtemschutz: {} };
      EINSATZ_ARTEN.forEach((art) => {
        m.arten[art] = { anzahl: 0, minuten: 0 };
      });
    }
    // Von Hand im Blatt geändert und nicht mehr bekannt: zählt als sonstiger Dienst.
    const art = m.arten[e.art] ? e.art : 'sonstiges';
    const minuten = minuten_(k.von, k.bis);
    m.minuten += minuten;
    m.arten[art].minuten += minuten;
    if (!m.gesehen[e.id]) {
      m.gesehen[e.id] = true;
      m.dienste++;
      m.arten[art].anzahl++;
    }
    if (k.atemschutz && !m.unterAtemschutz[e.id]) {
      m.unterAtemschutz[e.id] = true;
      m.atemschutz++;
    }
  });
  return Object.keys(je).map((id) => {
    const m = je[id];
    return { mitglied_id: id, minuten: m.minuten, dienste: m.dienste, atemschutz: m.atemschutz, arten: m.arten };
  });
}

// ─────────────────────────────── Inventur ───────────────────────────────

/**
 * Der Befund eines Zählgangs aus Soll und Fundliste.
 *
 *   gefunden – lag hier und sollte hier liegen
 *   fehlt    – sollte hier liegen und lag nicht hier
 *   fremd    – lag hier und gehört woanders hin
 *
 * Ausgemusterte stehen nicht im Soll und können deshalb nicht fehlen.
 */
function inventurBefund_(geraete, ortId, gefundenIds) {
  const gefunden = {};
  (gefundenIds || []).forEach((id) => {
    gefunden[String(id)] = true;
  });
  const befund = { gefunden: [], fehlt: [], fremd: [] };
  geraete.forEach((g) => {
    if (g.lagerplatz_id === ortId && g.status !== 'ausgemustert') befund[gefunden[g.id] ? 'gefunden' : 'fehlt'].push(g.id);
    else if (gefunden[g.id] && g.lagerplatz_id !== ortId) befund.fremd.push(g.id);
  });
  return befund;
}

// ─────────────────────────────── Das Abgeleitete ───────────────────────────────

/**
 * Alles Abgeleitete auf einmal – ergänzt `d` und gibt es zurück.
 *
 * Arbeitsliste: Prüfungen aus dem Plan, Reinigung und Reparatur aus dem Status.
 * Ausgemusterte Geräte stehen nicht darin. Ein Gerät, das defekt UND fällig ist, steht
 * zweimal: Das sind zwei verschiedene Arbeiten, und die eine erledigt die andere nicht.
 *
 * Satzstand in drei Stufen – vollständig, unvollständig (Mindestbestand unterschritten),
 * abweichend (Höchstbestand überschritten oder ein Teil gehört nicht zur Vorlage).
 * „Abweichend“ blockiert nichts: Im Einsatzfall muss buchbar bleiben, was da ist.
 * Ausgemusterte Teile zählen nicht mit.
 */
function ableiten_(d) {
  const heute = d.heute;
  const vorwarnung = Number(d.einstellungen.vorwarnung_pruefung_tage) || 30;
  const geraetNach = {};
  d.geraete.forEach((g) => {
    geraetNach[g.id] = g;
  });
  const planNach = {};
  d.plaene.forEach((p) => {
    planNach[p.id] = p;
  });

  const bestand = {};
  d.geraete.forEach((g) => {
    if (g.status !== 'ausgemustert') bestand[g.lagerplatz_id] = (bestand[g.lagerplatz_id] || 0) + 1;
  });
  d.lagerplaetze.forEach((l) => {
    l.bestand = bestand[l.id] || 0;
  });

  const liste = [];
  d.stand.forEach((s) => {
    if (!s.aktiv) return;
    const g = geraetNach[s.geraet_id];
    const p = planNach[s.pruefplan_id];
    if (!g || !p || g.status === 'ausgemustert') return;
    const tage = tageZwischen_(heute, s.naechste_faellig);
    liste.push({
      art: 'pruefung',
      id: s.id,
      geraet_id: g.id,
      plan_id: p.id,
      faellig: s.naechste_faellig,
      zuletzt: s.zuletzt_geprueft,
      tage: tage,
      ueberfaellig: tage < 0,
      werkstatt: g.status === 'zur_pruefung',
      intervall_wert: s.abw_wert || p.intervall_wert,
      intervall_einheit: s.abw_einheit || p.intervall_einheit,
    });
  });
  d.geraete.forEach((g) => {
    if (g.status === 'zu_reinigen' || g.status === 'defekt') {
      liste.push({ art: g.status === 'zu_reinigen' ? 'reinigung' : 'reparatur', id: 'z-' + g.id, geraet_id: g.id });
    }
  });
  d.arbeitsliste = liste;

  const glieder = {};
  d.geraete.forEach((g) => {
    if (g.satz_id) (glieder[g.satz_id] = glieder[g.satz_id] || []).push(g);
  });
  d.saetze.forEach((s) => {
    const alle = glieder[s.id] || [];
    const aktiv = alle.filter((g) => g.status !== 'ausgemustert');
    const orte = alle.map((g) => g.lagerplatz_id).filter((o, i, a) => a.indexOf(o) === i);
    const fehlt = [];
    const zuviel = [];
    let fremd = [];
    if (s.satzart_id) {
      const soll = d.satzteile.filter((t) => t.satzart_id === s.satzart_id);
      soll.forEach((t) => {
        const ist = aktiv.filter((g) => g.geraetetyp_id === t.geraetetyp_id).length;
        if (ist < t.min_anzahl) fehlt.push({ geraetetyp_id: t.geraetetyp_id, ist: ist, soll: t.min_anzahl });
        if (ist > t.max_anzahl) zuviel.push({ geraetetyp_id: t.geraetetyp_id, ist: ist, soll: t.max_anzahl });
      });
      const erlaubt = soll.map((t) => t.geraetetyp_id);
      fremd = aktiv.filter((g) => erlaubt.indexOf(g.geraetetyp_id) < 0).map((g) => g.id);
    }
    s.teile = alle.map((g) => g.id);
    s.standort_id = orte.length === 1 ? orte[0] : null;
    s.verteilt = orte.length > 1;
    s.vollstaendigkeit = fehlt.length ? 'unvollstaendig' : zuviel.length || fremd.length ? 'abweichend' : 'vollstaendig';
    s.fehlt = fehlt;
    s.zuviel = zuviel;
    s.fremd = fremd;
  });

  const imDienst = d.geraete.filter((g) => g.status !== 'ausgemustert');
  const mitPlan = {};
  d.stand.forEach((s) => {
    if (s.aktiv) mitPlan[s.geraet_id] = true;
  });
  const zaehle = (status) => d.geraete.filter((g) => g.status === status).length;
  d.kennzahlen = {
    geraete: imDienst.length,
    lagerplaetze: d.lagerplaetze.length,
    typen: d.typen.length,
    vorwarnung: vorwarnung,
    ueberfaellig: liste.filter((a) => a.art === 'pruefung' && a.ueberfaellig).length,
    bald: liste.filter((a) => a.art === 'pruefung' && !a.ueberfaellig && a.tage <= vorwarnung).length,
    ohnePlan: imDienst.filter((g) => !mitPlan[g.id]).length,
    zu_reinigen: zaehle('zu_reinigen'),
    zur_pruefung: zaehle('zur_pruefung'),
    defekt: zaehle('defekt'),
    saetze: d.saetze.length,
    saetzeUnvollstaendig: d.saetze.filter((s) => s.vollstaendigkeit === 'unvollstaendig').length,
    saetzeAbweichend: d.saetze.filter((s) => s.vollstaendigkeit === 'abweichend').length,
  };

  d.personal = d.nachweise ? personalAbleiten_(d) : null;
  return d;
}

// ─────────────────────────────── Auslieferung ───────────────────────────────

const GEMEINSAM_ = [
  istDatum_, tageZwischen_, datumPlus_,
  statusNachPruefung_, statusNachGrund_, regelnPlan_, regelBereinigen_,
  pruefungFolgen_, faelligkeitenPlan_, planVerteilenPlan_, planIntervallFolgen_, faelligkeitWerte_,
  lagerplatzZyklus_, satzteilePruefen_, einstellungPruefen_,
  mitgliedWerte_, letzterAdmin_, mitgliedAenderungPruefen_, mitgliedLoeschenPruefen_,
  qualiartPruefen_, nachweisBis_, nachweisPruefen_, nachweiseAktuell_, personalAbleiten_,
  istZeit_, tagVon_, minuten_, dauerText_, stundenText_, einsatzWerte_, einsatzPruefen_, kraftWerte_,
  atemschutzMerken_, einsatzNachweise_, einsatzSumme_, einsatzStunden_,
  inventurBefund_, ableiten_,
];

/**
 * Was der Browser aus dem Schema wissen muss, um eine Eingabe vorab zu prüfen und eine
 * Änderung vorherzusagen: Eindeutigkeit, Verweise samt Löschregel, Spalten und Vorgaben,
 * die Einstellungen. Daten, keine Regeln – angewandt werden sie im Browser von
 * `js_sync.html` genauso wie hier von `Vorgang_`.
 */
function vorgabenFuerBrowser_() {
  const eindeutig = {};
  const verweise = {};
  const spalten = {};
  const vorgaben = {};
  Object.keys(SCHEMA).forEach((name) => {
    const s = SCHEMA[name];
    eindeutig[name] = (s.eindeutig || []).map((r) => ({ spalten: r.spalten || [r.spalte], klein: !!r.klein, text: r.text }));
    spalten[name] = {};
    Object.keys(s.spalten).forEach((sp) => {
      const t = s.spalten[sp];
      spalten[name][sp] = typeof t === 'string' ? t : t.art;
      if (typeof t === 'object' && t.ziel) {
        (verweise[t.ziel] = verweise[t.ziel] || []).push({ tabelle: name, spalte: sp, regel: t.beiLoeschen, text: t.text });
      }
    });
    vorgaben[name] = s.vorgaben || {};
  });
  return { eindeutig: eindeutig, verweise: verweise, spalten: spalten, vorgaben: vorgaben, einzahl: EINZAHL_, einstellungen: EINSTELLUNGEN };
}

/** Der Quelltext für den Browser – dieselben Zeilen, kein Nachbau. */
function gemeinsamerCode_() {
  return [
    '/* Aus 05_Gemeinsam.js – vom Server mitgeschickt, nicht von Hand ändern. */',
    'const STATUS = ' + JSON.stringify(STATUS) + ';',
    'const EINHEITEN = ' + JSON.stringify(EINHEITEN) + ';',
    'const LAGERPLATZ_TYPEN = ' + JSON.stringify(LAGERPLATZ_TYPEN) + ';',
    'const EINSATZ_ARTEN = ' + JSON.stringify(EINSATZ_ARTEN) + ';',
    'const VORGABEN_ = ' + JSON.stringify(vorgabenFuerBrowser_()) + ';',
  ].concat(GEMEINSAM_.map((f) => f.toString())).join('\n\n');
}
