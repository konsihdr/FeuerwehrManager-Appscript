# Bedienung

> Für alle, die mit der Anwendung arbeiten – nach Aufgaben, nicht nach Menüpunkten.
> Einrichten und Betreiben: `README.md` und `docs/BETRIEB.md`. Warum etwas so ist, wie es
> ist: `CLAUDE.md`.

**Stand 0.3.0 (Beta).** Die Bildschirmtexte sind die der Anwendung; was hier „Knopf“
heißt, steht dort so auf dem Knopf.

---

## Wer was sieht

| Rolle | Schreibtisch | Halle |
|---|---|---|
| **Mitglied** | Aktionsliste, Geräte, Gerätesätze, Etiketten, Mitglieder (nur Namen) – lesen, umlagern, „Gereinigt“ abhaken | umlagern, nachsehen, Reinigung abhaken, zählen |
| **Gerätewart** | dazu Prüfungen, Stammdaten, Sätze, Import, Protokoll; **Atemschutz & Nachweise**, **Einsätze & Stunden** | wie Mitglied |
| **Kommandant** | Technik nur lesen; **Atemschutz & Nachweise**, **Einsätze & Stunden**, **Qualifikationsarten**, Protokoll | wie Mitglied |
| **Administrator** | alles, dazu Mitglieder, Ausweise, Hallengeräte, Regeln, Einstellungen | wie Mitglied – Verwaltung geht in der Halle auch für ihn nicht |

Was eine Rolle nicht darf, zeigt die Seitenleiste gar nicht erst.

---

## Anmelden

**Am Schreibtisch und am eigenen Telefon** meldet das Firmenkonto an – es gibt kein
Kennwort für diese Anwendung und kein „Abmelden“. Steht dort „… ist hier nicht als Mitglied
eingetragen“, dem Administrator die angezeigte Adresse sagen.

**Am Hallen-Tablet** den **Ausweis** (QR-Code) vor die Kamera halten oder mit dem
Handscanner lesen – oder das **Kürzel** tippen. Oben steht, wer angemeldet ist und womit.
Ein geteiltes Tablet meldet nach ein paar Minuten ohne Eingabe von selbst ab; wer fertig
ist, tippt **Abmelden**. Sonst bucht der nächste Trupp auf den eigenen Namen.

Vom Telefon in die Halle: Knopf **Halle** in der Kopfzeile. Zurück: **Schreibtisch**.

---

## Speichern – oben rechts

Es gibt keinen Speichern-und-warten-Moment. Was man tut, steht sofort da; gespeichert wird
im Hintergrund. Der Punkt oben rechts sagt, wo die Sache steht:

| Anzeige | heißt |
|---|---|
| ● **Gespeichert** | alles ist in der Tabelle |
| ● **Speichert …** | ist schon zu sehen, wird gerade geschrieben |
| ● **Offline · 2** | keine Verbindung; die Änderungen warten in diesem Browser und gehen hinaus, sobald es wieder geht – auch nach einem Neuladen |

Ein Klick darauf zeigt, was wartet. Lehnt der Server eine Änderung ab (jemand anders war
schneller, der Name ist schon vergeben), verschwindet sie wieder und eine rote Meldung sagt
warum – mit **Nochmal öffnen** für den Dialog samt Eingaben. Was andere ändern, erscheint
nach spätestens 15 Sekunden von selbst.

> An einem Rechner, den andere mitbenutzen: erst gehen, wenn **Gespeichert** dasteht.

---

## In der Halle

Vier Reiter unten: **Umlagern**, **Info**, **Arbeit**, **Zählen**. Gescannt wird mit der
Kamera, einem Handscanner (tippt wie eine Tastatur) oder per Hand ins Feld.

### Geräte umlagern

1. **Umlagern**: die Geräte scannen. Das Etikett eines **Gerätesatzes** nimmt alle seine
   Teile mit. Das Etikett eines **Lagerplatzes** wird zum Ziel.
2. **Weiter**, Ziel wählen (oder scannen), **Grund** wählen.
3. **… buchen**.

