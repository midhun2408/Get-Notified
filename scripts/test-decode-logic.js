const https = require('https');
const Parser = require('rss-parser');

async function testDecoding() {
  const parser = new Parser();
  const feed = await parser.parseURL('https://news.google.com/rss/search?q=kerala&hl=en-IN&gl=IN&ceid=IN:en');
  
  const articleLink = feed.items[0].link; // e.g. https://news.google.com/rss/articles/CBMi...
  console.log('Original Link:', articleLink);
  
  const parts = articleLink.split('/');
  const base64Part = parts[parts.length - 1].split('?')[0];
  console.log('Base64 Part:', base64Part);
  
  const decoded = Buffer.from(base64Part, 'base64');
  console.log('Decoded length:', decoded.length);
  
  // Look for http in the buffer
  const str = decoded.toString('utf8');
  console.log('String representation:', str);
  
  const urlMatches = str.match(/https?:\/\/[^\s\x00-\x1F\x7F-\x9F]+/g);
  console.log('Found URLs:', urlMatches);
}

testDecoding();
