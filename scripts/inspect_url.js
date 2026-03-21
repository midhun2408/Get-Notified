const axios = require('axios');

const url = 'https://www.thehindu.com/news/international/israels-doesnt-seek-perpetual-war-with-iran-says-envoy-suggests-diplomatic-options-remain/article70750573.ece';

async function inspect() {
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    const html = res.data;
    
    // Check for common containers
    console.log('Contains <article>:', html.includes('<article'));
    console.log('Contains class="article-content":', html.includes('class="article-content"'));
    console.log('Contains id="content-body-":', html.includes('id="content-body-'));
    console.log('Contains class="content-body":', html.includes('class="content-body"'));
    console.log('Contains class="articleblock":', html.includes('class="articleblock"'));
    
    // Let's print a small chunk around ID content-body- or similar if found
    const match = html.match(/id="content-body-[^"]+"/);
    if (match) {
        console.log('Found ID match:', match[0]);
    }
    const classMatch = html.match(/class="[^"]*(article|content)[^"]*"/g);
    if (classMatch) {
       console.log('Found matching classes (up to 5):', classMatch.slice(0, 5));
    }

  } catch (e) {
    console.error('Error fetching URL:', e.message);
  }
}

inspect();
