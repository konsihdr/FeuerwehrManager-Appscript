# FeuerwehrManager – Apps-Script-Fassung

> Dieses Dokument sagt **warum**. `README.md` sagt, wie man es einrichtet und benutzt.
> Fachlich ist das SaaS-Produkt (`../FeuerwehrManager-SaaS/CLAUDE.md`) die Quelle:
> Datenmodell, Prüfwesen, Sätze, Regeln, Inventur und vor allem die Begründungen sind von
> dort übernommen. Was hier anders ist, steht hier – mit Grund.

## 1. Was das hier ist

Dieselbe Lager- und Prüfverwaltung, betrieben aus einer Google-Tabelle: eine Tabelle je
Wehr, ein Apps Script dahinter, eine Web-App davor. Kein Server, kein Dienst, keine
Bibliothek – die Vorgabe beim Start (2026-10-17) war ausdrücklich **„keine externen
Libs“**, und das gilt für Server, Oberfläche und Tests.

```
Browser ──google.script.run──► aufruf(token, aktion, argumente) ──► Vorgang_ ──► Blätter
   │                              (10_Tuer.js: Sitzung, Rolle, Sperre)   (03_Vorgang.js: Regeln, Protokoll)
   │   Sync.tun → sofort anzeigen (ANWENDEN + ableiten_) → Warteschlange
   └──────────────► aufruf(token, 'stapel', { ops }) ──► je Änderung ein Vorgang_
```

## 2. Was gegenüber dem SaaS-Produkt umgestoßen ist

| SaaS | Hier | Weil |
|---|---|---|
| Viele Wehren, Mandantenspalte, Betreiberbereich | **Eine Tabelle = eine Wehr** | Apps Script läuft im Konto der Wehr. Eine zweite Wehr kopiert die Tabelle; es gibt nichts, wovon man getrennt werden müsste |
| Rechte in RLS-Policies | **Rechte an der einen Tür `aufruf()`** | Hier gibt es wieder eine API dazwischen – und sie ist der einzige Weg an die Daten: Die Web-App läuft als Eigentümer, die Mitglieder haben auf die Tabelle keinen Zugriff |
| Fremdschlüssel, CHECK, Trigger | **`SCHEMA` + `Vorgang_`** | Ein Blatt erzwingt nichts. Die Regeln stehen als Beschreibung im Schema und werden bei jedem Schreiben angewandt – nicht in der Fachfunktion, die sie vergessen könnte |
| Supabase Auth, E-Mail-Einladung | **Firmenkonto (Google Workspace); am Hallengerät Ausweis oder Kürzel** | Bei „Ausführen als: Ich“ + „Zugriff: Domain“ nennt Google die Adresse des Besuchers. Die Firma verwaltet die Konten schon – eine zweite Identität mit eigenem Kennwort wäre Doppelpflege und überlebte einen Austritt |
| Zweistufige Datenschutz-Zustimmung | **entfällt** | Sie trennte Betreiber und Wehr. Hier ist die Wehr beides |
| PDF selbst geschrieben (`pdf.ts`) | **HTML → PDF auf dem Server (`Blob.getAs`)** | Die Lehre aus A5 drüben war „die Bytes bestimmen, nicht der Browser“ – das leistet der eingebaute Wandler auch, ohne 300 Zeilen |
| Live-Aktualisierung über Realtime | **Abfrage alle 15 s auf einen Fingerabdruck** | Ein Abruf im CacheService; nur wenn er sich ändert, wird neu geladen |
| Personalmodul abgeschaltet (A2: Gesundheitsdaten auf fremder Infrastruktur) | **eingeschaltet** – Qualifikationen mit Ablauf, Atemschutztauglichkeit, Einsätze und Stunden | Die Daten liegen in der Google-Tabelle der Firma; die Wehr hat entschieden, dass sie dort liegen dürfen (2026-10-17) |
| Einsatz-Tagebuch aus Umlagerungen abgeleitet (T2: PA mit Grund „Einsatz“ gebucht ⇒ unter Gerät), Übungsstunden von Hand (T3) | **Bericht aus dem Einsatztagebuch übernommen** – der JSON-Export der eigenen kleinen App, die an der Einsatzstelle offline läuft; Übungen und Wachen von Hand | Die Wehr führt das Tagebuch ohnehin, mit Uhrzeit für jedes An- und Abrücken – genauer als eine Buchung hinterher. Unter Atemschutz kreuzt der Übernehmende an; der Kommentar im Tagebuch macht nur einen Vorschlag |
| Gerätewart liest Qualifikationen nur | **Gerätewart erfasst sie auch** | Ausdrücklicher Wunsch: Gerätewart *und* Kommandant verfolgen die G26.3. Wer den Atemschutz betreut, soll sie nicht beim Kommandanten bestellen müssen. Die Arten bleiben bei der Führung |
| Antwort abwarten, dann anzeigen | **Erst anzeigen, im Hintergrund speichern** | Apps Script braucht 1–3 s je schreibendem Aufruf. Drüben war die API schnell genug zum Warten, hier nicht |

