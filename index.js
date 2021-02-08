/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const { readFileSync } = require("fs");
const { join } = require("path");
const ejs = require("ejs");
const MagicString = require("magic-string");
const tippex = require("tippex");

const defaultOpts = {
  // A string containing the EJS template for the amd loader. If `undefined`,
  // OMT will use `loader.ejs`.
  loader: readFileSync(join(__dirname, "/loader.ejs"), "utf8"),
  // Use `fetch()` + `eval()` to load dependencies instead of `<script>` tags
  // and `importScripts()`. _This is not CSP compliant, but is required if you
  // want to use dynamic imports in ServiceWorker_.
  useEval: false,
  // Function name to use instead of AMD’s `define`.
  amdFunctionName: "define",
  // A function that determines whether the loader code should be prepended to a
  // certain chunk. Should return true if the load is supposed to be prepended.
  prependLoader: (chunk, workerFiles) =>
    chunk.isEntry || workerFiles.includes(chunk.facadeModuleId),
  // The scheme used when importing workers as a URL.
  urlLoaderScheme: "omt",
  // Silence the warning about ESM being badly supported in workers.
  silenceESMWorkerWarning: false
};

// A regexp to find static `new Worker` invocations.
// File part matches one of:
// - '...'
// - "..."
// - `import.meta.url`
// - `new URL('...', import.meta.url)
// - `new URL("...", import.meta.url)
// Also matches optional options param.
const workerRegexp = /(new\s+Worker\()\s*(('.*?'|".*?")|import\.meta\.url|new\s+URL\(('.*?'|".*?"),\s*import\.meta\.url\))\s*(,(.+?))?(\))/gs;

let longWarningAlreadyShown = false;

