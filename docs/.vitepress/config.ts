import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';
import { readFileSync } from 'node:fs';
import { resolve } from 'path';

// The docs are built from the released commit (deploy-docs.yml), so this is
// the version the pages describe.
const { version } = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as {
  version: string;
};

const config = defineConfig({
  title: 'LibreDraw',
  description: 'MapLibre GL JS polygon drawing and editing library for TypeScript',

  base: '/libre-draw/',

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API Reference', link: '/api/' },
      { text: 'Live Demo', link: '/examples/' },
      {
        text: `v${version}`,
        items: [
          {
            text: 'Release notes',
            link: 'https://github.com/sindicum/libre-draw/releases',
          },
          { text: 'npm', link: 'https://www.npmjs.com/package/@sindicum/libre-draw' },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Modes', link: '/guide/modes' },
            { text: 'Programmatic API', link: '/guide/programmatic-api' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Overview', link: '/api/' },
            { text: 'LibreDraw Class', link: '/api/libre-draw' },
            { text: 'Types', link: '/api/types' },
            { text: 'Events', link: '/api/events' },
          ],
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/sindicum/libre-draw' }],

    footer: {
      message: `Documentation for @sindicum/libre-draw v${version}. Released under the MIT License.`,
    },

    search: {
      provider: 'local',
    },
  },

  vite: {
    resolve: {
      alias: {
        '@sindicum/libre-draw': resolve(__dirname, '../../src/index.ts'),
      },
    },
    ssr: {
      noExternal: [],
    },
    // mermaid 11.17 imports the CommonJS-only fastdom (and its promised
    // extension), which the mermaid plugin does not pre-bundle; without this
    // the dev server serves them raw and every page fails to load (the
    // production build is unaffected).
    optimizeDeps: {
      include: ['fastdom', 'fastdom/extensions/fastdom-promised.js'],
    },
  },
});

// Adds the `mermaid` fence renderer (docs/guide/programmatic-api.md) on top of the site config.
export default withMermaid(config);
