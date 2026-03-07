const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/100.0.4896.127 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        }
    }, (res) => {
      console.log('GET', url);
      console.log('Status:', res.statusCode);
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          console.log('Redirecting to:', res.headers.location);
          return resolve(fetchUrl(res.headers.location));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function test() {
  const url = 'https://news.google.com/rss/articles/CBMifkFVX3lxTE53Vk1kMGdBSkRDaGcyS3J1OUQ3TzZtdkZ4bXkxUkswZ2F3bXh2bF9pQ0lkYnl0NzhsTExvWjdTUEs2c1FpRG16Y2hhTEtLcUJvOExQYVpVR21iUG8tRWJ1RUVqQWF1WjBHRWl2cExuRWhjRUtkZXZFSU5QUzBRUQ?oc=5';
  const html = await fetchUrl(url);
  console.log('--- Page Source ---');
  console.log(html);
}
test();
