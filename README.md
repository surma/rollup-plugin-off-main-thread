# rollup-plugin-loadz0r

An ill-named rollup plugin so you can use `import()` in every browser, even in workers.

```
$ npm install --save rollup-plugin-loadz0r
```

Code splitting is important to make loading more efficient by only loading what you need. This becomes literally doubly important when you are using workers (including service workers), as [they might share dependencies with your UI thread and you don’t want to load the same code twice][splitting]. That’s the point where you usually run into the issue that workers don’t have support for modules anywhere just yet. To work around this you can either pick a full-blown module loader like [RequireJS] or [SystemJS] **or you can use loadz0r!!!!1!11**.

The plugin packs a tiny (~380B gzip’d) almost-AMD loader that is specifically tailored to the output that rollup produces. It is so small in fact, that it is totally acceptable to just prepend the loader to all entry point modules. This way you don’t have to load a module loader and then pay another round-trip to load your bootstrap code.

**This plugin is only necessary for as long as there is no mainstream support for modules in workers.** Once modules in workers land, just use rollup’s ES Module output format.

> Note: The reason the loader is so small is because _it is not a general purpose loader_. It most likely won’t work with anything but rollup generated bundles.

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
  plugins: [loadz0r()]
};
```

## Options

```js
{
  // ...
  plugins: [loadz0r(options)];
}
```

- `loader`: A string containing the source of the loader. If `undefined,` loadz0r will use the aforementioned minimal AMD loader (see `loader.js`).
- `useEval`: Use `fetch()` + `eval()` to load dependencies instead of `<script>` tags and `importScripts()`. _This is not CSP compliant, but is required if you want to use dynamic imports in ServiceWorker_.
- `publicPath`: The location your AMD modules will be served from. If undefined, module URLs are relative to the current page. A value of `{ publicPath: '/scripts' }` would change `./chunk-xyz123.js` to `/scripts/chunk-xyz123.js`.

[rollup]: https://rollupjs.org/
[requirejs]: https://requirejs.org/
[systemjs]: https://github.com/systemjs/systemjs
[splitting]: https://twitter.com/DasSurma/status/1013489346090012672

---

License Apache-2.0