## 3. Die Regeln, an denen alles hängt

**1. Eine Tür.** Jede globale Funktion ohne `_` am Ende ist über `google.script.run`
aufrufbar – von jedem, der die Adresse kennt. Deshalb enden alle internen Funktionen auf
`_` oder stecken in Objekten (`Speicher_`, `Sitzung_`). Offen sind genau: `doGet`,
`aufruf`, `onOpen`, `onEdit`, `beiAenderung` und die Menüfunktionen – letztere werfen
außerhalb der Tabelle an `getUi()`. **`test/server.mjs` hält diese Liste fest**; eine neue
offene Funktion lässt die Suite fallen.

**2. Jeder Schreibzugriff geht durch `Vorgang_`.** Er liest unter der Sperre frisch,
prüft Pflicht, Auswahl, Eindeutigkeit und Verweise aus `SCHEMA`, hält alles im Speicher
und schreibt erst in `festschreiben()` – ganz oder gar nicht. Löschen folgt den
Verweisregeln (`restrict` / `cascade` / `null`). Der Standort eines Geräts ändert sich nur
mit `buchungLaeuft`, also nur in `umlagern_`.

**3. Das Protokoll entsteht im Vorgang, nicht in der Fachfunktion.** Bei Änderungen nur
der Unterschied; Spalten der Art `geheim` erscheinen nie mit Wert.

**4. Datenstand statt Einzelabfragen.** Ein Aufruf kostet 0,5–2 s. Der Browser holt
einmal alles Nötige (`standBauen_`) und jede Änderung bringt den neuen Stand mit
(`stand: true`, beim Stapel immer). Was ohne Ende wächst – Buchungen, Prüfnachweise,
Protokoll, die Abschrift der Einsatztagebücher –, bleibt draußen und wird geholt, wenn es
jemand aufschlägt; von den Einsatzberichten stehen nur die letzten zwei Jahre darin.
Abgeleitetes (Arbeitsliste, Kennzahlen, Satzstand, Atemschutz, Nachweise aus Einsätzen)
rechnet `ableiten_` – auf dem Server für den Stand, im Browser für die Vorhersage.

**5. Alles in den Blättern ist Text** (Zahlenformat `@`). Umgewandelt wird anhand des
Schemas. Spalten werden **am Namen** gefunden, nicht an der Position.

**6. Die Oberfläche wartet nicht auf die Tabelle.** Jede Änderung geht durch
`Sync.tun` (`js_sync.html`): auf eine Kopie des Angezeigten anwenden (`ANWENDEN`),
Abgeleitetes neu rechnen, zeigen, in die Warteschlange (auch `localStorage`), im
Hintergrund als Stapel schicken. Angezeigt wird immer **Basis + eigene offene
Änderungen**; was der Server ablehnt, fällt aus der Schlange und damit aus der Anzeige –
niemand schreibt ein „Rückgängig“. Nur was eine Antwort braucht, bevor es weitergeht
(Ausweis, Kopplung, Anmeldung, PDF, Import, Gerät löschen), geht über `api()`, und das
wartet vorher, bis die Schlange leer ist.

**7. Eine Wahrheit für Server und Browser.** Was beide rechnen müssen – Ableitungen,
Status nach Grund und Prüfung, Regelfolgen, Fälligkeiten, Prüfungen von Eingaben –
steht in `05_Gemeinsam.js`, und `doGet` schickt **ihren Quelltext** mit
(`Function.prototype.toString`). Dort gibt es keine Apps-Script-Dienste und keine Namen
außer den eigenen; die Suite lässt den Code in einem leeren Kontext laufen und vergleicht
für jede Aktion die Vorhersage des Browsers mit dem Ergebnis des Servers.

## 4. Entscheidungsprotokoll

