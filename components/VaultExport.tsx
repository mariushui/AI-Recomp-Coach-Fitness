// Export in den Obsidian-Vault: eine Markdown-Datei pro Monat. Auf dem iPhone über „Teilen → In Dateien sichern“
// in den Vault-Ordner in iCloud, am Mac als Download. Später übernimmt das der Kurzbefehl automatisch.
import React, { useState } from 'react';
import { listEntries } from '../lib/entries';
import { exportMonths, monthFile, type VaultFile } from '../lib/vaultExport';
import { addDays } from '../lib/time';
import { Button } from './ui';

const LAST_KEY = 'recomp_vault_export_last';

/** Standardordner im Vault (iCloud), so wie er am Mac heißt. Auf dem iPhone unter Dateien → Obsidian → Marius_Vault. */
export const VAULT_PATH_MAC = '/Users/mariushuinink/Library/Mobile Documents/iCloud~md~obsidian/Documents/Marius_Vault/01 marius privat/Sport&Health/Health App Export';
export const VAULT_PATH_IPHONE = 'Obsidian → Marius_Vault → 01 marius privat → Sport&Health → Health App Export';

// Ordner-Zugriff am Mac (Chrome, Edge): einmal verbinden, Handle im Browser merken. Safari und iPhone können das nicht.
type DirHandle = { name: string; getFileHandle: (n: string, o: { create: boolean }) => Promise<any>; queryPermission?: (o: any) => Promise<string>; requestPermission?: (o: any) => Promise<string> };
const canPickFolder = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

function idb<T>(fn: (store: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode = 'readonly'): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('recomp-vault', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const req = fn(open.result.transaction('kv', mode).objectStore('kv'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
  });
}
const loadDir = () => idb<DirHandle | undefined>((s) => s.get('dir')).catch(() => undefined);
const saveDir = (h: DirHandle) => idb((s) => s.put(h, 'dir'), 'readwrite');

async function writeToDir(dir: DirHandle, files: VaultFile[]): Promise<boolean> {
  const opts = { mode: 'readwrite' };
  if ((await dir.queryPermission?.(opts)) !== 'granted' && (await dir.requestPermission?.(opts)) !== 'granted') return false;
  for (const f of files) {
    const fh = await dir.getFileHandle(f.name, { create: true });
    const w = await fh.createWritable();
    await w.write(f.content);
    await w.close();
  }
  return true;
}

async function filesFor(months: string[]): Promise<VaultFile[]> {
  const first = months[0].split('-').map(Number);
  const last = months[months.length - 1].split('-').map(Number);
  // 30 Tage Vorlauf für die Erholung
  const from = addDays(new Date(first[0], first[1] - 1, 1), -30);
  const to = new Date(last[0], last[1], 1);
  const entries = await listEntries(from, to);
  const now = new Date();
  return months.map((m) => monthFile(entries, m, now));
}

function monthsSince(firstIso: string, now = new Date()): string[] {
  const out: string[] = [];
  const d = new Date(Number(firstIso.slice(0, 4)), Number(firstIso.slice(5, 7)) - 1, 1);
  while (d <= now) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

/** Teilen-Menü, wenn das Gerät Dateien teilen kann (iPhone), sonst Download je Datei (Mac). */
async function deliver(files: VaultFile[]): Promise<'geteilt' | 'geladen' | 'geschrieben'> {
  const dir = canPickFolder() ? await loadDir() : undefined;
  if (dir && (await writeToDir(dir, files))) return 'geschrieben';
  const list = files.map((f) => new File([f.content], f.name, { type: 'text/markdown' }));
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (nav.share && nav.canShare?.({ files: list })) {
    await nav.share({ files: list, title: 'Recomp für den Vault' });
    return 'geteilt';
  }
  for (const f of list) {
    const url = URL.createObjectURL(f);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  return 'geladen';
}

const VaultExport: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [last, setLast] = useState(() => {
    try {
      return localStorage.getItem(LAST_KEY);
    } catch {
      return null;
    }
  });

  const [dirName, setDirName] = useState<string | null>(null);
  React.useEffect(() => {
    if (canPickFolder()) loadDir().then((h) => setDirName(h?.name ?? null));
  }, []);
  const pickFolder = async () => {
    try {
      const h = (await (window as any).showDirectoryPicker({ mode: 'readwrite', id: 'recomp-vault' })) as DirHandle;
      await saveDir(h);
      setDirName(h.name);
      setMsg(`Verbunden mit „${h.name}“. Exporte landen jetzt direkt dort.`);
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setMsg(`Ordner nicht verbunden: ${(e as Error).message}`);
    }
  };

  const run = async (all: boolean) => {
    setBusy(true);
    setMsg(null);
    try {
      let months = exportMonths();
      if (all) {
        const first = await listEntries(new Date('2000-01-01'), new Date('2100-01-01')).then((l) => l[0]?.occurred_at);
        months = first ? monthsSince(first) : months;
      }
      const files = await filesFor(months);
      const how = await deliver(files);
      const stamp = new Date().toLocaleString('de-DE', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
      try {
        localStorage.setItem(LAST_KEY, stamp);
      } catch {
        /* egal */
      }
      setLast(stamp);
      setMsg(
        how === 'geschrieben'
          ? `${files.length} Dateien in „${dirName}“ gespeichert.`
          : how === 'geteilt'
            ? `${files.length} Dateien bereit. „In Dateien sichern“ wählen, dann ${VAULT_PATH_IPHONE}, vorhandene ersetzen.`
            : `${files.length} Dateien heruntergeladen. In den Vault-Ordner „Health App Export“ verschieben, vorhandene ersetzen.`,
      );
    } catch (e) {
      // Abbruch im Teilen-Menü ist kein Fehler
      if ((e as Error)?.name !== 'AbortError') setMsg(`Export fehlgeschlagen: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-400">
        Eine Markdown-Datei pro Monat mit allen Werten: Tage, Training, Ernährung, Körpermaße, Befinden. Dateien werden immer ganz ersetzt.
      </p>
      <p className="text-[11px] text-slate-500 break-words">
        Ziel im Vault: <span className="text-slate-300">01 marius privat / Sport&amp;Health / Health App Export</span>. iPhone: im Teilen-Menü „In Dateien sichern“, dann {VAULT_PATH_IPHONE}.
      </p>
      {canPickFolder() && (
        <Button variant="ghost" className="w-full" onClick={pickFolder} disabled={busy}>
          {dirName ? `Ordner: ${dirName} (ändern)` : 'Vault-Ordner verbinden (Mac, Chrome oder Edge)'}
        </Button>
      )}
      <Button variant="green" className="w-full" onClick={() => run(false)} disabled={busy}>
        {busy ? 'Erstelle Dateien …' : 'Jetzt in den Vault (aktueller und letzter Monat)'}
      </Button>
      <Button variant="ghost" className="w-full" onClick={() => run(true)} disabled={busy}>
        Alle Monate exportieren
      </Button>
      {last && <p className="text-[11px] text-slate-500">Zuletzt exportiert: {last}</p>}
      {msg && <p className="text-xs text-slate-300">{msg}</p>}
    </div>
  );
};

export default VaultExport;
