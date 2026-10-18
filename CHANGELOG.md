# Änderungen

Die Begründungen zu jedem Punkt stehen im Entscheidungsprotokoll in `CLAUDE.md`.

## 0.3.0 – 2026-10-18 · Beta

**Einsätze & Stunden**

- Berichte aus dem [Einsatztagebuch](https://github.com/konsihdr/Feuerwehreinsatztagebuch)
  übernehmen (JSON-Export): Kopfdaten, Abschrift mit Gestrichenem und früheren Fassungen,
  aus „eingesetzt / abgerückt“ die Zeiten jeder Kraft. Namen werden Mitgliedern,
  Fahrzeugen oder Gastkräften zugeordnet; „unter Atemschutz“ kreuzt man an. Dieselbe Datei
  ein zweites Mal wird erkannt, ersetzt nur ausdrücklich.
- Übungen, Brandsicherheitswachen und sonstige Dienste von Hand, mit Teilnehmerliste.
- Bericht schreiben und ergänzen, Kräfte nachtragen und berichtigen; Bericht als PDF.
- Stunden je Mitglied und Jahr nach Art des Dienstes, Stundenübersicht als PDF.
- Dienstnachweis je Mitglied als PDF – mit oder ohne Qualifikationen (für den Arbeitgeber).
- Nachweise aus Einsätzen: Eine Qualifikationsart kann „durch Einsatz oder Übung unter
  Atemschutz erbracht“ sein; sie folgt dann aus den Berichten, niemand trägt sie ein.
- Listen fürs Einsatztagebuch (Mitglieder.csv, Fahrzeuge.csv), damit die Namen passen.
- Im Datenstand die Berichte der letzten zwei Jahre; ältere Jahre zum Lesen.

**Betrieb und Sicherheit**

- Fehlende Spalten ergänzt die Anwendung wie fehlende Blätter selbst.
- Formeln bleiben Text: nachgewiesen für jedes Blatt und jeden Schreibweg.
- CSV-Export: Zellen, die Excel als Formel läse, werden Text; der Import nimmt das zurück.
- `SECURITY.md`, `docs/BEDIENUNG.md`, `docs/BETRIEB.md`.

**Zum Aktualisieren:** neue Blätter „Einsätze“, „Einsatzkräfte“, „Einsatztagebuch“ und die
Spalte `aus_einsatz` bei den Qualifikationsarten – legt die Anwendung selbst an.

## 0.2.0 – 2026-10-18

- **Speichern im Hintergrund:** Jede Änderung steht sofort da und wird als Stapel
  gespeichert; ohne Netz wartet sie im Browser, auch über ein Neuladen hinweg. Abgelehntes
  verschwindet mit Begründung und „Nochmal öffnen“. Änderungen anderer alle 15 Sekunden.
- Server und Browser rechnen mit demselben Code (`05_Gemeinsam.js`); eine Prüfung
  vergleicht die Vorhersage des Browsers mit dem Ergebnis des Servers.
- **Personalmodul:** Qualifikationsarten, Nachweise mit Ablauf, Atemschutztauglichkeit,
  Personalakte, Atemschutzliste als PDF. Neue Rolle **Kommandant**.
- Fehlende Blätter legt die Anwendung selbst an.

## 0.1.0 – 2026-10-17

- Nachbau der Lager- und Prüfverwaltung des SaaS-Produkts auf Google-Tabelle und Apps
  Script, ohne Bibliotheken: Geräte, Gerätetypen, Prüfpläne mit Checklisten, Prüfungen,
  Gerätesätze, Lagerplätze, Buchungen, Inventur, Regeln, Etiketten (Code 128), Import und
  Export, Protokoll, PDFs auf dem Server.
- Anmeldung mit dem Firmenkonto (Google Workspace); in der Fahrzeughalle Ausweis (QR) oder
  Kürzel an gekoppelten Hallengeräten.
