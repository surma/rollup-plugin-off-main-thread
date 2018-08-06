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
const { dirname, join } = require("path");

function isEntryModule(chunk, inputs) {
  return chunk.orderedModules.some(module => inputs.includes(module.id));
}

module.exports = function(opts = {}) {
  if (!opts.loader) {
    const loaderPath = join(__dirname, "/loader.js");
    opts.loader = readFileSync(loaderPath);
  }
  let inputs;
  let resolvedInputs;
  return {
    name: "loadz0r",

    options({input}) {
      inputs = input;
    },

    transformChunk(code, outputOptions, chunk) {
      if (outputOptions.format !== "amd") {
        throw new Error(`You must set output.format to 'amd'`);
      }
      const id = `./${chunk.id}`;
      // FIXME (@surma): Is this brittle? HELL YEAH.
      // Happy to accept PRs that make this more robust.

      // Strip off `define(` at the start
      code = code.substr("define(".length);
      // If the module does not have any dependencies, it’s technically okay
      // to skip the dependency array. But our minimal loader expects it, so
      // we add it back in.
      if (!code.startsWith("[")) {
        code = `[], ${code}`;
      }
      // And add the `define(` back in with the module name inlined.
      code = `define("${id}", ${code}`;

      // If not already done, resolve input names to fully qualified moduled IDs
      if(!resolvedInputs) {
        resolvedInputs = Promise.all(inputs.map(id => this.resolveId(id)));
      }
      return resolvedInputs
        .then(inputs => {
          // If this is an entry module, add the loader code.
          if(isEntryModule(chunk, inputs)) {
            code = opts.loader + code;
          }
          return { code, map: null };
        });
    }
  };
};
