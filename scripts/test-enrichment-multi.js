const https = require('https');

function fetchArticleData(url) {
  return new Promise((resolve) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36'
      },
      timeout: 5000
    };

    https.get(url, options, (res) => {
      console.log(`GET ${url} - Status: ${res.statusCode}`);
      if (res.statusCode !== 200) return resolve({ description: null, imageUrl: null });
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          // Extract text from <p> tags
          const paragraphs = data.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
          let description = null;
          if (paragraphs) {
            const cleanParagraphs = paragraphs
              .map(p => p.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim())
              .filter(p => p.length > 120 && !p.includes('{') && !p.includes('Subscribe') && !p.includes('Sign in'));

            if (cleanParagraphs.length > 0) {
              description = cleanParagraphs.slice(0, 4).join('\n\n');
            }
          }

          // Extract og:image
          const ogImageMatch = data.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"/i);
          const twitterImageMatch = data.match(/<meta[^>]*name="twitter:image"[^>]*content="([^"]*)"/i);
          const imageUrl = (ogImageMatch ? ogImageMatch[1] : (twitterImageMatch ? twitterImageMatch[1] : null));

          resolve({ description, imageUrl });
        } catch (e) {
          resolve({ description: null, imageUrl: null });
        }
      });
    }).on('error', (e) => {
      console.log('Error:', e.message);
      resolve({ description: null, imageUrl: null });
    });
  });
}

const testUrls = [
    { name: 'TOI (India)', url: 'https://timesofindia.indiatimes.com/india/modi-leads-bjp-to-landslide-victory-in-haryana/articleshow/104321321.cms' },
    { name: 'Al Jazeera (World)', url: 'https://www.aljazeera.com/news/liveblog/2023/10/24/israel-hamas-war-live-israel-hits-400-targets-in-gaza-as-death-toll-rises' },
    { name: 'Google News (Fallback)', url: 'https://news.google.com/rss/articles/CBMif0FVX3lxTE5wUXhXN2pWcXRUVlp6ZXZKWWVUMXZ1WUt6LVZleFdhbHRia0tHajh2UmV2R0NBMWh1cml0Q050bXlId19QajhVUG5zV0Vncnoyc3NkbjAwdnREUXhHZnNURzZ3NnV4S3NlZ3UwaThIcnJvVFFCR0s3YWQ4OHM3RjNnSFRfRWdERGdoeFE?oc=5' }
];

async function runTests() {
    for (const test of testUrls) {
        console.log(`\nTesting ${test.name}:`);
        const result = await fetchArticleData(test.url);
        console.log('Desc Length:', result.description ? result.description.length : 0);
        console.log('Image URL:', result.imageUrl);
    }
}

runTests();
