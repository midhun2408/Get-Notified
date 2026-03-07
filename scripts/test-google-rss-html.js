const Parser = require('rss-parser');
const parser = new Parser();

async function testGoogleRSS() {
    const topic = 'AMERICA';
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-IN&gl=IN&ceid=IN:en`;
    try {
        const feed = await parser.parseURL(url);
        const item = feed.items[0];
        console.log('--- Google Item Raw ---');
        console.log('Title:', item.title);
        console.log('Description (HTML):', item.content);
        
        // Check for images in the description HTML
        const imgMatch = (item.content || '').match(/<img[^>]*src="([^"]*)"/i);
        if (imgMatch) {
            console.log('Found Img in RSS description:', imgMatch[1]);
        }
    } catch (e) {
        console.error(e.message);
    }
}

testGoogleRSS();
