/**
 * Kleinkram, den mehrere Teile brauchen: Fehler, Datum, Zufall, Abdrücke.
 *
 * Alles, was der Browser nicht direkt aufrufen soll, endet auf `_`. Das ist in Apps
 * Script keine Stilfrage: **Jede andere Funktion im globalen Bereich lässt sich über
 * `google.script.run` von außen aufrufen** – auch von jemandem, der nur die Adresse
 * der Web-App kennt. Die einzige gewollte Tür ist `aufruf()` in `10_Tuer.js`.
 */

/**
 * Ein Fehler, dessen Text für den Anwender bestimmt ist.
 *
 * Alles andere, was beim Bearbeiten wirft, ist ein Programmfehler. Die Tür
 * unterscheidet beides: Diese Meldungen gehen wörtlich in die Oberfläche, die
 * anderen mit dem Zusatz „Interner Fehler“ – damit niemand eine Programmzeile für
 * eine Aussage über seine Eingabe hält.
 */
class Fehler_ extends Error {
  constructor(text, code) {
    super(text);
    this.name = 'Fehler_';
    this.code = code || 'fehler';
  }
}

function pruefe_(bedingung, text, code) {
  if (!bedingung) throw new Fehler_(text, code);
}

// ─────────────────────────────── Datum ───────────────────────────────

function zeitzone_() {
  return Session.getScriptTimeZone() || 'Europe/Berlin';
}

/** Heute als „yyyy-MM-dd“ – in der Zeitzone der Wehr, nicht in UTC. */
function heute_() {
  return Utilities.formatDate(new Date(), zeitzone_(), 'yyyy-MM-dd');
}

function jetzt_() {
  return new Date().toISOString();
}

// `istDatum_`, `datumPlus_` und `tageZwischen_` stehen in `05_Gemeinsam.js` – der Browser
// rechnet mit denselben Zeilen.

// ─────────────────────────────── Text ───────────────────────────────

function normal_(text) {
  return String(text == null ? '' : text).trim().toLowerCase();
}

function textOderLeer_(wert) {
  return wert == null ? '' : String(wert).trim();
}

/**
 * Eine Kennung, die der Browser schon vergeben hat.
 *
 * Wer etwas anlegt, sieht es sofort – lange bevor der Server geantwortet hat. Dafür
 * braucht es seine Kennung im Browser, und die muss dieselbe sein, die hinterher in der
 * Tabelle steht: Sonst zeigte jede Folgeaktion („Nachweis als PDF“, „in den Satz“) auf
 * etwas, das es so nie gab. Zugelassen ist nur die Form einer UUID; doppelt vergeben
 * lehnt `Vorgang_.einfuegen` ab.
 */
function neueId_(a) {
  const id = a && a.neu_id;
  if (id === undefined || id === null || id === '') return undefined;
  pruefe_(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id)), 'Ungültige Kennung.');
  return String(id).toLowerCase();
}

// ─────────────────────────── Zufall und Abdrücke ───────────────────────────

/**
 * Bytes aus Apps Script kommen als Java-Bytes: −128 bis 127. Wer damit rechnet,
 * ohne das zu wissen, bekommt bei jedem zweiten Byte ein negatives Ergebnis – und
 * einen Abdruck, der zu nichts passt.
 */
function bytesZuHex_(bytes) {
  return bytes.map((b) => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}

function sha256Hex_(text) {
  return bytesZuHex_(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8),
  );
}

/**
 * Zufällige Bytes.
 *
 * Apps Script hat kein `getRandomValues`. `Utilities.getUuid()` liefert UUIDs der
 * Version 4, und die kommen aus Javas `SecureRandom` – 122 zufällige Bits je Stück.
 * Durch SHA-256 geschickt wird daraus ein gleichmäßig verteilter Block; zwei UUIDs
 * je Block halten die Entropie über der Blockbreite.
 */
function zufallsBytes_(anzahl) {
  let bytes = [];
  while (bytes.length < anzahl) {
    const block = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      Utilities.getUuid() + Utilities.getUuid() + bytes.length,
      Utilities.Charset.UTF_8,
    );
    bytes = bytes.concat(block.map((b) => (b + 256) % 256));
  }
  return bytes.slice(0, anzahl);
}

/**
 * Base32 ohne die Zeichen, die man verwechselt (0/O, 1/I). Ein Ausweiscode wird
 * gescannt – unter dem QR-Code steht er aber auch zum Abtippen.
 */
const ALPHABET_ = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function base32_(bytes) {
  let bits = 0;
  let wert = 0;
  let aus = '';
  for (const b of bytes) {
    wert = (wert << 8) | b;
    bits += 8;
    while (bits >= 5) {
      aus += ALPHABET_[(wert >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) aus += ALPHABET_[(wert << (5 - bits)) & 31];
  return aus;
}

function zufallsCode_(zeichen) {
  return base32_(zufallsBytes_(Math.ceil((zeichen * 5) / 8))).slice(0, zeichen);
}