| Datum | Entscheidung | Begründung |
|---|---|---|
| 2026-10-17 | Container-gebundenes Skript, Berechtigung `spreadsheets.currentonly` | Die Web-App braucht genau diese eine Tabelle. Ein freistehendes Skript mit `openById` verlangte Zugriff auf alle Tabellen des Eigentümers |
| 2026-10-17 | ~~„Zugriff: Jeder“, eigene Anmeldung mit Benutzername, PBKDF2-Kennwort, Sitzungen mit Kennwort-Stempel~~ | **Am selben Tag umgestoßen**, siehe nächste Zeile. Gebaut für Wehren mit privaten Gmail-Konten, bei denen Google die Adresse nicht verrät |
| 2026-10-17 | **Firmenkonto statt Kennwort** – „Ausführen als: Ich“, „Zugriff: Domain“, `Session.getActiveUser()` | Die App läuft im Workspace-Tenant der Firma. Dort ist die Adresse des Besuchers verlässlich (Google hat geprüft), Kennwörter wären eine zweite Identität mit eigener Pflege – und ein gesperrtes Firmenkonto ließe die zweite stehen. Entfallen sind damit PBKDF2, Kennwort-Zurücksetzen, die Bremse am Benutzernamen und jede Sitzung am Schreibtisch |
| 2026-10-17 | Mitglied = Google-Adresse; geprüft bei **jedem** Aufruf gegen das Blatt | Keine Sitzung, die einen Entzug überleben könnte: gesperrt heißt ab dem nächsten Klick draußen |
| 2026-10-17 | „Kein Zugang“ nennt die eigene Adresse | Wer nicht hineinkommt, muss dem Administrator sagen können, welche Adresse einzutragen ist – bei mehreren Konten im Browser ist das nicht offensichtlich |
| 2026-10-17 | Am Hallengerät **Ausweis oder Kürzel** in einem Feld | Gescannt kommt der Ausweiscode, getippt das Kürzel. Erst der Ausweis (ein Geheimnis), dann das Kürzel |
| 2026-10-17 | Das Kürzel ist eine **Selbstauskunft** – und wird so behandelt | Wer es kennt, kann es tippen. Deshalb: nur an angemeldeten Hallengeräten, je Gerät abschaltbar (laufende Kürzel-Sitzungen enden dann), im Protokoll „per Kürzel“, im Hallenkopf sichtbar. Adressen und Kürzel anderer sieht nur der Administrator |
| 2026-10-17 | Ein Hallengerät fragt Google **nicht** | Das Tablet ist mit irgendeinem Konto angemeldet. Wäre es ein Mitglied, buchte sonst jeder Trupp auf dessen Namen – genau der Fehler, vor dem die Abmeldung nach Untätigkeit schützt |
| 2026-10-17 | **Kopplungscode** für Hallengeräte | Das Tablet hat ein Konto ohne Mitgliedschaft und kommt nie bis in die Einstellungen. Der Administrator erzeugt am Schreibtisch einen Code (8 Zeichen, 15 min, einmal), das Tablet tauscht ihn gegen seine Anmeldung. Bremse beim Einlösen für alle Geräte zusammen |
| 2026-10-17 | „Zuletzt da“ in den Skripteigenschaften, höchstens alle 10 min geschrieben | Eine Blattzeile je Seitenaufruf wäre ein Schreibvorgang unter der Sperre für eine Uhrzeit |
| 2026-10-17 | Hallensitzungen in den Skripteigenschaften, nicht im CacheService | Der Cache darf vor Ablauf verwerfen; eine Sitzung, die mitten im Zählgang verschwindet, kostet die Arbeit. Geschrieben wird nur alle paar Minuten (Tageskontingent) |
| 2026-10-17 | Hallensitzungen nur für Aktionen mit `halle: true` – auch beim Administrator | Wer das Tablet erwischt und ein Kürzel kennt, soll buchen und zählen können, nicht Mitglieder aufnehmen oder Ausweise ausgeben |
| 2026-10-17 | „Gereinigt“ dürfen alle, jeden anderen Statuswechsel nur die Technik | Nach dem Einsatz wäscht der Trupp. Der schmale Durchlass: nur `zu_reinigen → einsatzbereit` |
| 2026-10-17 | Status nach der Prüfung entscheidet der Server, mit ausdrücklichem „unverändert“ | Offener Punkt A13 drüben. Bestanden holt aus Werkstatt/Reparatur zurück, lässt „zu reinigen“ aber stehen – eine Prüfung wäscht nichts. Nicht bestanden ⇒ defekt |
| 2026-10-17 | Arbeitsliste als PDF mit Kästchen und Abzeichenlinie | A13 drüben, zweiter Punkt. Kein Ausdruck der Bildschirmansicht, sondern ein eigenes Blatt |
| 2026-10-17 | Platz „Vermisst“ bei der Inventur, je Gang abwählbar | A13 drüben, dritter Punkt. Gebucht wird durch `umlagern_` |
| 2026-10-17 | Zwischenspeicher mit Revision je Tabelle; `onEdit`/`beiAenderung` erneuern | Zwanzig Blätter je Aufruf zu lesen dauerte Sekunden. Von Hand geänderte Zellen müssen trotzdem sofort gelten |
| 2026-10-17 | Nur-Anhängen-Tabellen (Buchungen, Prüfungen, Protokoll) werden zum Schreiben nicht gelesen | Sie wachsen ohne Ende; jede Buchung läse sonst die ganze Historie |
| 2026-10-17 | Antwort von `aufruf()` als JSON-Zeichenkette | `google.script.run` macht aus einem Objekt mit `Date` darin kommentarlos `null` |
| 2026-10-17 | Kein Framework in der Oberfläche; `h()` + `zeichnen()` | Vorgabe „keine Libs“. Für diese Größe reicht ein Neuaufbau je Datenstand; `mitFokus()` hält den Cursor im Feld |
| 2026-10-17 | Scanner-Element bleibt je Reiter dasselbe | Sonst risse jedes Neuzeichnen (auch die Abfrage im Hintergrund) die laufende Kamera ab |
| 2026-10-17 | Foto statt Live-Kamera, wenn der Rahmen sie nicht freigibt | Apps Script bettet die Seite in einen Rahmen ohne `allow="camera"`. `capture="environment"` öffnet die Kamera-App, `BarcodeDetector` liest das Foto |
| 2026-10-17 | Meldungen in der Halle oben | Unten liegen Hauptknopf und Reiter; eine Meldung darüber verdeckte genau das, was man als Nächstes drückt |
| 2026-10-17 | Tabellenzellen tragen ihren Inhalt in `.zelle` | Im Kartenmodus stand sonst jedes Kindelement für sich in der Zeile: „B01 … B-Druckschlauch“ über die volle Breite verteilt |
| 2026-10-17 | Tests über `aufruf()`, nicht über die Fachfunktionen | Sonst bewiese ein grüner Lauf nur, dass die Funktionen tun, was sie tun – nicht, dass ein Mitglied nicht darf, was es nicht darf |
| 2026-10-17 | Codes von **zbar** gelesen, nicht durch Hinsehen | Dieselbe Überlegung wie drüben bei poppler und dem QR-Code |
| 2026-10-17 | Browser-Steuerung über das DevTools-Protokoll mit Nodes eigenem `WebSocket` | Puppeteer wäre dieselbe Fähigkeit mit ein paar hundert Paketen dahinter |
| 2026-10-18 | **Optimistisch mit Neuaufsetzen** statt Rückgängig-Aktionen | Basis (Stand des Servers) + Schlange ergibt die Anzeige. Eine abgelehnte Änderung muss niemand zurückrechnen; kommt ein neuer Stand, werden die offenen Änderungen darauf neu angewandt |
| 2026-10-18 | Kennungen vergibt der Browser (`neu_id`, UUID v4), der Server übernimmt sie | Ein neues Gerät muss sofort eine Akte, einen Satz, einen Nachweis haben können. Nur die UUID-Form ist zugelassen; doppelt lehnt `Vorgang_` mit `schon_da` ab. Codes (Barcode, Lagerplatz-Code) vergibt weiter der Server – zwei Browser könnten sonst denselben ziehen |
| 2026-10-18 | Stapel: je Änderung ein eigener Vorgang, eine Sperre für alle | Eine abgelehnte Änderung nimmt die anderen nicht mit. Die Sperre einmal statt je Änderung spart Wartezeit |
| 2026-10-18 | Wiederholung erkannt an der Änderungskennung (6 h im CacheService) | Reißt die Antwort ab, schickt der Browser denselben Stapel noch einmal. Ist der Speicher geräumt, fängt `schon_da` die Anlagen – nicht aber eine Prüfung: `Prüfungen` wächst ohne Ende und wird zum Anhängen nicht gelesen (siehe 7) |
| 2026-10-18 | Ein Stand ist nur gültig, wenn seit seiner Anfrage kein Stapel beantwortet wurde (`Sync.epoche`) | Sonst überschriebe eine späte Abfrage, was gerade gespeichert wurde, und die Änderung flackerte bis zur nächsten Abfrage weg |
| 2026-10-18 | Am Schreibtisch geht eine Änderung nur unter dem Google-Konto hinaus, das sie gemacht hat; am Hallengerät trägt sie das Token ihrer Sitzung | Ein geteilter Rechner darf nicht die Buchung des Vorgängers unter dem Namen des Nächsten schicken. In der Halle soll das Gegenteil gelten: Wer sich abmeldet, solange noch etwas offen ist, dessen Buchung kommt trotzdem unter seinem Namen an – seine Sitzung bleibt dafür auf dem Server offen, bis sie abläuft |
| 2026-10-18 | Warteschlange je Fenster in `localStorage`, beim Start übernimmt jedes Fenster Liegengebliebenes | Ein gemeinsamer Schlüssel ließe zwei offene Fenster einander die Schlange überschreiben. Doppelt geschickt erkennt der Server an der Kennung |
| 2026-10-18 | Regeln bekommt jedes Mitglied im Stand | Für die Vorhersage: Bucht ein Mitglied mit Grund „Einsatz“, soll es die sofort fällige Prüfung schon sehen. Regeln ändern bleibt beim Administrator |
| 2026-10-18 | Personaldaten nie an ein Hallengerät | Am Tablet sieht jeder, der vorbeigeht, was auf dem Bildschirm steht. Auch das Kürzel des Gerätewarts bringt dort keine G26.3 |
| 2026-10-18 | Ablaufdatum gespeichert, nicht gerechnet; die Art macht nur einen Vorschlag | G26.3: unter 50 Jahren 36 Monate, ab 50 12 Monate. Maßgeblich ist das Datum auf der Bescheinigung |
| 2026-10-18 | Je (Mitglied, Art) zählt der aktuelle Nachweis (`nachweiseAktuell_`) | SaaS 1j: Sonst galt jeder, der je verlängert hatte, für immer als abgelaufen |
| 2026-10-18 | Demo-Nachweise nur für eigens angelegte Demo-Mitglieder (`…@demo.invalid`) | Läuft die Demo in einer Tabelle mit echten Mitgliedern, bekäme sonst ein echter Mensch eine erfundene G26.3 |
| 2026-10-18 | Fehlende Blätter legt `Speicher_.blatt` selbst an | Eine neue Fassung bringt neue Tabellen mit; nach `clasp push` soll die Web-App nicht erst an „Einrichten“ scheitern |
| 2026-10-18 | **Einsätze aus dem Einsatztagebuch** (github.com/konsihdr/Feuerwehreinsatztagebuch, `formatVersion` 1) | Wunsch der Wehr: Der Bericht entsteht an der Einsatzstelle in der eigenen App, die hier nur übernommen und ausgewertet wird – Stunden und Nachweise für die Mannschaft. Kein Nachbau des Tagebuchs in Apps Script: Das muss offline und ohne Anmeldung gehen |
| 2026-10-18 | Die Datei liest der Browser, nicht der Server | Dort wird zugeordnet – welcher Name welches Mitglied ist, wer unter Atemschutz war. Der Server bekommt das Ergebnis und prüft es wie jede andere Eingabe (`einsatzWerte_`, `kraftWerte_` aus `05_Gemeinsam.js`) |
| 2026-10-18 | Namen werden zugeordnet, nicht verlangt; dafür gibt es die Liste fürs Tagebuch | Im Tagebuch stehen Namen, wie sie jemand eingetippt hat. „Brenner, Max“ findet Max Brenner, „LF 10“ ist ein Fahrzeug, der Rest Gastkraft – sichtbar und änderbar. Wer die Mitgliederliste der App ins Tagebuch lädt (*CSV ↑*), braucht nichts zuzuordnen |
| 2026-10-18 | Eine Zeile je Zeitraum, keine Minutenspalte | Wer abrückt und wiederkommt, hat zwei Zeilen. Stunden folgen aus von/bis; eine eigene Dauer daneben könnte dem widersprechen |
| 2026-10-18 | Zweites Übernehmen erkannt an `erstelltAm` des Tagebuchs; ersetzt wird nur ausdrücklich | Zwischenstände werden an der Einsatzstelle gesichert und landen später doppelt hier. Ersetzen löscht den alten Bericht samt Änderungen daran – das soll niemand aus Versehen tun |
| 2026-10-18 | Die Abschrift des Tagebuchs: eigenes Blatt, nicht im Datenstand, nicht im Protokoll | Zweihundert Zeilen je Einsatz. Gebraucht werden sie, wenn jemand den Bericht aufschlägt oder druckt. Das Protokoll vermerkt den Bericht, nicht jede Zeile der Abschrift |
| 2026-10-18 | **Nachweise aus Einsätzen abgeleitet**, nicht gespeichert (`einsatzNachweise_`, Art mit `aus_einsatz`) | Wie drüben beim Einsatz-Tagebuch (2026-08-07): Wer den Bericht übernimmt, hat den Nachweis damit erbracht; eine zweite Liste wäre nach einem Monat unvollständig. Und wer einen Bericht berichtigt oder löscht, berichtigt den Nachweis mit. Welche Art so entsteht, entscheidet die Wehr – die App behauptet nicht, was die FwDV 7 anrechnet |
| 2026-10-18 | Dort wird das Ablaufdatum gerechnet – anders als bei erfassten Nachweisen | Bei der G26.3 gilt das Papier, weil die Frist am Alter hängt. Ein Einsatz hat kein Papier, und „zwölf Monate nach dem letzten Einsatz unter Atemschutz“ hängt an nichts sonst |
| 2026-10-18 | Im Datenstand die Berichte des laufenden und des vorigen Jahres; ältere auf Nachfrage, nur lesen | Berichte und Kräfte wachsen ohne Ende. Zwei Jahre reichen für die Jahresauswertung im Januar. Damit ein Nachweis aus einem älteren Einsatz nicht im Browser anders ausfällt als auf dem Server, kommt je Mitglied der letzte Dienst unter Atemschutz davor mit (`atemschutzVorher`) |
| 2026-10-18 | Wer austritt, bleibt im Bericht (`null`, nicht `cascade`) | Anders als seine Nachweise: Die gehören zur Person, der Bericht gehört der Wehr. Der Name steht als Momentaufnahme daneben |
| 2026-10-18 | Dienstnachweis mit oder ohne Qualifikationen | Einer geht an das Mitglied, einer an den Arbeitgeber, der eine Freistellung bescheinigt haben will – den geht die G26.3 nichts an |
| 2026-10-18 | CSV-Export: was Excel als Formel läse (`=`, `+`, `-`, `@`, keine Zahl), bekommt ein Hochkomma; der Import nimmt es zurück | Excel führt Formeln auch aus einer CSV-Datei aus. Die Tabelle selbst schützt das Textformat (`@`); die Attrappe markiert seitdem jede Zelle, die Google als Formel läse |
| 2026-10-18 | Fehlende **Spalten** ergänzt die App wie fehlende Blätter | 0.3 bringt `aus_einsatz` bei den Qualifikationsarten. Der Zwischenspeicher kennt das Blatt noch ohne; gelesen wird dann aus dem Blatt, die Spalte hinten angefügt. Bis 0.2 nannte die App die fehlende Spalte und verwies auf „Einrichten“ |
| 2026-10-19 | **Beide Suiten auf GitHub** (`.github/workflows/pruefen.yml`) bei Push auf `main` und Pull Request | „Vor jedem Commit“ hängt an der Disziplin dessen, der committet. Weiter ohne Pakete; die drei GitHub-Aktionen sind auf den Commit festgelegt, nicht aufs Tag, und der Lauf darf nur lesen. Node 22, weil `package.json` das zusagt. Fehlt `zbarimg`, scheitert der Lauf – die Suite übersprünge die Codes sonst still. In UTC und mit C-Locale vorher lokal grün, also ohne Abhängigkeit von der Zeitzone des Rechners |

