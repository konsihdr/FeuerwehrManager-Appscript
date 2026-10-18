# Sicherheit

> **Stand 2026-10-18 · Version 0.3.0 (Beta)** – für die Apps-Script-Fassung.
>
> Jede Maßnahme nennt ihren **Nachweis**: eine Prüfung in `test/server.mjs` oder
> `test/oberflaeche.mjs`, die fehlschlägt, wenn die Maßnahme wegfällt. Wo keiner steht, steht
> „offen“ oder „ungeprüft“. Eine Absicht ohne Nachweis ist nur eine Absicht.
>
> Geprüft ist alles bisher gegen eine Attrappe der Google-Dienste und im echten Chromium,
> **noch nicht in echtem Apps Script**. Welche Stellen davon abhängen, steht in Abschnitt 5.

---

## Eine Sicherheitslücke melden

**Bitte nicht als Issue, sondern direkt an den Betreuer des Repositorys** – auf GitHub über
*Security → Report a vulnerability*, wo das eingeschaltet ist (eine private Meldung, die
nur die Betreuer sehen), sonst über sein Profil. Hilfreich sind die Fassung (unten links in
der Seitenleiste), was man getan hat, was passieren sollte und was passiert ist.

Sicherheitskorrekturen gibt es nur für die **jeweils neueste Fassung** – solange 0.x eine
Beta ist, gibt es keine gepflegten Altstände. Eine Wehr aktualisiert, indem sie die Dateien
aus `src/` neu hochlädt und eine neue Version bereitstellt (`docs/BETRIEB.md`).

---

## 1. Wofür diese Fassung gebaut ist

Die Sicherheit dieser Anwendung hängt an vier Annahmen. Trifft eine nicht zu, gilt das
Folgende nicht:

1. **Ein Google-Workspace-Tenant.** Die Web-App ist mit *Ausführen als: Ich* und *Zugriff:
   alle in der Domain* bereitgestellt. Nur so prüft Google das Konto des Besuchers, bevor
   ein Aufruf ankommt, und nennt der App dessen Adresse.
2. **Die Tabelle ist Vertrauensbereich.** Wer sie bearbeiten darf, darf alles – auch das
   Protokoll ändern. Mit ihr geteilt wird nur, wer Administrator ist.
3. **Das Konto des Eigentümers ist geschützt** (Zwei-Faktor-Anmeldung). Alle Aufrufe
   laufen mit seinen Rechten.
4. **Das Hallen-Tablet ist mit einem eigenen Konto angemeldet, das kein Mitglied ist.**

---

## 2. Bedrohungsmodell

| | Bedrohung | Warum sie hier zählt |
|---|---|---|
| **B1** | Jemand ohne Mitgliedschaft ruft die Web-App auf | Die Adresse der Web-App ist kein Geheimnis. Jeder im Tenant kann sie öffnen |
| **B2** | Ein Mitglied will mehr, als seine Rolle darf | Der Browser ist in der Hand des Anwenders. `google.script.run` lässt sich aus der Entwicklerkonsole mit beliebigen Argumenten aufrufen |
| **B3** | Jemand am Hallen-Tablet | Wer vorbeigeht, sieht den Bildschirm und kann tippen. Wer ein Kürzel kennt, kann es eingeben |
| **B4** | Personaldaten gelangen an Unbefugte | G26.3 ist ein Gesundheitsdatum (Art. 9 DSGVO); Einsatzzeiten sind Personaldaten. Sie gehören weder auf das Tablet in der Halle noch zum Arbeitgeber |
| **B5** | Nachweise werden unbemerkt verändert | Prüfnachweise und Einsatzberichte sind der Zweck der Anwendung. Ein geänderter Nachweis, dem man es nicht ansieht, ist schlimmer als keiner |
| **B6** | Eingeschleuste Inhalte | Was ein Mitglied eintippt oder eine Datei mitbringt (CSV, Einsatztagebuch), darf weder im Browser noch in der Tabelle noch in Excel als Code laufen |
| **B7** | Fremdcode in der Lieferkette | Eine Bibliothek im Browser liest alles mit, was der Anwender sieht |
| **B8** | Datenverlust | Gleichzeitiges Schreiben, abgerissene Verbindungen, ein Funkloch in der Halle |

