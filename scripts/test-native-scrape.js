const https = require('https');

function fetchContent(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function test() {
  const url = 'https://www.thehindu.com/news/national/kerala/kerala-man-booked-for-calling-pm-modi-traitor-on-social-media/article70715101.ece';
  try {
    const html = await fetchContent(url);
    // Simple regex to find paragraphs
    const paragraphs = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    if (paragraphs) {
        console.log(`Found ${paragraphs.length} paragraphs`);
        const cleanParagraphs = paragraphs
            .map(p => p.replace(/<[^>]*>?/gm, '').trim())
            .filter(p => p.length > 100 && !p.includes('{') && !p.includes('Subscribe'));
            
        console.log('--- Extracted Text ---');
        console.log(cleanParagraphs.slice(0, 4).join('\n\n'));
    }
  } catch (e) {
    console.error(e.message);
  }
}

test();
