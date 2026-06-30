/**
 * swls-wasm language server worker.
 *
 * Runs either in the VS Code web-extension host (a Web Worker) or, on desktop,
 * inside a Node `worker_threads` worker via {@link ../nodeWorkerShim.js} which
 * shims `postMessage`/`onmessage` and `fetch(file://…)`.
 *
 * Both ends speak whole JSON-RPC messages over `postMessage` with no
 * `Content-Length` framing — the client transports add/strip framing where the
 * language client needs it — so this worker is a thin pass-through onto the
 * shared {@link createSwlsServer} pump.
 */
import { createSwlsServer } from "swls-wasm";
// Emitted into server/dist as an asset by webpack; the value is the (hashed)
// file name, which we resolve against the extension URI sent in `context`.
// Required CJS-style: webpack hands `asset/resource` to this CommonJS bundle as
// a bare `module.exports = "<url>"`, so a default `import` would read `.default`
// (undefined) instead of the string.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import wasmFile = require("swls-wasm/swls_wasm_bg.wasm");

const logChan = new BroadcastChannel("swls");
const debugChan = new BroadcastChannel("swls-debug");

function log(...args: string[]) {
  logChan.postMessage({ level: "info", message: args.map(String).join(" ") });
}

function logDebug(...args: string[]) {
  debugChan.postMessage({ level: "info", message: args.map(String).join(" ") });
}

function error(...args: string[]) {
  logChan.postMessage({ level: "error", message: args.map(String).join(" ") });
}

log("worker started");

// Buffer incoming messages until the wasm server has finished initializing.
let feed: ((data: unknown) => void) | null = null;
let starting = false;
const queue: unknown[] = [];

async function ensureLspLoaded(context: string) {
  if (feed || starting) {return;}
  starting = true;
  try {
    const wasm = `${context}/server/dist/${wasmFile}`;
    log("[worker] loading swls wasm from " + wasm);
    const send = await createSwlsServer((message) => postMessage(message), {
      wasm,
      debug: (message: string) => logDebug(message),
    });
    feed = send;
    for (const data of queue) {send(data);}
    queue.length = 0;
    log("[worker] swls ready");
  } catch (ex) {
    starting = false;
    if (ex instanceof Error) {
      error("[worker] error " + ex.name + " " + ex.message);
      error("[worker] " + ex.stack);
    } else {
      error("[worker] error " + ex);
    }
  }
}

onmessage = (event: MessageEvent) => {
  // The client sends `{ context }` once, before any LSP traffic, so the worker
  // can locate the wasm asset relative to the extension's install location.
  if (event.data?.context !== undefined) {
    void ensureLspLoaded(event.data.context);
    return;
  }

  if (feed) {feed(event.data);}
  else {queue.push(event.data);}
};
