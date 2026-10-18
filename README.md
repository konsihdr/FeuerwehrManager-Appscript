# 🚒 FeuerwehrManager – Apps-Script-Fassung

Lager- und Prüfverwaltung für **eine** Feuerwehr, gebaut aus nichts als einer Google-Tabelle
und dem Apps Script dahinter. Gerätetypen, Geräte, Gerätesätze, Lagerplätze, Prüfpläne mit
Checklisten, Buchungen, Inventur, Regeln, Etiketten, Ausweise, Atemschutz-Nachweise
(G26.3), Einsatzberichte mit Stunden je Mitglied – und ein Protokoll über alles.

> ### Stand 2026-10-18 · Version 0.3.0 · Beta
>
> **Beta:** Vollständig geprüft gegen eine Attrappe der Google-Dienste und im echten Browser –
> aber noch nicht im Dauerbetrieb einer Wehr. Welche Annahmen erst echtes Apps Script
> bestätigt, steht in `CLAUDE.md` (Abschnitt 6) und `SECURITY.md` (Abschnitt 5).
>
> Fachlich nachgebaut nach dem SaaS-Produkt (`../FeuerwehrManager-SaaS`, Stand 0.4.0).
> **Keine Bibliothek, kein CDN, kein Build**: Was in `src/` steht, ist alles, was läuft –
> Server wie Oberfläche. Geprüft mit 835 Zusicherungen gegen eine Attrappe der
> Google-Dienste und 178 im echten Browser, die Barcodes von zbar gelesen.
>
> **Läuft in einem Google-Workspace-Tenant:** Am Schreibtisch meldet das Firmenkonto an,
> in der Halle Ausweis (QR) oder Kürzel am angemeldeten Hallengerät.
>
> **Neu in 0.2:** Die Oberfläche wartet nicht mehr auf die Tabelle – jede Änderung steht
> sofort da und wird im Hintergrund gespeichert; was andere ändern, kommt alle 15 Sekunden.
> Und das **Personalmodul**: Gerätewart und Kommandant verfolgen G26.3, Lehrgang und
> Belastungsübung der Mannschaft.
>
> **Neu in 0.3: Einsätze & Stunden.** Den JSON-Export des
> [Einsatztagebuchs](https://github.com/konsihdr/Feuerwehreinsatztagebuch) übernehmen –
> daraus werden Bericht, Einsatzzeiten je Kraft, Stunden je Mitglied, der Dienstnachweis
> als PDF und Nachweise für „unter Atemschutz“. Übungen und Wachen von Hand.

| Dokument | für wen |
|---|---|
| **README.md** (hier) | Überblick, Einrichten, was die Anwendung kann |
| [docs/BEDIENUNG.md](docs/BEDIENUNG.md) | alle, die damit arbeiten – nach Aufgaben |
| [docs/BETRIEB.md](docs/BETRIEB.md) | wer sie betreut: aktualisieren, sichern, Datenschutz, Fehlersuche |
| [SECURITY.md](SECURITY.md) | Bedrohungsmodell, Maßnahmen mit Nachweis, Lücken melden |
| [CHANGELOG.md](CHANGELOG.md) | was sich je Fassung geändert hat |
| [CLAUDE.md](CLAUDE.md) | warum es so gebaut ist – Entscheidungen, Befunde, offene Punkte |
| [LICENSE](LICENSE) | MIT |

---

## Drei Produkte, ein Ursprung

| | Wehr-Produkt | SaaS | **Apps Script (hier)** |
|---|---|---|---|
| Für wen | eine Wehr | viele Wehren auf einer Anlage | **eine Wehr** |
| Betrieb | Raspberry Pi in der Wache | Supabase + Cloudflare | **Google-Tabelle + Apps Script** |
| Daten liegen | bei der Wehr | beim Betreiber | **im Google Drive der Wehr** |
| Kosten / Pflege | Hardware, Updates | zwei Dienste | **nichts außer dem Workspace-Tenant** |
| Anmeldung | Kennwort oder Ausweis | E-Mail + Kennwort, Ausweis am Hallengerät | **Firmenkonto (Google), am Hallengerät Ausweis oder Kürzel** |
| Rechte durchgesetzt in | der API | der Datenbank (RLS) | **der einen Tür `aufruf()`** |

Die Fassung ist für die Wehr gedacht, die keinen Server betreiben und keinen Dienst
bezahlen will, deren Leute aber ohnehin ein Konto im Google-Workspace der Firma haben –
und die ihre Daten in einer Tabelle sehen möchte, die sie selbst öffnen kann.

### Was hier bewusst fehlt

- **Mehrere Wehren auf einer Anlage, der Betreiberbereich.** Eine Tabelle ist eine Wehr.
  Eine zweite Wehr kopiert die Tabelle. Damit entfällt die Mandantentrennung nicht als
  Lücke, sondern als Frage: Es gibt nichts, wovon man getrennt werden müsste.
- **Die zweistufige Datenschutz-Zustimmung.** Im SaaS-Produkt war sie das Tor zwischen
  Betreiber und Wehr. Hier ist die Wehr selbst der Betreiber und damit der
  Verantwortliche; die Daten liegen in ihrem eigenen Konto. Was sie ihren Mitgliedern
  dazu sagen muss, sagt sie ihnen ohnehin.
- **Kennwörter, Einladungsmails, „Kennwort vergessen“.** Wer im Firmen-Tenant ein Konto
  hat, ist bei Google schon angemeldet. Aufnehmen heißt: die Adresse eintragen. Wer das
  Firmenkonto verliert, verliert damit den Zugang am Schreibtisch – Ausweis und Kürzel in
  der Halle erst, wenn er auch in der App gesperrt ist.
- **Das Tagebuch an der Einsatzstelle.** Das führt die Wehr in ihrer eigenen kleinen
  Anwendung, die offline auf dem Tablet läuft; hierher kommt der fertige Export. Ein Weg
  zurück (Bericht aus der App ins Tagebuch) ist nicht nötig und nicht gebaut.

---

## Aufbau

```
   Browser (Schreibtisch oder Telefon in der Halle)
      │  zeigt jede Änderung sofort (Vorhersage mit dem Code aus 05_Gemeinsam.js),
      │  sammelt sie in einer Warteschlange und schickt sie als Stapel
      │
      │  google.script.run → aufruf(token, aktion | 'stapel', argumente)   ← die einzige Tür
      ▼
   Apps Script Web-App, läuft als Eigentümer der Tabelle
      │  Sitzung prüfen → Rolle prüfen → Vorgang unter Sperre → festschreiben + Protokoll
      ▼
   Google-Tabelle: ein Blatt je Tabelle (Geräte, Buchungen, Prüfungen, Protokoll …)
```

```
src/                      ← genau das, was nach Apps Script geht
├── appsscript.json       Zeitzone, Web-App, Berechtigungen (nur diese eine Tabelle)
├── 00_Schema.js          Das Datenmodell: Blätter, Spalten, Verweise, Eindeutigkeit
├── 01_Hilfen.js          Fehler, Datum, Zufall, Abdrücke, Kennungen aus dem Browser
├── 02_Speicher.js        Blätter lesen/schreiben, Zwischenspeicher mit Revisionen
├── 03_Vorgang.js         „Transaktion“: Regeln aus dem Schema, ganz oder gar nicht, Protokoll
├── 04_Sitzung.js         Wer ruft an: Firmenkonto, oder am Hallengerät Ausweis/Kürzel
├── 05_Gemeinsam.js       Was Server UND Browser rechnen: Ableitungen, Regeln, Prüfungen
├── 10_Tuer.js            doGet und aufruf() – Rechte, Sperre, Stapel, Antwort
├── 20_Stand.js           Datenstand für den Browser
├── 21_Betrieb.js         Umlagern, Regeln, Zustände
├── 22_Pruefungen.js      Fälligkeiten, Prüfung erfassen
├── 23_Stammdaten.js      Lagerplätze, Typen, Pläne, Schritte, Geräte, Import, Einstellungen
├── 24_Saetze.js          Gerätesätze und Satzarten
├── 25_Inventur.js        Zählgang
├── 26_Mitglieder.js      Mitglieder, Ausweise, Hallengeräte, Kopplung
├── 27_Pdf.js             Prüfnachweis, Arbeitsliste, Atemschutzliste, Einsatzbericht,
│                         Dienstnachweis, Stundenübersicht als PDF (serverseitig)
├── 28_Protokoll.js       Protokoll lesen
├── 29_Einsaetze.js       Einsatzberichte, Kräfte, Abschrift des Tagebuchs, Archiv
├── 29_Personal.js        Qualifikationsarten und Nachweise (G26.3)
├── 30_Einrichtung.js     Menü in der Tabelle: einrichten, Administrator, Demo, Adresse
├── 31_Demo.js            Demo-Daten (wie im SaaS-Produkt)
├── index.html            Gerüst
├── stil.html             Design-System (Tokens aus dem SaaS-Produkt, dunkles Thema)
└── js_*.html             Oberfläche: Grundlagen, Bausteine (Code 128, QR, Scanner),
                          Speichern im Hintergrund (js_sync), Dialoge, Schreibtisch,
                          Personal, Einsätze, Halle, Start
test/
├── attrappe.js           Die Google-Dienste nachgebaut – streng, wo Google streng ist
├── server.mjs            835 Prüfungen des Servers, durch dieselbe Tür wie der Browser –
│                         dazu: sagt der Browser jede Änderung so voraus, wie der Server sie macht?
├── vorschau.mjs          baut dist/vorschau.html: Server + Oberfläche im Browser, ohne Google
├── oberflaeche.mjs       178 Prüfungen im echten Chromium, Codes von zbar gelesen
├── umgebung.mjs          Servercode laden wie Apps Script, Browser ohne Bildschirm,
│                         ein Beispiel-Export des Einsatztagebuchs
└── browser.mjs           Chromium fernsteuern über das DevTools-Protokoll, ohne Bibliothek
docs/
├── BEDIENUNG.md          nach Aufgaben: Halle, Schreibtisch, Personal, Einsätze
└── BETRIEB.md            aktualisieren, sichern, Datenschutz, Grenzen, Fehlersuche
```

---

## Einrichten

### 1. Tabelle und Skript

1. Eine **neue, leere Google-Tabelle** anlegen, z. B. „FeuerwehrManager FF Musterstadt“.
2. In der Tabelle **Erweiterungen → Apps Script** öffnen. Das ist das Skript, das zu
   dieser Tabelle gehört – nur so darf es auf sie zugreifen, ohne Zugriff auf das ganze
   Drive zu verlangen.
3. Die Dateien aus `src/` hineinbringen – auf einem der zwei Wege:

**Mit clasp** (empfohlen, eine Minute):

```bash
npm install -g @google/clasp
clasp login
# Die Skript-ID steht im Apps-Script-Editor unter Projekteinstellungen.
cp .clasp.json.example .clasp.json   # scriptId eintragen
clasp push
```

**Von Hand:** Im Editor für jede Datei aus `src/` eine Datei gleichen Namens anlegen –
`.js` als *Skript* (ohne Endung, der Editor hängt `.gs` an), `.html` als *HTML* – und den
Inhalt hineinkopieren. Unter *Projekteinstellungen* „appsscript.json im Editor anzeigen“
einschalten und `src/appsscript.json` dorthin kopieren.

### 2. Einrichten über das Menü

Die Tabelle neu laden. Oben erscheint **🚒 FeuerwehrManager**.

1. **Einrichten / Blätter prüfen** – beim ersten Mal fragt Google nach der Berechtigung.
   Verlangt werden genau vier: *diese* Tabelle bearbeiten, ein Menü anzeigen, einen
   Auslöser anlegen, die eigene Adresse sehen. Danach stehen 26 Blätter da, jedes mit
   Kopfzeile.
2. **Administrator eintragen …** – Google-Adresse (leer = die eigene), Name, Kürzel.
3. *(optional)* **Demo-Daten einspielen** – 8 Lagerplätze, 10 Gerätetypen, 33 Geräte,
   Buchungen, Prüfungen, 4 Sätze, 2 Regeln, 6 Qualifikationen und sechs erfundene
   Mitglieder (`…@demo.invalid`) mit Atemschutz-Nachweisen in jedem Zustand, dazu fünf
   Einsätze, Übungen und Wachen. Echte Mitglieder bekommen keine erfundenen Nachweise und
   tauchen in keinem Demo-Bericht auf. Nur in eine leere Tabelle; ein zweiter Lauf
   verweigert.

> **Warum über das Menü und nicht in der Web-App?** Eine frische Anlage hat keinen
> Zugang, und ohne Zugang kann niemand einen anlegen. Eine Einrichtungsseite in der
> Web-App wäre die Tür, durch die der Erste, der die Adresse findet, Administrator wird.
> Wer das Menü sieht, hat die Tabelle offen – und besitzt die Daten ohnehin.

Derselbe Menüpunkt ist der **Notausgang**: Gibt man eine vorhandene Adresse an, wird sie
wieder aktiver Administrator.

### 3. Als Web-App bereitstellen

Im Apps-Script-Editor: **Bereitstellen → Neue Bereitstellung → Typ: Web-App**

| Feld | Wert | warum |
|---|---|---|
| Ausführen als | **Ich** | Nur so schreibt die App in die Tabelle, ohne dass die Mitglieder Bearbeitungsrechte darauf brauchen. Wer die hätte, könnte an Rollen und Protokoll vorbei direkt in die Zellen tippen. |
| Zugriff | **Alle in *eurer Domain*** | Nur in dieser Kombination nennt Google der App die Adresse des Besuchers – das Firmenkonto ist dann die Anmeldung. Bei „Jeder“ käme die Adresse leer an, und niemand käme hinein. |

Die Adresse (`…/exec`) an die Mitglieder geben; im Menü steht sie unter **Adresse der
Web-App anzeigen**. Am Telefon: im Browser öffnen, „Zum Startbildschirm hinzufügen“.

Ein Konto, das noch nicht eingetragen ist, sieht „… ist hier nicht als Mitglied
eingetragen“ – mit seiner Adresse, damit es dem Administrator sagen kann, welche er
eintragen soll.

**Aktualisieren:** Nach `clasp push` unter *Bereitstellungen verwalten* die bestehende
Bereitstellung bearbeiten und *Neue Version* wählen. **Nicht** „Neue Bereitstellung“ –
die bekäme eine neue Adresse. Blätter und Spalten, die eine neue Fassung mitbringt (0.2:
„Qualifikationsarten“, „Nachweise“; 0.3: „Einsätze“, „Einsatzkräfte“, „Einsatztagebuch“
und die Spalte `aus_einsatz`), legt die App beim ersten Aufruf selbst an;
**Einrichten / Blätter prüfen** schadet trotzdem nie.

### 4. Die Fahrzeughalle

Das Tablet an der Hallenwand ist bei Google mit irgendeinem Konto angemeldet – am besten
einem eigenen, das **kein** Mitglied ist (etwa `halle@…`). Wer davorsteht, meldet sich
dort mit **Ausweis** (QR-Code) oder **Kürzel** an.

1. Am Schreibtisch: **Einstellungen → Fahrzeughalle → Gerät koppeln** – Name vergeben,
   „geteilt“ (meldet sich nach Untätigkeit selbst ab, sonst bucht der nächste Trupp auf
   den Namen des vorigen) und ob das Kürzel gilt. Es erscheint ein Code wie `K7QM-3HTA`,
   eine Viertelstunde gültig.
2. Auf dem Tablet die Web-App öffnen. Dort steht „kein Zugang“ – darunter **Dieses Gerät
   als Hallengerät einrichten …**, Code eintippen. Ab jetzt zeigt das Tablet die
   Hallen-Anmeldung, egal welches Google-Konto darauf angemeldet ist.
3. **Mitglieder → Ausweis** (Kartensymbol) – der QR-Code erscheint **einmal** zum
   Ausdrucken. Die Tabelle kennt nur seinen Abdruck. Das Kürzel steht beim Mitglied.

Sitzt ein Administrator selbst am Gerät, geht es auch direkt: **Dieses Gerät**.

> **Ausweis oder Kürzel – der Unterschied.** Der Ausweis ist ein Geheimnis (160 Bit). Das
> Kürzel ist eine Selbstauskunft: Wer es kennt, kann es tippen – wie eine Unterschrift
> auf der Liste an der Hallenwand. Beides wirkt nur an einem angemeldeten Hallengerät,
> und das Protokoll hält fest, womit sich jemand angemeldet hat. Wo das nicht reicht,
> lässt sich das Kürzel je Gerät abschalten (**Nur Ausweis**).

Wer das eigene Telefon nimmt, braucht das alles nicht: Darauf ist das Firmenkonto
angemeldet, und die Halle ist ein Knopf in der Kopfzeile.

| Fall | was zu tun ist |
|---|---|
| Ausweis verloren | *Mitglieder → Ausweis* – der alte gilt ab dann nicht mehr |
| Tablet verloren | *Einstellungen → Fahrzeughalle → Sperren* – Ausweise und Kürzel der Mannschaft bleiben gültig |
| Kürzel missbraucht | am Gerät **Nur Ausweis** – laufende Kürzel-Sitzungen enden sofort |
| Browserdaten gelöscht | Gerät neu anmelden; das Geheimnis lag nur dort |
| Mitglied tritt aus | sperren oder entfernen – Ausweis und Kürzel gehen mit |

Eine Anmeldung am Hallengerät taugt für die Halle und für nichts sonst – **auch beim
Administrator**: Wer das Tablet erwischt und ein Kürzel kennt, kann buchen und zählen,
aber niemanden aufnehmen und keinen Ausweis ausgeben.

---

## Was die Anwendung kann

**Ohne Warten.** Jede Änderung – Buchen, Prüfung, Gerät anlegen, Nachweis – steht sofort
da; der Dialog geht zu, gespeichert wird im Hintergrund. Oben rechts sagt ein Punkt, wo
die Sache steht: *Gespeichert*, *Speichert …* oder *Offline · 2 Änderungen warten*. Reißt
die Verbindung ab (Halle aus Stahlbeton), warten die Änderungen im Browser – auch über
ein Neuladen hinweg – und gehen hinaus, sobald es wieder geht. Lehnt der Server eine ab
(jemand anders war schneller), verschwindet sie wieder, und eine Meldung sagt warum – mit
**Nochmal öffnen** für den Dialog samt Eingaben. Was andere ändern, erscheint nach
spätestens 15 Sekunden von selbst.

**Schreibtisch** – Aktionsliste mit Kennzahlen (überfällig, bald fällig, zu reinigen,
Werkstatt, defekt, unvollständige Sätze) und der Arbeitsliste zum Abhaken; Geräte mit
Filter, Mehrfachauswahl, Umlagern, Status, CSV; die **Geräteakte** (Prüfpläne mit
Fälligkeit, Prüfnachweise als PDF, Bewegungen, Zählungen – sie steht in der Adresse und
lässt sich verschicken); Gerätesätze mit Soll/Ist gegen ihre Vorlage; Gerätetypen mit
Prüfplänen und Checklisten (Haken, Messwert, Freitext; Sonderpläne für einzelne Geräte;
abweichende Intervalle je Gerät); Lagerplätze mit Unterplätzen und „zuletzt gezählt“;
Umlagerungsgründe mit Folge-Status; Etiketten (Code 128) zum Drucken; Mitglieder mit
Firmenkonto, Kürzel, Rolle und Ausweis; Protokoll mit Suche; Import aus Excel/CSV
(ganz oder gar nicht); Regeln („wenn Einsatz, dann Prüfung sofort fällig“);
Einstellungen mit Logo für den Briefkopf; dunkles Thema.

**Personal** (Gerätewart, Kommandant, Administrator) – **Atemschutz & Nachweise**: wer heute
atemschutztauglich ist (jede als „Voraussetzung für Atemschutz“ markierte Qualifikation
gültig – typisch G26.3, Lehrgang, Belastungsübung), was in den nächsten 60 Tagen abläuft,
die **Personalakte** je Mitglied mit Verlauf. Erneuert wird mit einem neuen Nachweis, der
alte bleibt als Beleg; „gültig bis“ schlägt die Art vor (G26.3: 36 Monate), maßgeblich ist
das Datum auf der Bescheinigung. Ablaufende Nachweise stehen in der Aktionsliste; die
**Atemschutzliste** gibt es als PDF. **Qualifikationsarten** legen Kommandant und
Administrator fest. Abschaltbar unter *Einstellungen → Personal*; am Hallengerät gibt es
davon nichts, auch nicht mit dem Kürzel des Gerätewarts.

**Einsätze & Stunden** (dieselben Rollen) – An der Einsatzstelle führt die Wehr ihr
[Einsatztagebuch](https://github.com/konsihdr/Feuerwehreinsatztagebuch); nach dem Einsatz
kommt dessen **Speichern (JSON)** hierher: **Einsatztagebuch übernehmen**, Datei wählen.

1. Die Kopfdaten (Bezeichnung, Nummer, Stichwort, Ort, Einsatzleitung) stehen schon da,
   Beginn ist die Alarmzeit, Ende der letzte Eintrag.
2. Jeder Name aus „Eingesetzte Kräfte“ ist zugeordnet: ein **Mitglied** (auch als
   „Brenner, Max“ geschrieben), ein **Fahrzeug** (Lagerplatz der Art Fahrzeug, oder eine
   Ziffer im Namen) oder eine **Gastkraft**. Aus „eingesetzt“ und „abgerückt“ werden
   Zeiträume; wer nie abrückte, war bis zum Ende da. Jede Zuordnung lässt sich ändern.
3. **Unter Atemschutz** kreuzt man an. Steht im Kommentar „PA“, „AGT“ oder „Atemschutz“,
   ist der Haken schon gesetzt – das Tagebuch selbst weiß es nicht.
4. **Übernehmen** – der Bericht ist sofort da, das Tagebuch hängt als Abschrift daran,
   mit gestrichenen Einträgen und früheren Fassungen. Dieselbe Datei ein zweites Mal wird
   erkannt; ersetzt wird nur mit Haken.

Damit die Namen passen: unten auf der Seite **Mitglieder.csv** und **Fahrzeuge.csv**
herunterladen und im Einsatztagebuch mit *CSV ↑* laden – dann ist jeder Name auf dem
Tablet genau der aus der App.

Übungen und Wachen ohne Tagebuch: **Bericht erfassen**, Teilnehmer ankreuzen. Den Bericht
selbst (Lage, Maßnahmen, Besonderheiten) schreibt man danach in der App; **Bericht (PDF)**
legt Kopfdaten, Kräfte, Fahrzeuge und die Abschrift des Tagebuchs mit Unterschriftslinie
auf ein Blatt.

Daraus folgt: **Stunden je Mitglied** und Jahr, getrennt nach Einsatz, Übung, Wache und
sonstigem Dienst (*Stunden (PDF)* für den Jahresbericht); der **Dienstnachweis** je
Mitglied aus der Personalakte – auf Wunsch **ohne** Qualifikationen, für den Arbeitgeber,
den die G26.3 nichts angeht; und **Nachweise aus Einsätzen**: Eine Qualifikationsart mit
dem Haken *Erbracht durch einen Einsatz oder eine Übung unter Atemschutz* (Demo:
„Einsatz oder Übung unter Atemschutz“, 12 Monate) erneuert sich mit jedem Bericht, in dem
das Mitglied unter Atemschutz war – niemand trägt sie ein. Ist die Art zugleich
„Voraussetzung für Atemschutz“, hängt die Tauglichkeit daran.

Im Datenstand stehen die Berichte des laufenden und des vorigen Jahres; ältere Jahre lädt
die Jahresauswahl nach, zum Lesen.

**Halle** (am Telefon, große Knöpfe, Navigation unten) – **Umlagern**: scannen, Ziel,
Grund, buchen; ein Satz-Etikett nimmt alle Teile mit, ein Lagerplatz-Etikett wird zum
Ziel. **Info**: was ist das, wo gehört es hin, wann ist es fällig. **Arbeit**: Reinigung
und Reparatur abhaken. **Zählen**: Inventurgang mit Befund (gefunden / fehlt / fremd),
fremde Geräte geradebuchen, fehlende nach „Vermisst“.

Gescannt wird mit der Kamera (Chrome/Android), einem Handscanner (tippt wie eine
Tastatur) oder per Hand. Gibt der eingebettete Rahmen von Apps Script die Live-Kamera
nicht frei, öffnet sich die Kamera-App und der Code wird auf dem Foto erkannt.

**Prüfnachweis und Arbeitsliste** entstehen als PDF auf dem Server (`Blob.getAs`) –
nicht über `window.print()`, das im SaaS-Produkt an der Adresszeile quer über dem
Nachweis gescheitert war. Die Arbeitsliste hat, wofür man sie ausdruckt: ein Kästchen je
Zeile und eine Linie zum Abzeichnen.

### Rollen

Rollen sind keine Rangfolge, sondern Zuständigkeiten (wie im SaaS-Produkt):

| Rolle | Technik | Personal |
|---|---|---|
| Mitglied | lesen, umlagern, zählen, „gereinigt“ abhaken | – |
| Gerätewart | dazu Stammdaten, Prüfungen, Sätze, Status, Import | Nachweise und Einsatzberichte sehen und erfassen |
| Kommandant | **nur lesen** (umlagern und zählen wie jedes Mitglied) | Nachweise, Einsatzberichte und Qualifikationsarten |
| Administrator | alles, dazu Mitglieder, Ausweise, Hallengeräte, Regeln, Einstellungen | alles |

Das Protokoll lesen Gerätewart, Kommandant und Administrator.

Die Seitenleiste zeigt jeder Rolle ihren Ausschnitt. Verlassen wird sich darauf nicht:
Entschieden wird in `10_Tuer.js`, bei jedem Aufruf neu – eine entzogene Rolle gilt ab dem
nächsten Klick.

---

## Was schützt wovor

| | |
|---|---|
| **Eine Tür** | Der Browser erreicht genau `aufruf()`. Alle übrigen Funktionen enden auf `_` und sind für `google.script.run` unsichtbar; die Menüfunktionen scheitern außerhalb der Tabelle. Eine Prüfung hält die Liste der offenen Funktionen fest. |
| **Schreibtisch** | Google prüft das Firmenkonto, bevor der Aufruf ankommt; die App vergleicht die Adresse bei **jedem** Aufruf mit dem Blatt „Mitglieder“. Gesperrt heißt: ab dem nächsten Klick draußen. Kein Kennwort, das hier liegen oder vergessen werden könnte. |
| **Hallengerät** | 200-Bit-Geheimnis im Browser (40 Zeichen), in der Tabelle nur als Abdruck. Ohne es sind Ausweis und Kürzel wertlos. Kopplungscodes gelten 15 Minuten und einmal; nach zehn falschen ist eine Viertelstunde Ruhe. |
| **Ausweise** | 160 Bit, einmal angezeigt, als Abdruck gespeichert. Die Bremse zählt am Gerät. |
| **Kürzel** | eine Selbstauskunft, nur am Hallengerät, je Gerät abschaltbar; das Protokoll vermerkt „per Kürzel“. |
| **Hallensitzungen** | Zufälliges Token, in den Skripteigenschaften nur als SHA-256. Enden bei Untätigkeit, mit neuem Ausweis, gesperrtem Gerät oder Mitglied – geprüft bei jedem Aufruf. |
| **Protokoll** | Entsteht beim Festschreiben aus den Änderungen selbst – keine Fachfunktion kann es vergessen, niemand kann sich herausschreiben. Abdrücke erscheinen nie darin. |
| **Standort** | ändert sich nur durch eine Buchung – erzwungen im `Vorgang_`, durch den jeder Schreibzugriff geht. |

**Was es nicht kann:** Wer die **Tabelle** bearbeiten darf, darf alles. Sie gehört der
Wehr und soll das auch – im Notfall soll man hineinsehen und eingreifen können –, aber
**teilen Sie sie mit niemandem, der nicht Administrator ist**, und schützen Sie das
Google-Konto des Eigentümers mit Zwei-Faktor-Anmeldung. Die Blätter tragen einen Schutz,
der vor versehentlichen Änderungen warnt; aufhalten kann er niemanden.

---

## Grenzen von Apps Script, ehrlich benannt

- **Jeder Aufruf dauert** – eine halbe bis zwei Sekunden, schreibend unter der Sperre
  auch mehr. Deshalb holt der Browser beim Start den ganzen Datenstand und wartet bei
  Änderungen nicht: Er sagt das Ergebnis mit demselben Code voraus, den der Server
  benutzt, und gleicht ab, wenn die Antwort da ist. Gelesen wird aus einem
  Zwischenspeicher mit Revisionen (`02_Speicher.js`); geschrieben immer frisch.
- **Was der Browser schon zeigt, ist noch nicht gespeichert**, solange oben *Speichert …*
  steht. Wer in diesem Moment das Fenster schließt, verliert nichts – beim nächsten Öffnen
  geht es hinaus –, aber ein anderer sieht es erst dann.
- **Nur im Workspace-Tenant.** Außerhalb einer Domain (private Gmail-Konten) verrät Google
  die Adresse des Besuchers nicht, und niemand käme hinein. Dafür gab es bis zum
  2026-10-17 eine eigene Anmeldung mit Kennwort; sie ist zugunsten des Firmenkontos
  entfallen (Begründung in `CLAUDE.md`).
- **Gleichzeitigkeit**: Alle Aufrufe laufen als Eigentümer; Google erlaubt davon 30
  gleichzeitig. Für eine Wehr reicht das; schreibende Vorgänge laufen nacheinander.
- **Kamera**: Live-Scan braucht `BarcodeDetector` (Chrome/Android) und einen Rahmen, der
  die Kamera freigibt; sonst übernimmt das Foto. Safari kann gar keine Codes lesen – dort
  bleiben Handscanner und Eintippen, und die Oberfläche sagt das.
- **Von Hand in der Tabelle geändert** wird sofort sichtbar (Auslöser `onEdit` und
  `beiAenderung` leeren den Zwischenspeicher) – umgeht aber Regeln und Protokoll.
- **Größe**: Ausgelegt für hunderte bis wenige tausend Geräte. Am schnellsten wächst die
  Abschrift der Einsatztagebücher – gelesen wird sie nur, wenn jemand einen Bericht
  aufschlägt (oder einen löscht). Das Protokoll wächst ebenso; ab
  einigen zehntausend Zeilen lohnt es, alte Jahre in eine Archivtabelle zu verschieben.

---

## Prüfen

```bash
node test/server.mjs        # 835 Prüfungen: Zugang, Rechte, Stapel, Vorhersage = Server, Personal, Einsätze, Sicherheit, Speicher …
node test/oberflaeche.mjs   # 178 im echten Chromium – Hintergrund, offline, Ablehnung, Personal, Tagebuch übernehmen; Codes von zbar gelesen
node test/vorschau.mjs      # dist/vorschau.html: die ganze Anwendung im Browser, ohne Google
```

Gebraucht wird Node (ab 22) und für die Oberfläche Chromium und `zbarimg`. Keine Pakete.

Die Attrappe (`test/attrappe.js`) ist streng, wo Google streng ist: Bereiche außerhalb
des Blatts werfen, Zellen ohne Textformat machen aus „00123“ die Zahl 123, Bytes müssen
zwischen −128 und 127 liegen wie in Java. **Was sie nicht ersetzt, ist ein Lauf in echtem
Apps Script** – welche Stellen davon abhängen, steht in `CLAUDE.md` unter „Ungeprüft“.

**Die Vorschau** (`dist/vorschau.html`) enthält dieselben Dateien wie die Web-App,
dazu die Attrappe. Wer „bei Google angemeldet“ ist, stellt der Schalter **Vorschau** am
linken Rand ein: Anna (Administratorin, Kürzel AB), Ben (Gerätewart, BS), Carla
(Mitglied, CF), Dora (Kommandantin, DW) oder das Konto des Hallen-Tablets, das kein
Mitglied ist. Die Daten bleiben im Browser.
