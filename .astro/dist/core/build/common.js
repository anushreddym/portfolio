import npath from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { appendForwardSlash } from "../../core/path.js";
const STATUS_CODE_PAGES = /* @__PURE__ */ new Set(["/404", "/500"]);
const FALLBACK_OUT_DIR_NAME = "./.astro/";
function getOutRoot(astroConfig) {
  if (astroConfig.output === "static") {
    return new URL("./", astroConfig.outDir);
  } else {
    return new URL("./", astroConfig.build.client);
  }
}
function getOutFolder(astroConfig, pathname, routeData) {
  const outRoot = getOutRoot(astroConfig);
  const routeType = routeData.type;
  switch (routeType) {
    case "endpoint":
      return new URL("." + appendForwardSlash(npath.dirname(pathname)), outRoot);
    case "fallback":
    case "page":
    case "redirect":
      switch (astroConfig.build.format) {
        case "directory": {
          if (STATUS_CODE_PAGES.has(pathname)) {
            return new URL("." + appendForwardSlash(npath.dirname(pathname)), outRoot);
          }
          return new URL("." + appendForwardSlash(pathname), outRoot);
        }
        case "file": {
          const d = pathname === "" ? pathname : npath.dirname(pathname);
          return new URL("." + appendForwardSlash(d), outRoot);
        }
        case "preserve": {
          let dir;
          if (pathname === "" || routeData.isIndex) {
            dir = pathname;
          } else {
            dir = npath.dirname(pathname);
          }
          return new URL("." + appendForwardSlash(dir), outRoot);
        }
      }
  }
}
function getOutFile(astroConfig, outFolder, pathname, routeData) {
  const routeType = routeData.type;
  switch (routeType) {
    case "endpoint":
      return new URL(npath.basename(pathname), outFolder);
    case "page":
    case "fallback":
    case "redirect":
      switch (astroConfig.build.format) {
        case "directory": {
          if (STATUS_CODE_PAGES.has(pathname)) {
            const baseName = npath.basename(pathname);
            return new URL("./" + (baseName || "index") + ".html", outFolder);
          }
          return new URL("./index.html", outFolder);
        }
        case "file": {
          const baseName = npath.basename(pathname);
          return new URL("./" + (baseName || "index") + ".html", outFolder);
        }
        case "preserve": {
          let baseName = npath.basename(pathname);
          if (!baseName || routeData.isIndex) {
            baseName = "index";
          }
          return new URL(`./${baseName}.html`, outFolder);
        }
      }
  }
}
function getOutDirWithinCwd(outDir) {
  if (fileURLToPath(outDir).startsWith(process.cwd())) {
    return outDir;
  } else {
    return new URL(FALLBACK_OUT_DIR_NAME, pathToFileURL(process.cwd() + npath.sep));
  }
}
export {
  getOutDirWithinCwd,
  getOutFile,
  getOutFolder
};
