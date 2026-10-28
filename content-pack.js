(() => {
  'use strict';
  const format = 'ion-fury-content-pack';
  const hashPattern = /^[a-f0-9]{64}$/;
  async function chunkHash(bytes, environment) {
    if (!environment.crypto?.subtle) return environment.sha256(bytes);
    const digest = new Uint8Array(await environment.crypto.subtle.digest('SHA-256', bytes));
    return Array.from(digest, value => value.toString(16).padStart(2, '0')).join('');
  }
  function validate(manifest) {
    if (!manifest || manifest.format !== format || manifest.version !== 1) throw new Error('Unsupported game package format/version');
    if (!Number.isSafeInteger(manifest.totalSize) || manifest.totalSize < 1 || manifest.totalSize > 300 * 1024 * 1024
        || !hashPattern.test(manifest.sha256) || typeof manifest.variant !== 'string' || !manifest.variant.length) throw new Error('Invalid game package metadata');
    if (!Array.isArray(manifest.chunks) || manifest.chunkCount !== manifest.chunks.length || manifest.chunkCount < 1 || manifest.chunkCount > 64) throw new Error('Invalid chunk count');
    let offset = 0;
    for (const [index, chunk] of manifest.chunks.entries()) {
      if (chunk.index !== index || chunk.name !== 'content.pack.' + String(index).padStart(2, '0') || chunk.offset !== offset
          || !Number.isSafeInteger(chunk.size) || chunk.size < 1 || chunk.size > 45 * 1024 * 1024 || !hashPattern.test(chunk.sha256)) throw new Error('Invalid chunk order, path, size or hash');
      offset += chunk.size;
    }
    if (offset !== manifest.totalSize) throw new Error('Incorrect total chunk size');
    if (!Array.isArray(manifest.files) || manifest.files.length !== 2) throw new Error('Invalid archive entries');
    offset = 0;
    for (const [index, entry] of manifest.files.entries()) {
      if (entry.path !== ['fury.grp', 'fury.grpinfo'][index] || entry.offset !== offset || !Number.isSafeInteger(entry.size)
          || entry.size < 1 || entry.size > (index ? 16384 : 300 * 1024 * 1024) || !hashPattern.test(entry.sha256)) throw new Error('Unsafe or malformed archive entry');
      offset += entry.size;
    }
    if (offset !== manifest.totalSize) throw new Error('Incorrect archive entry ranges');
    return manifest;
  }
  async function exactBytes(response, size, progress = () => {}) {
    if (!response.ok || response.type === 'opaque') throw new Error('Game data download failed: HTTP ' + response.status);
    if (!response.body?.getReader) throw new Error('Streaming game downloads are unavailable in this browser');
    const reader = response.body.getReader();
    const bytes = new Uint8Array(size);
    let offset = 0;
    try {
      for (;;) {
        let timer;
        const { done, value } = await Promise.race([reader.read(), new Promise((resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Game data download stalled; reload to retry')), 30000);
        })]).finally(() => clearTimeout(timer));
        if (done) break;
        if (offset + value.length > size) throw new Error('Game data exceeds declared size');
        bytes.set(value, offset); offset += value.length; progress(offset);
      }
      if (offset !== size) throw new Error('Truncated game data download');
      return bytes;
    } finally { await reader.cancel().catch(() => {}); }
  }
  async function load(manifestURL, environment = globalThis, progress = () => {}) {
    const begin = performance.now();
    const url = new URL(manifestURL);
    const base = new URL('./', url);
    progress({ stage: 'Loading game package manifest', loaded: 0, total: 0 });
    const response = await environment.fetch(url, { cache: 'no-store', mode: 'same-origin', credentials: 'omit', redirect: 'error' });
    if (!response.ok) throw new Error('Game package manifest failed: HTTP ' + response.status);
    const text = await response.text();
    if (text.length > 16384) throw new Error('Game package manifest is too large');
    const manifest = validate(JSON.parse(text));
    const cachePrefix = 'ion-fury-content-v1:' + base.pathname + ':';
    const cacheName = cachePrefix + manifest.sha256;
    let cache;
    let cacheWrites = true;
    try { cache = await environment.caches?.open(cacheName); } catch {}
    const files = manifest.files.map(entry => new Uint8Array(entry.size));
    const fileHashes = manifest.files.map(() => environment.sha256.create());
    const packageHash = environment.sha256.create();
    const report = { packageSHA256: manifest.sha256, networkBytes: 0, cachedBytes: 0, cacheWritesFailed: false, hashMs: 0, durationMs: 0 };
    for (const chunk of manifest.chunks) {
      const chunkURL = new URL(chunk.name, base).href;
      let bytes;
      try {
        const hit = await cache?.match(chunkURL);
        if (hit) {
          bytes = await exactBytes(hit, chunk.size);
          const hashStart = performance.now();
          if (await chunkHash(bytes, environment) !== chunk.sha256) throw new Error('Corrupt cached game data');
          report.hashMs += performance.now() - hashStart;
          report.cachedBytes += bytes.length;
        }
      } catch { bytes = null; try { await cache?.delete(chunkURL); } catch {} }
      if (!bytes) {
        progress({ stage: 'Downloading game data', loaded: chunk.offset, total: manifest.totalSize });
        const incoming = await environment.fetch(chunkURL, { cache: 'no-cache', mode: 'same-origin', credentials: 'omit', redirect: 'error' });
        bytes = await exactBytes(incoming, chunk.size, loaded => progress({ stage: 'Downloading game data', loaded: chunk.offset + loaded, total: manifest.totalSize }));
        const hashStart = performance.now();
        if (await chunkHash(bytes, environment) !== chunk.sha256) throw new Error('Game data integrity check failed: ' + chunk.name);
        report.hashMs += performance.now() - hashStart;
        report.networkBytes += bytes.length;
        if (cache && cacheWrites) {
          try { await cache.put(chunkURL, new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } })); }
          catch { cacheWrites = false; report.cacheWritesFailed = true; }
        }
      }
      progress({ stage: 'Verifying game data', loaded: chunk.offset + chunk.size, total: manifest.totalSize });
      const hashStart = performance.now();
      packageHash.update(bytes);
      for (const [index, entry] of manifest.files.entries()) {
        const start = Math.max(chunk.offset, entry.offset);
        const end = Math.min(chunk.offset + bytes.length, entry.offset + entry.size);
        if (end > start) {
          const part = bytes.subarray(start - chunk.offset, end - chunk.offset);
          files[index].set(part, start - entry.offset); fileHashes[index].update(part);
        }
      }
      report.hashMs += performance.now() - hashStart;
    }
    if (packageHash.hex() !== manifest.sha256) throw new Error('Complete game package integrity check failed');
    for (const [index, entry] of manifest.files.entries()) if (fileHashes[index].hex() !== entry.sha256) throw new Error('Game file integrity check failed: ' + entry.path);
    try {
      for (const name of await environment.caches?.keys() || []) if (name.startsWith(cachePrefix) && name !== cacheName) await environment.caches.delete(name);
    } catch {}
    report.durationMs = performance.now() - begin;
    return { archive: files[0], metadata: new TextDecoder('utf-8', { fatal: true }).decode(files[1]), report };
  }
  globalThis.FuryContentPack = { validate, exactBytes, load };
})();