**Nicht im Modell:** wer die Tabelle bearbeiten darf oder das Konto des Eigentümers hat
(Annahme 2 und 3) – gegen den hilft keine Prüfung in der App. Und Google selbst.

---

## 3. Maßnahmen und ihre Nachweise

Die Nachweise sind Abschnittsnamen in `test/server.mjs` (S) und `test/oberflaeche.mjs` (O).

### Zugang (B1)

| | Maßnahme | Nachweis |
|---|---|---|
| **Z1** | Der Browser erreicht genau eine Funktion: `aufruf()`. Alle anderen enden auf `_` und sind für `google.script.run` unsichtbar; die Menüfunktionen scheitern außerhalb der Tabelle an `getUi()` | S „Nur aufruf() und die Menüs stehen offen“ – die Liste der offenen Funktionen ist festgeschrieben, eine neue lässt die Suite fallen |
| **Z2** | Jede Aktion braucht eine Rechteangabe; ohne wird sie abgelehnt. Interne Funktionen und Objekteigenschaften sind keine Aktionen | S „Ohne Sitzung kein Zugriff, unbekannte Aktionen abgewiesen“ |
| **Z3** | Wer drin ist, sagt das Blatt „Mitglieder“ – geprüft bei **jedem** Aufruf, nicht bei der Anmeldung. Gesperrt heißt: ab dem nächsten Klick draußen. Am Schreibtisch gibt es keine eigene Sitzung, die einen Entzug überleben könnte | S „Das Firmenkonto ist der Zugang“, O „Neues Mitglied: erst kein Zugang, nach der Aufnahme drin“ |
| **Z4** | Die Web-App läuft als Eigentümer und nur für die Domain; kein Kennwort, das hier liegen oder vergessen werden könnte | S „Keine fremden Skripte, keine Pakete, nur die nötigen Berechtigungen“ (prüft `executeAs`/`access` im Manifest) |

### Rechte (B2)

| | Maßnahme | Nachweis |
|---|---|---|
| **R1** | Rollen werden an der Tür durchgesetzt (`10_Tuer.js`), nicht in der Oberfläche. Die Oberfläche blendet nur aus, was ohnehin verboten ist | S „Rollen: Mitglied, Gerätewart, Administrator“, „Personal: wer was sieht und darf“, „Einsätze: wer was sieht und darf“ |
| **R2** | Der Stapel (Speichern im Hintergrund) prüft jede Änderung einzeln, mit denselben Rechten wie ein einzelner Aufruf; Lesendes und Öffentliches gehören nicht hinein | S „Stapel: dieselben Rechte wie ein einzelner Aufruf“ |
| **R3** | Der letzte aktive Administrator lässt sich nicht entfernen, sperren oder herabstufen; niemand sperrt sich selbst oder ändert die eigene Adresse | S „Der letzte Administrator bleibt“ |
| **R4** | Adressen und Kürzel anderer sieht nur der Administrator | S „Rollen: …“ – „Mitglied sieht keine Adressen und Kürzel anderer“ |
| **R5** | Kennungen aus dem Browser (`neu_id`) nur in UUID-Form; doppelt vergeben wird abgelehnt | S „Stapel: der Reihe nach, einzeln festgeschrieben, nie doppelt“ |

### Halle (B3)

