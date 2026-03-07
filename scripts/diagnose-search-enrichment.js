const Parser = require('rss-parser');
const https = require('https');
const urlModule = require('url');

const parser = new Parser();

function decodeGoogleNewsUrl(encodedUrl) {
  try {
    const url = new URL(encodedUrl);
    if (!url.hostname.includes('news.google.com')) return encodedUrl;
    
    const pathParts = url.pathname.split('/');
    let base64Str = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];
    if (base64Str) base64Str = base64Str.split('?')[0];
    
    console.log(`[Debug] Base64 part: ${base64Str ? base64Str.substring(0, 20) + '...' : 'None'}`);

    if (base64Str && (base64Str.startsWith('CBMi') || base64Str.startsWith('AU_'))) {
      const buffer = Buffer.from(base64Str, 'base64');
      // Try multiple encodings
      const encodings = ['utf8', 'binary', 'ascii'];
      for (const enc of encodings) {
        const text = buffer.toString(enc);
        const match = text.match(/https?:\/\/[^\s\x00-\x1f\x7f-\xff]*/);
        if (match) {
          console.log(`[Debug] Found URL using ${enc} encoding`);
          return match[0];
        }
      }
    }
  } catch (e) { 
    console.log(`[Debug] Decode catch: ${e.message}`);
  }
  return encodedUrl;
}

const zlib = require('zlib');

function fetchWithRedirects(url, depth = 0) {
  return new Promise((resolve) => {
    if (depth > 5) return resolve(null);
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/',
        'Accept-Encoding': 'gzip, deflate'
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
      if (encoding === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === 'deflate') {
        stream = res.pipe(zlib.createInflate());
      }

      let data = '';
      stream.on('data', chunk => data += chunk);
      stream.on('end', () => resolve(data));
      stream.on('error', () => resolve(null));
    }).on('error', () => resolve(null));
  });
}

async function testTopic(topic) {
  console.log(`\n--- Testing Topic: ${topic} ---`);
  const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-IN&gl=IN&ceid=IN:en`;
  const feed = await parser.parseURL(feedUrl);
  const items = feed.items.slice(0, 3);

  for (const item of items) {
    console.log(`\nTitle: ${item.title}`);
    console.log(`Google Link: ${item.link}`);
    
    const realUrl = decodeGoogleNewsUrl(item.link);
    console.log(`Real URL: ${realUrl}`);

    const html = await fetchWithRedirects(realUrl);
    if (!html) {
      console.log('Failed to fetch HTML');
      continue;
    }

    const paragraphs = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    if (!paragraphs || paragraphs.length === 0) {
      console.log('No paragraphs found');
      console.log('HTML Prefix (500 chars):');
      console.log(html.substring(0, 500));
    } else {
      const clean = paragraphs.map(p => p.replace(/<[^>]*>?/gm, '').trim()).filter(p => p.length > 100);
      console.log(`Found ${clean.length} long paragraphs`);
      if (clean.length > 0) console.log(`Sample: ${clean[0].substring(0, 100)}...`);
    }

    const ogImageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"/i);
    const ogImage = ogImageMatch ? ogImageMatch[1] : 'None';
    console.log(`OG Image: ${ogImage}`);

    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    console.log(`Page Title: ${titleMatch ? titleMatch[1] : 'None'}`);

    if (ogImage.includes('googleusercontent') || ogImage === 'None') {
        console.log('--- HTML DUMP (First 2000 chars) ---');
        console.log(html.substring(0, 2000));
        console.log('--- END DUMP ---');
    }
  }
}

testTopic('Rahul Gandhi');
