/**
 * Eine Attrappe der Apps-Script-Dienste, die diese Anwendung benutzt.
 *
 * Für zweierlei:
 *   - `test/lauf.mjs` lässt den Servercode in Node laufen und prüft ihn.
 *   - `test/vorschau.mjs` baut eine Seite, in der Server UND Oberfläche im Browser
 *     laufen – ohne Google, zum Ansehen und Durchklicken.
 *
 * Darum schlichtes JavaScript ohne Module und ohne Node-Bibliotheken: Dieselbe Datei
 * läuft in `vm` und im Browser. SHA-256 steht deshalb selbst hier – der Browser hat es
 * nur asynchron, und Apps Script rechnet synchron.
 *
 * Die Attrappe ist streng, wo Apps Script streng ist, damit Fehler hier auffallen und
 * nicht erst im Echtbetrieb:
 *   - Bereiche außerhalb des Blatts werfen.
 *   - `setValues` mit falschen Maßen wirft.
 *   - Zellen ohne Textformat wandeln Zahlen, Wahrheitswerte und Daten um – wie Google
 *     Tabellen. Wer das Format vergisst, bekommt „00123“ als 123 zurück.
 *   - Bytes sind vorzeichenbehaftet (−128 bis 127), wie Javas `byte`.
 *   - Werte im CacheService über 100 KB werfen.
 */
