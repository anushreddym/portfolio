import { promises as fs, existsSync } from "node:fs";
import PQueue from "p-queue";
import xxhash from "xxhash-wasm";
import { AstroUserError } from "../core/errors/errors.js";
import {
  ASSET_IMPORTS_FILE,
  CONTENT_LAYER_TYPE,
  DATA_STORE_FILE,
  MODULES_IMPORTS_FILE
} from "./consts.js";
import {
  getEntryConfigByExtMap,
  getEntryDataAndImages,
  globalContentConfigObserver
} from "./utils.js";
class ContentLayer {
  #logger;
  #store;
  #settings;
  #watcher;
  #lastConfigDigest;
  #unsubscribe;
  #generateDigest;
  #queue;
  constructor({ settings, logger, store, watcher }) {
    watcher?.setMaxListeners(50);
    this.#logger = logger;
    this.#store = store;
    this.#settings = settings;
    this.#watcher = watcher;
    this.#queue = new PQueue({ concurrency: 1 });
  }
  /**
   * Whether the content layer is currently loading content
   */
  get loading() {
    return this.#queue.size > 0 || this.#queue.pending > 0;
  }
  /**
   * Watch for changes to the content config and trigger a sync when it changes.
   */
  watchContentConfig() {
    this.#unsubscribe?.();
    this.#unsubscribe = globalContentConfigObserver.subscribe(async (ctx) => {
      if (ctx.status === "loaded" && ctx.config.digest !== this.#lastConfigDigest) {
        this.sync();
      }
    });
  }
  unwatchContentConfig() {
    this.#unsubscribe?.();
  }
  async #getGenerateDigest() {
    if (this.#generateDigest) {
      return this.#generateDigest;
    }
    const { h64ToString } = await xxhash();
    this.#generateDigest = (data) => {
      const dataString = typeof data === "string" ? data : JSON.stringify(data);
      return h64ToString(dataString);
    };
    return this.#generateDigest;
  }
  async #getLoaderContext({
    collectionName,
    loaderName = "content",
    parseData,
    refreshContextData
  }) {
    return {
      collection: collectionName,
      store: this.#store.scopedStore(collectionName),
      meta: this.#store.metaStore(collectionName),
      logger: this.#logger.forkIntegrationLogger(loaderName),
      config: this.#settings.config,
      parseData,
      generateDigest: await this.#getGenerateDigest(),
      watcher: this.#watcher,
      refreshContextData,
      entryTypes: getEntryConfigByExtMap([
        ...this.#settings.contentEntryTypes,
        ...this.#settings.dataEntryTypes
      ])
    };
  }
  /**
   * Enqueues a sync job that runs the `load()` method of each collection's loader, which will load the data and save it in the data store.
   * The loader itself is responsible for deciding whether this will clear and reload the full collection, or
   * perform an incremental update. After the data is loaded, the data store is written to disk. Jobs are queued,
   * so that only one sync can run at a time. The function returns a promise that resolves when this sync job is complete.
   */
  sync(options = {}) {
    return this.#queue.add(() => this.#doSync(options));
  }
  async #doSync(options) {
    const contentConfig = globalContentConfigObserver.get();
    const logger = this.#logger.forkIntegrationLogger("content");
    if (contentConfig?.status !== "loaded") {
      logger.debug("Content config not loaded, skipping sync");
      return;
    }
    if (!this.#settings.config.experimental.contentLayer) {
      const contentLayerCollections = Object.entries(contentConfig.config.collections).filter(
        ([_, collection]) => collection.type === CONTENT_LAYER_TYPE
      );
      if (contentLayerCollections.length > 0) {
        throw new AstroUserError(
          `The following collections have a loader defined, but the content layer is not enabled: ${contentLayerCollections.map(([title]) => title).join(", ")}.`,
          "To enable the Content Layer API, set `experimental: { contentLayer: true }` in your Astro config file."
        );
      }
      return;
    }
    logger.info("Syncing content");
    const { digest: currentConfigDigest } = contentConfig.config;
    this.#lastConfigDigest = currentConfigDigest;
    let shouldClear = false;
    const previousConfigDigest = await this.#store.metaStore().get("config-digest");
    const previousAstroVersion = await this.#store.metaStore().get("astro-version");
    if (currentConfigDigest && previousConfigDigest !== currentConfigDigest) {
      logger.info("Content config changed");
      shouldClear = true;
    }
    if (previousAstroVersion !== "4.16.6") {
      logger.info("Astro version changed");
      shouldClear = true;
    }
    if (shouldClear) {
      logger.info("Clearing content store");
      this.#store.clearAll();
    }
    if ("4.16.6") {
      await this.#store.metaStore().set("astro-version", "4.16.6");
    }
    if (currentConfigDigest) {
      await this.#store.metaStore().set("config-digest", currentConfigDigest);
    }
    await Promise.all(
      Object.entries(contentConfig.config.collections).map(async ([name, collection]) => {
        if (collection.type !== CONTENT_LAYER_TYPE) {
          return;
        }
        let { schema } = collection;
        if (!schema && typeof collection.loader === "object") {
          schema = collection.loader.schema;
          if (typeof schema === "function") {
            schema = await schema();
          }
        }
        if (options?.loaders && (typeof collection.loader !== "object" || !options.loaders.includes(collection.loader.name))) {
          return;
        }
        const collectionWithResolvedSchema = { ...collection, schema };
        const parseData = async ({ id, data, filePath = "" }) => {
          const { data: parsedData } = await getEntryDataAndImages(
            {
              id,
              collection: name,
              unvalidatedData: data,
              _internal: {
                rawData: void 0,
                filePath
              }
            },
            collectionWithResolvedSchema,
            false
          );
          return parsedData;
        };
        const context = await this.#getLoaderContext({
          collectionName: name,
          parseData,
          loaderName: collection.loader.name,
          refreshContextData: options?.context
        });
        if (typeof collection.loader === "function") {
          return simpleLoader(collection.loader, context);
        }
        if (!collection.loader.load) {
          throw new Error(`Collection loader for ${name} does not have a load method`);
        }
        return collection.loader.load(context);
      })
    );
    if (!existsSync(this.#settings.config.cacheDir)) {
      await fs.mkdir(this.#settings.config.cacheDir, { recursive: true });
    }
    const cacheFile = getDataStoreFile(this.#settings);
    await this.#store.writeToDisk(cacheFile);
    if (!existsSync(this.#settings.dotAstroDir)) {
      await fs.mkdir(this.#settings.dotAstroDir, { recursive: true });
    }
    const assetImportsFile = new URL(ASSET_IMPORTS_FILE, this.#settings.dotAstroDir);
    await this.#store.writeAssetImports(assetImportsFile);
    const modulesImportsFile = new URL(MODULES_IMPORTS_FILE, this.#settings.dotAstroDir);
    await this.#store.writeModuleImports(modulesImportsFile);
    logger.info("Synced content");
    if (this.#settings.config.experimental.contentIntellisense) {
      await this.regenerateCollectionFileManifest();
    }
  }
  async regenerateCollectionFileManifest() {
    const collectionsManifest = new URL("collections/collections.json", this.#settings.dotAstroDir);
    this.#logger.debug("content", "Regenerating collection file manifest");
    if (existsSync(collectionsManifest)) {
      try {
        const collections = await fs.readFile(collectionsManifest, "utf-8");
        const collectionsJson = JSON.parse(collections);
        collectionsJson.entries ??= {};
        for (const { hasSchema, name } of collectionsJson.collections) {
          if (!hasSchema) {
            continue;
          }
          const entries = this.#store.values(name);
          if (!entries?.[0]?.filePath) {
            continue;
          }
          for (const { filePath } of entries) {
            if (!filePath) {
              continue;
            }
            const key = new URL(filePath, this.#settings.config.root).href.toLowerCase();
            collectionsJson.entries[key] = name;
          }
        }
        await fs.writeFile(collectionsManifest, JSON.stringify(collectionsJson, null, 2));
      } catch {
        this.#logger.error("content", "Failed to regenerate collection file manifest");
      }
    }
    this.#logger.debug("content", "Regenerated collection file manifest");
  }
}
async function simpleLoader(handler, context) {
  const data = await handler();
  context.store.clear();
  for (const raw of data) {
    const item = await context.parseData({ id: raw.id, data: raw });
    context.store.set({ id: raw.id, data: item });
  }
}
function getDataStoreFile(settings, isDev) {
  isDev ??= process?.env.NODE_ENV === "development";
  return new URL(DATA_STORE_FILE, isDev ? settings.dotAstroDir : settings.config.cacheDir);
}
function contentLayerSingleton() {
  let instance = null;
  return {
    init: (options) => {
      instance?.unwatchContentConfig();
      instance = new ContentLayer(options);
      return instance;
    },
    get: () => instance,
    dispose: () => {
      instance?.unwatchContentConfig();
      instance = null;
    }
  };
}
const globalContentLayer = contentLayerSingleton();
export {
  ContentLayer,
  getDataStoreFile,
  globalContentLayer,
  simpleLoader
};
