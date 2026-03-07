const https = require('https');
const urlModule = require('url');

function fetchWithRedirects(url, depth = 0) {
  return new Promise((resolve) => {
    if (depth > 5) return resolve(null);

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36'
      },
      timeout: 5000
    };

    https.get(url, options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const nextUrl = urlModule.resolve(url, res.headers.location);
        console.log(`Redirecting to: ${nextUrl}`);
        return resolve(fetchWithRedirects(nextUrl, depth + 1));
      }

      if (res.statusCode !== 200) return resolve(null);

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(null));
  });
}

async function testRedirect() {
    const googleUrl = 'https://news.google.com/rss/articles/CBMif0FVX3lxTE5wUXhXN2pWcXRUVlp6ZXZKWWVUMXZ1WUt6LVZleFdhbHRia0tHajh2UmV2R0NBMWh1cml0Q050bXlId19QajhVUG5zV0Vncnoyc3NkbjAwdnREUXhHZnNURzZ3NnV4S3NlZ3UwaThIcnJvVFFCR0s3YWQ4OHM3RjNnSFRfRWdERGdoeFE?oc=5';
    console.log('Testing Google Redirect...');
    const html = await fetchWithRedirects(googleUrl);
    if (html) {
        console.log('HTML Length:', html.length);
        const ogImage = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"/i);
        console.log('Found Image:', ogImage ? ogImage[1] : 'No');
    } else {
        console.log('Failed to follow redirect.');
    }
}

testRedirect();
