// @ts-check
import { defineConfig } from 'astro/config';

// Where the site is served from. GitHub Pages serves this repo at
// https://officialprotondev.github.io/my-portfolio/. For a custom domain at its
// root, build with SITE_URL=https://your-domain BASE_PATH=/
const SITE = process.env.SITE_URL ?? 'https://officialprotondev.github.io';
const BASE = process.env.BASE_PATH ?? '/my-portfolio';

export default defineConfig({
  site: SITE,
  base: BASE,
  devToolbar: { enabled: false },
  build: {
    inlineStylesheets: 'always',
  },
});
