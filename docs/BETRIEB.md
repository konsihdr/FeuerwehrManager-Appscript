# Betrieb

> Für den Administrator und wer die Anwendung für die Wehr betreut: aktualisieren, sichern,
> Datenschutz, Grenzen, Fehlersuche. Das erste Einrichten steht in `README.md`, die
> Bedienung in `docs/BEDIENUNG.md`, die Sicherheit in `SECURITY.md`.

**Stand 0.3.0 (Beta).**

---

## Was wo läuft

| Teil | wo | gehört |
|---|---|---|
| **Die Daten** | eine Google-Tabelle, ein Blatt je Tabelle (26 Blätter) | dem Eigentümer der Tabelle |
| **Der Server** | das Apps Script, das an diese Tabelle gebunden ist (*Erweiterungen → Apps Script*) | ebenso |
| **Die Web-App** | eine Bereitstellung dieses Skripts: *Ausführen als: Ich*, *Zugriff: Domain* | läuft mit den Rechten des Eigentümers |
| **Zwischenspeicher** | `CacheService` des Skripts: Kopien der Blätter, höchstens sechs Stunden | – |
| **Hallensitzungen, Kopplungscodes** | Skripteigenschaften | – |
| **Offene Änderungen** | `localStorage` des jeweiligen Browsers, bis sie gespeichert sind | dem Gerät |

Eigentümer sollte ein **Funktionskonto der Wehr** sein, kein persönliches: Verlässt der
Eigentümer die Firma und wird sein Konto gelöscht, gehen Tabelle und Web-App mit.

---

## Aktualisieren

1. Die Dateien aus `src/` hochladen – `clasp push` (siehe `README.md`) oder von Hand.
2. Im Apps-Script-Editor: **Bereitstellen → Bereitstellungen verwalten** → die bestehende
   Bereitstellung bearbeiten → **Version: Neue Version** → *Bereitstellen*.
   **Nicht** „Neue Bereitstellung“ – die bekäme eine neue Adresse, und alle Lesezeichen und
   Hallen-Tablets zeigten auf die alte.
3. Fertig. Blätter und Spalten, die eine neue Fassung mitbringt, legt die Anwendung beim
   ersten Aufruf selbst an. **🚒 FeuerwehrManager → Einrichten / Blätter prüfen** schadet nie
   und meldet, was es ergänzt hat.

Offene Browserfenster arbeiten mit dem alten Stand der Oberfläche weiter, bis sie neu
geladen werden. Änderungen, die dort noch in der Warteschlange stehen, gehen trotzdem
hinaus – der Server prüft sie wie jede andere.

Die Fassung steht unten links in der Seitenleiste, die Änderungen je Fassung in
`CHANGELOG.md`.

---

## Sichern und wiederherstellen

Die Daten sind eine Google-Tabelle – gesichert wird sie wie eine.

- **Versionsverlauf** (*Datei → Versionsverlauf*): Google hält ältere Stände von selbst vor.
  Eine Version wiederherstellen setzt alle Blätter zurück.
- **Kopie** (*Datei → Kopie erstellen*): nimmt das gebundene Skript mit, aber nicht die
  Bereitstellung. Gut als Sicherung vor einem größeren Eingriff.
- **Export**: *Datei → Herunterladen → Microsoft Excel* legt alle Blätter in eine Datei.
  Aus der Anwendung heraus gibt es CSV für Geräte, Lagerplätze, Fälligkeiten und Typen.

**Nach einem Wiederherstellen** oder jeder anderen Änderung am Blatt, die nicht über die
Anwendung lief: **🚒 FeuerwehrManager → Zwischenspeicher leeren.** Sonst zeigt die Web-App
bis zu sechs Stunden lang den Stand von vorher. (Das Bearbeiten einzelner Zellen bemerkt
die Anwendung selbst.)

---

## Datenschutz

Die Anwendung verarbeitet Personaldaten – mit der G26.3 auch **Gesundheitsdaten**
(Art. 9 DSGVO) und mit der Abschrift der Einsatztagebücher womöglich **Daten Dritter**
(Betroffene, Verletzte, Anwohner, wenn sie im Tagebuch stehen). Verantwortlich ist die
Wehr bzw. ihr Träger; Google ist über den bestehenden Workspace-Vertrag der Firma
Auftragsverarbeiter. Diese Übersicht ist die Grundlage für das Verzeichnis der
Verarbeitungstätigkeiten – sie ersetzt es nicht.

### Was wo liegt und wer es sieht

