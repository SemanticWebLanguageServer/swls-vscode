import { ExtensionContext } from "vscode";
import * as vscode from "vscode";
import {
  LanguageClient as NodeLanguageClient,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";
import { PassThrough, Transform } from "stream";
import { Worker as WorkerThread } from "worker_threads";
import {
  buildClientOptions,
  registerFsHandlers,
  setupBroadcastLogging,
  setupVirtualDocProvider,
} from "./common";

import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { download } from "./download";

const VERSION_REGEX = /version=([^ ]*)/;
const REPO = "SemanticWebLanguageServer/swls";
const BINARY_NAME = os.platform() === "win32" ? "swls.exe" : "swls";

function getTarget(): string {
  const platform = os.platform();
  const arch = os.arch();

  if (platform === "win32" && arch === "x64") {
    return "swls-windows-x86_64.exe";
  }
  if (platform === "win32" && arch === "arm64") {
    return "swls-windows-arm64.exe";
  }
  if (platform === "linux" && arch === "x64") {
    return "linux-x86_64";
  }
  if (platform === "linux" && arch === "arm64") {
    return "linux-aarch64";
  }
  if (platform === "darwin" && arch === "x64") {
    return "macos-x86_64";
  }
  if (platform === "darwin" && arch === "arm64") {
    return "macos-arm64";
  }

  throw new Error(`Unsupported platform: ${platform}-${arch}`);
}

function getCurrentVersion(
  command: string,
  channel: vscode.OutputChannel,
): Promise<string> {
  return new Promise((resolve) => {
    execFile(command, ["--version"], (error, stdout) => {
      if (error) {
        channel.appendLine(`Error ${error}`);
        return resolve("");
      }

      channel.appendLine(stdout);
      const result = VERSION_REGEX.exec(stdout);
      resolve((result && result[1]) || "");
    });
  });
}

class BinaryNotFound extends Error {
  constructor() {
    super("Binary not found");
  }
}

async function currentCommand(
  context: vscode.ExtensionContext,
): Promise<string> {
  const binDir = context.globalStorageUri.fsPath;
  const binaryPath = path.join(binDir, BINARY_NAME);
  if (fs.existsSync(binaryPath)) {
    return binaryPath;
  }

  const checker = os.platform() === "win32" ? "where" : "which";
  const exists = await new Promise((resolve) => {
    execFile(checker, [BINARY_NAME], (error) => {
      resolve(!error);
    });
  });

  if (exists) {
    return BINARY_NAME;
  }
  throw new BinaryNotFound();
}

async function updateVersion(
  checkUpdate: boolean,
  autoUpdate: boolean,
  context: vscode.ExtensionContext,
  channel: vscode.OutputChannel,
): Promise<string> {
  const cmd = await currentCommand(context);

  if (!checkUpdate) return cmd;

  const currentVersion = await getCurrentVersion(cmd, channel);
  let version = await getLatestRelease();

  if (currentVersion == version) return cmd;

  // we should either ask or update
  const doUpdate = autoUpdate || (await promptUpdate(currentVersion, version));

  if (!doUpdate) {
    return cmd;
  }

  return await install(context, channel, version);
}

async function install(
  context: vscode.ExtensionContext,
  channel: vscode.OutputChannel,
  version?: string,
): Promise<string> {
  version = version ?? (await getLatestRelease());

  const binDir = context.globalStorageUri.fsPath;
  fs.mkdirSync(binDir, { recursive: true });
  const binaryPath = path.join(binDir, BINARY_NAME);

  const target = getTarget();

  const url = `https://github.com/${REPO}/releases/download/${version}/${BINARY_NAME}-${target}`;
  channel.appendLine(`Downloading from ${url} to ${binaryPath}`);

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Installing LSP...",
    },
    async (progress) => {
      channel.appendLine(`Starting download`);
      await download(url, binaryPath, progress);
      channel.appendLine(`Download is done`);
    },
  );

  if (os.platform() !== "win32") {
    fs.chmodSync(binaryPath, 0o755);
  }

  return binaryPath;
}

async function ensureInstalled(
  checkUpdate: boolean,
  autoUpdate: boolean,
  context: vscode.ExtensionContext,
  channel: vscode.OutputChannel,
): Promise<string> {
  try {
    return await updateVersion(checkUpdate, autoUpdate, context, channel);
  } catch (ex) {
    if (ex instanceof BinaryNotFound) {
      const ok = autoUpdate || (await promptInstall());
      if (ok) {
        return await install(context, channel);
      }
    } else {
      throw ex;
    }
  }
  throw new Error("User declined or installation failed");
}

