/* ============================================================
   Doklady: fotky účtenek a PDF faktur k záznamům v podnikání

   Soubor se uloží tam, kde aplikace běží – na PC do složky
   data/doklady přes server, v telefonu do úložiště prohlížeče.
   Když je zapnutá synchronizace, odejde i do soukromého repozitáře
   (složka doklady/), odkud si ho stáhne druhé zařízení, až ho bude
   chtít otevřít. Soubor má jméno podle vlastního id a nikdy se
   nepřepisuje, takže se dvě zařízení nemají o co hádat.
   ============================================================ */

const DB_NAME = 'penize-doklady';
const STORE = 'soubory';
const LS_UP = 'penize:doklady-nahrat';     // cesty, které ještě nejsou na GitHubu
const LS_DEL = 'penize:doklady-smazat';    // cesty, které se mají z GitHubu smazat
const MAX_BYTES = 15 * 1024 * 1024;

export const EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic',
  'image/heif': 'heif', 'image/gif': 'gif', 'application/pdf': 'pdf',
};
const TYPE_BY_EXT = Object.fromEntries(Object.entries(EXT).map(([t, e]) => [e, t]));
export const typeOf = (meta) => meta.type || TYPE_BY_EXT[(meta.path || '').split('.').pop()] || 'application/octet-stream';
export const isImage = (meta) => typeOf(meta).startsWith('image/');

/* ---------- zmenšení fotky ----------
   Fotka z telefonu má 3–5 MB. Na čitelnou účtenku stačí dlouhá strana
   2 200 px v JPEG, to je kolem 400 kB. */
export async function zmensit(file, { max = 2200, quality = 0.82 } = {}) {
  const type = file.type || '';
  if (!type.startsWith('image/') || type === 'image/gif' || type === 'image/svg+xml') return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && type === 'image/jpeg' && file.size < 900 * 1024) { bmp.close?.(); return file; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';                    // průhledné PNG ať v JPEG nezčerná
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
    return blob && (blob.size < file.size || !EXT[type] || type === 'image/heic' || type === 'image/heif') ? blob : file;
  } catch {
    return file;   // prohlížeč formát neumí – uložíme originál
  }
}

