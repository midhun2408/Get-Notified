const fs = require('fs');
const html = fs.readFileSync('output.html', 'utf8');

// The original URL we're looking for was related to "Welcome to Kerala signboard" on "The Hindu". Let's search for "thehindu" or "http"
const urlRegex = /https?:\/\/[a-zA-Z0-9.\-_]+\/[^"'\s]*/g;
const matches = [...new Set(html.match(urlRegex))];

console.log('Found URLs:');
matches.forEach(m => {
  if (!m.includes('google.com') && !m.includes('gstatic.com') && !m.includes('schema.org')) {
    console.log(m);
  }
});
