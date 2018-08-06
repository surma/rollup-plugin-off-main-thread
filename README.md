# rollup-plugin-loadz0r

This ill-named [rollup] plugin makes code splitting with rollup “just work”, even with workers.

The plugin consists of a rollup plugin that injects a tiny (~380B gzip’d) AMD loader to each entry file. This way you don’t need to load a fully fledged AMD loader and pay additional roundtrips until your app boots up. The AMD loader is so tiny because _it is not generaly purpose_, but can probably only load the AMD modules emitted by rollup.

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

```html
<!doctype html>
<!-- ... -->
<script src="main.js"></script>
<!-- Legit. That’s it. -->
```

[rollup]: https://rollupjs.org/guide/en

---

License Apache-2.0
