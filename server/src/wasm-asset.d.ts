// `require("…/swls_wasm_bg.wasm")` is handled by webpack's `asset/resource`
// rule and yields the emitted file's URL as a string.
declare module "*.wasm" {
  const url: string;
  export = url;
}
