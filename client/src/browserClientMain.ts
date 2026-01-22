import { ExtensionContext, Uri } from "vscode";
import * as vscode from "vscode";
import { LanguageClientOptions } from "vscode-languageclient";

import { LanguageClient } from "vscode-languageclient/browser";

const channels: { [label: string]: vscode.OutputChannel } = {};

function logToChannel(channel: string, msg: string) {
  if (channels[channel] === undefined) {
    channels[channel] = vscode.window.createOutputChannel("swls::" + channel);
  }
  channels[channel].appendLine(msg);
}

let client: LanguageClient | undefined;
// this method is called when vs code is activated
export async function activate(context: ExtensionContext) {
  const channel = vscode.window.createOutputChannel("swls");
  const debug = vscode.window.createOutputChannel("swls::debug");

  const logChan = new BroadcastChannel("swls");
  logChan.onmessage = (ev) => {
    const { level, message } = ev.data || {};
    // Forward to extension host (single, separate “log lane”)
    channel.appendLine(message);
  };

  const debugChan = new BroadcastChannel("swls-debug");
  debugChan.onmessage = (ev) => {
    const { level, message } = ev.data || {};
    debug.appendLine(message);
    const obj = JSON.parse(message);
    logToChannel(
      obj["target"] || "none",
      JSON.stringify(obj.span || {}) + " " + obj.fields?.message || "none",
    );
  };

  const virtualDocs: Record<string, string> = {};
  const emitter = new vscode.EventEmitter<vscode.Uri>();
  const provider: vscode.TextDocumentContentProvider = {
    onDidChange: emitter.event,
    provideTextDocumentContent(uri: vscode.Uri) {
      return virtualDocs[uri.toString()] || "";
    },
  };

  vscode.workspace.registerTextDocumentContentProvider("virtual", provider);

  channel.appendLine("semantic-web-lsp activated!, Part 3");

  const turtle = vscode.workspace.getConfiguration().get("swls.turtle");
  const jsonld = vscode.workspace.getConfiguration().get("swls.jsonld");
  const sparql = vscode.workspace.getConfiguration().get("swls.sparql");
  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { language: "turtle" },
      { language: "jsonld" },
      { language: "sparql" },
    ],
    synchronize: {},
    initializationOptions: {
      sparql,
      turtle,
      jsonld,
    },
  };

  client = createWorkerLanguageClient(context, clientOptions);

  await new Promise((res) => setTimeout(res, 200));

  channel.appendLine("client created " + context.extensionUri.toString());

  client.onRequest("custom/readFile", async (params: { url: string }) => {
    const uri = params.url;
    const vscodeUri = vscode.Uri.parse(uri);
    try {
      const doc = await vscode.workspace.openTextDocument(vscodeUri);
      return { content: doc.getText() };
    } catch (err) {
      return { error: "" + err };
    }
  });

  channel.appendLine("starting client");
  await client.start();
  channel.appendLine("client started");

  console.log("lsp-web-extension-sample server is ready");
}

export async function deactivate(): Promise<void> {
  if (client !== undefined) {
    await client.stop();
  }
}

function createWorkerLanguageClient(
  context: ExtensionContext,
  clientOptions: LanguageClientOptions,
) {
  // Create a worker. The worker main file implements the language server.
  const serverMain = Uri.joinPath(
    context.extensionUri,
    "server/dist/browserServerMain.js",
  );
  const worker = new Worker(serverMain.toString(true), {});

  worker.postMessage({ context: context.extensionUri.toString() });

  // create the language server client to communicate with the server running in the worker
  return new LanguageClient(
    "semantic-web-lsp",
    "semantic-web-lsp",
    clientOptions,
    worker,
  );
}