## 5. Befunde beim Bauen

- **Klassenname doppelt belegt.** Die Ankreuzspalte der Tabellen hieß `.wahl` – wie die
  Knöpfe „In Ordnung / Beanstandet“ der Prüfung. Jede Tabelle mit Auswahl bekam deren
  Rahmen: eine senkrechte Linie durch die ganze Liste. Jetzt `.spalte-wahl`.
- **Der Speichern-Knopf blieb gesperrt.** Ob „Speichern“ geht, rechnete nur das
  Neuzeichnen des ganzen Dialogs aus; eine Auswahlliste zeichnete nicht neu. Jetzt
  rechnet jede Eingabe den Fuß des Dialogs neu – ohne den Inhalt anzufassen.
- **Doppelt gezählt nach dem Festschreiben.** Eine nur angehängte Tabelle, danach im
  selben Vorgang gelesen, hatte ihre neuen Zeilen zweimal. Fiel an „78 Prüfungen“ statt
  39 in der Demo-Meldung auf.
- **Java-Bytes.** `computeHmacSha256Signature(Byte[], Byte[])` bekam das Salz als Zahlen
  0–255. Mit dem Kennwort ist die Stelle entfallen; die Attrappe lehnt Byte[] außerhalb
  −128…127 weiterhin ab, damit es beim nächsten Mal auffällt.
