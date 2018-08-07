# rollup-plugin-loadz0r

An ill-named rollup plugin that makes code splitting “just work”, even with workers.

Code splitting is important to make loading more efficient. This becomes literally doubly important to avoid double loading when there are common dependencies between multiple bundles (e.g. oe for worker and one for the UI thread).

**This plugin is only necessary for as long as there is no mainstream support for modules in workers.** Once modules in workers land, just use rollup’s ES Module output format.

The plugin injects a tiny (~380B gzip’d) almost-AMD loader into each entry bundle. The AMD loader is this tiny because _it is not general purpose_. It’s probably not feasibly to use it outside of rollup.

## Usage

```js
// rollup.config.js
import loadz0r from "rollup-plugin-loadz0r";

export default {
  input: ["src/main.js", "src/worker.js", "src/serviceworker.js"],
  output: {
    dir: "dist",
    // You _must_ use “amd” as your format
    format: "amd"
  },
  plugins: [loadz0r()],
  // Enable code splitting
  experimentalCodeSplitting: true
};
```

[rollup]: https://rollupjs.org/

---
License Apache-2.0
