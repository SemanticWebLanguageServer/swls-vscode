import * as vscode from "vscode";
import { LanguageClientOptions } from "vscode-languageclient";

const channels: { [label: string]: vscode.OutputChannel } = {};

function logToChannel(label: string, msg: string) {
  if (channels[label] === undefined) {
    channels[label] = vscode.window.createOutputChannel("swls::" + label);
  }
  channels[label].appendLine(msg);
}

export function buildClientOptions(
  cfg: vscode.WorkspaceConfiguration,
): LanguageClientOptions {
  const turtle = cfg.get<boolean>("turtle");
  const jsonld = cfg.get<boolean>("jsonld");
  const sparql = cfg.get<boolean>("sparql");
  const log = cfg.get<string>("log", "debug");
  const ontologies = cfg.get<string[]>("ontologies", []);
  const shapes = cfg.get<string[]>("shapes", []);
  const disabled = cfg.get<string[]>("disabled", []);
  const prefixDisabled = cfg.get<string[]>("prefixDisabled", []);
  const completionMode = cfg.get<string>("completion.mode", "none");
  const completionStrict = cfg.get<string[]>("completion.strict", []);
  const completionExcept = cfg.get<string[]>("completion.except", []);

  let completion: string | { strict: string[] } | { loose: string[] };
  if (completionStrict.length > 0) {
    completion = { strict: completionStrict };
  } else if (completionExcept.length > 0) {
    completion = { loose: completionExcept };
  } else {
    completion = completionMode;
  }

  return {
    documentSelector: [
      { language: "turtle" },
      { language: "jsonld" },
      { language: "sparql" },
    ],
    synchronize: {},
    initializationOptions: {
      log,
      sparql,
      turtle,
      jsonld,
      ontologies,
      shapes,
      disabled,
      prefix_disabled: prefixDisabled,
      completion,
    },
  };
}

// BroadcastChannel is available in both WebWorker and Node.js 18+.
export function setupBroadcastLogging(channel: vscode.OutputChannel): void {
  const logChan = new BroadcastChannel("swls");
  logChan.onmessage = (ev) => {
    const { message } = ev.data || {};
    channel.appendLine(message);
  };

  const debug = vscode.window.createOutputChannel("swls::debug");
  const debugChan = new BroadcastChannel("swls-debug");
  debugChan.onmessage = (ev) => {
    const { message } = ev.data || {};
    debug.appendLine(message);
    const obj = JSON.parse(message);
    logToChannel(
      obj["target"] || "none",
      JSON.stringify(obj.span || {}) + " " + obj.fields?.message || "none",
    );
  };
}

export function setupVirtualDocProvider(): void {
  const virtualDocs: Record<string, string> = {};
  const emitter = new vscode.EventEmitter<vscode.Uri>();
  vscode.workspace.registerTextDocumentContentProvider("virtual", {
    onDidChange: emitter.event,
    provideTextDocumentContent: (uri: vscode.Uri) =>
      virtualDocs[uri.toString()] || "",
  });
}

// Duck-typed so it works with both BrowserLanguageClient and NodeLanguageClient.
export function registerFsHandlers(
  client: {
    onRequest(method: string, handler: (params: never) => unknown): unknown;
  },
  channel: vscode.OutputChannel,
): void {
  client.onRequest("custom/readFile", async (params: { url: string }) => {
    channel.appendLine("reading file " + params.url);
    try {
      const doc = await vscode.workspace.openTextDocument(
        vscode.Uri.parse(params.url),
      );
      return { content: doc.getText() };
    } catch (err) {
      return { error: "" + err };
    }
  });

  client.onRequest("custom/readDir", async (params: { url: string }) => {
    channel.appendLine("reading dir " + params.url);
    const dirUri = vscode.Uri.parse(params.url);
    try {
      const entries = await vscode.workspace.fs.readDirectory(dirUri);
      return entries.map(([name, type]) => {
        const isDir = (type & vscode.FileType.Directory) !== 0;
        const uri = vscode.Uri.joinPath(dirUri, name);
        return {
          name,
          path: isDir ? uri.toString() + "/" : uri.toString(),
          is_dir: isDir,
        };
      });
    } catch {
      return [];
    }
  });

  client.onRequest("custom/isFile", async (params: { url: string }) => {
    try {
      const stat = await vscode.workspace.fs.stat(vscode.Uri.parse(params.url));
      return (stat.type & vscode.FileType.File) !== 0;
    } catch {
      return false;
    }
  });

  client.onRequest(
    "custom/glob",
    async (params: { url: string; pattern: string }) => {
      const baseUri = vscode.Uri.parse(params.url);
      try {
        const relPattern = new vscode.RelativePattern(baseUri, params.pattern);
        const files = await vscode.workspace.findFiles(relPattern, null);
        return files.map((uri) => ({
          name: uri.path.split("/").pop() || "",
          path: uri.toString(),
          is_dir: false,
        }));
      } catch {
        return [];
      }
    },
  );

  client.onRequest("custom/isDir", async (params: { url: string }) => {
    try {
      const stat = await vscode.workspace.fs.stat(vscode.Uri.parse(params.url));
      return (stat.type & vscode.FileType.Directory) !== 0;
    } catch {
      return false;
    }
  });
}