Der Grund zählt: **Einsatz** stellt das Gerät auf „zu reinigen“ (und je nach den Regeln der
Wehr die nächste Prüfung sofort fällig), **Übung** auf „einsatzbereit“, **Defekt gemeldet**
auf „defekt“. Ein defektes Gerät bleibt defekt, auch wenn es nach einer Übung zurückkommt.

### Nachsehen

**Info**: scannen – was ist das, wo gehört es hin, wann ist es fällig, in welchem Satz. Ein
Lagerplatz zeigt seinen Bestand.

### Reinigen

**Arbeit**: was zu reinigen ist. **Gereinigt** tippen – das Gerät ist wieder
einsatzbereit. Reparaturen sieht man hier auch; **Instandgesetzt** dürfen Gerätewart und
Administrator abhaken.

### Zählen (Inventur)

**Zählen**: Lagerplatz wählen oder scannen, dann alles scannen, was dort liegt.
**Abschließen** zeigt den Befund: *gefunden*, *fehlt*, *fremd* (liegt hier, gehört
woandershin). Fremde Geräte lassen sich gleich hierher buchen; was fehlt, auf Wunsch nach
„Vermisst“, wenn die Wehr diesen Platz eingestellt hat. Ein unterbrochener Zählgang lässt
sich fortsetzen.

---

## Am Schreibtisch

### Die Aktionsliste

Die Startseite. Oben die Kennzahlen (überfällig, bald fällig, zu reinigen, Werkstatt,
defekt, unvollständige Sätze, für Personal auch die Atemschutz-Zahlen), darunter alles, was
zu tun ist: fällige Prüfungen, Reinigung, Reparatur – und ablaufende Nachweise. Der
Zeitraum oben stellt ein, wie weit voraus. **Arbeitsliste als PDF** zum Mitnehmen in die
Werkstatt: mit Kästchen und Linie zum Abzeichnen.

### Geräte und Geräteakte

**Geräte**: Suche, Filter (Status, Typ, Ort), Mehrfachauswahl für **Umlagern**,
**Etiketten** und – für die Technik – **Status**. Ein Klick öffnet die **Geräteakte**: Prüfpläne mit
Fälligkeit, Prüfnachweise (als PDF), Bewegungen, Zählungen. Die Akte steht in der Adresse –
man kann sie verschicken.

### Eine Prüfung erfassen *(Gerätewart, Administrator)*

Aus der Aktionsliste oder der Akte: **Prüfung erfassen**. Die Checkliste des Prüfplans
abarbeiten (Haken, Messwert, Freitext); solange Pflichtschritte offen sind, bleibt
**Speichern** gesperrt und sagt warum. Bestanden schiebt den nächsten Termin, holt das Gerät
aus Werkstatt oder Reparatur zurück; nicht bestanden macht es defekt. Wer bewusst nichts am
Status ändern will, wählt „unverändert“. Der **Prüfnachweis** ist danach als PDF da.

### Stammdaten *(Gerätewart, Administrator)*

- **Gerätetypen & Prüfpläne**: je Typ die Pläne mit Intervall und Checkliste. Ein Plan nur
  für ein einzelnes Gerät (Sonderplan) geht aus dessen Akte. Ein geändertes Intervall
  verschiebt die Termine gleich mit.
- **Lagerplätze**: mit Unterplätzen (das Fahrzeug in der Halle) und Code fürs Etikett.
- **Umlagerungsgründe**: mit Folge-Status. Benutzte Gründe stilllegen statt löschen.
- **Gerätesätze**: Satzarten als Vorlage (was gehört hinein, wie viele), Sätze danach;
  angezeigt wird, ob ein Satz vollständig ist.
- **Etiketten**: Code 128 zum Drucken, für Geräte, Plätze und Sätze.
- **Import & Export**: Geräte aus Excel oder CSV übernehmen (ganz oder gar nicht, mit
  Vorschau der Probleme), Listen als CSV hinaus.

---

## Atemschutz & Nachweise *(Gerätewart, Kommandant, Administrator)*

