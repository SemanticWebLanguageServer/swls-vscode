/* eslint-disable */
// Adapter so that the browser-targeted server bundle (browserServerMain.js)
// can run inside a Node.js worker_threads Worker.
// Runs before browserServerMain.js is loaded.

const { parentPort } = require("worker_threads");

// The bundle is built for `target: "webworker"`, so its webpack runtime reads
// `self.location`. Node worker_threads has no `self` — alias it to globalThis.
if (typeof globalThis.self === "undefined") globalThis.self = globalThis;

// Node.js fetch() does not support file:// URLs. browserServerMain fetches the
// wasm asset by an absolute file:// URL (built from the extension path); patch
// fetch to read those off disk.
const _originalFetch = globalThis.fetch?.bind(globalThis);
globalThis.fetch = function (url, options) {
  const urlStr =
    typeof url === "string" ? url : url instanceof URL ? url.href : String(url);
  if (urlStr.startsWith("file://")) {
    return Promise.resolve().then(() => {
      const fs = require("fs");
      const { fileURLToPath } = require("url");
      const filePath = fileURLToPath(urlStr);
      const buffer = fs.readFileSync(filePath);
      // Set the MIME type so WebAssembly.instantiateStreaming accepts it.
      return new Response(buffer, {
        status: 200,
        headers: { "Content-Type": "application/wasm" },
      });
    });
  }
  if (_originalFetch) return _originalFetch(url, options);
  return Promise.reject(new Error("fetch not available"));
};

// Shim the Web Worker message API.
// browserServerMain.js does:  onmessage = handler   and   postMessage(obj)
// worker_threads uses parentPort instead of those globals.

let _onmessageHandler = null;
Object.defineProperty(globalThis, "onmessage", {
  get() {
    return _onmessageHandler;
  },
  set(fn) {
    _onmessageHandler = fn;
    parentPort.on("message", (data) => fn({ data }));
  },
  configurable: true,
});

globalThis.postMessage = (data) => parentPort.postMessage(data);

require("./browserServerMain.js");
