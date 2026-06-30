/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-var-requires */
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
("use strict");

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

const path = require("path");

/** @type WebpackConfig */
const browserClientConfig = {
  context: path.join(__dirname, "client"),
  mode: "none",
  target: "webworker", // web extensions run in a webworker context
  entry: {
    browserClientMain: "./src/browserClientMain.ts",
  },
  output: {
    filename: "[name].js",
    path: path.join(__dirname, "client", "dist"),
    libraryTarget: "commonjs",
    devtoolModuleFilenameTemplate: "../[resource-path]",
  },
  resolve: {
    mainFields: ["module", "main"],
    extensions: [".ts", ".js"], // support ts-files and js-files
    alias: {},
    fallback: {
      path: require.resolve("path-browserify"),
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader",
          },
        ],
      },
    ],
  },
  externals: {
    vscode: "commonjs vscode", // ignored because it doesn't exist
  },
  performance: {
    hints: false,
  },
  devtool: "nosources-source-map",
};

/** @type WebpackConfig */
const browserServerConfig = {
  context: path.join(__dirname, "server"),
  mode: "none",
  target: "webworker", // web extensions run in a webworker context
  entry: {
    browserServerMain: "./src/browserServerMain.ts",
  },
  output: {
    filename: "[name].js",
    path: path.join(__dirname, "server", "dist"),
    libraryTarget: "var",
    library: "serverExportVar",
    devtoolModuleFilenameTemplate: "../[resource-path]",
    publicPath: "",
  },
  resolve: {
    symlinks: false,
    mainFields: ["module", "main"],
    extensions: [".ts", ".js"], // support ts-files and js-files
    alias: {},
    fallback: {
      //path: require.resolve("path-browserify")
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader",
          },
        ],
      },
      {
        // The `web`-target swls-wasm is loaded by URL (we fetch it ourselves),
        // so emit the .wasm as an asset rather than an async-wasm module.
        test: /\.wasm$/,
        type: "asset/resource",
      },
    ],
  },
  externals: {
    vscode: "commonjs vscode", // ignored because it doesn't exist
  },
  performance: {
    hints: false,
  },
  devtool: "nosources-source-map",
};

/** @type WebpackConfig */
const nodeClientConfig = {
  context: path.join(__dirname, "client"),
  mode: "none",
  target: "node",
  entry: {
    nodeClientMain: "./src/nodeClientMain.ts",
  },
  output: {
    filename: "[name].js",
    path: path.join(__dirname, "client", "dist"),
    libraryTarget: "commonjs",
    devtoolModuleFilenameTemplate: "../[resource-path]",
  },
  resolve: {
    mainFields: ["module", "main"],
    extensions: [".ts", ".js"],
    alias: {},
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [{ loader: "ts-loader" }],
      },
    ],
  },
  externals: {
    vscode: "commonjs vscode",
  },
  performance: {
    hints: false,
  },
  devtool: "nosources-source-map",
};

/** @type WebpackConfig */
const nodeWorkerShimConfig = {
  context: path.join(__dirname, "server"),
  mode: "none",
  target: "node",
  entry: {
    nodeWorkerShim: "./src/nodeWorkerShim.js",
  },
  output: {
    filename: "[name].js",
    path: path.join(__dirname, "server", "dist"),
  },
  externals: {
    // Keep these as real runtime requires — never bundle them.
    worker_threads: "commonjs worker_threads",
    "./browserServerMain.js": "commonjs ./browserServerMain.js",
  },
  performance: {
    hints: false,
  },
};

module.exports = [
  browserClientConfig,
  browserServerConfig,
  nodeClientConfig,
  nodeWorkerShimConfig,
];
