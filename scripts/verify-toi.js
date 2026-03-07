const https = require('https');
const urlModule = require('url');

function fetchWithRedirects(url, depth = 0) {
  return new Promise((resolve) => {
    if (depth > 5) return resolve(null);
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36'
      },
      timeout: 8000
    };
    https.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const nextUrl = urlModule.resolve(url, res.headers.location);
        console.log(`Redirecting to: ${nextUrl}`);
        return resolve(fetchWithRedirects(nextUrl, depth + 1));
      }
      if (res.statusCode !== 200) return resolve(null);
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(null));
  });
}

async function testTOI() {
  const url = 'https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms';
  console.log('Fetching TOI RSS...');
  const Parser = require('rss-parser');
  const parser = new Parser();
  const feed = await parser.parseURL(url);
  const articleUrl = feed.items[0].link;
  console.log(`TOI Article: ${articleUrl}`);
  
  const html = await fetchWithRedirects(articleUrl);
  if (html) {
      console.log('HTML Length:', html.length);
      const paragraphs = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
      console.log('Paragraphs found:', paragraphs ? paragraphs.length : 0);
      const ogImage = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"/i);
      console.log('Image:', ogImage ? ogImage[1] : 'No');
  } else {
      console.log('Failed to fetch article.');
  }
}

testTOI();
