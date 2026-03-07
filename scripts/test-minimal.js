const https = require('https');

https.get('https://news.google.com', (res) => {
  console.log('Status:', res.statusCode);
  res.on('data', () => {});
  res.on('end', () => console.log('Done'));
});
