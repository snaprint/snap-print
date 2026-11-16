/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — Dynamic Sitemap Generator
   
   GET /sitemap.xml
   
   Generates an XML sitemap that includes all static pages and
   all active products from the live Google Sheet CSV.
   This ensures Google always has an up-to-date list of pages
   to crawl — no manual maintenance needed.
   ═══════════════════════════════════════════════════════════════ */

import { parseCSV } from './_lib/csv.js';
import { isActive, isEngineering } from '../shared/products.js';

const SITE_URL = 'https://snaprint.in';

// Static pages with their update frequency and priority
const STATIC_PAGES = [
  { path: '/',                    changefreq: 'daily',   priority: '1.0' },
  { path: '/about.html',         changefreq: 'monthly', priority: '0.6' },
  { path: '/quote.html',         changefreq: 'monthly', priority: '0.7' },
  { path: '/faq.html',           changefreq: 'monthly', priority: '0.6' },
  { path: '/contact.html',       changefreq: 'monthly', priority: '0.6' },
  { path: '/track-order.html',   changefreq: 'monthly', priority: '0.5' },
  { path: '/refund-policy.html', changefreq: 'yearly',  priority: '0.3' },
  { path: '/shipping-policy.html', changefreq: 'yearly', priority: '0.3' },
  { path: '/terms.html',         changefreq: 'yearly',  priority: '0.3' },
  { path: '/privacy-policy.html', changefreq: 'yearly', priority: '0.3' },
];

// ── Sitemap Generation ──

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSitemapXml(staticPages, products) {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  // Static pages
  for (const page of staticPages) {
    xml += '  <url>\n';
    xml += `    <loc>${escapeXml(SITE_URL + page.path)}</loc>\n`;
    xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
    xml += `    <priority>${page.priority}</priority>\n`;
    xml += '  </url>\n';
  }

  // Product pages
  for (const product of products) {
    xml += '  <url>\n';
    xml += `    <loc>${escapeXml(SITE_URL + '/product.html?id=' + encodeURIComponent(product.id))}</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += `    <changefreq>weekly</changefreq>\n`;
    xml += `    <priority>0.8</priority>\n`;
    xml += '  </url>\n';
  }

  xml += '</urlset>';
  return xml;
}

export async function onRequestGet(context) {
  const { env } = context;

  try {
    const productsCSVUrl = env.PRODUCTS_CSV_URL || env.VITE_PRODUCTS_CSV_URL;

    let activeProducts = [];

    if (productsCSVUrl) {
      const res = await fetch(productsCSVUrl, { cf: { cacheTtl: 300 } });
      if (res.ok) {
        const csvText = await res.text();
        const allProducts = parseCSV(csvText);
        activeProducts = allProducts.filter(
          p => isActive(p) && !isEngineering(p)
        );
      }
    }

    const xml = buildSitemapXml(STATIC_PAGES, activeProducts);

    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600', // Cache for 1 hour
      },
    });

  } catch (err) {
    console.error('Sitemap generation error:', err);

    // Fallback: return sitemap with just static pages
    const xml = buildSitemapXml(STATIC_PAGES, []);
    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=600',
      },
    });
  }
}
