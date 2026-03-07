const Parser = require('rss-parser');
const parser = new Parser();

const sources = [
  { name: 'TOI - India', url: 'https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms' },
  { name: 'TOI - Kerala', url: 'https://timesofindia.indiatimes.com/rssfeeds/29474668.cms' },
  { name: 'The Hindu - Kerala', url: 'https://www.thehindu.com/news/national/kerala/feeder/default.rss' },
  { name: 'Manorama - News', url: 'https://www.onmanorama.com/rss/news.xml' }
];

async function testSources() {
  for (const source of sources) {
    try {
      console.log(`Testing: ${source.name}`);
      const feed = await parser.parseURL(source.url);
      console.log(`Items: ${feed.items.length}`);
      if (feed.items.length > 0) {
        const item = feed.items[0];
        console.log(`- Title: ${item.title}`);
        console.log(`- Description: ${item.contentSnippet || item.description || 'MISSING'}`);
        console.log(`- Link: ${item.link}`);
      }
      console.log('---');
    } catch (e) {
      console.error(`Error with ${source.name}:`, e.message);
    }
  }
}

testSources();
