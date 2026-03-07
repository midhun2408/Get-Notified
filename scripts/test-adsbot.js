const axios = require('axios');
const cheerio = require('cheerio');

async function testAdsBot() {
  const url = 'https://news.google.com/rss/articles/CBMif0FVX3lxTE5wUXhXN2pWcXRUVlp6ZXZKWWVUMXZ1WUt6LVZleFdhbHRia0tHajh2UmV2R0NBMWh1cml0Q050bXlId19QajhVUG5zV0Vncnoyc3NkbjAwdnREUXhHZnNURzZ3NnV4S3NlZ3UwaThIcnJvVFFCR0s3YWQ4OHM3RjNnSFRfRWdERGdoeFE?oc=5';
  
  try {
    console.log("Fetching with AdsBot-Google User-Agent...");
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'AdsBot-Google (+http://www.google.com/adsbot.html)'
      },
      maxRedirects: 5
    });
    
    console.log("Status:", response.status);
    console.log("Final URL:", response.request.res.responseUrl || response.config.url);
    
    const $ = cheerio.load(response.data);
    const description = $('meta[property="og:description"]').attr('content') || 
                       $('meta[name="description"]').attr('content') || 
                       "No description";
    console.log("Description:", description);
    
    if (description.includes("Comprehensive up-to-date")) {
        console.log("FAIL: Still got the generic Google description.");
    } else {
        console.log("SUCCESS: Got a different description!");
    }
  } catch(e) {
    console.error("Error:", e.message);
  }
}

testAdsBot();
