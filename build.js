#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');

const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const FONT_CACHE = path.join('src', '.fonts.cache.css');
const REFRESH_FONTS = process.argv.includes('--refresh-fonts');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': CHROME_UA } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpGet(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function buildFontCSS() {
  if (!REFRESH_FONTS && fs.existsSync(FONT_CACHE)) {
    process.stdout.write('fonts: using cache\n');
    return fs.readFileSync(FONT_CACHE, 'utf8');
  }

  process.stdout.write('fonts: downloading Inter from Google Fonts...\n');
  const apiUrl = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap';
  const css = (await httpGet(apiUrl)).toString('utf8');

  // Extract only the latin @font-face blocks (last block per weight, covers Basic Latin)
  const latinBlocks = [...css.matchAll(/\/\* latin \*\/\s*(@font-face\s*\{[^}]+\})/gs)].map(m => m[1]);
  if (!latinBlocks.length) throw new Error('No latin @font-face blocks found in Google Fonts response');

  let inlineCSS = '';
  for (const block of latinBlocks) {
    const urlMatch = block.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/);
    if (!urlMatch) continue;
    process.stdout.write(`  fetching ${urlMatch[1].slice(0, 60)}...\n`);
    const fontData = await httpGet(urlMatch[1]);
    const dataUrl = `data:font/woff2;base64,${fontData.toString('base64')}`;
    inlineCSS += block.replace(urlMatch[1], dataUrl) + '\n';
  }

  fs.writeFileSync(FONT_CACHE, inlineCSS);
  process.stdout.write(`fonts: cached ${(Buffer.byteLength(inlineCSS) / 1024).toFixed(1)} KiB\n`);
  return inlineCSS;
}

async function main() {
  const projects = JSON.parse(fs.readFileSync('projects.json', 'utf8'));
  let html = fs.readFileSync(path.join('src', 'index.html'), 'utf8');

  // Inline JSON
  html = html.replace(
    /\/\* __DATA_LOAD_START__ \*\/[\s\S]*?\/\* __DATA_LOAD_END__ \*\//,
    `render(${JSON.stringify(projects)});`
  );

  // Inline fonts and remove Google Fonts link tags
  const fontCSS = await buildFontCSS();
  html = html
    .replace(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\n?/g, '')
    .replace(/<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\n?/g, '')
    .replace(/<link href="https:\/\/fonts\.googleapis\.com[^"]*" rel="stylesheet">\n?/g, '')
    .replace('</style>', `${fontCSS}\n  </style>`);

  fs.writeFileSync('index.html', html);
  const size = (fs.statSync('index.html').size / 1024).toFixed(1);
  process.stdout.write(`Built index.html — ${size} KiB\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
