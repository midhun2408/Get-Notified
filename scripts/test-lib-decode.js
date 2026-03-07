const { GoogleDecoder } = require('google-news-url-decoder');

async function test() {
    const decoder = new GoogleDecoder();
    const googleNewsUrl = 'https://news.google.com/rss/articles/CBMif0FVX3lxTE5wUXhXN2pWcXRUVlp6ZXZKWWVUMXZ1WUt6LVZleFdhbHRia0tHajh2UmV2R0NBMWh1cml0Q050bXlId19QajhVUG5zV0Vncnoyc3NkbjAwdnREUXhHZnNURzZ3NnV4S3NlZ3UwaThIcnJvVFFCR0s3YWQ4OHM3RjNnSFRfRWdERGdoeFE?oc=5';
    
    try {
        console.log('Decoding...');
        const result = await decoder.decode(googleNewsUrl);
        if (result.status) {
            console.log('Original URL:', result.decoded_url);
        } else {
            console.error('Error:', result.message);
        }
    } catch (e) {
        console.error('Catch Error:', e.message);
    }
}

test();