- **Ein Name, zwei Bedeutungen.** `letzterAdmin_(v, id)` in `26_Mitglieder.js` und
  `letzterAdmin_(mitglieder, id)` in `05_Gemeinsam.js` – in Apps Script gewinnt die
  spätere Datei, still. Beim Umzug der Prüfungen fiel es auf; die Suite sucht seitdem
  nach doppelten Namen auf oberster Ebene auch zwischen gemeinsamem Code und Oberfläche.
- **Ein grüner Abgleich, dem man nicht traut.** Der Vergleich „Vorhersage = Server“ lief
  beim ersten Mal ohne Fehler durch. Gegenprobe: zwei Vorhersagen absichtlich leer gemacht –
  vier Fehlschläge, an genau diesen Stellen. Erst danach zählt das Grün.
- **Neuladen, das keines war.** Die Prüfung „übersteht Neuladen“ rief dieselbe Adresse mit
  anderem Anker auf – der Browser lud nicht neu, sondern sprang. Jetzt mit geänderter Suche.
- **„Speichert …“ im Hallenkopf** drückte den Namen auf „Carl…“. In der Halle zeigt die
  Anzeige jetzt nur den Punkt, die Zahl wartender Änderungen und „Offline“.
- **Wieder grün beim ersten Lauf** (Einsätze, 0.3). Gegenprobe: Kräfte und den Atemschutz
  älterer Berichte im Browser nicht vorhergesagt – vier Fehlschläge, an genau diesen Fällen.
