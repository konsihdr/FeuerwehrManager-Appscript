/**
 * Demo-Daten: eine Wehr, die aussieht, als würde mit ihr gearbeitet.
 *
 * Übernommen aus `supabase/demo-daten.sql` des SaaS-Produkts, mit denselben drei
 * Eigenschaften:
 *
 *   1. **Es weigert sich, in einen benutzten Bestand zu schreiben.** Demo-Geräte, die
 *      sich mit echten mischen, lassen sich hinterher nicht mehr davon trennen.
 *   2. **Gebucht wird über `umlagern_`.** Sonst stünde die Regel „welcher Grund führt
 *      zu welchem Status“ ein zweites Mal hier, und beim nächsten Wechsel würde eine
 *      der beiden Stellen vergessen. Nur die Uhr wird für jede Buchung zurückgestellt.
 *   3. **Regeln kommen zuletzt.** Eine Regel wirkt auf jede Buchung nach ihr; stünde sie
 *      oben, hätte sie die Historie umgeschrieben, die hier gerade entsteht.
 *
 * Danach hat die Aktionsliste alle drei Vorgangsarten (überfällige Prüfungen, zu
 * Reinigendes, Defektes), das Protokoll ist gefüllt, jeder Satzzustand kommt einmal
 * vor – und im Personal jeder Atemschutz-Zustand: tauglich, bald fällig, abgelaufen,
 * verlängert, unvollständig, keiner. Dazu jede Art von Dienst einmal, ein Bericht aus dem
 * Einsatztagebuch und einer, der älter ist als das, was der Browser bekommt.
 */

const DEMO_BARCODES_ = [
  'IT-PA-0001', 'IT-PA-0002', 'IT-PA-0003', 'IT-PA-0004',
  'IT-MASKE-0001', 'IT-MASKE-0002', 'IT-MASKE-0003', 'IT-MASKE-0004',
  'IT-LA-0001', 'IT-LA-0002', 'IT-LA-0003', 'IT-LA-0004',
  'IT-FLASCHE-0001', 'IT-FLASCHE-0002', 'IT-FLASCHE-0003', 'IT-FLASCHE-0004', 'IT-FLASCHE-0005', 'IT-FLASCHE-0006',
  'IT-SCHL-B-0001', 'IT-SCHL-B-0002', 'IT-SCHL-B-0003', 'IT-SCHL-B-0004',
  'IT-SCHL-C-0001', 'IT-SCHL-C-0002', 'IT-SCHL-C-0003', 'IT-SCHL-C-0004',
  'IT-LOESCH-0001', 'IT-LOESCH-0002', 'IT-HELM-0001', 'IT-HELM-0002', 'IT-HELM-0003',
  'IT-SAEGE-0001', 'IT-SCHERE-0001',
];

