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
  applyFormatOnTypeDefaults,
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
const PLAIN = "swls";
const BINARY_NAME = os.platform() === "win32" ? "swls.exe" : "swls";

function getTarget(): string {
  const platform = os.platform();
  const arch = os.arch();

  if (platform === "win32" && arch === "x64") {
    return "windows-x86_64.exe";
  }
  if (platform === "win32" && arch === "arm64") {
    return "windows-arm64.exe";
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

async function currentCommand(
  context: vscode.ExtensionContext,
): Promise<string> {
  const cfg = vscode.workspace.getConfiguration("swls");
  const userCommand = cfg.get<string>("command", "").trim();
  if (userCommand) {
    return userCommand;
  }

  const binaryPath = path.join(context.extensionPath, BINARY_NAME);
  if (fs.existsSync(binaryPath)) {
    return binaryPath;
  }

  throw new Error("Binary not found");
}

async function install(
  context: vscode.ExtensionContext,
  channel: vscode.OutputChannel,
  version?: string,
): Promise<string> {
  version = version ?? (await getLatestRelease());

  const binaryPath = path.join(context.extensionPath, BINARY_NAME);
  const tmpPath = path.join(context.extensionPath, `${BINARY_NAME}.tmp`);

  const target = getTarget();
  const url = `https://github.com/${REPO}/releases/download/${version}/${PLAIN}-${target}`;
  channel.appendLine(`Downloading from ${url} to ${tmpPath}`);

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Installing LSP...",
      },
      async (progress) => {
        channel.appendLine(`Starting download`);
        await download(url, tmpPath, progress);
        channel.appendLine(`Download is done`);
      },
    );
  } catch (err) {
    fs.rmSync(tmpPath, { force: true });
    throw err;
  }

  if (os.platform() !== "win32") {
    fs.chmodSync(tmpPath, 0o755);
  }

  fs.renameSync(tmpPath, binaryPath);
  channel.appendLine(`Installed to ${binaryPath}`);

  return binaryPath;
}