- **Beim Schreiben von `SECURITY.md` gefunden** (2026-10-18): Das README nannte das
  Gerätegeheimnis „160 Bit“ – es sind 40 Zeichen zu 5 Bit, also 200. Es verwies auf
  `.clasp.json.example`, die es nicht gab. Und „wer das Firmenkonto verliert, verliert den
  Zugang“ stimmte nur am Schreibtisch: Ausweis und Kürzel fragen Google nicht. Erst das
  Sperren in der App schließt auch die Halle. Alle drei berichtigt.
- **Der Textformat-Schutz hat zwei Lagen.** Die Gegenprobe, nur das Format beim Anhängen
  wegzunehmen, blieb grün: „Einrichten“ hatte das ganze Blatt schon als Text formatiert, und
  neue Zeilen erben es. Erst ohne beide Lagen schlägt „Formeln bleiben Text“ an – viermal.
- **Der Reiter zählte 20, zeigte 7.** „Einsatztagebuch (20)“ schloss die Einträge
  „eingesetzt/abgerückt“ ein, die standardmäßig ausgeblendet sind. `tagebuch_eintraege`
  zählt jetzt nur, was im Tagebuch selbst stand.
- **Erster Lauf auf GitHub: Code 13, kein Wort dazu** (2026-10-19). Die Oberfläche brach
  im Teil „Telefon: Tabellen werden Karten“ ab – lokal mit Chromium 154 und mit demselben
  Chrome 155 wie auf dem Runner grün, dort beim nächsten Lauf auch. Code 13 heißt: Node lief
  leer, während eine Anfrage an Chromium offen war – das geht nur, wenn Chromium weg ist.
  `browser.mjs` lehnt seitdem offene Anfragen ab, sobald Prozess oder Verbindung enden, mit
  den letzten Zeilen von stderr. Gegenprobe: Chromium mitten in einer Anfrage beendet – alt
  Code 13, neu eine Meldung. Danach viermal grün; die Ursache auf dem Runner ist offen, bis
  die Meldung einmal erscheint.

