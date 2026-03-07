const Parser = require('rss-parser');
const parser = new Parser();

async function testBing() {
  try {
    const topic = 'Kerala';
    const url = `https://www.bing.com/news/search?q=${encodeURIComponent(topic)}&format=rss`;
    console.log(`Testing Bing News RSS for: ${topic}`);
    const feed = await parser.parseURL(url);
    console.log(`Items: ${feed.items.length}`);
    if (feed.items.length > 0) {
      const item = feed.items[0];
      console.log(`- Title: ${item.title}`);
      console.log(`- Description: ${item.contentSnippet || item.description || 'MISSING'}`);
      console.log(`- Link: ${item.link}`);
    }
  } catch (e) {
    console.error(`Error with Bing:`, e.message);
  }
}

testBing();