module.exports = function(opts = {}) {
  opts = Object.assign({}, defaultOpts, opts);

  opts.loader = ejs.render(opts.loader, opts);

  const urlLoaderPrefix = opts.urlLoaderScheme + ":";

  let workerFiles;
  let isEsmOutput = false;
  return {
    name: "off-main-thread",

    async buildStart(options) {
      workerFiles = [];
    },

    outputOptions({ format }) {
      if (format === "esm" || format === "es") {
        if (!opts.silenceESMWorkerWarning) {
          this.warn(
            'Very few browsers support ES modules in Workers. If you want to your code to run in all browsers, set `output.format = "amd";`'
          );
        }
        // In ESM, we never prepend a loader.
        isEsmOutput = true;
      } else if (format !== "amd") {
        this.error(
          `\`output.format\` must either be "amd" or "esm", got "${format}"`
        );
      }
    },

    async resolveId(id, importer) {
      if (!id.startsWith(urlLoaderPrefix)) return;

      const path = id.slice(urlLoaderPrefix.length);
      const resolved = await this.resolve(path, importer);
      if (!resolved)
        throw Error(`Cannot find module '${path}' from '${importer}'`);
      const newId = resolved.id;

      return urlLoaderPrefix + newId;
    },

    load(id) {
      if (!id.startsWith(urlLoaderPrefix)) return;

      const realId = id.slice(urlLoaderPrefix.length);
      const chunkRef = this.emitFile({ id: realId, type: "chunk" });
      return `export default import.meta.ROLLUP_FILE_URL_${chunkRef};`;
    },

    async transform(code, id) {
      const ms = new MagicString(code);

      const replacementPromises = [];

      // Tippex is performing regex matching under the hood, but automatically ignores comments
      // and string contents so it's more reliable on JS syntax.
      tippex.match(
        code,
        workerRegexp,
        (
          fullMatch,
          partBeforeArgs,
          workerSource,
          directWorkerFile,
          workerFile,
          optionsStrWithComma = "",
          optionsStr = "",
          partAfterArgs,
        ) => {
          // We need to get this before the `await`, otherwise `lastIndex`
          // will be already overridden.
          const matchIndex = workerRegexp.lastIndex - fullMatch.length;

          let workerIdPromise;
          if (workerSource === "import.meta.url") {
            // Turn the current file into a chunk
            workerIdPromise = Promise.resolve(id);
          } else {
            // Otherwise it's a string literal either directly or in the `new URL(...)`.
            if (directWorkerFile) {
              const fullReplacement = `new Worker(new URL(${directWorkerFile}, import.meta.url)${optionsStrWithComma})`;

              if (!longWarningAlreadyShown) {
              this.warn(`rollup-plugin-off-main-thread:
\`${fullMatch}\` suggests that the Worker should be relative to the document, not the script.
In the bundler, we don't know what the final document's URL will be, and instead assume it's a URL relative to the current module.
This might lead to incorrect behaviour during runtime.
If you did mean to use a URL relative to the current module, please change your code to the following form:
\`${fullReplacement}\`
This will become a hard error in the future.`, matchIndex);
                  longWarningAlreadyShown = true;
              } else {
                this.warn(`rollup-plugin-off-main-thread: Treating \`${fullMatch}\` as \`${fullReplacement}\``, matchIndex);
              }
              workerFile = directWorkerFile;
            }

            // Cut off surrounding quotes.
            workerFile = workerFile.slice(1, -1);

            if (!/^\.{1,2}\//.test(workerFile)) {
              this.warn(
                `Paths passed to the Worker constructor must be relative to the current file, i.e. start with ./ or ../ (just like dynamic import!). Ignoring "${workerFile}".`,
                matchIndex
              );
              return;
            }

            workerIdPromise = this.resolve(workerFile, id).then(res => res.id);
          }

          const workerParametersStartIndex = matchIndex + partBeforeArgs.length;
          const workerParametersEndIndex =
            matchIndex + fullMatch.length - partAfterArgs.length;

          // Parse the optional options object if provided.
          optionsStr = optionsStr.trim();
          if (optionsStr) {
            let optionsObject = new Function(`return ${optionsStr};`)();
            if (!isEsmOutput) {
              delete optionsObject.type;
            }
            optionsStr = JSON.stringify(optionsObject);
            optionsStr = optionsStr === "{}" ? "" : `, ${optionsStr}`;
          }

          // tippex.match accepts only sync callback, but we want to perform &
          // wait for async job here, so we track those promises separately.
          replacementPromises.push(
            (async () => {
              const resolvedWorkerFile = await workerIdPromise;
              workerFiles.push(resolvedWorkerFile);
              const chunkRefId = this.emitFile({
                id: resolvedWorkerFile,
                type: "chunk"
              });

              ms.overwrite(
                workerParametersStartIndex,
                workerParametersEndIndex,
                `new URL(import.meta.ROLLUP_FILE_URL_${chunkRefId}, import.meta.url)${optionsStr}`
              );
            })()
          );
        }
      );

      // No matches found.
      if (!replacementPromises.length) {
        return;
      }

      // Wait for all the scheduled replacements to finish.
      await Promise.all(replacementPromises);

      return {
        code: ms.toString(),
        map: ms.generateMap({ hires: true })
      };
    },

    resolveFileUrl(chunk) {
      return `"./${chunk.fileName}"`;
    },

    renderChunk(code, chunk, outputOptions) {
      // We don’t need to do any loader processing when targeting ESM format.
      if (isEsmOutput) {
        return;
      }
      if (outputOptions.banner && outputOptions.banner.length > 0) {
        this.error(
          "OMT currently doesn’t work with `banner`. Feel free to submit a PR at https://github.com/surma/rollup-plugin-off-main-thread"
        );
        return;
      }
      const ms = new MagicString(code);

      // Mangle define() call
      const id = `./${chunk.fileName}`;
      ms.remove(0, "define(".length);
      // If the module does not have any dependencies, it’s technically okay
      // to skip the dependency array. But our minimal loader expects it, so
      // we add it back in.
      if (!code.startsWith("define([")) {
        ms.prepend("[],");
      }
      ms.prepend(`${opts.amdFunctionName}("${id}",`);

      // Prepend loader if it’s an entry point or a worker file
      if (opts.prependLoader(chunk, workerFiles)) {
        ms.prepend(opts.loader);
      }

      return {
        code: ms.toString(),
        map: ms.generateMap({ hires: true })
      };
    }
  };
};