| | Maßnahme | Nachweis |
|---|---|---|
| **H1** | Ein Hallengerät trägt ein Geheimnis (40 Zeichen, 200 Bit) im Browser; in der Tabelle steht nur sein SHA-256-Abdruck. Ohne gekoppeltes Gerät sind Ausweis und Kürzel wertlos | S „Hallengerät: Ausweis oder Kürzel“ |
| **H2** | Gekoppelt wird mit einem Code (8 Zeichen, 15 Minuten, einmal), den nur ein Administrator am Schreibtisch erzeugt. Nach zehn falschen Codes – über alle Geräte zusammen – ist eine Viertelstunde Ruhe | S „Hallengerät aus der Ferne koppeln“ |
| **H3** | Der Ausweis ist ein Geheimnis (160 Bit), einmal angezeigt, gespeichert als Abdruck. Ein neuer Ausweis beendet die Sitzungen mit dem alten | S „Hallengerät: Ausweis oder Kürzel“ |
| **H4** | Das **Kürzel ist eine Selbstauskunft** und wird so behandelt: nur an gekoppelten Geräten, je Gerät abschaltbar (laufende Kürzel-Sitzungen enden dann), im Protokoll „per Kürzel“ | S „Hallengerät: Ausweis oder Kürzel“ |
| **H5** | Zehn Fehlversuche an einem Gerät sperren es für 15 Minuten – auch für das richtige Kürzel | S „Hallengerät: Ausweis oder Kürzel“ |
| **H6** | Eine Hallensitzung taugt nur für Aktionen mit `halle: true` (buchen, zählen, „gereinigt“) – **auch beim Administrator** | S „Hallengerät: …“ – „Admin am Hallengerät: keine Verwaltung“ |
| **H7** | Sitzungstoken (256 Bit) liegen in den Skripteigenschaften nur als Abdruck. Ein geteiltes Gerät meldet nach Untätigkeit ab (Vorgabe 3 Minuten); auf dem Server endet die Sitzung spätestens nach 30 Minuten Ruhe (persönliches Gerät: 12 Stunden). Ein gesperrtes Gerät oder Mitglied beendet sie sofort | S „Hallengerät: …“ |

### Personaldaten (B4)

| | Maßnahme | Nachweis |
|---|---|---|
| **P1** | Qualifikationen, Nachweise und Einsatzberichte bekommen nur Gerätewart, Kommandant und Administrator – **nie ein Hallengerät**, auch nicht mit dem Kürzel des Gerätewarts. Ist das Personalmodul ausgeschaltet, bekommt sie niemand | S „Personal: wer was sieht und darf“, „Einsätze: wer was sieht und darf“; O „Personal: Rollen in der Oberfläche“ |
| **P2** | Der Dienstnachweis lässt sich **ohne** Qualifikationen erzeugen – für den Arbeitgeber, den die G26.3 nichts angeht | S „Einsätze: Bericht, Dienstnachweis und Stunden als PDF“ |
| **P3** | Wer gelöscht wird, nimmt seine Nachweise mit. Einsatzberichte gehören der Wehr: Dort bleibt der Name als Momentaufnahme, der Verweis auf die Person verschwindet | S „Personal: aktueller Nachweis, Atemschutz, Ablauf“, „Einsätze: übernehmen, ersetzen, löschen – mit Abschrift“ |
| **P4** | Die Abschrift des Einsatztagebuchs steht nicht im Datenstand des Browsers; sie wird geholt, wenn jemand mit Recht den Bericht aufschlägt | S „Einsätze: Zeitraum im Stand, Archiv, Stunden, Nachweise aus Einsätzen“ |

Was wo liegt und wie lange, steht in `docs/BETRIEB.md` unter *Datenschutz*.

### Nachweisfähigkeit (B5)

| | Maßnahme | Nachweis |
|---|---|---|
| **N1** | Jeder Schreibzugriff geht durch `Vorgang_`: frisch gelesen unter der Sperre, Regeln aus dem Schema, geschrieben erst am Ende – ganz oder gar nicht | S „Import: ganz oder gar nicht“, „Einsätze: übernehmen, … – auch nicht halb“ |
| **N2** | Das Protokoll entsteht im Vorgang aus den Änderungen selbst: keine Fachfunktion kann es vergessen, niemand sich herausschreiben. Bei Änderungen steht der Unterschied darin; Abdrücke (Ausweis, Gerät) erscheinen nie mit Wert | S „Protokoll: Unterschiede statt Abzüge, Geheimes geschwärzt“ |
| **N3** | Der Standort eines Geräts ändert sich nur durch eine Buchung | S „Der Standort ändert sich nur durch eine Buchung“ |
| **N4** | Ein Prüfnachweis hält die abgearbeiteten Schritte als Momentaufnahme fest – eine spätere Änderung der Checkliste schreibt ihn nicht um | S „Prüfung erfassen: Schritte, Termin, Status, Nachweis“ |
| **N5** | Die Abschrift des Einsatztagebuchs behält Gestrichenes und frühere Fassungen, im Bericht wie im PDF | S „Einsätze: übernehmen, …“, „Einsätze: Bericht, Dienstnachweis und Stunden als PDF“ |

### Eingeschleuste Inhalte (B6)

