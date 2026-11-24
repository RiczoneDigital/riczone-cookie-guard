import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: '.',
  entrypointsDir: 'entrypoints',
  publicDir: 'public',
  outDir: '.output',
  manifest: ({ browser }) => {
    const baseManifest = {
      name: 'Riczone Cookie Guard',
      short_name: 'Cookie Guard',
      description:
        'Lehnt Cookie-Banner automatisch ab und akzeptiert sie auf Whitelist-Seiten (z. B. Payback) automatisch.',
      version: '1.0.0',
      default_locale: undefined,
      permissions: ['storage', 'scripting', 'declarativeNetRequest'],
      host_permissions: ['<all_urls>'],
      icons: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
      action: {
        default_title: 'Riczone Cookie Guard',
        default_icon: {
          16: 'icon/16.png',
          32: 'icon/32.png',
          48: 'icon/48.png',
          128: 'icon/128.png',
        },
      },
      content_security_policy: {
        extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none'",
      },
    };

    if (browser === 'firefox') {
      return {
        ...baseManifest,
        browser_specific_settings: {
          gecko: {
            id: 'cookie-guard@riczone.de',
            strict_min_version: '142.0',
            data_collection_permissions: {
              required: ['none'],
            },
          },
          gecko_android: {
            strict_min_version: '142.0',
          },
        },
      };
    }

    return baseManifest;
  },
});