async function getLatestRelease(): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases`, {
    signal: AbortSignal.timeout(10_000),
  });
  const json: { tag_name: string }[] = await res.json();
  // Match only the main binary releases (swls-vX.Y.Z), not the per-language
  // sub-crate tags (swls-lang-*, swls-core-*) which also start with "swls-".
  const latest = json.find((x) => /^swls-v\d/.test(x.tag_name ?? ""));
  if (!latest) {
    throw new Error("No valid release found");
  }
  return latest.tag_name;
}

async function checkForUpdates(
  autoUpdate: boolean,
  context: vscode.ExtensionContext,
  channel: vscode.OutputChannel,
): Promise<void> {
  let currentVersion = "";
  try {
    const cmd = await currentCommand(context);
    currentVersion = await getCurrentVersion(cmd, channel);
  } catch {
    // no binary installed yet
  }
  // The binary may report its version as a bare semver ("0.4.0") or as the
  // release tag ("swls-v0.4.0"), depending on build. Normalize the same way
  // as `latestVersion` below so equal versions actually compare equal.
  currentVersion = currentVersion.replace(/^swls-v/, "");

  let latestTag: string;
  try {
    latestTag = await getLatestRelease();
  } catch (err) {
    channel.appendLine(`Failed to fetch latest release: ${err}`);
    return;
  }
  // `swls --version` reports a bare semver (e.g. "0.3.0") while the release
  // tag is prefixed ("swls-v0.3.0"). Normalize before comparing/displaying so
  // an up-to-date binary doesn't keep prompting to update.
  const latestVersion = latestTag.replace(/^swls-v/, "");

  if (currentVersion === latestVersion) {
    channel.appendLine(`Already at latest version: ${currentVersion}`);
    return;
  }

  const isInstall = currentVersion === "";
  let doUpdate = autoUpdate;
  if (!doUpdate) {
    const label = isInstall ? "Install" : "Update";
    const message = isInstall
      ? "swls language server is available. Install it now?"
      : `swls update available: ${currentVersion} → ${latestVersion}`;
    const choice = await vscode.window.showInformationMessage(
      message,
      label,
      "Cancel",
    );
    doUpdate = choice === label;
  }

  if (!doUpdate) {return;}

  try {
    await install(context, channel, latestTag);
  } catch (err) {
    channel.appendLine(`Failed to install: ${err}`);
    vscode.window.showWarningMessage(`swls: installation failed. (${err})`);
    return;
  }

  const choice = await vscode.window.showInformationMessage(
    isInstall
      ? "swls language server installed. Reload window to use native binary."
      : "swls updated. Reload window to apply.",
    "Reload",
    "Later",
  );
  if (choice === "Reload") {
    vscode.commands.executeCommand("workbench.action.reloadWindow");
  }
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
        if (sep === -1) {break;}
        const header = buf.subarray(0, sep).toString("ascii");
        const m = /Content-Length:\s*(\d+)/i.exec(header);
        if (!m) {
          buf = buf.subarray(sep + 4);
          continue;
        }
        const len = Number(m[1]);
        const start = sep + 4;
        if (buf.length < start + len) {break;}
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

async function startWasm(
  context: vscode.ExtensionContext,
  clientOptions: ReturnType<typeof buildClientOptions>,
  channel: vscode.OutputChannel,
): Promise<void> {
  setupBroadcastLogging(channel);
  setupVirtualDocProvider();

  const shimPath = context.asAbsolutePath("server/dist/nodeWorkerShim.js");
  const worker = new WorkerThread(shimPath);

  await new Promise<void>((resolve, reject) => {
    worker.once("error", reject);
    worker.once("online", resolve);
  });
  worker.removeAllListeners("error");

  worker.on("error", (err) => channel.appendLine("WASM worker error: " + err));
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

  await new Promise((res) => setTimeout(res, 200));
  await wasmClient.start();
  client = wasmClient;
  channel.appendLine("WASM client started");
}

export async function activate(context: ExtensionContext) {
  const channel = vscode.window.createOutputChannel("swls");
  applyFormatOnTypeDefaults(context, channel).catch((err) => {
    channel.appendLine(`Failed to apply formatOnType defaults: ${err}`);
  });
  const cfg = vscode.workspace.getConfiguration("swls");
  const clientOptions = buildClientOptions(cfg);
  const checkUpdate = cfg.get<boolean>("checkUpdate") ?? true;
  const autoUpdate = cfg.get<boolean>("automaticUpdate") ?? false;
  const forceWasm = cfg.get<boolean>("forceWasm") ?? false;

  // Start immediately with whatever is locally available, unless the user
  // forces the bundled WASM server.
  let startedNative = false;
  if (forceWasm) {
    channel.appendLine("swls.forceWasm enabled; skipping native binary");
  } else {
    try {
      const serverBin = await currentCommand(context);
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
        startedNative = true;
        channel.appendLine("Native binary started");
      } catch (err) {
        await nodeClient.stop().catch(() => {});
        channel.appendLine("Failed to start native binary: " + err);
      }
    } catch (err) {
      channel.appendLine("No local binary found: " + err);
    }
  }

  if (!startedNative) {
    channel.appendLine("Starting WASM worker");
    try {
      await startWasm(context, clientOptions, channel);
    } catch (err) {
      vscode.window.showWarningMessage(`swls: Failed to start WASM. (${err})`);
    }
  }

  // Background: check for updates / prompt to install. Skipped under forceWasm,
  // since the native binary it would install is never used.
  if (checkUpdate && !forceWasm) {
    checkForUpdates(autoUpdate, context, channel).catch((err) => {
      channel.appendLine(`Update check failed: ${err}`);
    });
  }
}

export async function deactivate(): Promise<void> {
  await client?.stop();
}