/* ---------- úložiště ---------- */
export function createDocs({ mode, syncConfig }) {
  let dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }
  async function idb(method, ...args) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, method === 'get' ? 'readonly' : 'readwrite');
      const req = tx.objectStore(STORE)[method](...args);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  const apiPath = (p) => '/api/doklady/' + p.split('/').map(encodeURIComponent).join('/');
  const local = {
    async get(p) {
      if (mode() === 'server') {
        try {
          const r = await fetch(apiPath(p), { cache: 'no-store' });
          return r.ok ? await r.blob() : null;
        } catch { return null; }
      }
      try { return (await idb('get', p)) || null; } catch { return null; }
    },
    async put(p, blob) {
      if (mode() === 'server') {
        const r = await fetch(apiPath(p), { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type || 'application/octet-stream' } });
        if (!r.ok) throw new Error('Server doklad neuložil.');
        return;
      }
      await idb('put', blob, p);
    },
    async del(p) {
      if (mode() === 'server') { try { await fetch(apiPath(p), { method: 'DELETE' }); } catch { /* nevadí */ } return; }
      try { await idb('delete', p); } catch { /* nevadí */ }
    },
  };

  /* ---------- fronty pro GitHub ---------- */
  const readQ = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
  const writeQ = (k, list) => { try { localStorage.setItem(k, JSON.stringify([...new Set(list)])); } catch { /* příště */ } };

  /* ---------- GitHub ---------- */
  const ghUrl = (cfg, p) => `${cfg.api || 'https://api.github.com'}/repos/${cfg.repo}/contents/doklady/${p.split('/').map(encodeURIComponent).join('/')}`;
  const ghHeaders = (cfg, extra = {}) => ({
    Authorization: `Bearer ${cfg.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...extra,
  });
  async function blobToB64(blob) {
    const url = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
    return String(url).split(',')[1] || '';
  }
  async function ghPut(cfg, p, blob) {
    const res = await fetch(ghUrl(cfg, p), {
      method: 'PUT',
      headers: ghHeaders(cfg, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ message: `Doklad ${p}`, content: await blobToB64(blob) }),
    });
    // 422 = soubor už tam je (třeba z druhého zařízení). Jména se neopakují, je to on.
    if (res.ok || res.status === 422) return true;
    if (res.status === 409) return false;   // větev se mezitím pohnula, zkusí se příště
    throw new Error(`GitHub vrátil ${res.status}`);
  }
  async function ghGet(cfg, p) {
    const res = await fetch(ghUrl(cfg, p), { cache: 'no-store', headers: ghHeaders(cfg, { Accept: 'application/vnd.github.raw+json' }) });
    if (!res.ok) return null;
    return res.blob();
  }
  async function ghDelete(cfg, p) {
    const meta = await fetch(ghUrl(cfg, p), { cache: 'no-store', headers: ghHeaders(cfg) });
    if (meta.status === 404) return true;
    if (!meta.ok) return false;
    const { sha } = await meta.json();
    const res = await fetch(ghUrl(cfg, p), {
      method: 'DELETE',
      headers: ghHeaders(cfg, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ message: `Smazat doklad ${p}`, sha }),
    });
    return res.ok || res.status === 404;
  }

  /* ---------- veřejné funkce ---------- */
  async function add(file, { year, uid }) {
    if (file.size > MAX_BYTES * 2) throw new Error('Soubor je moc velký (víc než 30 MB).');
    const small = await zmensit(file);
    if (small.size > MAX_BYTES) throw new Error('Soubor je i po zmenšení větší než 15 MB.');
    const type = small.type || file.type || 'application/octet-stream';
    const ext = EXT[type] || (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
    const id = uid();
    const p = `${year}/${id}.${ext}`;
    const blob = small instanceof Blob && small.type === type ? small : new Blob([small], { type });
    await local.put(p, blob);
    if (syncConfig()) writeQ(LS_UP, [...readQ(LS_UP), p]);
    // Fotka se mohla převést na JPEG – ať jméno sedí na obsah.
    const base = (file.name || 'doklad').replace(/\.[a-z0-9]{1,5}$/i, '');
    return {
      id, path: p, type, size: blob.size,
      name: `${base.slice(0, 110)}.${ext}`,
      at: new Date().toISOString(),
    };
  }

  // Obsah dokladu: z tohoto zařízení, jinak z GitHubu (a rovnou si ho uložit).
  async function blobOf(meta) {
    const here = await local.get(meta.path);
    if (here) return here;
    const cfg = syncConfig();
    if (!cfg) return null;
    try {
      const b = await ghGet(cfg, meta.path);
      if (!b) return null;
      const blob = new Blob([b], { type: typeOf(meta) });
      try { await local.put(meta.path, blob); } catch { /* příště znovu */ }
      return blob;
    } catch { return null; }
  }

  async function remove(meta) {
    await local.del(meta.path);
    writeQ(LS_UP, readQ(LS_UP).filter((p) => p !== meta.path));
    if (syncConfig()) writeQ(LS_DEL, [...readQ(LS_DEL), meta.path]);
  }

  // Po synchronizaci dat: poslat čekající doklady a smazat odstraněné.
  let pumping = false;
  async function pump() {
    const cfg = syncConfig();
    if (!cfg || pumping) return { sent: 0, left: readQ(LS_UP).length };
    pumping = true;
    let sent = 0;
    try {
      for (const p of readQ(LS_UP)) {
        const blob = await local.get(p);
        let done = !blob;                         // soubor tu už není – není co posílat
        if (blob) {
          try { done = await ghPut(cfg, p, blob); } catch { break; }
        }
        if (!done) break;
        sent += blob ? 1 : 0;
        writeQ(LS_UP, readQ(LS_UP).filter((x) => x !== p));
      }
      for (const p of readQ(LS_DEL)) {
        let ok = false;
        try { ok = await ghDelete(cfg, p); } catch { break; }
        if (!ok) break;
        writeQ(LS_DEL, readQ(LS_DEL).filter((x) => x !== p));
      }
    } finally {
      pumping = false;
    }
    return { sent, left: readQ(LS_UP).length };
  }

  // Po zapnutí synchronizace poslat i doklady, které vznikly bez ní.
  function queueAll(paths) {
    writeQ(LS_UP, [...readQ(LS_UP), ...paths]);
  }

  const pending = () => readQ(LS_UP).length;

  return { add, blobOf, remove, pump, pending, queueAll };
}

/* ============================================================
   ZIP bez komprese – fotky a PDF jsou zkomprimované samy.
   Stačí to pro balíček pro účetní a nepotřebuje žádnou knihovnu.
   ============================================================ */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function dosTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

// files: [{ name, data: Blob | string }]
export async function zip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const now = dosTime(new Date());
  for (const f of files) {
    const bytes = typeof f.data === 'string'
      ? enc.encode(f.data)
      : new Uint8Array(await f.data.arrayBuffer());
    const name = enc.encode(f.name);
    const crc = crc32(bytes);
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true);
    head.setUint16(4, 20, true);
    head.setUint16(6, 0x0800, true);          // jména v UTF-8
    head.setUint16(8, 0, true);               // bez komprese
    head.setUint16(10, now.time, true);
    head.setUint16(12, now.date, true);
    head.setUint32(14, crc, true);
    head.setUint32(18, bytes.length, true);
    head.setUint32(22, bytes.length, true);
    head.setUint16(26, name.length, true);
    head.setUint16(28, 0, true);
    parts.push(head, name, bytes);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, now.time, true);
    cd.setUint16(14, now.date, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, bytes.length, true);
    cd.setUint32(24, bytes.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(cd, name);
    offset += 30 + name.length + bytes.length;
  }
  const cdSize = central.reduce((s, x) => s + (x.byteLength ?? x.length), 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
