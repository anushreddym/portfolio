import type { Plugin as VitePlugin } from 'vite';
import type { AstroSettings } from '../@types/astro.js';
import type { Logger } from '../core/logger/core.js';
/** Connect Astro integrations into Vite, as needed. */
export default function astroIntegrationsContainerPlugin({ settings, logger, }: {
    settings: AstroSettings;
    logger: Logger;
}): VitePlugin;
