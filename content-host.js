window.FuryContent = {
  load(progress) {
    const worker = new Worker(new URL('content-worker.js', document.baseURI));
    return new Promise((resolve, reject) => {
      const fail = error => { worker.terminate(); reject(error); };
      worker.onerror = event => fail(new Error(event.message || 'Game data loader failed'));
      worker.onmessage = event => {
        const message = event.data;
        if (message.type === 'progress') progress(message.detail);
        if (message.type === 'failure') fail(new Error(message.message));
        if (message.type === 'complete') {
          worker.terminate(); window.FuryContent.lastReport = message.report; resolve(message);
        }
      };
      worker.postMessage({ url: new URL('assets/content.pack.manifest.json', document.baseURI).href });
    });
  }
};
