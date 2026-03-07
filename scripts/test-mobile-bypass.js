const https = require('https');

function getUrl(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      console.log(`GET ${url} - Status: ${res.statusCode}`);
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (!redirectUrl.startsWith('http')) {
            const parsed = new URL(url);
            redirectUrl = parsed.protocol + '//' + parsed.host + redirectUrl;
        }
        resolve(getUrl(redirectUrl, headers));
      } else {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ data, url }));
      }
    }).on('error', reject);
  });
}

async function run() {
  const url = 'https://news.google.com/rss/articles/CBMif0FVX3lxTE5wUXhXN2pWcXRUVlp6ZXZKWWVUMXZ1WUt6LVZleFdhbHRia0tHajh2UmV2R0NBMWh1cml0Q050bXlId19QajhVUG5zV0Vncnoyc3NkbjAwdnREUXhHZnNURzZ3NnV4S3NlZ3UwaThIcnJvVFFCR0s3YWQ4OHM3RjNnSFRfRWdERGdoeFE?oc=5';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Cookie': 'CONSENT=YES+cb.20230501-14-p0.en+FX+386;'
  };
  
  try {
    const { data, url: finalUrl } = await getUrl(url, headers);
    console.log('Final URL:', finalUrl);
    // console.log('Data Snippet:', data.substring(0, 1000));
    
    if (data.includes('og:description')) {
        const match = data.match(/property="og:description" content="([^"]+)"/);
        console.log('og:description:', match ? match[1] : 'Not found');
    } else {
        console.log('og:description tag not found in HTML');
    }

  } catch (e) {
    console.error('Error:', e.message);
  }
}

run();