| | Maßnahme | Nachweis |
|---|---|---|
| **I1** | Die Oberfläche setzt Text immer als Text (`h()`), nie als HTML. `innerHTML` gibt es genau einmal – für die festen Symbole. Kein `eval`, kein nachgeladener Code | S „Keine fremden Skripte, keine Pakete, nur die nötigen Berechtigungen“ |
| **I2** | PDFs entstehen aus HTML, in dem jeder Wert maskiert ist | S „Einsätze: Bericht, …“ – ein Name `<img src=x onerror=…>` erscheint als Text |
| **I3** | Wehrname und gemeinsamer Code werden in die Startseite so eingesetzt, dass `</script>` den Block nicht beendet | S „doGet liefert die Seite mit allen Teilen“ |
| **I4** | **Formeln bleiben Text.** Jede Zelle ist „Nur Text“ (`@`), bevor etwas hineingeschrieben wird – sonst führte Google Tabellen ein eingetipptes `=IMPORTXML("https://…")` aus, sobald der Eigentümer die Tabelle öffnet, und schickte Inhalte nach draußen | S „Formeln bleiben Text – in jedem Blatt, auf jedem Weg“ (die Attrappe markiert jede Zelle, die Google als Formel läse; Gegenprobe ohne Textformat: vier Fehlschläge) |
| **I5** | **CSV für Excel:** Was mit `=`, `+`, `-`, `@` beginnt und keine Zahl ist, bekommt ein Hochkomma – Excel und LibreOffice führen solche Zellen sonst auch aus einer CSV-Datei aus. Der Import nimmt das Hochkomma wieder weg | S „Formeln bleiben Text …“ |
| **I6** | Das Einsatztagebuch wird als JSON gelesen, nicht ausgeführt; höchstens 5 MB, 5 000 Einträge, 500 Kräfte; jede Zeit wird geprüft, Texte gekürzt | S „Einsatztagebuch lesen (im Browser)“, „Einsätze: übernehmen, …“ |
| **I7** | Das Logo nur als PNG oder JPEG (Daten-Adresse), höchstens rund 35 KB | – (geprüft in `einstellungen.logo`; ein eigener Nachweis fehlt) |

### Lieferkette (B7)

| | Maßnahme | Nachweis |
|---|---|---|
| **L1** | **Keine Bibliothek, kein CDN, kein Paket** – weder im Server noch in der Oberfläche noch in den Tests. Was in `src/` steht, ist alles, was läuft | S „Keine fremden Skripte, …“: kein `<script src>`, keine Abhängigkeiten in `package.json`, keine Apps-Script-Bibliotheken |
| **L2** | Genau vier Berechtigungen: *diese* Tabelle (nicht alle des Eigentümers), Menü, Auslöser, eigene Adresse. Kein Netz (`UrlFetchApp`), kein Drive, keine Mail | S „Keine fremden Skripte, …“ |

### Datenverlust (B8)

| | Maßnahme | Nachweis |
|---|---|---|
| **D1** | Schreibende Vorgänge laufen nacheinander unter einer Sperre; ist sie belegt, wird nichts geschrieben und der Browser versucht es erneut | S „Stapel: dieselben Rechte …“ – „belegte Sperre“ |
| **D2** | Eine Änderung, die nach abgerissener Antwort zweimal ankommt, wird einmal gebucht (Kennung der Änderung, sechs Stunden gemerkt; Anlagen erkennen ihre eigene Kennung auch danach) | S „Stapel: der Reihe nach, einzeln festgeschrieben, nie doppelt“ |
| **D3** | Ohne Netz warten Änderungen im Browser (`localStorage`), auch über ein Neuladen hinweg. Am Schreibtisch gehen sie nur unter dem Google-Konto hinaus, das sie gemacht hat; in der Halle unter dem Token dessen, der gebucht hat | O „Ohne Netz: wartet im Browser, übersteht Neuladen, geht danach hinaus“ |

---

## 4. Was diese Fassung nicht kann – bewusst oder noch nicht

- **Die Tabelle schützt sich nicht selbst.** Die Blätter tragen einen Schutz, der vor
  versehentlichen Änderungen warnt; aufhalten kann er niemanden, der bearbeiten darf. Was
  dort von Hand geändert wird, umgeht Regeln und Protokoll. Der Versionsverlauf von Google
  Tabellen zeigt es trotzdem.
