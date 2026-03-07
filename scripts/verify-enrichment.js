const Parser = require('rss-parser');
const https = require('https');
const fs = require('fs');
const zlib = require('zlib');

const parser = new Parser();

function decodeArticleUrl(encodedUrl) {
  try {
    const url = new URL(encodedUrl);
    
    // Handle Bing News RSS URLs
    if (url.hostname.includes('bing.com')) {
      const realUrl = url.searchParams.get('url');
      if (realUrl) return realUrl;
    }

    // Handle Google News RSS URLs
    if (url.hostname.includes('news.google.com')) {
      const pathParts = url.pathname.split('/');
      let base64Str = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];
      if (base64Str) base64Str = base64Str.split('?')[0];
      
      if (!base64Str) return encodedUrl;

      const normalized = base64Str.replace(/-/g, '+').replace(/_/g, '/');
      const buffer = Buffer.from(normalized, 'base64');
      
      const encodings = ['binary', 'utf8', 'ascii'];
      for (const enc of encodings) {
        const text = buffer.toString(enc);
        const matches = text.match(/https?:\/\/[^\s\x00-\x1f\x7f-\xff]*/g);
        if (matches && matches.length > 0) {
          const filtered = matches.filter(m => !m.includes('google.com'));
          if (filtered.length > 0) {
            return filtered.sort((a, b) => b.length - a.length)[0];
          }
        }
      }
    }
  } catch (e) { }
  return encodedUrl;
}

function fetchWithRedirects(url, depth = 0) {
  return new Promise((resolve) => {
    if (depth > 5) return resolve(null);
    try {
      const parsedUrl = new URL(url);
      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate',
          'Referer': 'https://www.google.com/'
        },
        timeout: 10000
      };
      https.get(url, options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const nextUrl = new URL(res.headers.location, url).href;
          return resolve(fetchWithRedirects(nextUrl, depth + 1));
        }
        if (res.statusCode !== 200) return resolve(null);

        let stream = res;
        const encoding = res.headers['content-encoding'];
        if (encoding === 'gzip') stream = res.pipe(zlib.createGunzip());
        else if (encoding === 'deflate') stream = res.pipe(zlib.createInflate());

        let data = '';
        stream.on('data', chunk => data += chunk);
        stream.on('end', () => resolve(data));
        stream.on('error', () => resolve(null));
      }).on('error', () => resolve(null));
    } catch(e) { resolve(null); }
  });
}

async function verifyEnrichment(topic) {
  const logFile = 'verification_results.txt';
  fs.writeFileSync(logFile, `VERIFICATION FOR TOPIC: ${topic}\n\n`);
  
  // Use Bing News as planned
  const feedUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(topic)}&format=rss`;
  console.log(`Fetching from Bing News: ${feedUrl}`);
  
  try {
    const feed = await parser.parseURL(feedUrl);
    const items = feed.items.slice(0, 3);

    for (const item of items) {
      fs.appendFileSync(logFile, `TITLE: ${item.title}\n`);
      
      const realUrl = decodeArticleUrl(item.link);
      fs.appendFileSync(logFile, `REAL URL: ${realUrl}\n`);
      
      const html = await fetchWithRedirects(realUrl);
      if (!html) {
        fs.appendFileSync(logFile, `FETCH FAILED for ${realUrl}\n\n`);
        continue;
      }

      const paragraphs = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
      const clean = paragraphs ? paragraphs.map(p => p.replace(/<[^>]*>?/gm, '').trim()).filter(p => p.length > 120) : [];
      
      fs.appendFileSync(logFile, `PARAGRAPHS FOUND: ${clean.length}\n`);
      if (clean.length > 0) {
        fs.appendFileSync(logFile, `DESCRIPTION: ${clean[0].substring(0, 250)}...\n`);
      }

      const ogImage = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"/i);
      fs.appendFileSync(logFile, `IMAGE URL: ${ogImage ? ogImage[1] : 'None'}\n\n`);
    }
    console.log(`Verification complete. Results in ${logFile}`);
  } catch (e) {
    console.error('RSS Fetch Failed:', e.message);
  }
}

verifyEnrichment('Rahul Gandhi');
