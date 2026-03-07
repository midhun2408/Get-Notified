const Parser = require('rss-parser');
const https = require('https');
const parser = new Parser();

const url = 'https://www.thehindu.com/news/national/kerala/feeder/default.rss';

async function testImageExtraction() {
  try {
    const feed = await parser.parseURL(url);
    const item = feed.items[0];
    console.log('--- RSS Item ---');
    console.log('Title:', item.title);
    console.log('Enclosure:', item.enclosure);
    console.log('Content (snippet):', (item.content || '').substring(0, 200));
    
    // Test meta tag extraction for image
    console.log('\n--- Scraping for og:image ---');
    https.get(item.link, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const ogImageMatch = data.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"/i);
        const twitterImageMatch = data.match(/<meta[^>]*name="twitter:image"[^>]*content="([^"]*)"/i);
        
        console.log('og:image:', ogImageMatch ? ogImageMatch[1] : 'NOT FOUND');
        console.log('twitter:image:', twitterImageMatch ? twitterImageMatch[1] : 'NOT FOUND');
      });
    });
  } catch (e) {
    console.error(e.message);
  }
}

testImageExtraction();