| Daten | Blatt / Ort | sehen in der Anwendung |
|---|---|---|
| Name, Rolle, gesperrt | Mitglieder | alle Mitglieder |
| Google-Adresse, Kürzel, „zuletzt da“, Ausweis seit | Mitglieder, Skripteigenschaften | nur Administrator |
| Ausweis | Ausweise – **nur als Abdruck**, der Code selbst steht nirgends | – |
| Qualifikationen und Nachweise (G26.3, Lehrgänge, Führerschein) | Qualifikationsarten, Nachweise | Gerätewart, Kommandant, Administrator |
| Einsätze: Kopfdaten, Bericht, wer wann dabei war, Funktion, unter Atemschutz | Einsätze, Einsatzkräfte | Gerätewart, Kommandant, Administrator |
| Abschrift der Einsatztagebücher (Freitext!) | Einsatztagebuch | ebenso – nur, wenn jemand den Bericht aufschlägt |
| Wer gebucht, geprüft, gezählt hat | Buchungen, Prüfungen, Inventuren – als Name | alle Mitglieder, in der Geräteakte (nicht am Hallengerät) |
| Jede Änderung mit Werten | Protokoll | Gerätewart, Kommandant, Administrator |
| Hallensitzungen (Abdruck des Tokens, Mitglied, Zeiten) | Skripteigenschaften | – |
| Kopien der Blätter | `CacheService`, höchstens sechs Stunden | – |
| Offene Änderungen, Zählgang in Arbeit; am Hallengerät dessen Geheimnis und Sitzung | `localStorage` des Browsers | wer an diesem Gerät sitzt |

Am **Hallengerät** gibt es keine Personaldaten, auch nicht mit dem Kürzel des
Gerätewarts. Ein **Dienstnachweis** für Stellen außerhalb der Wehr (Arbeitgeber) wird
**ohne** Qualifikationen erzeugt.

### Löschen und Aufbewahren

- **Mitglied entfernen** löscht seinen Zugang, seinen Ausweis und seine Nachweise. **Nicht**
  gelöscht wird sein Name dort, wo er Teil eines Belegs ist: Buchungen, Prüfnachweise,
  Zählungen, Einsatzberichte, Protokoll. Das ist Absicht – ein Prüfnachweis ohne Prüfer ist
  keiner. Wer einen Namen auch dort tilgen muss, tut das im Blatt von Hand und wägt es gegen
  die Aufbewahrungspflichten ab; das Protokoll bemerkt solche Änderungen nicht.
- **Einen Einsatzbericht löschen** löscht seine Kräfte und die Abschrift mit, und die
  Nachweise, die aus ihm folgten.
- **Fristen** setzt die Anwendung nicht durch. Wie lange Einsatzberichte, Nachweise und das
  Protokoll aufbewahrt werden, entscheidet die Wehr nach den Vorgaben ihres Trägers;
  gelöscht wird dann in der Anwendung (Berichte, Nachweise) oder im Blatt (Protokoll,
  ältere Buchungen).
- **Ausgeschaltetes Personalmodul** (*Einstellungen → Personal*) blendet die Personaldaten
  aus und lässt sie niemanden mehr bearbeiten – gelöscht sind sie damit nicht.

---

## Das Einsatztagebuch