function demoEinspielen_() {
  return mitSperre_(() => {
    Speicher_.vergessen();
    const v = new Vorgang_(null, true);
    const fremde = v.alle('geraete').filter((g) => DEMO_BARCODES_.indexOf(g.barcode) < 0);
    pruefe_(!fremde.length, 'In der Tabelle stehen bereits ' + fremde.length + ' Geräte, die nicht aus den ' +
      'Demo-Daten stammen. Demo-Daten gehören in eine eigene, leere Tabelle.');
    pruefe_(!v.alle('buchungen').length, 'Die Demo-Daten sind schon eingespielt.');

    // Wer bucht? Der erste Administrator – er hat die Demo-Daten bestellt.
    const admin = v.alle('mitglieder').find((m) => m.rolle === 'admin' && m.aktiv);
    v.ich = admin ? { id: admin.id, name: admin.name } : null;

    const heute = heute_();
    const vorTagen = (tage, stunde) => {
      const d = new Date(Date.now() - tage * 86400000);
      d.setHours(stunde || 9, 15, 0, 0);
      return d.toISOString();
    };
    v.zeit = vorTagen(30, 8);

    // Nur, wo die Wehr noch nichts eingetragen hat.
    if (!v.finde('einstellungen', 'wehr_name')) einstellungSetzen_(v, 'wehr_name', 'FF Musterstadt');
    if (!v.finde('einstellungen', 'wehr_zusatz')) einstellungSetzen_(v, 'wehr_zusatz', 'Löschzug Mitte');

    // ─────────────── Lagerplätze ───────────────
    const ort = {};
    [
      ['Fahrzeughalle', 'LOC-HALLE', 'sonstige'],
      ['Lager Hauptwache', 'LOC-LAGER', 'lager'],
      ['Werkstatt Atemschutz', 'LOC-WERK', 'werkstatt'],
      ['Füllstation', 'LOC-FUELL', 'sonstige'],
      ['LF 10', 'LOC-LF10', 'fahrzeug'],
      ['DLK 23', 'LOC-DLK23', 'fahrzeug'],
      ['MTW', 'LOC-MTW', 'fahrzeug'],
      ['Vermisst', 'LOC-VERMISST', 'sonstige'],
    ].forEach((x) => {
      ort[x[1]] = v.einfuegen('lagerplaetze', { name: x[0], code: x[1], typ: x[2] });
    });
    // Die Fahrzeuge stehen in der Halle.
    ['LOC-LF10', 'LOC-DLK23', 'LOC-MTW'].forEach((c) => v.aendern('lagerplaetze', ort[c].id, { ober_id: ort['LOC-HALLE'].id }));
    einstellungSetzen_(v, 'inventur_vermisst_code', 'LOC-VERMISST');

    // ─────────────── Umlagerungsgründe ───────────────
    // Keine Demo-Daten im engeren Sinn: Ohne sie hat der Buchungsdialog nichts anzubieten.
    const grund = {};
    [
      ['Einsatz', 'Nach dem Einsatz zurück – das Gerät muss gereinigt werden.', 'zu_reinigen'],
      ['Übung', 'Nach der Übung zurück – nur wieder einsatzbereit machen.', 'einsatzbereit'],
      ['Zur Prüfung', 'Geht in die Werkstatt und wartet dort auf die Prüfung.', 'zur_pruefung'],
      ['Defekt gemeldet', 'Ist beschädigt und darf nicht mehr eingesetzt werden.', 'defekt'],
      ['Umräumen', 'Reine Standortänderung, der Zustand bleibt, wie er ist.', ''],
    ].forEach((x, i) => {
      const da = v.alle('gruende').find((g) => g.name === x[0]);
      grund[x[0]] = da || v.einfuegen('gruende', { name: x[0], beschreibung: x[1], status_danach: x[2], position: i + 1 });
    });
    grundInventur_(v);

    // ─────────────── Gerätetypen, Prüfpläne, Prüfschritte ───────────────
    const typ = {};
    [
      ['Pressluftatmer', 'Dräger', 'PA 94 Plus', 'Umluftunabhängiges Atemschutzgerät, 300 bar'],
      ['Atemschutzmaske', 'Dräger', 'FPS 7000', 'Vollmaske mit Überdruckanschluss'],
      ['Lungenautomat', 'Dräger', 'PSS', 'Überdruck, Steckanschluss'],
      ['Atemluftflasche', 'Luxfer', '6,8 l / 300 bar', 'Composite-Flasche'],
      ['B-Druckschlauch', 'Oswald', 'B 75 / 20 m', 'Formstabil, 20 m'],
      ['C-Druckschlauch', 'Oswald', 'C 42 / 15 m', 'Formstabil, 15 m'],
      ['Feuerlöscher', 'Gloria', 'PG 6', 'Pulverlöscher 6 kg, ABC'],
      ['Feuerwehrhelm', 'Dräger', 'HPS 7000', 'Mit Nackenschutz und Visier'],
      ['Motorkettensäge', 'Stihl', 'MS 261 C-M', 'Für die technische Hilfeleistung'],
      ['Rettungsschere', 'Weber', 'RSX 165-65', 'Hydraulisch, mit Aggregat'],
    ].forEach((x) => {
      typ[x[0]] = v.einfuegen('geraetetypen', { name: x[0], hersteller: x[1], modell: x[2], beschreibung: x[3] });
    });

    const plan = {};
    [
      ['Pressluftatmer', 'Halbjahresprüfung', 6, 'monate', 'Sicht-, Dicht- und Funktionsprüfung nach vfdb 0804'],
      ['Pressluftatmer', 'Grundüberholung', 6, 'jahre', 'Vollständige Zerlegung durch die Fachwerkstatt'],
      ['Atemschutzmaske', 'Halbjahresprüfung', 6, 'monate', 'Sichtprüfung, Dichtprüfung, Ausatemventil'],
      ['Lungenautomat', 'Halbjahresprüfung', 6, 'monate', 'Statischer Druck, Ansprechdruck, Dichtheit'],
      ['Atemluftflasche', 'Sichtprüfung', 1, 'jahre', 'Äußere Sichtprüfung durch den Gerätewart'],
      ['Atemluftflasche', 'Wiederkehrende Prüfung', 5, 'jahre', 'Druckprüfung durch die benannte Stelle'],
      ['B-Druckschlauch', 'Druckprüfung', 1, 'jahre', 'Prüfdruck nach DIN 14811'],
      ['C-Druckschlauch', 'Druckprüfung', 1, 'jahre', 'Prüfdruck nach DIN 14811'],
      ['Feuerlöscher', 'Wartung', 2, 'jahre', 'Wartung durch den Sachkundigen'],
      ['Motorkettensäge', 'Wartung', 1, 'jahre', 'Kettenbremse, Fangbolzen, Schwertzustand'],
      ['Rettungsschere', 'Jahresprüfung', 1, 'jahre', 'Sicht- und Funktionsprüfung, Hydraulikschläuche'],
      ['Rettungsschere', 'Sachkundigenprüfung', 3, 'jahre', 'Durch den Hersteller oder eine Fachwerkstatt'],
    ].forEach((x) => {
      plan[x[0] + '/' + x[1]] = v.einfuegen('pruefplaene', {
        geraetetyp_id: typ[x[0]].id, name: x[1], intervall_wert: x[2], intervall_einheit: x[3], beschreibung: x[4],
      });
    });

    [
      ['Pressluftatmer/Halbjahresprüfung', 'Sichtprüfung Trageeinrichtung', 'haken', '', true, 'Gurte, Nähte, Schnallen'],
      ['Pressluftatmer/Halbjahresprüfung', 'Hochdruckdichtheit', 'messwert', 'bar', true, 'Druckabfall in einer Minute'],
      ['Pressluftatmer/Halbjahresprüfung', 'Ansprechdruck Warneinrichtung', 'messwert', 'bar', true, 'Sollwert 55 ± 5 bar'],
      ['Pressluftatmer/Halbjahresprüfung', 'Funktionsprüfung Lungenautomat', 'haken', '', true, ''],
      ['Pressluftatmer/Halbjahresprüfung', 'Bemerkungen', 'text', '', false, 'Auffälligkeiten, getauschte Teile'],
      ['Atemschutzmaske/Halbjahresprüfung', 'Sichtprüfung Maskenkörper', 'haken', '', true, 'Risse, Verhärtungen, Bänderung'],
      ['Atemschutzmaske/Halbjahresprüfung', 'Dichtprüfung', 'messwert', 'mbar', true, 'Unterdruck 10 mbar, Abfall < 1 mbar/min'],
      ['Atemschutzmaske/Halbjahresprüfung', 'Ausatemventil dicht', 'haken', '', true, ''],
      ['Atemluftflasche/Sichtprüfung', 'Äußere Beschädigungen', 'haken', '', true, 'Kerben, Riefen, Hitzeeinwirkung'],
      ['Atemluftflasche/Sichtprüfung', 'Prüfdatum am Flaschenhals', 'text', '', true, 'Nächste wiederkehrende Prüfung'],
      ['Atemluftflasche/Sichtprüfung', 'Fülldruck', 'messwert', 'bar', false, ''],
      ['B-Druckschlauch/Druckprüfung', 'Prüfdruck gehalten', 'haken', '', true, 'Nach DIN 14811'],
      ['B-Druckschlauch/Druckprüfung', 'Kupplungen und Dichtringe', 'haken', '', true, ''],
    ].forEach((x, i) => {
      v.einfuegen('pruefschritte', {
        pruefplan_id: plan[x[0]].id, position: i + 1, titel: x[1], art: x[2], einheit: x[3], pflicht: x[4], beschreibung: x[5],
      });
    });

    // ─────────────── Geräte – alle im Lager; wo sie stehen, erzählen die Buchungen ───────────────
    const geraet = {};
    [
      ['Pressluftatmer', 'PA01', 'ARSN-31441', 'IT-PA-0001', ''],
      ['Pressluftatmer', 'PA02', 'ARSN-31442', 'IT-PA-0002', ''],
      ['Pressluftatmer', 'PA03', 'ARSN-31443', 'IT-PA-0003', ''],
      ['Pressluftatmer', 'PA04', 'ARSN-31501', 'IT-PA-0004', 'Ersatzgerät'],
      ['Atemschutzmaske', 'M01', 'FPS-88201', 'IT-MASKE-0001', ''],
      ['Atemschutzmaske', 'M02', 'FPS-88202', 'IT-MASKE-0002', ''],
      ['Atemschutzmaske', 'M03', 'FPS-88203', 'IT-MASKE-0003', ''],
      ['Atemschutzmaske', 'M04', 'FPS-88204', 'IT-MASKE-0004', ''],
      ['Lungenautomat', 'LA01', 'PSS-4471', 'IT-LA-0001', ''],
      ['Lungenautomat', 'LA02', 'PSS-4472', 'IT-LA-0002', ''],
      ['Lungenautomat', 'LA03', 'PSS-4473', 'IT-LA-0003', ''],
      ['Lungenautomat', 'LA04', 'PSS-4474', 'IT-LA-0004', ''],
      ['Atemluftflasche', 'FL01', 'LX-220118', 'IT-FLASCHE-0001', ''],
      ['Atemluftflasche', 'FL02', 'LX-220119', 'IT-FLASCHE-0002', ''],
      ['Atemluftflasche', 'FL03', 'LX-220120', 'IT-FLASCHE-0003', ''],
      ['Atemluftflasche', 'FL04', 'LX-220121', 'IT-FLASCHE-0004', ''],
      ['Atemluftflasche', 'FL05', 'LX-220122', 'IT-FLASCHE-0005', ''],
      ['Atemluftflasche', 'FL06', 'LX-230004', 'IT-FLASCHE-0006', 'Reserve, noch nie im Einsatz'],
      ['B-Druckschlauch', 'B01', '', 'IT-SCHL-B-0001', ''],
      ['B-Druckschlauch', 'B02', '', 'IT-SCHL-B-0002', ''],
      ['B-Druckschlauch', 'B03', '', 'IT-SCHL-B-0003', ''],
      ['B-Druckschlauch', 'B04', '', 'IT-SCHL-B-0004', ''],
      ['C-Druckschlauch', 'C01', '', 'IT-SCHL-C-0001', ''],
      ['C-Druckschlauch', 'C02', '', 'IT-SCHL-C-0002', ''],
      ['C-Druckschlauch', 'C03', '', 'IT-SCHL-C-0003', ''],
      ['C-Druckschlauch', 'C04', '', 'IT-SCHL-C-0004', ''],
      ['Feuerlöscher', 'PG01', 'GL-99120', 'IT-LOESCH-0001', ''],
      ['Feuerlöscher', 'PG02', 'GL-99121', 'IT-LOESCH-0002', ''],
      ['Feuerwehrhelm', 'HELM01', 'HPS-5511', 'IT-HELM-0001', ''],
      ['Feuerwehrhelm', 'HELM02', 'HPS-5512', 'IT-HELM-0002', ''],
      ['Feuerwehrhelm', 'HELM03', 'HPS-5513', 'IT-HELM-0003', ''],
      ['Motorkettensäge', 'KS01', 'ST-771204', 'IT-SAEGE-0001', ''],
      ['Rettungsschere', 'RS01', 'WB-4415', 'IT-SCHERE-0001', 'Gehört zum Satz auf dem LF 10'],
    ].forEach((x) => {
      geraet[x[1]] = v.einfuegen('geraete', {
        geraetetyp_id: typ[x[0]].id, lagerplatz_id: ort['LOC-LAGER'].id,
        bezeichnung: x[1], seriennummer: x[2], barcode: x[3], bemerkung: x[4],
      });
      faelligkeitenAnlegen_(v, geraet[x[1]].id);
    });

    // ─────────────── Buchungen, zurückdatiert ───────────────
    [
      ['LOC-LF10', 'Umräumen', 21, ['PA01', 'M01', 'LA01', 'FL01', 'FL02', 'B01', 'B02', 'C01', 'C02', 'RS01']],
      ['LOC-DLK23', 'Umräumen', 18, ['PA04', 'B03', 'C03']],
      ['LOC-MTW', 'Umräumen', 16, ['PG01', 'HELM01', 'HELM02']],
      ['LOC-WERK', 'Einsatz', 5, ['PA02', 'M02', 'LA02']],
      ['LOC-FUELL', 'Einsatz', 5, ['FL03']],
      ['LOC-WERK', 'Zur Prüfung', 2, ['LA03']],
      ['LOC-WERK', 'Defekt gemeldet', 1, ['B03']],
    ].forEach((x) => {
      v.zeit = vorTagen(x[2], 19);
      umlagern_(v, x[3].map((b) => geraet[b].id), ort[x[0]].id, grund[x[1]].id, '');
    });
    v.zeit = jetzt_();

    // ─────────────── Fälligkeiten streuen, Prüfhistorie ───────────────
    const gestreut = {
      'PA01/Halbjahresprüfung': -21, 'PA02/Halbjahresprüfung': -6, 'LA03/Halbjahresprüfung': -3,
      'FL01/Sichtprüfung': -45, 'KS01/Wartung': 3, 'M01/Halbjahresprüfung': 7, 'PG01/Wartung': 12,
      'M02/Halbjahresprüfung': 14, 'LA01/Halbjahresprüfung': 21, 'B01/Druckprüfung': 28,
      'FL02/Sichtprüfung': 60, 'RS01/Jahresprüfung': 95,
    };
    // Zwei Prüfungen wurden vorgezogen erledigt – sonst sähe man „12 Tage vor Fälligkeit“ nirgends.
    const vorgezogen = { 'PA01/Halbjahresprüfung': 12, 'LA01/Halbjahresprüfung': 12 };
    v.alle('plan_stand').slice().forEach((s) => {
      const g = v.finde('geraete', s.geraet_id);
      const p = v.finde('pruefplaene', s.pruefplan_id);
      const schluessel = g.bezeichnung + '/' + p.name;
      let naechste;
      let zuletzt;
      if (schluessel in gestreut) {
        naechste = datumPlus_(heute, gestreut[schluessel], 'tage');
        zuletzt = datumPlus_(naechste, -p.intervall_wert, p.intervall_einheit);
      } else if (g.bezeichnung === 'FL06') {
        return; // Die Reserve bleibt ungeprüft – auch diesen Zustand soll man einmal sehen.
      } else {
        zuletzt = datumPlus_(heute, -30, 'tage');
        naechste = datumPlus_(zuletzt, p.intervall_wert, p.intervall_einheit);
      }
      v.aendern('plan_stand', s.id, { naechste_faellig: naechste, zuletzt_geprueft: zuletzt });
      const am = vorgezogen[schluessel] ? datumPlus_(zuletzt, vorgezogen[schluessel], 'tage') : zuletzt;
      v.zeit = vorTagen(Math.max(tageZwischen_(am, heute), 0), 17);
      v.einfuegen('pruefungen', {
        geraet_id: g.id,
        pruefplan_id: p.id,
        plan_name: p.name,
        benutzer_id: v.ich ? v.ich.id : null,
        benutzer_name: v.ich ? v.ich.name : 'Gerätewart',
        geprueft_am: am,
        ergebnis: 'bestanden',
        faellig_am: vorgezogen[schluessel] ? datumPlus_(am, vorgezogen[schluessel], 'tage') : zuletzt,
        status_danach: '',
        schritte: v.alle('pruefschritte')
          .filter((x) => x.pruefplan_id === p.id)
          .sort((a, b) => a.position - b.position)
          .map((x) => ({
            titel: x.titel,
            art: x.art,
            einheit: x.einheit,
            pflicht: x.pflicht,
            ok: x.art === 'haken' ? true : null,
            wert: x.art === 'messwert' ? (x.einheit === 'bar' ? '295' : '0,4') : x.art === 'text' ? 'ohne Befund' : '',
            notiz: '',
          })),
      });
    });
    v.zeit = jetzt_();

    // ─────────────── Gerätesätze: vier Sätze, vier Zustände ───────────────
    const art = v.einfuegen('satzarten', {
      name: 'Atemschutzgerät',
      beschreibung: 'Ein einsatzbereiter Atemschutz-Satz: Pressluftatmer, Maske, Lungenautomat und eine bis zwei Flaschen.',
    });
    [
      ['Pressluftatmer', 1, 1, ''],
      ['Atemschutzmaske', 1, 1, ''],
      ['Lungenautomat', 1, 1, ''],
      ['Atemluftflasche', 1, 2, 'Zweite Flasche für lange Einsätze'],
    ].forEach((x) => v.einfuegen('satzart_teile', {
      satzart_id: art.id, geraetetyp_id: typ[x[0]].id, min_anzahl: x[1], max_anzahl: x[2], bemerkung: x[3],
    }));
    [
      ['AS-Satz 1', 'SET-AS-0001', '', ['PA01', 'M01', 'LA01', 'FL01', 'FL02']],
      ['AS-Satz 2', 'SET-AS-0002', 'Nach dem Einsatz in der Werkstatt', ['PA02', 'M02', 'LA02', 'FL03']],
      ['AS-Satz 3', 'SET-AS-0003', 'Unvollständig – Lungenautomat und Flasche fehlen', ['PA03', 'M03']],
      ['AS-Satz 4', 'SET-AS-0004', 'Teile stehen an verschiedenen Orten', ['PA04', 'M04', 'LA04', 'FL04', 'FL05']],
    ].forEach((x) => {
      const satz = v.einfuegen('saetze', { satzart_id: art.id, name: x[0], barcode: x[1], bemerkung: x[2] });
      x[3].forEach((b) => v.einfuegen('satz_mitglieder', { satz_id: satz.id, geraet_id: geraet[b].id }));
    });

    // ─────────────── Personal: Qualifikationen und Nachweise ───────────────
    // Nur für eigens angelegte Demo-Mitglieder (Adressen unter `demo.invalid`, ohne Kürzel –
    // anmelden kann sich mit ihnen niemand). Wer die Demo in eine Tabelle mit echten
    // Mitgliedern spielt, bekommt keinem von ihnen eine erfundene G26.3 untergeschoben.
    const quali = {};
    [
      ['G26.3 – Atemschutztauglichkeit', 'Arbeitsmedizinische Vorsorge (DGUV G 26.3). Unter 50 Jahren 36 Monate, ab 50 Jahren 12 Monate – maßgeblich ist das Datum auf der Bescheinigung.', 36, 'monate', true],
      ['Atemschutzgeräteträger-Lehrgang', 'Grundausbildung nach FwDV 7.', null, null, true],
      ['Belastungsübung Atemschutz', 'Jährliche Übung unter Atemschutz in der Atemschutzstrecke (FwDV 7).', 12, 'monate', true],
      ['Maschinist', 'Lehrgang Maschinist für Löschfahrzeuge.', null, null, false],
      ['Führerschein C', 'Fahrerlaubnis Klasse C – alle fünf Jahre verlängern.', 5, 'jahre', false],
      // Ergibt sich aus den Einsatzberichten – niemand trägt ihn ein.
      ['Einsatz oder Übung unter Atemschutz', 'Wann zuletzt unter Atemschutz im Einsatz oder bei einer Übung. Folgt aus den Einsatzberichten.', 12, 'monate', false, true],
    ].forEach((x, i) => {
      quali[x[0].split(' ')[0]] = v.einfuegen('qualiarten', {
        name: x[0], beschreibung: x[1], gueltig_wert: x[2], gueltig_einheit: x[3], atemschutz: x[4], aus_einsatz: !!x[5], position: i + 1,
      });
    });
    // [Name, Adresse, [Art, gültig bis in Tagen ab heute (null = unbefristet), erworben vor Tagen (nur unbefristet)]]
    const mannschaft = [
      ['Max Brenner', [['G26.3', 400], ['Atemschutzgeräteträger-Lehrgang', null, 2400], ['Belastungsübung', 200], ['Maschinist', null, 1500], ['Führerschein', 900]]],
      ['Lena Wasser', [['G26.3', 25], ['Atemschutzgeräteträger-Lehrgang', null, 1100], ['Belastungsübung', 150]]],
      ['Tom Leiter', [['G26.3', -20], ['Atemschutzgeräteträger-Lehrgang', null, 3000], ['Belastungsübung', 100]]],
      // Verlängert: Der alte Nachweis ist abgelaufen, der neue gilt – tauglich.
      ['Sven Funke', [['G26.3', -400], ['G26.3', 700], ['Atemschutzgeräteträger-Lehrgang', null, 2000], ['Belastungsübung', 30]]],
      ['Jana Schaum', [['G26.3', 500], ['Atemschutzgeräteträger-Lehrgang', null, 400]]],
      ['Paul Pumpe', [['Maschinist', null, 800]]],
    ];
    const person = {};
    mannschaft.forEach((x) => {
      const email = x[0].toLowerCase().replace(/\s+/g, '.') + '@demo.invalid';
      const m = v.alle('mitglieder').find((y) => normal_(y.email) === email) ||
        v.einfuegen('mitglieder', { name: x[0], email: email, kuerzel: '', rolle: 'mitglied' });
      person[x[0]] = m;
      x[1].forEach((n) => {
        const art = quali[n[0].split(' ')[0]];
        const bis = n[1] === null ? null : datumPlus_(heute, n[1], 'tage');
        const erworben = bis ? datumPlus_(bis, -art.gueltig_wert, art.gueltig_einheit) : datumPlus_(heute, -n[2], 'tage');
        v.einfuegen('nachweise', { mitglied_id: m.id, art_id: art.id, erworben_am: erworben, gueltig_bis: bis, erfasst_von: v.ich ? v.ich.name : 'System' });
      });
    });

    // ─────────────── Einsätze, Übung, Wache ───────────────
    // Auch hier nur Demo-Mitglieder. Der erste kommt „aus dem Einsatztagebuch“: mit
    // Abschrift, einer gestrichenen Zeile und einer berichtigten – so, wie es an der
    // Einsatzstelle aussieht. Er endet, bevor die Demo-Buchungen „Einsatz“ zurückkommen.
    const um = (tage, stunde, minute) => {
      const d = new Date(Date.now() - tage * 86400000);
      d.setHours(stunde, minute, 0, 0);
      return d.toISOString();
    };
    const kraft = (wer, von, bis, funktion, atemschutz) => ({
      neu_id: Utilities.getUuid(),
      art: person[wer] ? 'person' : 'mittel',
      mitglied_id: person[wer] ? person[wer].id : null,
      name: wer,
      von: von,
      bis: bis,
      funktion: funktion || '',
      atemschutz: !!atemschutz,
    });
    const t = (tage) => (h, m) => um(tage, h, m);
    const brand = t(5);
    const brandKraefte = [
      kraft('Tom Leiter', brand(16, 47), brand(18, 55), 'Gruppenführer'),
      kraft('Max Brenner', brand(16, 47), brand(18, 40), 'Angriffstruppführer', true),
      kraft('Sven Funke', brand(16, 47), brand(18, 40), 'Angriffstrupp', true),
      kraft('Lena Wasser', brand(16, 47), brand(18, 55), 'Maschinistin'),
      kraft('Jana Schaum', brand(16, 47), brand(17, 30), 'Wassertrupp'),
      kraft('Jana Schaum', brand(17, 50), brand(18, 55), 'Wassertrupp'),
      kraft('Paul Pumpe', brand(17, 5), brand(18, 55), 'Melder'),
      kraft('LF 10', brand(16, 47), brand(18, 55)),
      kraft('DLK 23', brand(16, 52), brand(18, 30)),
    ];
    // Der Sicherheitstrupp der Nachbarwehr: dabei, aber kein Mitglied.
    brandKraefte.push(Object.assign(kraft('Heinz Nachbar (FF Nachbarort)', brand(17, 10), brand(18, 20), 'Sicherheitstrupp', true), { art: 'person' }));
    const eintrag = (zeit, text, extra) => Object.assign({ liste: 'tagebuch', zeit: zeit, text: text }, extra || {});
    const abschrift = [
      eintrag(brand(16, 42), 'Alarmierung B3 Wohnungsbrand, Lindenstraße 12 – Person am Fenster'),
      eintrag(brand(16, 47), 'LF 10 ausgerückt, Besatzung 1/5'),
      eintrag(brand(16, 52), 'DLK 23 ausgerückt'),
      eintrag(brand(16, 55), 'Eintreffen LF 10. Rauch aus Fenster 2. OG, eine Person am Fenster'),
      eintrag(brand(16, 58), 'Angriffstrupp unter PA über den Treppenraum zur Menschenrettung vor', { vorher: ['Angriffstrupp unter PA zur Menschenrettung vor'] }),
      eintrag(brand(17, 4), 'Person aus 2. OG gerettet, an Rettungsdienst übergeben'),
      eintrag(brand(17, 6), 'Melder nachalarmiert'),
      eintrag(brand(17, 10), 'Sicherheitstrupp FF Nachbarort eingetroffen'),
      eintrag(brand(17, 22), 'Feuer aus, Nachlöscharbeiten'),
      eintrag(brand(17, 30), 'Wassertrupp zur Wasserversorgung Hydrant Lindenstraße', { geloescht: true }),
      eintrag(brand(17, 45), 'Belüftung mit Überdrucklüfter', { zeit_vorher: [brand(17, 40)] }),
      eintrag(brand(18, 20), 'Einsatzstelle an die Polizei übergeben'),
      eintrag(brand(18, 40), 'Atemschutzgeräte und Schläuche verlastet'),
      eintrag(brand(18, 55), 'Einsatzende, Rückfahrt'),
    ];
    brandKraefte.forEach((k) => {
      abschrift.push({ liste: 'kraefte', zeit: k.von, text: k.name, aktion: 'eingesetzt', kommentar: k.funktion });
      abschrift.push({ liste: 'kraefte', zeit: k.bis, text: k.name, aktion: 'abgerückt' });
    });
    const uebung = t(12);
    const bma = t(20);
    const wache = t(40);
    const alt = t(800);
    const nummer = (zeit, n) => 'E-' + tagVon_(zeit).slice(0, 4) + '-' + n;
    [
      {
        art: 'einsatz', nummer: nummer(brand(16, 42), '117'), stichwort: 'B3 – Wohnungsbrand, Menschenleben', bezeichnung: 'Wohnungsbrand Lindenstraße 12',
        ort: 'Lindenstraße 12', einsatzleiter: 'Tom Leiter', beginn: brand(16, 42), ende: brand(18, 55),
        bericht: 'Lage bei Eintreffen: Rauch aus einem Fenster im 2. OG, eine Person am Fenster.\n' +
          'Maßnahmen: Menschenrettung durch den Angriffstrupp unter Atemschutz über den Treppenraum, Brandbekämpfung mit einem C-Rohr, Belüftung.\n' +
          'Besonderheiten: Eine Person mit Verdacht auf Rauchgasvergiftung an den Rettungsdienst übergeben.',
        quelle: 'einsatztagebuch', quelle_kennung: 'tagebuch:' + brand(16, 43), kraefte: brandKraefte, tagebuch: abschrift,
      },
      {
        art: 'uebung', stichwort: 'Atemschutz', bezeichnung: 'Atemschutzübung Werkhalle', ort: 'Werkhalle Nord', einsatzleiter: 'Tom Leiter',
        beginn: uebung(18, 30), ende: uebung(21, 0), bericht: 'Personensuche in verrauchter Halle, zwei Trupps im Wechsel.',
        kraefte: [
          kraft('Tom Leiter', uebung(18, 30), uebung(21, 0), 'Übungsleiter'),
          kraft('Max Brenner', uebung(18, 30), uebung(21, 0), 'Trupp 1', true),
          kraft('Lena Wasser', uebung(18, 30), uebung(21, 0), 'Trupp 1', true),
          kraft('Jana Schaum', uebung(18, 30), uebung(21, 0), 'Trupp 2', true),
          kraft('Sven Funke', uebung(18, 30), uebung(21, 0), 'Sicherheitstrupp'),
          kraft('Paul Pumpe', uebung(18, 30), uebung(20, 15), 'Atemschutzüberwachung'),
        ],
      },
      {
        art: 'einsatz', nummer: nummer(bma(2, 13), '109'), stichwort: 'BMA', bezeichnung: 'Brandmeldeanlage ausgelöst', ort: 'Gewerbegebiet Süd, Halle 4',
        einsatzleiter: 'Tom Leiter', beginn: bma(2, 13), ende: bma(3, 5), bericht: 'Täuschungsalarm durch Wasserdampf in der Produktion. Anlage zurückgestellt, an den Betreiber übergeben.',
        kraefte: [
          kraft('Tom Leiter', bma(2, 19), bma(3, 5), 'Gruppenführer'),
          kraft('Lena Wasser', bma(2, 19), bma(3, 5), 'Maschinistin'),
          kraft('Paul Pumpe', bma(2, 19), bma(3, 5)),
          kraft('LF 10', bma(2, 19), bma(3, 5)),
        ],
      },
      {
        art: 'wache', stichwort: 'BSW', bezeichnung: 'Brandsicherheitswache Stadtfest', ort: 'Marktplatz', beginn: wache(17, 30), ende: wache(23, 30),
        kraefte: [kraft('Paul Pumpe', wache(17, 30), wache(23, 30)), kraft('Jana Schaum', wache(17, 30), wache(23, 30))],
      },
      {
        art: 'einsatz', nummer: nummer(alt(14, 5), '061'), stichwort: 'TH – VU eingeklemmt', bezeichnung: 'Verkehrsunfall B 27', ort: 'B 27, Abfahrt Nord',
        einsatzleiter: 'Tom Leiter', beginn: alt(14, 5), ende: alt(16, 20),
        kraefte: [kraft('Tom Leiter', alt(14, 10), alt(16, 20)), kraft('Max Brenner', alt(14, 10), alt(16, 20)), kraft('Lena Wasser', alt(14, 10), alt(16, 20)), kraft('LF 10', alt(14, 10), alt(16, 20))],
      },
    ].forEach((e) => {
      v.zeit = e.ende;
      einsatzAnlegen_(v, Object.assign({ neu_id: Utilities.getUuid() }, e), v.ich);
    });
    v.zeit = jetzt_();

    // ─────────────── Regeln – zuletzt ───────────────
    v.einfuegen('regeln', {
      name: 'Nach dem Einsatz prüfen',
      beschreibung: 'Wer nach einem Einsatz zurückbucht, meldet damit Arbeit an: Die nächste Prüfung wird sofort fällig.',
      ausloeser: 'umlagerung',
      bedingungen: { grund: 'Einsatz' },
      aktionen: [{ art: 'pruefung_faellig' }],
      position: 1,
    });
    v.einfuegen('regeln', {
      name: 'Durchgefallen heißt defekt',
      beschreibung: 'Eine nicht bestandene Prüfung nimmt das Gerät aus dem Dienst, bis es instandgesetzt ist.',
      ausloeser: 'pruefung',
      bedingungen: { ergebnis: 'nicht_bestanden' },
      aktionen: [{ art: 'status_setzen', status: 'defekt' }],
      position: 2,
    });

    v.festschreiben();
    return 'Eingespielt: 8 Lagerplätze, 10 Gerätetypen, 12 Prüfpläne, 33 Geräte, ' +
      v.alle('buchungen').length + ' Buchungen, ' + v.alle('pruefungen').length + ' Prüfungen, 4 Gerätesätze, 2 Regeln, ' +
      '6 Qualifikationen, ' + mannschaft.length + ' Demo-Mitglieder mit Nachweisen, 5 Einsätze und Dienste.';
  });
}
