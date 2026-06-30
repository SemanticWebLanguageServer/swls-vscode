import * as vscode from "vscode";
import { LanguageClientOptions } from "vscode-languageclient";

const channels: Record<string, vscode.OutputChannel> = {};

// Legacy: maps the deprecated `swls.disable.<key>` booleans to the `Disabled`
// enum values the server expects. Superseded by the `swls.disabled` array, but
// still honored so existing user settings keep working.
const DISABLE_TOGGLES: [string, string][] = [
  ["shapes", "shapes"],
  ["undefinedPrefixDiagnostic", "undefined_prefix"],
  ["unusedPrefixDiagnostic", "unused_prefix"],
  ["namespacePropertiesDiagnostic", "namespace_properties"],
  ["syntaxDiagnostics", "syntax_diagnostics"],
  ["completion", "completion"],
  ["completionKeyword", "completion_keyword"],
  ["completionClass", "completion_class"],
  ["completionProperty", "completion_property"],
  ["completionPrefix", "completion_prefix"],
  ["completionSubject", "completion_subject"],
  ["hover", "hover"],
  ["hoverType", "hover_type"],
  ["hoverClass", "hover_class"],
  ["hoverProperty", "hover_property"],
  ["hoverExcludedProperty", "hover_excluded_property"],
  ["gotoDefinition", "goto_definition"],
  ["gotoDefinitionComponentsJs", "goto_definition_components_js"],
  ["gotoTypeDefinition", "goto_type_definition"],
  ["references", "references"],
  ["rename", "rename"],
  ["semanticTokens", "semantic_tokens"],
  ["format", "format"],
  ["prefixAutoInsert", "prefix_auto_insert"],
  ["codeAction", "code_action"],
  ["codeActionOrganizeImports", "code_action_organize_imports"],
  ["codeActionBlankNodeRefactor", "code_action_blank_node_refactor"],
  ["inlayHint", "inlay_hint"],
];

function logToChannel(label: string, msg: string) {
  if (channels[label] === undefined) {
    channels[label] = vscode.window.createOutputChannel("swls::" + label);
  }
  channels[label].appendLine(msg);
}

export function buildClientOptions(
  cfg: vscode.WorkspaceConfiguration,
): LanguageClientOptions {
  // Enabled languages / formatting come from the `swls.languages` and
  // `swls.formatLanguages` list-enums. The deprecated per-language booleans
  // (`swls.turtle`, `swls.format.trig`, …) still win when explicitly set.
  const languages = cfg.get<string[]>("languages", [
    "turtle",
    "trig",
    "n3",
    "jsonld",
  ]);
  const formatLanguages = cfg.get<string[]>("formatLanguages", ["turtle"]);
  const turtle = cfg.get<boolean>("turtle") ?? languages.includes("turtle");
  const trig = cfg.get<boolean>("trig") ?? languages.includes("trig");
  const n3 = cfg.get<boolean>("n3") ?? languages.includes("n3");
  const jsonld = cfg.get<boolean>("jsonld") ?? languages.includes("jsonld");
  const sparql = cfg.get<boolean>("sparql") ?? languages.includes("sparql");
  // Per-language formatting toggles (server default: Turtle on, others off).
  const format = {
    turtle: cfg.get<boolean>("format.turtle") ?? formatLanguages.includes("turtle"),
    trig: cfg.get<boolean>("format.trig") ?? formatLanguages.includes("trig"),
    n3: cfg.get<boolean>("format.n3") ?? formatLanguages.includes("n3"),
    jsonld: cfg.get<boolean>("format.jsonld") ?? formatLanguages.includes("jsonld"),
  };
  const log = cfg.get<string>("log", "debug");
  const ontologies = cfg.get<string[]>("ontologies", []);
  const shapes = cfg.get<string[]>("shapes", []);
  // Primary source: the `swls.disabled` list-enum. Merge in any legacy
  // `swls.disable.<key>` booleans that are still set for backwards compat.
  const legacyDisabled = DISABLE_TOGGLES.filter(([key]) =>
    cfg.get<boolean>(`disable.${key}`, false),
  ).map(([, value]) => value);
  const disabled = [
    ...new Set([...cfg.get<string[]>("disabled", []), ...legacyDisabled]),
  ];
  const prefixDisabled = cfg.get<string[]>("prefixDisabled", []);
  const completionMode = cfg.get<string>("completion.mode", "none");
  const completionExceptions = cfg.get<string[]>("completion.exceptions", []);
  // Deprecated lists, still honored: `strict` forced strict namespaces (loose
  // mode), `except` forced loose namespaces (strict mode).
  const legacyStrict = cfg.get<string[]>("completion.strict", []);
  const legacyExcept = cfg.get<string[]>("completion.except", []);
  const prefixFormat = cfg.get<string>("prefixFormat", "turtle");

  // The server's CompletionConfig is "none"|"loose"|"strict", or a base mode
  // with namespace exceptions that get the opposite treatment:
  //   { strict: [...] } => loose base, these forced strict
  //   { loose:  [...] } => strict base, these forced loose
  let completion: string | { strict: string[] } | { loose: string[] };
  if (completionMode === "loose" && completionExceptions.length > 0) {
    completion = { strict: completionExceptions };
  } else if (completionMode === "strict" && completionExceptions.length > 0) {
    completion = { loose: completionExceptions };
  } else if (legacyStrict.length > 0) {
    completion = { strict: legacyStrict };
  } else if (legacyExcept.length > 0) {
    completion = { loose: legacyExcept };
  } else {
    completion = completionMode;
  }

  return {
    documentSelector: [
      { language: "turtle" },
      { language: "trig" },
      { language: "n3" },
      { language: "jsonld" },
      { language: "sparql" },
    ],
    synchronize: {},
    initializationOptions: {
      log,
      sparql,
      turtle,
      trig,
      n3,
      jsonld,
      format,
      ontologies,
      shapes,
      disabled,
      prefix_disabled: prefixDisabled,
      completion,
      prefix_format: prefixFormat,
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
