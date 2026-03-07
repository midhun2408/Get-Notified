const https = require('https');
const urlModule = require('url');

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

async function verifyTopics() {
  const topics = [
      { name: 'India (TOI)', url: 'https://timesofindia.indiatimes.com/india/modi-leads-bjp-to-landslide-victory-in-haryana/articleshow/104321321.cms' },
      { name: 'Tech (Gadgets 360)', url: 'https://www.gadgets360.com/mobiles/news/oppo-find-x7-ultra-satellite-communication-version-launch-price-specifications-5373612' }
  ];

  for (const t of topics) {
      console.log(`\n--- Verifying ${t.name} ---`);
      const html = await fetchWithRedirects(t.url);
      if (html) {
          console.log(`HTML Loaded: ${html.length}`);
          const paragraphs = (html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [])
            .map(p => p.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim())
            .filter(p => p.length > 120 && !p.toLowerCase().includes('subscribe'));
          console.log(`Paragraphs: ${paragraphs.length}`);
          const ogImage = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"/i);
          console.log(`Image: ${ogImage ? ogImage[1] : 'NONE'}`);
      } else {
          console.log('Failed to load HTML.');
      }
  }
}

verifyTopics();