## 6. Ungeprüft – erst in echtem Apps Script zu sehen

Die Attrappe ist streng, aber sie ist nicht Google. Diese Stellen hängen an Verhalten,
das nur ein Lauf in Apps Script bestätigt:

- `SpreadsheetApp.getActiveSpreadsheet()` in `doGet` eines gebundenen Skripts (erwartet:
  die Tabelle). Scheitert es, braucht es `openById` und den Umfang `spreadsheets`.
- `Blob.getAs('application/pdf')` aus HTML: wie viel CSS der Wandler versteht (die
  Vorlagen bleiben deshalb bei Tabellen und Rahmen) und ob das Logo als Daten-Adresse
  erscheint.
- `Session.getActiveUser().getEmail()` in der Web-App bei „Ausführen als: Ich“ und
  „Zugriff: Domain“ (erwartet: die Adresse des Besuchers; Umfang `userinfo.email`). Liefert
  es leer, erscheint „Kein Google-Konto erkannt“ – dann stimmt die Bereitstellung nicht.
- Ein Tablet-Browser mit **mehreren** angemeldeten Google-Konten: Apps-Script-Web-Apps
  nehmen dann nicht immer das erwartete. Für das Hallen-Tablet ein Konto, nicht mehrere.
- Ob `localStorage` (Gerätegeheimnis) einen Kontowechsel im selben Browserprofil übersteht.
- Herunterladen per `<a download>` aus dem Rahmen (erwartet: `allow-downloads` ist
  gesetzt), Zwischenablage, `window.print()`.
- `google.script.history` / `google.script.url` – Adresse der Geräteakte im äußeren
  Fenster.
