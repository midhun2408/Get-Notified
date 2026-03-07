const Parser = require('rss-parser');
const parser = new Parser();

async function test() {
  const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent('kerala')}&hl=en-IN&gl=IN&ceid=IN:en`;
  const feed = await parser.parseURL(feedUrl);
  
  if (feed.items.length > 0) {
    console.log(JSON.stringify(feed.items[0], null, 2));
  } else {
    console.log("No items found");
  }
}

test();
