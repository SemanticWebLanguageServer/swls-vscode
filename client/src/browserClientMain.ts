import { ExtensionContext, Uri } from "vscode";
import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/browser";
import {
  applyFormatOnTypeDefaults,
  buildClientOptions,
  registerFsHandlers,
  setupBroadcastLogging,
  setupVirtualDocProvider,
} from "./common";

let client: LanguageClient | undefined;

export async function activate(context: ExtensionContext) {
  const channel = vscode.window.createOutputChannel("swls");
  channel.appendLine("semantic-web-lsp activated");

  applyFormatOnTypeDefaults(context, channel).catch((err) => {
    channel.appendLine(`Failed to apply formatOnType defaults: ${err}`);
  });

  setupBroadcastLogging(channel);
  setupVirtualDocProvider();

  const serverMain = Uri.joinPath(
    context.extensionUri,
    "server/dist/browserServerMain.js",
  );
  const worker = new Worker(serverMain.toString(true));
  worker.postMessage({ context: context.extensionUri.toString() });

  const cfg = vscode.workspace.getConfiguration("swls");
  client = new LanguageClient(
    "semantic-web-lsp",
    "semantic-web-lsp",
    buildClientOptions(cfg),
    worker,
  );
  registerFsHandlers(client, channel);

  await new Promise((res) => setTimeout(res, 200));
  await client.start();
}

export async function deactivate(): Promise<void> {
  await client?.stop();
}