(function (global) {
  'use strict';

  // ─────────────────────────────── SHA-256 ───────────────────────────────

  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  function sha256(bytes) {
    const l = bytes.length;
    const mit = new Uint8Array(((l + 9 + 63) >> 6) << 6);
    mit.set(bytes);
    mit[l] = 0x80;
    const bits = l * 8;
    const n = mit.length;
    mit[n - 4] = (bits >>> 24) & 255;
    mit[n - 3] = (bits >>> 16) & 255;
    mit[n - 2] = (bits >>> 8) & 255;
    mit[n - 1] = bits & 255;
    mit[n - 5] = Math.floor(bits / 0x100000000) & 255;
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const W = new Uint32Array(64);
    for (let i = 0; i < n; i += 64) {
      for (let t = 0; t < 16; t++) {
        W[t] = (mit[i + t * 4] << 24) | (mit[i + t * 4 + 1] << 16) | (mit[i + t * 4 + 2] << 8) | mit[i + t * 4 + 3];
      }
      for (let t = 16; t < 64; t++) {
        const s0 = ((W[t - 15] >>> 7) | (W[t - 15] << 25)) ^ ((W[t - 15] >>> 18) | (W[t - 15] << 14)) ^ (W[t - 15] >>> 3);
        const s1 = ((W[t - 2] >>> 17) | (W[t - 2] << 15)) ^ ((W[t - 2] >>> 19) | (W[t - 2] << 13)) ^ (W[t - 2] >>> 10);
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let t = 0; t < 64; t++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[t] + W[t]) | 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        h = g;
        g = f;
        f = e;
        e = (d + t1) | 0;
        d = c;
        c = b;
        b = a;
        a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0;
      H[1] = (H[1] + b) | 0;
      H[2] = (H[2] + c) | 0;
      H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0;
      H[5] = (H[5] + f) | 0;
      H[6] = (H[6] + g) | 0;
      H[7] = (H[7] + h) | 0;
    }
    const aus = new Uint8Array(32);
    H.forEach((x, i) => {
      aus[i * 4] = (x >>> 24) & 255;
      aus[i * 4 + 1] = (x >>> 16) & 255;
      aus[i * 4 + 2] = (x >>> 8) & 255;
      aus[i * 4 + 3] = x & 255;
    });
    return aus;
  }

  function hmacSha256(schluessel, nachricht) {
    let k = schluessel;
    if (k.length > 64) k = sha256(k);
    const block = new Uint8Array(64);
    block.set(k);
    const innen = new Uint8Array(64 + nachricht.length);
    const aussen = new Uint8Array(64 + 32);
    for (let i = 0; i < 64; i++) {
      innen[i] = block[i] ^ 0x36;
      aussen[i] = block[i] ^ 0x5c;
    }
    innen.set(nachricht, 64);
    aussen.set(sha256(innen), 64);
    return sha256(aussen);
  }

  const utf8 = (text) => new TextEncoder().encode(String(text));
  const vorzeichen = (bytes) => Array.from(bytes, (b) => (b > 127 ? b - 256 : b));
  const ohneVorzeichen = (bytes) => Uint8Array.from(bytes, (b) => (b + 256) % 256);
  /** Wie Java: Ein Byte[] mit 200 darin gibt es nicht. Wer das übergibt, soll es hier merken. */
  const javaBytes = (bytes) => {
    if (!Array.isArray(bytes) || bytes.some((b) => !Number.isInteger(b) || b < -128 || b > 127)) {
      throw new Error('Cannot convert to Byte[]: Werte außerhalb −128…127');
    }
    return ohneVorzeichen(bytes);
  };

  function base64(bytes) {
    const u = ohneVorzeichen(bytes);
    if (typeof Buffer !== 'undefined') return Buffer.from(u).toString('base64');
    let s = '';
    for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s);
  }

  function uuid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  // ─────────────────────────────── Tabelle ───────────────────────────────

  function autoWert(wert) {
    if (typeof wert !== 'string') return wert;
    // Google Tabellen rechnet: Aus „=1+1“ wird 2, aus „=IMPORTXML(…)“ ein Abruf nach
    // draußen. Die Attrappe rechnet nicht – aber sie lässt sehen, dass es passiert wäre.
    if (wert.charAt(0) === '=') return '#FORMEL:' + wert.slice(1);
    if (/^-?\d+(\.\d+)?$/.test(wert) && !/^0\d/.test(wert)) return Number(wert);
    if (/^0\d+$/.test(wert)) return Number(wert); // genau der Fall, vor dem das Textformat schützt
    if (/^(TRUE|FALSE|WAHR|FALSCH)$/i.test(wert)) return /^(TRUE|WAHR)$/i.test(wert);
    if (/^\d{4}-\d{2}-\d{2}$/.test(wert)) return new Date(wert + 'T00:00:00');
    return wert;
  }

  class Bereich {
    constructor(blatt, zeile, spalte, zeilen, spalten) {
      if (zeile < 1 || spalte < 1 || zeilen < 1 || spalten < 1) throw new Error('Ungültiger Bereich');
      if (zeile + zeilen - 1 > blatt.maxZeilen || spalte + spalten - 1 > blatt.maxSpalten) {
        throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
      }
      Object.assign(this, { blatt, zeile, spalte, zeilen, spalten });
    }
    getValues() {
      const aus = [];
      for (let r = 0; r < this.zeilen; r++) {
        const z = [];
        for (let c = 0; c < this.spalten; c++) {
          const w = this.blatt.wert(this.zeile + r, this.spalte + c);
          z.push(w === undefined || w === null ? '' : w instanceof Date ? new Date(w.getTime()) : w);
        }
        aus.push(z);
      }
      return aus;
    }
    setValues(werte) {
      if (werte.length !== this.zeilen || werte.some((z) => z.length !== this.spalten)) {
        throw new Error('The number of rows or columns in the data does not match the range.');
      }
      werte.forEach((z, r) => z.forEach((w, c) => this.blatt.setze(this.zeile + r, this.spalte + c, w)));
      this.blatt.ss.schreibvorgaenge++;
      return this;
    }
    setNumberFormat(f) {
      for (let r = 0; r < this.zeilen; r++) for (let c = 0; c < this.spalten; c++) this.blatt.formatSetzen(this.zeile + r, this.spalte + c, f);
      return this;
    }
    setFontWeight() {
      return this;
    }
    setBackground() {
      return this;
    }
  }

  class Blatt {
    constructor(ss, name) {
      this.ss = ss;
      this.name = name;
      this.daten = [];
      this.formate = [];
      this.maxZeilen = 1000;
      this.maxSpalten = 26;
      this.schutz = [];
      this.fixiert = 0;
    }
    wert(r, c) {
      return (this.daten[r - 1] || [])[c - 1];
    }
    setze(r, c, w) {
      while (this.daten.length < r) this.daten.push([]);
      const f = (this.formate[r - 1] || [])[c - 1];
      this.daten[r - 1][c - 1] = f === '@' ? (w === null || w === undefined ? '' : w) : autoWert(w);
    }
    formatSetzen(r, c, f) {
      while (this.formate.length < r) this.formate.push([]);
      this.formate[r - 1][c - 1] = f;
    }
    getName() {
      return this.name;
    }
    getLastRow() {
      for (let r = this.daten.length; r >= 1; r--) {
        if ((this.daten[r - 1] || []).some((w) => w !== '' && w !== undefined && w !== null)) return r;
      }
      return 0;
    }
    getLastColumn() {
      let max = 0;
      this.daten.forEach((z) => z.forEach((w, c) => {
        if (w !== '' && w !== undefined && w !== null) max = Math.max(max, c + 1);
      }));
      return max;
    }
    getMaxRows() {
      return this.maxZeilen;
    }
    getMaxColumns() {
      return this.maxSpalten;
    }
    getRange(zeile, spalte, zeilen, spalten) {
      if (typeof zeile === 'string') throw new Error('A1-Schreibweise wird in der Attrappe nicht gebraucht.');
      return new Bereich(this, zeile, spalte, zeilen || 1, spalten || 1);
    }
    getDataRange() {
      return new Bereich(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1));
    }
    insertRowsAfter(nach, anzahl) {
      const vorlage = (this.formate[nach - 1] || []).slice();
      this.daten.splice(nach, 0, ...Array.from({ length: anzahl }, () => []));
      this.formate.splice(nach, 0, ...Array.from({ length: anzahl }, () => vorlage.slice()));
      this.maxZeilen += anzahl;
      return this;
    }
    deleteRows(start, anzahl) {
      if (start < 1 || start + anzahl - 1 > this.maxZeilen) throw new Error('Those rows are out of bounds.');
      if (this.maxZeilen - anzahl < 1 + this.fixiert) throw new Error('Sie können nicht alle nicht fixierten Zeilen löschen.');
      this.daten.splice(start - 1, anzahl);
      this.formate.splice(start - 1, anzahl);
      this.maxZeilen -= anzahl;
      this.ss.schreibvorgaenge++;
    }
    deleteRow(z) {
      this.deleteRows(z, 1);
    }
    setFrozenRows(n) {
      this.fixiert = n;
    }
    protect() {
      const s = { setDescription: () => s, setWarningOnly: () => s };
      this.schutz.push(s);
      return s;
    }
    getProtections() {
      return this.schutz;
    }
    autoResizeColumns() {
      return this;
    }
  }

  class Mappe {
    constructor() {
      this.blaetter = [new Blatt(this, 'Tabelle1')];
      this.schreibvorgaenge = 0;
    }
    getSheetByName(name) {
      return this.blaetter.find((b) => b.name === name) || null;
    }
    insertSheet(name) {
      if (this.getSheetByName(name)) throw new Error('Ein Blatt mit dem Namen "' + name + '" existiert bereits.');
      const b = new Blatt(this, name);
      this.blaetter.push(b);
      return b;
    }
    getSheets() {
      return this.blaetter.slice();
    }
    deleteSheet(b) {
      this.blaetter = this.blaetter.filter((x) => x !== b);
    }
    getUrl() {
      // Leer: In der Vorschau gibt es keine Google-Tabelle, auf die ein Verweis zeigen könnte.
      return '';
    }
    getId() {
      return 'ATTRAPPE';
    }
    /** Für die Vorschau: der ganze Inhalt als JSON, damit er ein Neuladen übersteht. */
    abzug() {
      return this.blaetter.map((b) => ({ name: b.name, daten: b.daten.map((z) => z.map((w) => (w instanceof Date ? { d: w.toISOString() } : w))), formate: b.formate, max: b.maxZeilen, fix: b.fixiert }));
    }
    einspielen(abzug) {
      this.blaetter = abzug.map((x) => {
        const b = new Blatt(this, x.name);
        b.daten = x.daten.map((z) => z.map((w) => (w && typeof w === 'object' && w.d ? new Date(w.d) : w)));
        b.formate = x.formate;
        b.maxZeilen = x.max;
        b.fixiert = x.fix;
        return b;
      });
    }
  }

  // ─────────────────────────────── Datum ───────────────────────────────

  function formatDate(datum, zeitzone, muster) {
    const teile = {};
    new Intl.DateTimeFormat('en-GB', {
      timeZone: zeitzone || 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(datum).forEach((p) => {
      teile[p.type] = p.value;
    });
    const ms = String(datum.getMilliseconds()).padStart(3, '0');
    // Versatz der Zeitzone zu diesem Zeitpunkt
    const lokal = Date.UTC(+teile.year, +teile.month - 1, +teile.day, +teile.hour, +teile.minute, +teile.second);
    const versatz = Math.round((lokal - Math.floor(datum.getTime() / 1000) * 1000) / 60000);
    const vz = (versatz >= 0 ? '+' : '-') + String(Math.floor(Math.abs(versatz) / 60)).padStart(2, '0') + ':' + String(Math.abs(versatz) % 60).padStart(2, '0');
    return muster
      .replace("'T'", 'T')
      .replace('yyyy', teile.year)
      .replace('MM', teile.month)
      .replace('dd', teile.day)
      .replace('HH', teile.hour)
      .replace('mm', teile.minute)
      .replace('ss', teile.second)
      .replace('SSS', ms)
      .replace('XXX', vz);
  }

  // ─────────────────────────────── Dienste ───────────────────────────────

  function attrappeErzeugen(optionen) {
    optionen = optionen || {};
    const mappe = optionen.mappe || new Mappe();
    const cache = new Map();
    const eigenschaften = new Map();
    const ausloeser = [];
    const dateien = optionen.dateien || {};
    const zaehler = { aufrufe: 0, cacheAbrufe: 0 };
    // Wer gerade „bei Google angemeldet“ ist. In der Web-App mit „Zugriff: Domain“ liefert
    // getActiveUser() die Adresse des Besuchers; leer heißt: niemand (oder fremde Domain).
    const nutzer = { email: optionen.email || '' };

    const blob = (bytes, art, name) => ({
      getBytes: () => vorzeichen(bytes),
      getDataAsString: () => new TextDecoder('utf-8').decode(bytes),
      getContentType: () => art,
      getName: () => name,
      // Einen PDF-Wandler gibt es hier nicht. Zurück kommt das HTML, mit seiner wahren Art.
      getAs: () => blob(bytes, art, name),
    });

    const dienste = {
      SpreadsheetApp: {
        getActiveSpreadsheet: () => mappe,
        getActive: () => mappe,
        flush: () => undefined,
        getUi: () => {
          if (optionen.ui) return optionen.ui;
          throw new Error('Cannot call SpreadsheetApp.getUi() from this context.');
        },
        ProtectionType: { SHEET: 'SHEET', RANGE: 'RANGE' },
      },
      CacheService: {
        getScriptCache: () => ({
          get: (k) => {
            zaehler.cacheAbrufe++;
            return cache.has(k) ? cache.get(k) : null;
          },
          getAll: (schluessel) => {
            zaehler.cacheAbrufe++;
            const aus = {};
            schluessel.forEach((k) => {
              if (cache.has(k)) aus[k] = cache.get(k);
            });
            return aus;
          },
          put: (k, v) => {
            if (utf8(v).length > 100 * 1024) throw new Error('Argument too large: value');
            cache.set(k, String(v));
          },
          putAll: (werte) => {
            Object.keys(werte).forEach((k) => {
              if (utf8(werte[k]).length > 100 * 1024) throw new Error('Argument too large: value');
            });
            Object.keys(werte).forEach((k) => cache.set(k, String(werte[k])));
          },
          remove: (k) => cache.delete(k),
          removeAll: (ks) => ks.forEach((k) => cache.delete(k)),
        }),
      },
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: (k) => (eigenschaften.has(k) ? eigenschaften.get(k) : null),
          setProperty: (k, v) => {
            if (utf8(v).length > 9 * 1024) throw new Error('Eigenschaft zu groß');
            eigenschaften.set(k, String(v));
          },
          deleteProperty: (k) => eigenschaften.delete(k),
          getProperties: () => Object.fromEntries(eigenschaften),
        }),
      },
      LockService: {
        getScriptLock: () => ({ tryLock: () => true, waitLock: () => undefined, releaseLock: () => undefined, hasLock: () => true }),
      },
      Utilities: {
        DigestAlgorithm: { SHA_256: 'SHA_256' },
        Charset: { UTF_8: 'UTF_8' },
        getUuid: uuid,
        computeDigest: (algo, text) => {
          if (algo !== 'SHA_256') throw new Error('Nur SHA_256 nachgebaut');
          return vorzeichen(sha256(typeof text === 'string' ? utf8(text) : ohneVorzeichen(text)));
        },
        computeHmacSha256Signature: (wert, schluessel) => {
          const w = typeof wert === 'string' ? utf8(wert) : javaBytes(wert);
          const k = typeof schluessel === 'string' ? utf8(schluessel) : javaBytes(schluessel);
          return vorzeichen(hmacSha256(k, w));
        },
        base64Encode: (bytes) => base64(typeof bytes === 'string' ? utf8(bytes) : javaBytes(bytes)),
        newBlob: (daten, art, name) => blob(typeof daten === 'string' ? utf8(daten) : ohneVorzeichen(daten), art || 'text/plain', name || ''),
        formatDate: formatDate,
        sleep: () => undefined,
      },
      Session: {
        getScriptTimeZone: () => 'Europe/Berlin',
        getActiveUser: () => ({ getEmail: () => nutzer.email }),
        getEffectiveUser: () => ({ getEmail: () => 'inhaber@example.org' }),
      },
      ScriptApp: {
        getProjectTriggers: () => ausloeser.slice(),
        newTrigger: (name) => {
          const t = { getHandlerFunction: () => name };
          const bau = { forSpreadsheet: () => bau, onChange: () => bau, onEdit: () => bau, create: () => { ausloeser.push(t); return t; } };
          return bau;
        },
        getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/ATTRAPPE/exec' }),
      },
      HtmlService: {
        createHtmlOutputFromFile: (name) => {
          if (!(name in dateien)) throw new Error('Datei fehlt: ' + name);
          return { getContent: () => dateien[name] };
        },
        createTemplateFromFile: (name) => {
          if (!(name in dateien)) throw new Error('Datei fehlt: ' + name);
          const vorlage = {
            evaluate: () => {
              const inhalt = dateien[name]
                .replace(/<\?!=\s*einbinden_\('([^']+)'\);?\s*\?>/g, (m, n) => dateien[n])
                .replace(/<\?!=\s*(\w+)\s*;?\s*\?>/g, (m, v) => String(vorlage[v]));
              const aus = {
                titel: '',
                meta: {},
                getContent: () => inhalt,
                setTitle: (t) => { aus.titel = t; return aus; },
                addMetaTag: (k, v) => { aus.meta[k] = v; return aus; },
                setXFrameOptionsMode: () => aus,
                setFaviconUrl: () => aus,
              };
              return aus;
            },
          };
          return vorlage;
        },
        XFrameOptionsMode: { DEFAULT: 'DEFAULT', ALLOWALL: 'ALLOWALL' },
      },
      console: optionen.console || console,
    };
    return {
      dienste: dienste,
      mappe: mappe,
      cache: cache,
      eigenschaften: eigenschaften,
      zaehler: zaehler,
      ausloeser: ausloeser,
      setzeNutzer: (email) => {
        nutzer.email = email || '';
      },
    };
  }

  const aussen = { attrappeErzeugen: attrappeErzeugen, sha256: sha256, hmacSha256: hmacSha256, Mappe: Mappe };
  if (typeof module !== 'undefined' && module.exports) module.exports = aussen;
  else global.Attrappe = aussen;
})(typeof globalThis !== 'undefined' ? globalThis : this);
