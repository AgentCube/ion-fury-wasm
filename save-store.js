(() => {
  'use strict';
  const databaseName = 'ion-fury-native-saves-v1';
  const slotPattern = /^save\d{4}\.esv$/;
  const maxPrimary = 32 * 1024 * 1024;
  const maxCompanion = 1024 * 1024;
  function slot(path) {
    const name = String(path).replace(/^\//, '').replace(/\.ext$/, '');
    return slotPattern.test(name) ? name : null;
  }
  function validate(name, primary, companion) {
    if (!slotPattern.test(name) || !(primary instanceof Uint8Array) || primary.length < 256 || primary.length > maxPrimary
        || new TextDecoder().decode(primary.subarray(0, 11)) !== 'E32SAVEGAME') throw new Error('Invalid or incomplete native save file');
    if (companion) {
      if (!(companion instanceof Uint8Array) || !companion.length || companion.length > maxCompanion) throw new Error('Invalid save companion');
      const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(companion));
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('Invalid save companion metadata');
    }
  }
  const hash = async bytes => bytes ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('') : null;
  function create(environment = globalThis, notify = () => {}) {
    let filesystem;
    let database;
    let releaseLock;
    let writable = false;
    let restored = false;
    let paused = false;
    let disabledError = null;
    let running = false;
    let inFlight = 0;
    let pendingBytes = 0;
    let deletionTimer;
    const pending = new Map();
    const deleted = new Set();
    const sizes = new Map();
    const closed = new Set();
    const writing = new Map();
    const observations = { primaryOpened: 0, primaryClosed: 0, completionMessages: 0, completedSnapshots: 0, restoredFiles: 0 };
    const status = { state: 'initializing', restored: false, backend: 'IndexedDB native-save adapter',
      files: 0, bytes: 0, pending: 0, lastSync: null, error: null, durability: 'unknown' };
    function publish(state, error = null) {
      status.state = state; status.error = error; status.pending = pending.size + inFlight + deleted.size;
      status.files = sizes.size;
      status.bytes = [...sizes.values()].reduce((sum, value) => sum + value, 0);
      notify({ ...status, observations: { ...observations } });
    }
    function fail(error) { paused = true; publish('sync-failed', error?.name + ': ' + error?.message); }
    function disable(error) {
      writable = false; paused = true;
      pending.clear(); pendingBytes = 0; deleted.clear();
      disabledError = String(error?.message || error) + '. Latest changes are temporary; committed saves were preserved. Reload before trying again.';
      publish('unavailable', disabledError);
    }
    function transaction(mode) {
      if (mode === 'readwrite') {
        try {
          const result = database.transaction('slots', mode, { durability: 'strict' });
          status.durability = result.durability || 'default';
          return result;
        } catch (error) { if (!(error instanceof TypeError)) throw error; }
      }
      status.durability = mode === 'readwrite' ? 'browser-default' : status.durability;
      return database.transaction('slots', mode);
    }
    function read(key) {
      return new Promise((resolve, reject) => {
        const tx = transaction('readonly');
        const request = key === undefined ? tx.objectStore('slots').getAllKeys() : tx.objectStore('slots').get(key);
        let result;
        request.onsuccess = () => { result = request.result; };
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(tx.error || new Error('Save read transaction aborted'));
        tx.onerror = () => {};
      });
    }
    async function acquire() {
      if (!environment.navigator?.locks?.request) return false;
      return new Promise((resolve, reject) => {
        environment.navigator.locks.request(databaseName, { mode: 'exclusive', ifAvailable: true }, lock => {
          if (!lock) { resolve(false); return; }
          return new Promise(release => { releaseLock = release; resolve(true); });
        }).catch(reject);
      });
    }
    function open() {
      return new Promise((resolve, reject) => {
        if (!environment.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
        let expired = false;
        const timer = setTimeout(() => { expired = true; reject(new Error('IndexedDB initialization timed out')); }, 15000);
        const request = environment.indexedDB.open(databaseName, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('slots', { keyPath: 'name' });
        request.onblocked = () => { expired = true; clearTimeout(timer); reject(new Error('Save database upgrade blocked by another tab')); };
        request.onerror = () => { clearTimeout(timer); reject(request.error); };
        request.onsuccess = () => {
          clearTimeout(timer);
          if (expired) { request.result.close(); return; }
          resolve(request.result);
        };
      });
    }
    async function pump() {
      if (running || paused || !writable || !restored || !pending.size) return;
      running = true;
      const entries = [...pending];
      pending.clear(); pendingBytes = 0; inFlight = entries.length;
      publish('saving');
      try {
        const records = [];
        for (const [name, entry] of entries) records.push(entry ? { name, version: 1, primary: entry.primary, companion: entry.companion,
          primaryHash: await hash(entry.primary), companionHash: await hash(entry.companion), updated: Date.now() } : null);
        await new Promise((resolve, reject) => {
          const tx = transaction('readwrite');
          const target = tx.objectStore('slots');
          tx.oncomplete = resolve;
          tx.onabort = () => reject(tx.error || new Error('Save commit aborted'));
          tx.onerror = () => {};
          try {
            for (let index = 0; index < entries.length; index++) {
              if (records[index]) target.put(records[index]); else target.delete(entries[index][0]);
            }
          } catch (error) { try { tx.abort(); } catch {} reject(error); }
        });
        for (const [name, entry] of entries) {
          if (entry) sizes.set(name, entry.bytes); else sizes.delete(name);
        }
        status.lastSync = new Date().toISOString();
      } catch (error) {
        for (const [name, entry] of entries) {
          if (!pending.has(name)) { pending.set(name, entry); pendingBytes += entry?.bytes || 0; }
        }
        running = false; inFlight = 0;
        if (disabledError) { pending.clear(); pendingBytes = 0; publish('unavailable', disabledError); }
        else fail(error);
        return;
      }
      running = false; inFlight = 0;
      if (disabledError) { publish('unavailable', disabledError); return; }
      publish(pending.size ? 'saving' : 'saved');
      if (pending.size) void pump();
    }
    function queue(name, entry) {
      if (!writable || !restored) return;
      const bytes = pendingBytes - (pending.get(name)?.bytes || 0) + (entry?.bytes || 0);
      if (bytes > 128 * 1024 * 1024) { disable(new Error('Pending save memory limit exceeded')); return; }
      pendingBytes = bytes; pending.set(name, entry);
      publish(paused ? 'sync-failed' : 'saving', status.error);
      if (!running && !paused) queueMicrotask(() => void pump());
    }
    function completed(name, confirmed = false) {
      if (!slotPattern.test(name) || !writable || !restored) return;
      try {
        if ([...writing.values()].includes(name) || (confirmed && !closed.has(name))) throw new Error('Save is not closed; previous stored save preserved');
        if (filesystem.stat('/' + name).size > maxPrimary || (filesystem.analyzePath('/' + name + '.ext').exists && filesystem.stat('/' + name + '.ext').size > maxCompanion)) throw new Error('Save size limit exceeded; previous stored save preserved');
        const primary = filesystem.readFile('/' + name);
        const companion = filesystem.analyzePath('/' + name + '.ext').exists ? filesystem.readFile('/' + name + '.ext') : null;
        validate(name, primary, companion);
        observations.completedSnapshots++;
        queue(name, { primary, companion, bytes: primary.length + (companion?.length || 0) });
      } catch (error) { disable(error); }
    }
    function deletedFiles() {
      for (const name of deleted) {
        if (!filesystem.analyzePath('/' + name).exists) queue(name, null);
        else completed(name);
      }
      deleted.clear();
    }
    function installHooks() {
      const openFile = filesystem.open;
      filesystem.open = function(path) {
        const stream = openFile.apply(this, arguments);
        const name = (stream.flags & 3) ? slot(stream.path) : null;
        if (name) {
          writing.set(stream.fd, name); closed.delete(name);
          if (!stream.path.endsWith('.ext')) observations.primaryOpened++;
        }
        return stream;
      };
      const closeFile = filesystem.close;
      filesystem.close = function(stream) {
        const name = writing.get(stream.fd);
        const descriptor = stream.fd;
        const primary = name && !stream.path.endsWith('.ext');
        const result = closeFile.apply(this, arguments);
        if (name) { writing.delete(descriptor); closed.add(name); }
        if (primary) { observations.primaryClosed++; publish(status.state, status.error); }
        return result;
      };
      const unlink = filesystem.unlink;
      filesystem.unlink = function(path) {
        const result = unlink.apply(this, arguments);
        const name = slot(path);
        if (name && writable && restored) { deleted.add(name); publish(paused ? 'sync-failed' : 'saving', status.error); clearTimeout(deletionTimer); deletionTimer = setTimeout(deletedFiles, 25); }
        return result;
      };
      const rename = filesystem.rename;
      filesystem.rename = function(oldPath, newPath) {
        const result = rename.apply(this, arguments);
        for (const path of [oldPath, newPath]) {
          const name = slot(path);
          if (name && writable && restored) deleted.add(name);
        }
        if (deleted.size) { publish(paused ? 'sync-failed' : 'saving', status.error); clearTimeout(deletionTimer); deletionTimer = setTimeout(deletedFiles, 25); }
        return result;
      };
    }
    return {
      async initialize(fs) {
        filesystem = fs;
        publish('initializing');
        try {
          if (!globalThis.crypto?.subtle?.digest) throw new Error('Save integrity hashing unavailable');
          writable = await acquire();
          database = await open();
          database.onversionchange = () => { disable(new Error('Database version changed')); database.close(); };
          database.onclose = () => disable(new Error('Save database closed unexpectedly'));
          const keys = await read();
          if (keys.length > 10000) throw new Error('Save database has too many slots');
          let total = 0;
          for (const key of keys) {
            const record = await read(key);
            if (record?.version !== 1 || record.name !== key) throw new Error('Unknown save database record');
            validate(record.name, record.primary, record.companion);
            if (record.primaryHash !== await hash(record.primary) || record.companionHash !== await hash(record.companion)) throw new Error('Save integrity check failed; stored data preserved');
            total += record.primary.length + (record.companion?.length || 0);
            if (total > 256 * 1024 * 1024) throw new Error('Save restoration memory limit exceeded; stored data preserved');
            filesystem.writeFile('/' + record.name, record.primary, { canOwn: true });
            if (record.companion) filesystem.writeFile('/' + record.name + '.ext', record.companion, { canOwn: true });
            sizes.set(record.name, record.primary.length + (record.companion?.length || 0));
            observations.restoredFiles++;
          }
          restored = true; status.restored = true;
          installHooks();
          publish(writable ? 'ready' : 'temporary', writable ? null : 'Another tab owns saves, or Web Locks is unavailable. This tab cannot persist changes; close the other tab and reload.');
        } catch (error) {
          writable = false; releaseLock?.();
          publish('unavailable', error?.name + ': ' + error?.message + '. Saves in this session are temporary; stored data was not replaced.');
        }
        return { ...status };
      },
      savedLine(line) {
        const match = /^(?:[^\r\n]*\bINFO\|\s*)?Saved:\s+([^\r\n]+\.esv)\s*$/m.exec(String(line).replace(/\x1b\[[0-9;]*m/g, ''));
        if (match) {
          observations.completionMessages++;
          const name = match[1].replace(/^\//, '');
          if (slotPattern.test(name)) completed(name, true);
          else if (writable && restored) disable(new Error('Native save is outside the supported root slots'));
        }
      },
      retry() { if (writable && restored) { paused = false; void pump(); } },
      snapshot: () => ({ ...status, observations: { ...observations } }),
      close() { writable = false; database?.close(); releaseLock?.(); }
    };
  }
  globalThis.FurySaveStore = { create, validate, slot, databaseName };
})();
