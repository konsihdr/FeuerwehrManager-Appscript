/**
 * Ein Chromium fernsteuern – über das DevTools-Protokoll, ohne Bibliothek.
 *
 * Node bringt seit Version 22 ein `WebSocket` mit; mehr braucht es für Seite laden,
 * Ausdrücke auswerten, Bildschirmfotos und Fehler mitschreiben nicht. Puppeteer wäre
 * dieselbe Fähigkeit mit ein paar hundert Paketen dahinter.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const KANDIDATEN = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'];

export async function browserStarten(optionen = {}) {
  const programm = process.env.CHROMIUM || KANDIDATEN.find((p) => fs.existsSync(p));
  if (!programm) throw new Error('Kein Chromium gefunden (CHROMIUM=/pfad/zum/browser setzen).');
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'fwm-chromium-'));
  const prozess = spawn(programm, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', '--user-data-dir=' + profil, '--hide-scrollbars',
    ...(optionen.dunkel ? ['--force-dark-mode'] : []),
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  // Was Chromium zuletzt auf stderr sagte – stirbt er, steht der Grund meist dort.
  let ausgabe = '';
  prozess.stderr.on('data', (d) => {
    ausgabe = (ausgabe + d).slice(-8000);
  });
  const tot = () => {
    const wie = prozess.signalCode ? 'Signal ' + prozess.signalCode : prozess.exitCode !== null ? 'Code ' + prozess.exitCode : null;
    const rest = ausgabe.trim().split('\n').slice(-15).join('\n');
    return new Error((wie ? 'Chromium beendet (' + wie + ')' : 'Verbindung zu Chromium abgerissen') + (rest ? ':\n' + rest : ''));
  };

  const adresse = await new Promise((erfuellt, abgelehnt) => {
    let puffer = '';
    const zeit = setTimeout(() => abgelehnt(new Error('Chromium meldet sich nicht.')), 20000);
    prozess.once('error', abgelehnt);
    prozess.once('exit', () => {
      clearTimeout(zeit);
      abgelehnt(tot());
    });
    prozess.stderr.on('data', (d) => {
      puffer += d;
      const m = puffer.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) {
        clearTimeout(zeit);
        erfuellt(m[1]);
      }
    });
  });
  const port = new URL(adresse).port;
  const ziele = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const seite = ziele.find((z) => z.type === 'page');
  const ws = new WebSocket(seite.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));

  let naechste = 1;
  const offen = new Map();
  const fehler = [];
  ws.addEventListener('message', (ereignis) => {
    const n = JSON.parse(ereignis.data);
    if (n.id && offen.has(n.id)) {
      const { erfuellt, abgelehnt } = offen.get(n.id);
      offen.delete(n.id);
      if (n.error) abgelehnt(new Error(n.error.message));
      else erfuellt(n.result);
    } else if (n.method === 'Runtime.exceptionThrown') {
      const d = n.params.exceptionDetails;
      fehler.push('Ausnahme: ' + ((d.exception && d.exception.description) || d.text));
    } else if (n.method === 'Runtime.consoleAPICalled' && n.params.type === 'error') {
      fehler.push('console.error: ' + n.params.args.map((a) => a.value || a.description).join(' '));
    }
  });
  // Stirbt Chromium mitten im Teil, bekäme keine offene Anfrage je eine Antwort: Node liefe
  // leer und endete still mit „unsettled top-level await“. So scheitert der Teil mit Grund.
  const allesAbbrechen = () => {
    for (const { abgelehnt } of offen.values()) abgelehnt(tot());
    offen.clear();
  };
  prozess.on('exit', allesAbbrechen);
  ws.addEventListener('close', allesAbbrechen);
  const sende = (methode, params = {}) => new Promise((erfuellt, abgelehnt) => {
    if (ws.readyState !== WebSocket.OPEN) return abgelehnt(tot());
    const id = naechste++;
    offen.set(id, { erfuellt, abgelehnt });
    ws.send(JSON.stringify({ id, method: methode, params }));
  });
  await sende('Runtime.enable');
  await sende('Page.enable');

  const b = {
    fehler,
    sende,
    async groesse(breite, hoehe, mobil) {
      await sende('Emulation.setDeviceMetricsOverride', { width: breite, height: hoehe, deviceScaleFactor: mobil ? 2 : 1, mobile: !!mobil });
      await sende('Emulation.setTouchEmulationEnabled', mobil ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
      await sende('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: mobil ? 'coarse' : 'fine' }, { name: 'prefers-color-scheme', value: optionen.dunkel ? 'dark' : 'light' }] });
    },
    async laden(url) {
      // Erst wenn ein NEUES Dokument steht – sonst meldet das alte „complete“.
      let vorher = null;
      try {
        vorher = await b.werte('performance.timeOrigin');
      } catch (e) {
        vorher = null;
      }
      await sende('Page.navigate', { url });
      await b.warte(`performance.timeOrigin !== ${JSON.stringify(vorher)} && document.readyState === "complete"`);
    },
    async werte(ausdruck) {
      const r = await sende('Runtime.evaluate', { expression: ausdruck, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error('Im Browser: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text) + '\n  bei: ' + ausdruck.slice(0, 200));
      return r.result.value;
    },
    async warte(ausdruck, ms = 10000) {
      const ende = Date.now() + ms;
      while (Date.now() < ende) {
        try {
          if (await b.werte(ausdruck)) return true;
        } catch (e) {
          // noch nicht
        }
        await new Promise((r) => setTimeout(r, 60));
      }
      throw new Error('Zeitüberschreitung beim Warten auf: ' + ausdruck);
    },
    async ruhe(ms = 300) {
      // Bis keine Anfrage mehr läuft (Z.laufend) und die Seite stillsteht.
      await b.warte('typeof Z === "undefined" || Z.laufend === 0', 10000);
      await new Promise((r) => setTimeout(r, ms));
    },
    async foto(datei, voll) {
      const opt = { format: 'png' };
      if (voll) {
        const m = await sende('Page.getLayoutMetrics');
        opt.clip = { x: 0, y: 0, width: m.cssContentSize.width, height: Math.min(m.cssContentSize.height, 6000), scale: 1 };
        opt.captureBeyondViewport = true;
      }
      const r = await sende('Page.captureScreenshot', opt);
      fs.writeFileSync(datei, Buffer.from(r.data, 'base64'));
      return datei;
    },
    async fotoVon(selektor, datei, skalierung = 3) {
      const r = await b.werte(`(() => { const e = document.querySelector(${JSON.stringify(selektor)}); if (!e) return null; e.scrollIntoView(); const q = e.getBoundingClientRect(); return { x: q.x + scrollX, y: q.y + scrollY, width: q.width, height: q.height }; })()`);
      if (!r) throw new Error('Nicht gefunden: ' + selektor);
      const bild = await sende('Page.captureScreenshot', { format: 'png', clip: { ...r, scale: skalierung }, captureBeyondViewport: true });
      fs.writeFileSync(datei, Buffer.from(bild.data, 'base64'));
      return datei;
    },
    /** Auf den ersten sichtbaren Knopf/Verweis mit diesem Text klicken. */
    async klick(text, innerhalb = 'body') {
      const ok = await b.werte(`(() => {
        const t = ${JSON.stringify(text)};
        const alle = [...document.querySelectorAll(${JSON.stringify(innerhalb)} + ' button, ' + ${JSON.stringify(innerhalb)} + ' a, ' + ${JSON.stringify(innerhalb)} + ' label')];
        const e = alle.find((x) => x.offsetParent !== null && !x.disabled && x.textContent.trim().replace(/\\s+/g, ' ').includes(t));
        if (!e) return false;
        e.click();
        return true;
      })()`);
      if (!ok) throw new Error('Kein klickbares Element mit „' + text + '“');
      await b.ruhe(150);
    },
    async tippe(selektor, wert, enter) {
      await b.werte(`(() => {
        const e = document.querySelector(${JSON.stringify(selektor)});
        if (!e) throw new Error('Feld fehlt: ${selektor}');
        e.focus();
        const setzer = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e), 'value').set;
        setzer.call(e, ${JSON.stringify(wert)});
        e.dispatchEvent(new Event('input', { bubbles: true }));
        e.dispatchEvent(new Event('change', { bubbles: true }));
        ${enter ? "e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));" : ''}
      })()`);
      await b.ruhe(100);
    },
    /** Eine Datei in ein `<input type="file">` legen – wie über den Dateidialog. */
    async datei(selektor, pfad) {
      const { root } = await sende('DOM.getDocument', { depth: 0 });
      const { nodeId } = await sende('DOM.querySelector', { nodeId: root.nodeId, selector: selektor });
      if (!nodeId) throw new Error('Kein Dateifeld: ' + selektor);
      await sende('DOM.setFileInputFiles', { nodeId, files: [pfad] });
      await b.ruhe(150);
    },
    async schliessen() {
      try {
        await sende('Browser.close');
      } catch (e) {
        // schon zu
      }
      if (prozess.exitCode === null && prozess.signalCode === null) {
        await new Promise((r) => {
          const zeit = setTimeout(() => {
            prozess.kill('SIGKILL');
            r();
          }, 3000);
          prozess.once('exit', () => {
            clearTimeout(zeit);
            r();
          });
        });
      }
      try {
        fs.rmSync(profil, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch (e) {
        // Ein Rest im Temp-Ordner ist kein Prüfungsfehler.
      }
    },
  };
  await b.groesse(optionen.breite || 1400, optionen.hoehe || 900, optionen.mobil);
  return b;
}
