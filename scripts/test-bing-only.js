const Parser = require('rss-parser');
const parser = new Parser();

async function testBing() {
    const topic = 'Rahul Gandi';
    const url = `https://www.bing.com/news/search?q=${encodeURIComponent(topic)}&format=rss`;
    console.log(`Fetching from: ${url}`);
    try {
        const feed = await parser.parseURL(url);
        console.log(`Feed Title: ${feed.title}`);
        console.log(`Items found: ${feed.items.length}`);
        if (feed.items.length > 0) {
            console.log('First Item:');
            console.log(` - Title: ${feed.items[0].title}`);
            console.log(` - Link: ${feed.items[0].link}`);
        }
    } catch (e) {
        console.error('Fetch error:', e.message);
    }
}

testBing();
