const Parser = require('rss-parser');
const https = require('https');
const urlModule = require('url');
const parser = new Parser();

function decodeGoogleNewsUrl(encodedUrl) {
  try {
    const url = new URL(encodedUrl);
    if (!url.hostname.includes('news.google.com')) return encodedUrl;
    const pathParts = url.pathname.split('/');
    const base64Str = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];
    if (base64Str && base64Str.startsWith('CBMi')) {
      const buffer = Buffer.from(base64Str, 'base64');
      const text = buffer.toString('binary');
      const match = text.match(/https?:\/\/[^\s\x00-\x1f\x7f-\xff]*/);
      if (match) return match[0];
    }
  } catch (e) {}
  return encodedUrl;
}

function fetchWithRedirects(url, depth = 0) {
  return new Promise((resolve) => {
    if (depth > 5) return resolve(null);
    const parsedUrl = new URL(url);
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.google.com/'
      },
      timeout: 10000
    };
    https.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchWithRedirects(urlModule.resolve(url, res.headers.location), depth + 1));
      }
      if (res.statusCode !== 200) return resolve(null);
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(null));
  });
}

async function verifyAmerica() {
  const topic = 'AMERICA';
  const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-IN&gl=IN&ceid=IN:en`;
  console.log(`Searching Google News for: ${topic}...`);
  const feed = await parser.parseURL(feedUrl);
  const item = feed.items[0];
  console.log(`Found: ${item.title}`);
  
  const realUrl = decodeGoogleNewsUrl(item.link);
  console.log(`Url: ${realUrl.substring(0, 100)}...`);
  
  const html = await fetchWithRedirects(realUrl);
  if (html) {
      console.log(`HTML loaded, length: ${html.length}`);
      const paragraphs = (html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [])
        .map(p => p.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim())
        .filter(p => p.length > 120 && !p.toLowerCase().includes('subscribe'));
      
      console.log(`Summary quality: ${paragraphs.length} paragraphs found.`);
      const ogImage = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"/i);
      let imageUrl = ogImage ? ogImage[1] : 'NONE';
      if (imageUrl.includes('googleusercontent.com')) imageUrl = 'STILL GOOGLE LOGO (REJECTED)';
      console.log(`Image: ${imageUrl}`);
  } else {
      console.log('Failed to fetch article content.');
  }
}

verifyAmerica();
