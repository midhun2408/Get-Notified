const axios = require('axios');
const cheerio = require('cheerio');

async function testScrapeDirect(url) {
  try {
    console.log(`Scraping: ${url}`);
    const response = await axios.get(url, {
      headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4772.124 Safari/537.36'
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(response.data);
    
    // Most news sites put content in 'p' tags within a specific container
    // We'll try to find a few paragraphs
    let paragraphs = [];
    $('p').each((i, el) => {
        const text = $(el).text().trim();
        if (text.length > 50 && !text.includes('Subscribe') && !text.includes('Sign in')) {
            paragraphs.push(text);
        }
    });
    
    console.log(`Found ${paragraphs.length} paragraphs`);
    console.log('--- First 3 Paragraphs ---');
    console.log(paragraphs.slice(0, 3).join('\n\n'));
    
  } catch (e) {
    console.error(`Error: ${e.message}`);
  }
}

const theHinduUrl = 'https://www.thehindu.com/news/national/kerala/kerala-man-booked-for-calling-pm-modi-traitor-on-social-media/article70715101.ece';
testScrapeDirect(theHinduUrl);
