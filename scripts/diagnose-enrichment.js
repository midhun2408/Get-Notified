const Parser = require('rss-parser');
const https = require('https');
const urlModule = require('url');
const parser = new Parser();

const TOPIC_FEEDS = {
  'Kerala': 'https://www.thehindu.com/news/national/kerala/feeder/default.rss',
  'India': 'https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms',
  'World': 'https://www.aljazeera.com/xml/rss/all.xml',
  'Technology': 'https://www.gadgets360.com/rss/feeds'
};

function fetchWithRedirects(url, depth = 0) {
  return new Promise((resolve) => {
    if (depth > 5) return resolve(null);
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
        'Cookie': 'CONSENT=YES+cb.20230501-14-p0.en+FX+386;'
      },
      timeout: 8000
    };
    https.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const nextUrl = urlModule.resolve(url, res.headers.location);
        return resolve(fetchWithRedirects(nextUrl, depth + 1));
      }
      if (res.statusCode !== 200) return resolve(null);
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(null));
  });
}

async function fetchArticleData(url) {
  let html = await fetchWithRedirects(url);
  if (!html) return { description: null, imageUrl: null };
  const googleMatch = html.match(/<a[^>]*rel="nofollow"[^>]*href="([^"]*)"/i);
  if (googleMatch) {
      html = await fetchWithRedirects(googleMatch[1]);
      if (!html) return { description: null, imageUrl: null };
  }
  const paragraphs = (html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [])
    .map(p => p.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim())
    .filter(p => p.length > 120);
  const ogImage = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"/i);
  return { 
      descCount: paragraphs.length, 
      imageUrl: ogImage ? ogImage[1] : null,
      title: (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]
  };
}

async function runDiagnostics() {
    for (const [topic, url] of Object.entries(TOPIC_FEEDS)) {
        console.log(`\n--- Topic: ${topic} ---`);
        try {
            const feed = await parser.parseURL(url);
            const item = feed.items[0];
            console.log(`Article: ${item.title}`);
            console.log(`Link: ${item.link}`);
            const data = await fetchArticleData(item.link);
            console.log(`Result: Pars found=${data.descCount}, Image=${data.imageUrl ? 'YES' : 'NO'}`);
            if (data.imageUrl) console.log(`Img URL: ${data.imageUrl.substring(0, 50)}...`);
        } catch (e) {
            console.log(`Error: ${e.message}`);
        }
    }
}

runDiagnostics();