- `Function.prototype.toString` der Funktionen in `05_Gemeinsam.js` unter Apps Script V8
  (erwartet: der Quelltext, wie er in der Datei steht). Käme etwas anderes heraus, fehlte im
  Browser `ableiten_` – die Seite bliebe beim ersten Speichern mit einem Fehler stehen.
- Wie viele `google.script.run`-Aufrufe ein Browser gleichzeitig offen haben darf: Es sind
  höchstens drei (Stapel, Abfrage, ein `api()`); das Kontingent „gleichzeitige Ausführungen“
  (30 je Nutzer) teilt sich das Team, weil alles als Eigentümer läuft.
- Ob `beforeunload` im Rahmen von Apps Script eine Rückfrage zeigen darf (erwartet: eher
  nicht – die Schlange liegt ohnehin in `localStorage`).
- Die Ortszeit von `Date` unter Apps Script V8 (`tagVon_`: in welches Jahr ein Einsatz um
  0:30 an Neujahr gehört). Erwartet: die Zeitzone des Projekts, `Europe/Berlin`. Sonst
  verschöbe sich ein Einsatz um Mitternacht des 31.12. ins Nachbarjahr.
- `<input type="file">` im Rahmen von Apps Script (Einsatztagebuch, CSV-Import) – erwartet:
  geht, der Rahmen erlaubt Formulare und Dateiauswahl.
- Wie groß ein Aufruf über `google.script.run` werden darf: Ein Tagebuch mit 500 Einträgen
  sind gut 150 KB in einem Stapel. Erwartet: kein Problem; sonst die Abschrift in Teilen.

## 7. Offen

- Ein Lauf in echtem Apps Script mit den Punkten aus 6.
- Etikettenbogen als PDF statt `window.print()` – drüben ebenso offen, ebenso nicht dringend.
- `umlagern` als Regel-Aktion – dieselben offenen Fragen wie drüben (A13, vierter Punkt).
- Protokoll-Archiv für alte Jahre, wenn das Blatt groß wird.
- Personal: Import von Nachweisen aus CSV (SaaS 1m – „vierzig G26-Daten“ beim Aufsetzen);
  ob der Kommandant die Mannschaft selbst aufnehmen darf (drüben ja, nur Rolle `mitglied`;
  hier noch beim Administrator).
- Einsätze: „unter Atemschutz“ aus den Buchungen vorschlagen (wer nach dem Einsatz einen
  Pressluftatmer mit Grund „Einsatz“ bucht – SaaS T2); dafür bräuchte der Gerätetyp ein
  Merkmal „Atemschutzgerät“. Ältere Jahre ändern (bisher nur lesen). Jedes Mitglied sieht
  seine eigenen Stunden („Meine Dienste“) – bisher nur Gerätewart, Kommandant, Administrator.
- Eine Prüfung, deren Stapel nach geräumtem Zwischenspeicher ein zweites Mal ankommt,
  stünde doppelt im Blatt (siehe 4, Wiederholung). Selten; erst angehen, wenn es vorkommt.

## 8. Arbeitsweise

- `node test/server.mjs` und `node test/oberflaeche.mjs` vor jedem Commit. Beide ohne
  Pakete; die Oberfläche braucht Chromium und `zbarimg`. GitHub lässt beide noch einmal
  laufen; scheitert die Oberfläche dort, liegen die Bildschirmfotos als Artefakt am Lauf.
- Eine neue Aktion bekommt `rollen`, und – wenn sie schreibt – `schreibend: true`. Ohne
  Rechteangabe lehnt `aufruf()` sie ab.
- Eine neue schreibende Aktion, die die Oberfläche ohne Warten auslöst, bekommt einen
  Eintrag in `ANWENDEN` (`js_sync.html`) **und** einen Fall im Abgleich „Vorhersage im
  Browser = Ergebnis auf dem Server“ (`test/server.mjs`). Regeln, die beide brauchen,
  gehören nach `05_Gemeinsam.js` – nicht zweimal geschrieben.
- Was in `05_Gemeinsam.js` steht, ruft nur `…_`-Funktionen aus `GEMEINSAM_` und die
  mitgeschickten Konstanten; Prüfungen geben Text zurück statt zu werfen.
- Eine neue Tabelle steht zuerst in `SCHEMA`; `Einrichten` legt das Blatt an.
- Die Oberfläche teilt sich im Browser einen globalen Bereich über alle `js_*.html`;
  ein Name auf oberster Ebene darf dort nur einmal vorkommen – die Suite prüft das.
  (Der Server lebt in Apps Script getrennt davon, in der Vorschau in einer eigenen
  Funktion.)
