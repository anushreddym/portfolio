import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendForwardSlash } from "../path.js";
const isWindows = process.platform === "win32";
function removeEmptyDirs(root) {
  const dir = fileURLToPath(root);
  if (!fs.statSync(dir).isDirectory()) return;
  let files = fs.readdirSync(dir);
  if (files.length > 0) {
    files.map((file) => {
      const url = new URL(`./${file}`, appendForwardSlash(root.toString()));
      removeEmptyDirs(url);
    });
    files = fs.readdirSync(dir);
  }
  if (files.length === 0) {
    fs.rmdirSync(dir);
  }
}
function emptyDir(_dir, skip) {
  const dir = fileURLToPath(_dir);
  if (!fs.existsSync(dir)) return void 0;
  for (const file of fs.readdirSync(dir)) {
    if (skip?.has(file)) {
      continue;
    }
    const p = path.resolve(dir, file);
    const rmOptions = { recursive: true, force: true, maxRetries: 3 };
    try {
      fs.rmSync(p, rmOptions);
    } catch (er) {
      if (er.code === "ENOENT") {
        return;
      }
      if (er.code === "EPERM" && isWindows) {
        fixWinEPERMSync(p, rmOptions, er);
      }
    }
  }
}
/**
 * https://github.com/isaacs/rimraf/blob/8c10fb8d685d5cc35708e0ffc4dac9ec5dd5b444/rimraf.js#L183
 * @license ISC
 * The ISC License
 *
 * Copyright (c) Isaac Z. Schlueter and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR
IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */
const fixWinEPERMSync = (p, options, er) => {
  try {
    fs.chmodSync(p, 438);
  } catch (er2) {
    if (er2.code === "ENOENT") {
      return;
    } else {
      throw er;
    }
  }
  let stats;
  try {
    stats = fs.statSync(p);
  } catch (er3) {
    if (er3.code === "ENOENT") {
      return;
    } else {
      throw er;
    }
  }
  if (stats.isDirectory()) {
    fs.rmdirSync(p, options);
  } else {
    fs.unlinkSync(p);
  }
};
export {
  emptyDir,
  removeEmptyDirs
};
