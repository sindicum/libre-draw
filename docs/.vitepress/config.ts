import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';
import { resolve } from 'path';

const config = defineConfig({
  title: 'LibreDraw',
  description: 'MapLibre GL JS polygon drawing and editing library for TypeScript',

  base: '/libre-draw/',

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API Reference', link: '/api/' },
      { text: 'Demo', link: '/examples/' },
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
      message: 'Released under the MIT License.',
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
  },
});

// Adds the `mermaid` fence renderer (docs/guide/programmatic-api.md) on top of the site config.
export default withMermaid(config);