**Atemschutz & Nachweise** zeigt, wer heute unter Atemschutz darf: *tauglich* heißt, jede
als „Voraussetzung für Atemschutz“ markierte Qualifikation ist gültig (typisch G26.3,
Lehrgang, Belastungsübung). Filter nach Stand, Suche nach Namen, **Atemschutzliste (PDF)**.

### Einen Nachweis erfassen oder erneuern

**Nachweis erfassen** (oder **Erneuern** in der Personalakte): Mitglied, Qualifikation,
**Erworben am**. **Gültig bis** schlägt die Art vor (G26.3: 36 Monate) – maßgeblich ist das
Datum auf der Bescheinigung; bei der G26.3 hängt es am Alter. Der bisherige Nachweis bleibt
als Beleg stehen und zählt nicht mehr. **Berichtigen** ist für Tippfehler, nicht zum
Verlängern.

### Die Personalakte

Ein Klick auf einen Namen: der Stand je Qualifikation, der Verlauf ersetzter Nachweise,
dazu **Einsätze & Stunden** des laufenden Jahres und der **Dienstnachweis (PDF)**.

### Qualifikationsarten *(Kommandant, Administrator)*

Name, Gültigkeit (leer = läuft nicht ab), ob sie **Voraussetzung für Atemschutz** ist –
und ob sie **durch einen Einsatz oder eine Übung unter Atemschutz erbracht** wird. Eine
solche Art trägt niemand ein: Sie folgt aus den Einsatzberichten (siehe unten). Arten mit
Nachweisen werden stillgelegt statt gelöscht.

---

## Einsätze & Stunden *(Gerätewart, Kommandant, Administrator)*

### Nach dem Einsatz: das Einsatztagebuch übernehmen

