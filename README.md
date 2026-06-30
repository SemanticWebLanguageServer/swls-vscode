# Semantic Web Language Server

[![Docs](https://img.shields.io/badge/docs-latest-blue)](https://semanticweblanguageserver.github.io/swls/docs/lsp_core/index.html)
![LICENSE](https://img.shields.io/badge/License-MIT-8A2BE2)
[![Visual Studio Marketplace Last Updated](https://img.shields.io/visual-studio-marketplace/last-updated/ajuvercr.semantic-web-lsp?label=VSCode%20Extension)](https://marketplace.visualstudio.com/items?itemName=ajuvercr.semantic-web-lsp)

IDE support for Semantic Web languages — Turtle, TriG, N3, JSON-LD, and SPARQL. Autocompletion, diagnostics, formatting, SHACL validation, and more.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
  - [VS Code](#vs-code)
  - [NeoVim](#neovim)
- [Configuration](#configuration)
- [Documentation](#documentation)
- [Screenshots](#screenshots)

## Features

### Diagnostics

- **Syntax errors** — immediate feedback on malformed documents
- **Undefined prefixes** — flags uses of undeclared namespace prefixes
- **SHACL shape violations** — validates data against loaded SHACL shapes

### Completion

- **Prefix completion** — typing `foa` expands to `foaf:` and inserts the prefix declaration
- **Property completion** — suggests properties ordered by domain relevance
- **Class completion** — when the predicate is `a`, suggests applicable classes

### Hover

- Shows labels, descriptions, and class information for IRIs

### Rename

- Rename terms local to the current file

### Formatting

- Format Turtle, TriG, N3, and JSON-LD documents
- Enabled for Turtle by default; enable the others via `swls.format.*`

### Semantic Highlighting

- Full semantic token highlighting for all supported languages

## Installation

### VS Code

Install from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=ajuvercr.semantic-web-lsp) or [Open VSX Registry](https://open-vsx.org/extension/ajuvercr/semantic-web-lsp).

On startup the extension looks for a native `swls` binary in its own directory (set `swls.command` to use a custom path instead). If no binary is found it falls back to a bundled WASM worker so the LSP is available immediately without any extra setup.

In the background it checks GitHub releases for updates. When a newer version is available you will be prompted to install it; after the download completes a window reload switches to the native binary.

### NeoVim

A NeoVim plugin is available at [SemanticWebLanguageServer/swls.nvim](https://github.com/SemanticWebLanguageServer/swls.nvim).

## Configuration

All settings live under the `swls` prefix.

| Setting | Type | Default | Description |
|---|---|---|---|
| `swls.command` | string | `""` | Path to the swls binary. If empty, the bundled binary in the extension directory is used |
| `swls.forceWasm` | boolean | `false` | Skip the native binary and always run the bundled WASM language server |
| `swls.languages` | string[] | `["turtle", "trig", "n3", "jsonld"]` | Languages SWLS is enabled for. Values: `turtle`, `trig`, `n3`, `jsonld`, `sparql` (experimental) |
| `swls.formatLanguages` | string[] | `["turtle"]` | Languages document formatting is enabled for. Values: `turtle`, `trig`, `n3`, `jsonld` |
| `swls.checkUpdate` | boolean | `true` | Check GitHub for new releases on startup |
| `swls.automaticUpdate` | boolean | `false` | Install updates without prompting |
| `swls.log` | string | `"debug"` | Log level: `error`, `warn`, `info`, `debug`, `trace` |
| `swls.ontologies` | string[] | `[]` | Extra ontology URLs to load |
| `swls.shapes` | string[] | `[]` | Extra SHACL shape URLs to load |
| `swls.prefixDisabled` | string[] | `[]` | Prefixes from prefix.cc to hide from completions |
| `swls.completion.mode` | string | `"none"` | Property completion mode: `none` (server default), `loose` (all properties), `strict` (domain-matched only) |
| `swls.completion.exceptions` | string[] | `[]` | Namespace IRIs that get the **opposite** treatment of `completion.mode`: forced strict in `loose` mode, always suggested in `strict` mode. Ignored when mode is `none` |
| `swls.prefixFormat` | string | `"turtle"` | Syntax for inserted Turtle/TriG prefix declarations: `turtle` (`@prefix ex: <...> .`) or `sparql` (`PREFIX ex: <...>`) |
| `swls.disabled` | string[] | `[]` | Features and diagnostics to turn off. Pick from the values below (in Settings UI: *Add Item* → choose from the dropdown) |

### `swls.disabled` values

| Value | Disables |
| --- | --- |
| `shapes` | SHACL shape validation |
| `undefined_prefix` | The undeclared-prefix diagnostic |
| `unused_prefix` | The unused-prefix diagnostic |
| `namespace_properties` | The closed-namespace property diagnostic |
| `syntax_diagnostics` | Syntax/parse error diagnostics |
| `completion` | Completion entirely |
| `completion_keyword` | Keyword completion |
| `completion_class` | Class-name completion |
| `completion_property` | Property completion |
| `completion_prefix` | Prefix-name completion |
| `completion_subject` | Subject-IRI completion (Turtle only) |
| `hover` | Hover entirely |
| `hover_type` | Inferred-type hover |
| `hover_class` | Class documentation hover |
| `hover_property` | Property documentation hover |
| `hover_excluded_property` | Allow-listed-property hover explanation |
| `goto_definition` | Goto-definition entirely |
| `goto_definition_components_js` | Components.js goto-definition |
| `goto_type_definition` | Goto type-definition |
| `references` | Find-all-references |
| `rename` | Rename |
| `semantic_tokens` | Semantic tokens |
| `format` | Document formatting |
| `prefix_auto_insert` | Auto-inserting missing prefix declarations |
| `code_action` | Code actions entirely |
| `code_action_organize_imports` | The "Organize Imports" quick-fix |
| `code_action_blank_node_refactor` | Blank-node refactor quick-fixes |
| `inlay_hint` | Inlay hints |

> Deprecated but still honored, so existing configs keep working: the per-feature `swls.disable.<name>`, per-language `swls.<lang>` and `swls.format.<lang>` booleans, and `swls.completion.strict` / `swls.completion.except` (replaced by `swls.completion.exceptions`).

## Documentation

- [lsp-core](https://semanticweblanguageserver.github.io/swls/docs/lsp_core/index.html)
- [lang-turtle](https://semanticweblanguageserver.github.io/swls/docs/lang_turtle/index.html)
- [lang-jsonld](https://semanticweblanguageserver.github.io/swls/docs/lang_jsonld/index.html)
- [lang-sparql](https://semanticweblanguageserver.github.io/swls/docs/lang_sparql/index.html)
- [swls](https://semanticweblanguageserver.github.io/swls/docs/swls/index.html)

## Screenshots

| Undefined prefix | Shape violation |
|---|---|
| ![Undefined Prefixes](./screenshots/undefined_prefix.png) | ![Shape violations](./screenshots/shape.png) |

| Class completion | Property completion |
|---|---|
| ![Complete Class](./screenshots/complete_class.png) | ![Complete Property](./screenshots/complete_property.png) |

## Support

If SWLS helps your workflow, consider supporting development:

☕ https://ko-fi.com/ajuvercr
