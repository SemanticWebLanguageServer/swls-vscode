import * as mod from "swls-wasm";

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

declare const __webpack_require__: { p: string };
let initialized = false;
let send_to_lsp: (frame: string) => void;

const encoder = new TextEncoder();
async function handleIncomingMessage(event: MessageEvent) {
  if (event.data.context !== undefined) {
    __webpack_require__.p = event.data.context + "/server/dist/";
    await ensureLspLoaded();
    return;
  }

  const payload =
    typeof event.data === "string" ? event.data : JSON.stringify(event.data);

  if (payload.includes("nitialize") || payload.includes("nlay")) {
    log(payload);
  }
  const len = encoder.encode(payload).byteLength;
  if (len !== payload.length) {
    log("Different lengths " + len + " !+ " + payload.length);
  }

  const framed = `Content-Length: ${len}\r\n\r\n${payload}`;
  send_to_lsp(framed);
}

onmessage = handleIncomingMessage;

class LspMessageSplitter {
  private buffer: Uint8Array = new Uint8Array(0);
  private readonly asciiDecoder = new TextDecoder("ascii");
  private readonly utf8Decoder = new TextDecoder("utf-8");

  /**
   * Push raw bytes into the splitter.
   * Returns zero or more complete LSP message payloads (JSON text).
   */
  push(chunk: Uint8Array): string[] {
    this.buffer = concat(this.buffer, chunk);

    const messages: string[] = [];

    while (true) {
      const headerEnd = indexOfDoubleCRLF(this.buffer);
      if (headerEnd === -1) break;

      const headerBytes = this.buffer.subarray(0, headerEnd);
      const headerText = this.asciiDecoder.decode(headerBytes);

      const match = /Content-Length:\s*(\d+)/i.exec(headerText);
      if (!match) {
        throw new Error("Invalid LSP header: missing Content-Length");
      }

      const contentLength = Number(match[1]);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;

      if (this.buffer.length < messageEnd) break;

      const messageBytes = this.buffer.subarray(messageStart, messageEnd);
      const messageText = this.utf8Decoder.decode(messageBytes);

      messages.push(messageText);

      // Consume processed bytes
      this.buffer = this.buffer.subarray(messageEnd);
    }

    return messages;
  }
}

/* ----------------- helpers ----------------- */

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function indexOfDoubleCRLF(buf: Uint8Array): number {
  for (let i = 0; i + 3 < buf.length; i++) {
    if (
      buf[i] === 13 && // \r
      buf[i + 1] === 10 && // \n
      buf[i + 2] === 13 &&
      buf[i + 3] === 10
    ) {
      return i;
    }
  }
  return -1;
}

const deframer = new LspMessageSplitter();
async function ensureLspLoaded() {
  if (!initialized) {
    try {
      log("[worker] importing swls-web… ");
      const mod = await import("swls-wasm");
      log("[worker] imported swls-web…");

      const t = new mod.WasmLsp((x: Uint8Array) => {
        for (const msg of deframer.push(x)) {
          if (msg.includes("nitialize") || msg.includes("nlay")) {
            log(msg);
          }
          postMessage(JSON.parse(msg));
        }
      }, logDebug);

      send_to_lsp = t.send.bind(t);
      log("[worker] started swls-web…");
      initialized = true;
    } catch (ex) {
      if (ex instanceof Error) {
        error("[worker] error " + ex.name + " " + ex.message);
        error("[worker] " + ex.stack);
      } else {
        error("[worker] error " + ex);
      }
    }
  }
}
