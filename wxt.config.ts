import { defineConfig } from 'wxt';
import pkg from './package.json';

export default defineConfig({
  srcDir: '.',
  entrypointsDir: 'entrypoints',
  publicDir: 'public',
  outDir: '.output',
  manifest: ({ browser }) => {
    const baseManifest = {
      name: '__MSG_extName__',
      short_name: '__MSG_extShortName__',
      description: '__MSG_extDescription__',
      version: pkg.version,
      default_locale: 'en',
      permissions: ['storage', 'scripting', 'declarativeNetRequest'],
      host_permissions: ['<all_urls>'],
      icons: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
      action: {
        default_title: '__MSG_extName__',
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