Die Berichte kommen aus dem
[Einsatztagebuch](https://github.com/konsihdr/Feuerwehreinsatztagebuch), einer eigenen
Anwendung, die an der Einsatzstelle offline läuft. Übernommen wird ihr Export
**Speichern (JSON)** im Format `formatVersion: 1`:

| im Tagebuch | wird hier |
|---|---|
| `meta` (Bezeichnung, Ort, Stichwort, Nummer, Einsatzleitung, Datum + Alarmzeit) | Kopfdaten; Datum + Alarmzeit = Beginn |
| `tagebuch[]` | Abschrift, mit Gestrichenem (`geloescht`) und früheren Fassungen (`history`, `zeitHistory`) |
| `kraefte[]` mit `aktion` „eingesetzt“ / „abgerückt“ | Zeiträume je Name; dazu in der Abschrift |
| `erstelltAm` | Kennung – dieselbe Datei wird beim zweiten Mal erkannt |

Damit die Namen passen, liefert die Anwendung die Listen fürs Tagebuch
(*Einsätze & Stunden → Mitglieder.csv / Fahrzeuge.csv*, eine Angabe je Zeile); im Tagebuch
werden sie mit *CSV ↑* geladen. Am besten nach jeder Aufnahme eines Mitglieds neu.

Ändert sich das Format des Tagebuchs, muss der Leser hier mit (`tagebuchLesen` in
`src/js_einsaetze.html`; Testbeispiel `tagebuchBeispiel` in `test/umgebung.mjs`).

---

## Grenzen

| | Grenze | was daraus folgt |
|---|---|---|
| **Dauer** | jeder Aufruf 0,5–2 s, schreibend unter der Sperre mehr | Die Oberfläche wartet nicht darauf (Speichern im Hintergrund) |
| **Gleichzeitig** | 30 Ausführungen je Nutzer – und alles läuft als Eigentümer | Für eine Wehr genug. Schreibendes läuft ohnehin nacheinander |
| **Laufzeit** | 6 Minuten je Aufruf | Ein Import von einigen tausend Geräten geht, zehntausende nicht in einem Zug |
| **Zelle** | 50 000 Zeichen | Berichte sind auf 40 000 Zeichen begrenzt |
| **Zwischenspeicher** | 100 KB je Eintrag, etwa 1,2 Mio. Zeichen je Blatt | Größere Blätter werden bei jedem Aufruf frisch gelesen – langsamer, nicht falsch |
| **Datenstand im Browser** | Geräte, Stammdaten, die Einsatzberichte der letzten zwei Jahre | Ältere Berichte lädt die Jahresauswahl nach, nur zum Lesen |

Was am schnellsten wächst: das **Protokoll** und die **Abschrift der Einsatztagebücher**.
Beide werden zum Schreiben nicht gelesen. Wird eines davon sehr groß (einige
zehntausend Zeilen), lohnt es, alte Jahre in eine Archivtabelle zu verschieben – das ist
Handarbeit im Blatt; danach *Zwischenspeicher leeren*.

---

## Fehlersuche

| Was man sieht | Ursache | was zu tun ist |
|---|---|---|
| „Kein Google-Konto erkannt“ | Bereitstellung nicht auf *Ausführen als: Ich* + *Zugriff: Domain*, oder der Browser ist mit keinem Firmenkonto angemeldet | Bereitstellung prüfen; im Browser mit dem Firmenkonto anmelden |
| „… ist hier nicht als Mitglied eingetragen“ | Adresse fehlt oder ist gesperrt | *Mitglieder* – genau die angezeigte Adresse eintragen |
| Niemand ist mehr Administrator | Gesperrt, entfernt, Rolle geändert | In der Tabelle: **🚒 FeuerwehrManager → Administrator eintragen oder zurückholen** – eine vorhandene Adresse wird wieder aktiver Administrator |
| „Interner Fehler: …“ | Ein Programmfehler, keine Eingabe | Apps-Script-Editor → *Ausführungen*: dort steht der vollständige Fehler. Bitte als Issue melden (ohne Personaldaten) |
| „Gerade wird zu viel gleichzeitig gebucht“ | Die Sperre war 30 Sekunden belegt | Nichts – der Browser versucht es selbst noch einmal |
| Änderungen im Blatt erscheinen nicht | Zwischenspeicher | **Zwischenspeicher leeren** |
| Hallen-Tablet zeigt „kein Zugang“ statt der Anmeldung | Browserdaten gelöscht – das Gerätegeheimnis ist weg | Am Schreibtisch neu koppeln (*Einstellungen → Fahrzeughalle → Gerät koppeln*), das alte Gerät entfernen |
| Hallen-Tablet verloren | – | *Einstellungen → Fahrzeughalle → Sperren*; Ausweise und Kürzel bleiben gültig |
| Einsatztagebuch: „Das ist kein Einsatztagebuch“ | Falsche Datei, oder nicht *Speichern (JSON)*, sondern der PDF-Export | Im Tagebuch **Speichern (JSON)** |
| Einsatztagebuch: „schon übernommen“ | Dieselbe Datei (oder ein späterer Stand desselben Einsatzes) | Haken *Den bisherigen Bericht ersetzen* – oder es lassen |
| Ein Bericht fehlt in der Liste | Er liegt in einem anderen Jahr | Jahresauswahl oben |

---

## Die Vorschau

`node test/vorschau.mjs` baut `dist/vorschau.html`: die ganze Anwendung in einer Datei, mit
einer Attrappe der Google-Dienste und Demo-Daten im Browser. Zum Ansehen und Ausprobieren,
**nicht zum Betrieb** – angemeldet wird dort per Schalter am linken Rand, und die Daten
liegen im `localStorage` des Browsers. Nicht ins Netz stellen.