An der Einsatzstelle wird das
[Einsatztagebuch](https://github.com/konsihdr/Feuerwehreinsatztagebuch) geführt. Danach:

1. Im Einsatztagebuch **Speichern (JSON)** – die Datei auf den Rechner bringen.
2. Hier **Einsatztagebuch übernehmen** und die Datei wählen.
3. Kopfdaten prüfen: Bezeichnung, Nummer, Stichwort, Ort, Einsatzleitung kommen aus dem
   Tagebuch; **Beginn** ist die Alarmzeit, **Ende** der letzte Eintrag.
4. Die Liste **Wer und was dabei war** durchsehen. Jeder Name ist zugeordnet – einem
   **Mitglied**, als **Fahrzeug oder Gerät**, als **Gastkraft** (kein Mitglied, etwa die
   Nachbarwehr) – oder *nicht übernehmen*. Darunter die Zeiten: Wer zwischendurch abrückte,
   hat zwei; wer nie abrückte, war bis zum Ende da („ohne Abrücken“).
5. **Atemschutz** ankreuzen, wer unter Atemschutz war. Steht im Kommentar „PA“, „AGT“ oder
   „Atemschutz“, ist der Haken schon gesetzt – prüfen.
6. **Übernehmen**. Der Bericht ist sofort offen.

Dieselbe Datei ein zweites Mal (etwa erst ein Zwischenstand, dann der fertige Stand): Die
Anwendung erkennt sie und übernimmt nur, wenn **Den bisherigen Bericht ersetzen**
angekreuzt ist. Was am alten seitdem geändert wurde, geht dabei verloren.

> **Damit die Namen passen:** unten auf der Seite **Mitglieder.csv** und **Fahrzeuge.csv**
> herunterladen und im Einsatztagebuch bei *Mitglieder* bzw. *Gegenstände* mit **CSV ↑**
> laden. Dann steht auf dem Tablet jeder Name genau so wie hier, und die Zuordnung stimmt
> von selbst.

### Den Bericht schreiben und ergänzen

Im Bericht: **Bericht schreiben** (Lage bei Eintreffen, Maßnahmen, Besonderheiten),
Kopfdaten berichtigen. Unter **Einsatzkräfte** und **Fahrzeuge & Gerät** lässt sich jede
Zeile bearbeiten oder herausnehmen, **Einsatzkraft eintragen** trägt nach. Der Reiter
**Einsatztagebuch** zeigt die Abschrift – gestrichene Einträge durchgestrichen, frühere
Fassungen darunter; ändern lässt sie sich nicht. **Bericht (PDF)** legt alles mit
Unterschriftslinie auf ein Blatt.

### Übungen und Wachen

**Bericht erfassen**: Art (Übung ist vorgewählt), Bezeichnung, Beginn, Ende, und unter
**Wer war dabei** die Teilnehmer ankreuzen – auf Wunsch je Teilnehmer *unter Atemschutz*.
Alle bekommen die Zeit von Beginn bis Ende; wer früher ging, wird danach im Bericht
berichtigt.

### Stunden und Nachweise

- **Stunden je Mitglied** (Reiter auf der Seite): Einsätze, Übungen, Wachen und sonstige
  Dienste des gewählten Jahres, je Anzahl und Stunden; **Stunden (PDF)** für den
  Jahresbericht.
- **Dienstnachweis (PDF)** aus der Personalakte: alle Dienste eines Jahres mit Zeiten. Mit
  Haken **Qualifikationen und Atemschutz aufnehmen** für das Mitglied selbst, **ohne** für
  den Arbeitgeber – den geht die G26.3 nichts an.
- **Nachweise aus Einsätzen**: Für eine Qualifikationsart mit *erbracht durch Einsatz oder
  Übung unter Atemschutz* zählt der letzte Bericht, in dem das Mitglied unter Atemschutz
  war. In der Personalakte steht dann „aus dem Bericht …“ mit Verweis. Wird der Bericht
  berichtigt oder gelöscht, ändert sich der Nachweis mit.

Die Jahresauswahl oben zeigt auch ältere Jahre; die sind nur zum Lesen da.

---

## Verwaltung *(Administrator)*

- **Mitglieder**: aufnehmen mit Name, **Google-Adresse aus dem Firmenkonto**, Kürzel,
  Rolle. **Ausweis** (Kartensymbol): Der QR-Code erscheint genau einmal – gleich drucken.
  Ein neuer Ausweis macht den alten ungültig. Sperren ist umkehrbar, entfernen nicht.
- **Regeln**: „Wenn nach einer Umlagerung mit Grund Einsatz, dann Prüfung sofort fällig“ –
  Auslöser, Bedingungen, Aktionen.
- **Einstellungen**: Name der Wehr und Logo (für die PDFs), Vorwarnzeiten, Barcode-Präfixe,
  Platz für „Vermisst“, Personalmodul an/aus, **Fahrzeughalle** (Hallengeräte koppeln,
  sperren, Kürzel erlauben). Wie man ein Tablet koppelt: `README.md`, *Die Fahrzeughalle*.
- **Protokoll** (auch Gerätewart und Kommandant): jede Änderung, wer, wann, was – mit
  Suche.

---

## Wenn etwas nicht geht

| Was man sieht | was es heißt |
|---|---|
| „… ist hier nicht als Mitglied eingetragen“ | Die Adresse fehlt im Blatt „Mitglieder“ oder ist gesperrt – Administrator fragen, die angezeigte Adresse nennen |
| „Kein Google-Konto erkannt“ | Die Bereitstellung stimmt nicht (`docs/BETRIEB.md`) |
| **Offline · n** bleibt stehen | Keine Verbindung. Nichts geht verloren; die Änderungen gehen hinaus, sobald es wieder geht. Ein Klick auf die Anzeige → **Jetzt senden** |
| „Nicht gespeichert – …“ | Der Server hat abgelehnt, die Begründung steht dabei. **Nochmal öffnen** bringt den Dialog mit den Eingaben zurück |
| Halle: „Zu viele Fehlversuche an diesem Gerät“ | Zehnmal falsch – eine Viertelstunde warten |
| Halle: „Ausweis oder Kürzel nicht erkannt“ | Ausweis ersetzt, Mitglied gesperrt oder Kürzel an diesem Gerät abgeschaltet |
| Kamera geht nicht | Der eingebettete Rahmen gibt sie nicht frei – dann öffnet sich die Kamera-App, oder Handscanner/Eintippen. Safari kann keine Codes lesen |
