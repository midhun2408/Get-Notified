const https = require('https');

function getDirectRedirect(url) {
  return new Promise((resolve) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
      },
      agent: false
    }, (res) => {
      console.log(`GET ${url} - Status: ${res.statusCode}`);
      if (res.headers.location) {
          console.log('Location:', res.headers.location);
          resolve(res.headers.location);
      } else {
          resolve(null);
      }
    }).on('error', (e) => {
      console.error(e.message);
      resolve(null);
    });
  });
}

const url = 'https://news.google.com/rss/articles/CBMif0FVX3lxTE5wUXhXN2pWcXRUVlp6ZXZKWWVUMXZ1WUt6LVZleFdhbHRia0tHajh2UmV2R0NBMWh1cml0Q050bXlId19QajhVUG5zV0Vncnoyc3NkbjAwdnREUXhHZnNURzZ3NnV4S3NlZ3UwaThIcnJvVFFCR0s3YWQ4OHM3RjNnSFRfRWdERGdoeFE?oc=5';
getDirectRedirect(url).then(r => console.log('Result:', r));
