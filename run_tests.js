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

const rollup = require("rollup");
const path = require("path");
const loadz0r = require(".");

const karma = require("karma");
const myKarmaConfig = require("./karma.conf.js");

async function init() {
  ["./tests/fixtures/loading/entry.js"].forEach(async input => {
    const bundle = await rollup.rollup({
      input,

      plugins: [loadz0r()],
      experimentalCodeSplitting: true
    });
    const outputOptions = {
      dir: path.join(path.dirname(input), "build"),
      format: "amd"
    };
    await bundle.generate(outputOptions);
    await bundle.write(outputOptions);
  });

  const karmaConfig = { port: 9876 };
  myKarmaConfig({
    set(config) {
      Object.assign(karmaConfig, config);
    }
  });
  const server = new karma.Server(karmaConfig, code => {
    console.log(`Karma exited with code ${code}`);
    process.exit(code);
  });
  server.start();
}
init();
