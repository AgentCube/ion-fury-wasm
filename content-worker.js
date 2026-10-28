importScripts('vendor/sha256.min.js', 'content-pack.js');
self.onmessage = async event => {
  try {
    const result = await FuryContentPack.load(event.data.url, globalThis, detail => postMessage({ type: 'progress', detail }));
    postMessage({ type: 'complete', ...result }, [result.archive.buffer]);
  } catch (error) { postMessage({ type: 'failure', message: error.message }); }
};