- **Das Kürzel ist kein Geheimnis.** Wo das nicht reicht: am Gerät „Nur Ausweis“ (H4).
- **Wer die Web-App öffnen kann, kann Last erzeugen.** Ein Mitglied könnte in Schleife
  aufrufen; alle Aufrufe teilen sich das Kontingent des Eigentümers (30 gleichzeitig). Eine
  Bremse gibt es nur bei Anmeldung und Kopplung in der Halle.
- **Textlängen sind nur teilweise begrenzt** (Bericht 40 000 Zeichen, Tagebuch je Eintrag
  5 000). Sonst begrenzt Google Tabellen (50 000 Zeichen je Zelle); ein zu langer Wert lässt
  den ganzen Vorgang scheitern, nichts wird halb geschrieben.
- **Das Protokoll enthält Personaldaten**, etwa das Datum einer G26.3. Lesen dürfen es
  Gerätewart, Kommandant und Administrator – dieselben, die die Nachweise sehen.
- **Kein automatisches Löschen nach Fristen.** Aufbewahrung und Löschung entscheidet die
  Wehr (`docs/BETRIEB.md`).
- **Warteschlange auf geteilten Rechnern.** Was offline gemacht wurde, liegt bis zum
  Senden (höchstens sieben Tage) im `localStorage` dieses Browsers – auch ein übernommenes
  Einsatztagebuch. Wer einen Rechner mit anderen teilt, wartet auf „Gespeichert“.
- **Die Vorschau ist kein Produkt.** `dist/vorschau.html` enthält eine Attrappe, in der man
  sich per Schalter „anmeldet“. Nicht ins Netz stellen, keine echten Daten hineintippen.

---

## 5. Ungeprüft – erst in echtem Apps Script zu sehen

Die Attrappe ist streng, aber sie ist nicht Google. Für die Sicherheit hängt an:

- **`Session.getActiveUser().getEmail()`** liefert bei „Ausführen als: Ich“ und „Zugriff:
  Domain“ die Adresse des Besuchers (Z3). Liefert es leer, kommt niemand hinein – sicher,
  aber unbrauchbar.
- **Das Textformat verhindert Formeln auch beim Schreiben über `setValues`** (I4). In der
  Oberfläche von Google Tabellen ist das so; für das Schreiben aus dem Skript nur
  angenommen. Prüfen: einen Gerätetyp `=1+1` anlegen, im Blatt muss `=1+1` stehen, nicht 2.
- **Mehrere Google-Konten im selben Browser:** Apps-Script-Web-Apps nehmen dann nicht immer
  das erwartete. Für das Hallen-Tablet ein Konto (Annahme 4).
- **Ob das Gerätegeheimnis im `localStorage` einen Kontowechsel im selben Browserprofil
  übersteht** (H1).

Die vollständige Liste, auch was nicht die Sicherheit betrifft: `CLAUDE.md`, Abschnitt 6.

---

## 6. Checkliste für die Wehr

- [ ] Web-App mit **Zugriff: alle in der Domain** bereitgestellt – nie „Jeder“.
- [ ] Die Tabelle mit **niemandem** geteilt, der nicht Administrator ist.
- [ ] Eigentümer ist ein **Funktionskonto der Wehr** (etwa `feuerwehr-app@…`), nicht ein
      persönliches – verlässt der Eigentümer die Firma, steht sonst die Anwendung. Mit
      Zwei-Faktor-Anmeldung.
- [ ] Hallen-Tablet mit **eigenem Konto, das kein Mitglied ist**, Bildschirmsperre an,
      als „geteilt“ gekoppelt.
- [ ] Ausweise wie Schlüssel behandeln: verloren → neu ausgeben (der alte gilt sofort nicht
      mehr).
- [ ] Wer austritt: **in der App** sperren oder entfernen. Das Firmenkonto zu sperren
      genügt nicht – es schließt nur den Schreibtisch. Ausweis und Kürzel fragen Google
      nicht und wirken in der Halle weiter, bis das Mitglied in der App gesperrt ist; dann
      enden auch laufende Hallensitzungen sofort.
- [ ] Die Atemschutzliste nicht offen aushängen; den Dienstnachweis für den Arbeitgeber
      **ohne** Qualifikationen erzeugen.
