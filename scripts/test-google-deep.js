const https = require('https');
const urlModule = require('url');

function fetchWithRedirects(url, depth = 0) {
  return new Promise((resolve) => {
    if (depth > 5) return resolve(null);
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
        'Cookie': 'CONSENT=YES+cb.20230501-14-p0.en+FX+386;'
      },
      timeout: 8000
    };
    https.get(url, options, (res) => {
      console.log(`[${depth}] GET ${url} - Status: ${res.statusCode}`);
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const nextUrl = urlModule.resolve(url, res.headers.location);
        return resolve(fetchWithRedirects(nextUrl, depth + 1));
      }
      if (res.statusCode !== 200) return resolve(null);
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(null));
  });
}

async function testFailedLink() {
    // This is a typical Google News article link pattern
    const url = 'https://news.google.com/rss/articles/CBMif0FVX3lxTE5wUXhXN2pWcXRUVlp6ZXZKWWVUMXZ1WUt6LVZleFdhbHRia0tHajh2UmV2R0NBMWh1cml0Q050bXlId19QajhVUG5zV0Vncnoyc3NkbjAwdnREUXhHZnNURzZ3NnV4S3NlZ3UwaThIcnJvVFFCR0s3YWQ4OHM3RjNnSFRfRWdERGdoeFE?oc=5';
    console.log('--- Testing Failed Link ---');
    let html = await fetchWithRedirects(url);
    if (!html) {
        console.log('Failed to fetch initial page.');
        return;
    }

    console.log('HTML Length:', html.length);
    
    // Check if we are still on Google News
    if (html.includes('google.com/amp') || html.includes('google.com/news')) {
        console.log('Still on Google property.');
        const googleMatch = html.match(/<a[^>]*rel="nofollow"[^>]*href="([^"]*)"/i);
        if (googleMatch) {
            const realUrl = googleMatch[1];
            console.log(`Found intermediate link: ${realUrl}`);
            html = await fetchWithRedirects(realUrl);
            if (html) {
                console.log('Final Page Length:', html.length);
                const ogImage = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"/i);
                console.log('Final Image:', ogImage ? ogImage[1] : 'NOT FOUND');
            }
        } else {
            console.log('No intermediate link found in HTML.');
            // Debug: Log a bit of the HTML to see what we're looking at
            console.log('HTML Preview:', html.substring(0, 500));
        }
    } else {
        console.log('Reached external site.');
        const ogImage = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"/i);
        console.log('Image:', ogImage ? ogImage[1] : 'NOT FOUND');
    }
}

testFailedLink();
