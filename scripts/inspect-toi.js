const Parser = require('rss-parser');
const parser = new Parser();

const url = 'https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms';

async function inspectTOI() {
  try {
    const feed = await parser.parseURL(url);
    if (feed.items.length > 0) {
      console.log('--- TOI Item Inspect ---');
      console.log('Title:', feed.items[0].title);
      console.log('Link:', feed.items[0].link);
      console.log('Guid:', feed.items[0].guid);
    }
  } catch (e) {
    console.error(e.message);
  }
}

inspectTOI();
