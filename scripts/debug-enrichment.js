const Parser = require('rss-parser');
const https = require('https');
const fs = require('fs');
const zlib = require('zlib');

const parser = new Parser();

function decodeGoogleNewsUrl(encodedUrl) {
  try {
    const url = new URL(encodedUrl);
    if (!url.hostname.includes('news.google.com')) return encodedUrl;
    
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
  } catch (e) {
    // Fallback
  }
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
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate',
          'Cache-Control': 'no-cache',
          'Referer': 'https://news.google.com/'
        },
        timeout: 10000
      };
      https.get(url, options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const nextUrl = new URL(res.headers.location, url).href;
          return resolve(fetchWithRedirects(nextUrl, depth + 1));
        }

        let stream = res;
        const encoding = res.headers['content-encoding'];
        if (encoding === 'gzip') stream = res.pipe(zlib.createGunzip());
        else if (encoding === 'deflate') stream = res.pipe(zlib.createInflate());

        let data = '';
        stream.on('data', chunk => data += chunk);
        stream.on('end', () => {
             // If this is a Google News page, we need to inspect it
             resolve(data);
        });
        stream.on('error', () => resolve(null));
      }).on('error', () => resolve(null));
    } catch(e) { resolve(null); }
  });
}

async function debugTopic(topic) {
  const logFile = 'debug_enrichment.txt';
  fs.writeFileSync(logFile, `DEBUG LOG FOR TOPIC: ${topic} (USING BING NEWS)\n\n`);
  
  const feedUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(topic)}&format=rss`;
  const feed = await parser.parseURL(feedUrl);
  const items = feed.items.slice(0, 3);

  for (const item of items) {
    fs.appendFileSync(logFile, `TITLE: ${item.title}\n`);
    fs.appendFileSync(logFile, `LINK: ${item.link}\n`);
    
    const realUrl = decodeGoogleNewsUrl(item.link);
    fs.appendFileSync(logFile, `DECODED: ${realUrl}\n`);
    
    const html = await fetchWithRedirects(realUrl);
    if (!html) {
      fs.appendFileSync(logFile, `FETCH FAILED\n\n`);
      continue;
    }

    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1] : 'No Title';
    fs.appendFileSync(logFile, `PAGE TITLE: ${pageTitle}\n`);

    const paragraphs = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    const clean = paragraphs ? paragraphs.map(p => p.replace(/<[^>]*>?/gm, '').trim()).filter(p => p.length > 100) : [];
    
    fs.appendFileSync(logFile, `PARAGRAPHS: ${clean.length}\n`);
    
    if (clean.length > 0) {
      fs.appendFileSync(logFile, `DESCRIPTION PREVIEW: ${clean[0].substring(0, 200)}...\n`);
    } else {
      fs.appendFileSync(logFile, `--- NO PARAGRAPHS FOUND. TRYING ATTRIBUTE EXTRACTION ---\n`);
      
      const dataUrlMatch = html.match(/data-n-au="([^"]+)"/i) || html.match(/data-url="([^"]+)"/i);
      if (dataUrlMatch) {
        const redirectUrl = dataUrlMatch[1];
        fs.appendFileSync(logFile, `FOUND REDIRECT LINK IN ATTR: ${redirectUrl}\n`);
        
        // Try fetching the REAL article now
        const realHtml = await fetchWithRedirects(redirectUrl);
        if (realHtml) {
          const realParas = realHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
          const realClean = realParas ? realParas.map(p => p.replace(/<[^>]*>?/gm, '').trim()).filter(p => p.length > 100) : [];
          fs.appendFileSync(logFile, `REAL ARTICLE PARAGRAPHS: ${realClean.length}\n`);
          if (realClean.length > 0) fs.appendFileSync(logFile, `REAL PREVIEW: ${realClean[0].substring(0, 200)}...\n`);
        }
      } else {
        fs.appendFileSync(logFile, `--- HTML DUMP (First 1000) ---\n`);
        fs.appendFileSync(logFile, html.substring(0, 1000));
        fs.appendFileSync(logFile, `\n--- END DUMP ---\n`);
      }
    }

    const ogImage = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"/i);
    fs.appendFileSync(logFile, `IMAGE: ${ogImage ? ogImage[1] : 'None'}\n\n`);
  }
  console.log(`Debug finished. Check ${logFile}`);
}

debugTopic('Rahul Gandhi');