async function promptUpdate(current: string, next: string): Promise<boolean> {
  const choice = await vscode.window.showInformationMessage(
    `The language server update available. Go from version ${current} to ${next}? `,
    "Update",
    "Cancel",
  );

  return choice == "Update";
}

async function promptInstall(): Promise<boolean> {
  const choice = await vscode.window.showInformationMessage(
    "The language server is not installed. Install it now?",
    "Install",
    "Cancel",
  );

  return choice === "Install";
}

async function getLatestRelease(): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases`);
  const json: Array<{ tag_name: string }> = await res.json();
  const latest = json.find((x) => x.tag_name?.startsWith("swls-"));
  if (!latest) {
    throw new Error("No valid release found");
  }
  return latest.tag_name;
}

let client: NodeLanguageClient | undefined;

// Bridges a worker_threads Worker to the LSP StreamInfo interface.
// The worker sends/receives parsed JSON objects (no framing), so we add
// Content-Length framing on the way out and strip it on the way in.
function createWorkerTransport(worker: WorkerThread) {
  const reader = new PassThrough();

  worker.on("message", (msg: unknown) => {
    const json = JSON.stringify(msg);
    const len = Buffer.byteLength(json, "utf8");
    reader.push(`Content-Length: ${len}\r\n\r\n${json}`);
  });

  let buf = Buffer.alloc(0);
  const writer = new Transform({
    transform(chunk: Buffer, _enc, done) {
      buf = Buffer.concat([buf, chunk]);
      while (true) {
        const sep = buf.indexOf("\r\n\r\n");
        if (sep === -1) break;
        const header = buf.subarray(0, sep).toString("ascii");
        const m = /Content-Length:\s*(\d+)/i.exec(header);
        if (!m) {
          buf = buf.subarray(sep + 4);
          continue;
        }
        const len = Number(m[1]);
        const start = sep + 4;
        if (buf.length < start + len) break;
        worker.postMessage(
          JSON.parse(buf.subarray(start, start + len).toString("utf8")),
        );
        buf = buf.subarray(start + len);
      }
      done();
    },
  });

  return { reader, writer };
}

export async function activate(context: ExtensionContext) {
  const channel = vscode.window.createOutputChannel("swls");

  const cfg = vscode.workspace.getConfiguration("swls");
  const clientOptions = buildClientOptions(cfg);
  try {
    const checkUpdate = cfg.get<boolean>("checkUpdate") ?? true;
    const autoUpdate = cfg.get<boolean>("automaticUpdate") ?? false;
    const serverBin = await ensureInstalled(
      checkUpdate,
      autoUpdate,
      context,
      channel,
    );

    channel.appendLine("Attempting to start native binary: " + serverBin);
    const nodeClient = new NodeLanguageClient(
      "semantic-web-lsp",
      "semantic-web-lsp",
      {
        command: serverBin,
        transport: TransportKind.stdio,
      } satisfies ServerOptions,
      clientOptions,
    );
    try {
      await nodeClient.start();
      client = nodeClient;
      channel.appendLine("Native binary started");
      return;
    } catch (err) {
      await nodeClient.stop().catch(() => {});
      throw err;
    }
  } catch (err) {
    channel.appendLine("Failed to start native binary: " + err);
    vscode.window.showWarningMessage(`swls: falling back to WASM. (${err})`);
    // WASM fallback via worker_threads + nodeWorkerShim
    channel.appendLine("Starting WASM worker");
    setupBroadcastLogging(channel);
    setupVirtualDocProvider();

    const shimPath = context.asAbsolutePath("server/dist/nodeWorkerShim.js");
    const worker = new WorkerThread(shimPath);
    worker.postMessage({ context: context.extensionUri.toString() });

    const { reader, writer } = createWorkerTransport(worker);
    const wasmClient = new NodeLanguageClient(
      "semantic-web-lsp",
      "semantic-web-lsp",
      (): Promise<{ reader: PassThrough; writer: Transform }> =>
        Promise.resolve({ reader, writer }),
      clientOptions,
    );
    registerFsHandlers(wasmClient, channel);

    try {
      await new Promise((res) => setTimeout(res, 200));
      await wasmClient.start();
      client = wasmClient;
      channel.appendLine("WASM client started");
    } catch (err) {
      vscode.window.showWarningMessage(`swls: Failed to start WASM. (${err})`);
    }
  }
}

export async function deactivate(): Promise<void> {
  await client?.stop();
}
