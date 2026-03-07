const Parser = require('rss-parser');
const parser = new Parser();

const url = 'https://www.thehindu.com/news/national/kerala/feeder/default.rss';

async function inspect() {
  try {
    const feed = await parser.parseURL(url);
    if (feed.items.length > 0) {
      console.log('--- Full Item Inspect ---');
      console.log(JSON.stringify(feed.items[0], null, 2));
    }
  } catch (e) {
    console.error(e.message);
  }
}

inspect();
