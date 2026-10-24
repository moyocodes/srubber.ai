import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The public address used in canonical, Open Graph and sitemap URLs. Set VITE_SITE_URL in Vercel to override.
process.env.VITE_SITE_URL = (process.env.VITE_SITE_URL || 'https://scrubber.ai').replace(/\/+$/, '');
const site = process.env.VITE_SITE_URL;

// robots.txt and sitemap.xml need the absolute address, so they are written at build time
const seoFiles = {
  name: 'seo-files',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${site}/sitemap.xml\n` });
    this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${site}/</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod></url>\n</urlset>\n` });
  }
};

export default defineConfig({ plugins: [react(), tailwindcss(), seoFiles] });
