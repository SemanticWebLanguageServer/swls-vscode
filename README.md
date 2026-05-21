# Semantic Web Language Server

[![Docs](https://img.shields.io/badge/docs-latest-blue)](https://semanticweblanguageserver.github.io/swls/docs/lsp_core/index.html)
![LICENSE](https://img.shields.io/badge/License-MIT-8A2BE2)
[![Visual Studio Marketplace Last Updated](https://img.shields.io/visual-studio-marketplace/last-updated/ajuvercr.semantic-web-lsp?label=VSCode%20Extension)](https://marketplace.visualstudio.com/items?itemName=ajuvercr.semantic-web-lsp)

IDE support for Semantic Web languages — Turtle, TriG, JSON-LD, and SPARQL. Autocompletion, diagnostics, formatting, SHACL validation, and more.

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

- Format Turtle and JSON-LD documents

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
| `swls.turtle` | boolean | `true` | Enable Turtle language support |
| `swls.trig` | boolean | `true` | Enable TriG language support |
| `swls.jsonld` | boolean | `true` | Enable JSON-LD language support |
| `swls.sparql` | boolean | `false` | Enable SPARQL language support (experimental) |
| `swls.checkUpdate` | boolean | `true` | Check GitHub for new releases on startup |
| `swls.automaticUpdate` | boolean | `false` | Install updates without prompting |
| `swls.log` | string | `"debug"` | Log level: `error`, `warn`, `info`, `debug`, `trace` |
| `swls.ontologies` | string[] | `[]` | Extra ontology URLs to load |
| `swls.shapes` | string[] | `[]` | Extra SHACL shape URLs to load |
| `swls.disabled` | string[] | `[]` | Features to disable (e.g. `"shapes"`) |
| `swls.prefixDisabled` | string[] | `[]` | Prefixes from prefix.cc to hide from completions |
| `swls.completion.mode` | string | `"none"` | Property completion mode: `none` (server default), `loose` (all properties), `strict` (domain-matched only) |
| `swls.completion.strict` | string[] | `[]` | Namespace prefixes that require a matching domain even in `loose` mode |
| `swls.completion.except` | string[] | `[]` | Namespace prefixes always suggested regardless of domain, even in `strict` mode |

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
