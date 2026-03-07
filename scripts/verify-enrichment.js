const Parser = require('rss-parser');
const https = require('https');
const parser = new Parser();

function fetchFullDescription(url) {
  return new Promise((resolve) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 5000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const paragraphs = data.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
        if (!paragraphs) return resolve(null);
        const clean = paragraphs
            .map(p => p.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim())
            .filter(p => p.length > 120 && !p.includes('{') && !p.includes('Subscr') && !p.includes('Sign in'));
        resolve(clean.slice(0, 4).join('\n\n'));
      });
    }).on('error', () => resolve(null));
  });
}

async function verify() {
  const feedUrl = 'https://www.thehindu.com/news/national/kerala/feeder/default.rss';
  console.log(`Fetching feed: ${feedUrl}`);
  const feed = await parser.parseURL(feedUrl);
  const item = feed.items[0];
  console.log(`\nTitle: ${item.title}`);
  console.log(`Short Desc: ${item.contentSnippet}`);
  
  console.log(`\nEnriching with full content...`);
  const fullDesc = await fetchFullDescription(item.link);
  if (fullDesc) {
      console.log(`\n--- ENRICHED DESCRIPTION (Length: ${fullDesc.split('\n').length} lines) ---`);
      console.log(fullDesc);
  } else {
      console.log('Failed to enrich.');
  }
}

verify();
