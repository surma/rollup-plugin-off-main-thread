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

const defaultOpts = {
  loader: readFileSync(join(__dirname, "/loader.ejs"), "utf8"),
  useEval: false,
  // Unique marker that temporarily injected to mark Worker imports. Should be
  // unique enough to not appear in (minified) code accidentally.
  marker: "_____TROLOLOLOL",
  // Regexp for detecting worker calls
  workerRegexp: /new Worker\((["'])(.+?)\1\)/g,
  // Regexp that finds the new chunk filename in between the markers after
  // Rollup has done its thing.
  filenameRegexp: /(["'])([./].+?(?:\.js)?)\1/
};

module.exports = function(opts = {}) {
  opts = Object.assign({}, defaultOpts, opts);

  opts.loader = ejs.render(opts.loader, opts);

  const prefix = `"${opts.marker}_start" + import(`;
  const suffix = `) + "${opts.marker}_end"`;

  let workerFiles;
  return {
    name: "off-main-thread",

    async buildStart({ input }) {
      workerFiles = [];
      let inputs = input;
      if (typeof inputs === "string") {
        inputs = [inputs];
      }
      if (typeof inputs === "object") {
        inputs = Object.values(inputs);
      }
      resolvedInputs = await Promise.all(inputs.map(id => this.resolve(id)));
      return null;
    },

    async transform(code, id) {
      // Copy the regexp as they are stateful and this hook is async.
      const workerRegexp = new RegExp(
        opts.workerRegexp.source,
        opts.workerRegexp.flags
      );
      if (!workerRegexp.test(code)) {
        return;
      }

      const ms = new MagicString(code);
      // Reset the regexp
      workerRegexp.lastIndex = 0;
      while (true) {
        const match = workerRegexp.exec(code);
        if (!match) {
          break;
        }

        const workerFile = match[2];

        if (!/^\.*\//.test(workerFile)) {
          this.warn(
            `Paths passed to the Worker constructor must be relative or absolute, i.e. start with /, ./ or ../ (just like dynamic import!). Ignoring "${workerFile}".`
          );
          continue;
        }

        const resolvedWorkerFile = await this.resolveId(workerFile, id);
        workerFiles.push(resolvedWorkerFile);

        const workerFileStartIndex = match.index + "new Worker(".length;
        const workerFileEndIndex = match.index + match[0].length - ")".length;
        ms.appendLeft(workerFileStartIndex, prefix);
        ms.appendRight(workerFileEndIndex, suffix);
      }

      return {
        code: ms.toString(),
        map: ms.generateMap({ hires: true })
      };
    },

    renderChunk(code, chunk, outputOptions) {
      if (outputOptions.format !== "amd") {
        this.error("You must set output.format to 'amd'");
        return;
      }
      if (outputOptions.banner && outputOptions.banner.length > 0) {
        this.error(
          "OMT currently doesn’t work with `banner`. Feel free to submit a PR at https://github.com/surma/rollup-plugin-off-main-thread"
        );
        return;
      }
      const ms = new MagicString(code);

      // Remove markers from Worker constructors
      const matcher = new RegExp(
        `"${opts.marker}_start.+?${opts.marker}_end"`,
        "g"
      );
      while (true) {
        const match = matcher.exec(code);
        if (!match) {
          break;
        }
        const newFileNameMatch = opts.filenameRegexp.exec(match[0]);
        let newFileName = newFileNameMatch[2];
        if (!newFileName.endsWith(".js")) {
          newFileName += ".js";
        }

        ms.overwrite(
          match.index,
          match.index + match[0].length,
          `"${newFileName}"`
        );
      }

      // Mangle define() call
      const id = `./${chunk.fileName}`;
      ms.remove(0, "define(".length);
      // If the module does not have any dependencies, it’s technically okay
      // to skip the dependency array. But our minimal loader expects it, so
      // we add it back in.
      if (!code.startsWith("define([")) {
        ms.prepend("[],");
      }
      ms.prepend(`define("${id}",`);

      // Prepend loader if it’s an entry point or a worker file
      if (chunk.isEntry || workerFiles.includes(chunk.facadeModuleId)) {
        ms.prepend(opts.loader);
      }

      return {
        code: ms.toString(),
        map: ms.generateMap({ hires: true })
      };
    }
  };
};
