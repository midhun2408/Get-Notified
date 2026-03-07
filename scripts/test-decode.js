function decodeGoogleNewsUrl(encodedUrl) {
    try {
        const url = new URL(encodedUrl);
        const pathParts = url.pathname.split('/');
        const base64Str = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];
        
        // This is a simplified decoding for CBMi... pattern
        // The real decoding is more complex but often CBMi followed by base64 of the URL
        if (base64Str.startsWith('CBMi')) {
            const buffer = Buffer.from(base64Str.substring(4), 'base64');
            const decoded = buffer.toString('utf8');
            // Find the first URL-like string
            const match = decoded.match(/https?:\/\/[^\s\x00-\x1f\x7f-\xff]*/);
            if (match) return match[0];
        }
        return encodedUrl;
    } catch (e) {
        return encodedUrl;
    }
}

const testLink = 'https://news.google.com/rss/articles/CBMif0FVX3lxTE5wUXhXN2pWcXRUVlp6ZXZKWWVUMXZ1WUt6LVZleFdhbHRia0tHajh2UmV2R0NBMWh1cml0Q050bXlId19QajhVUG5zV0Vncnoyc3NkbjAwdnREUXhHZnNURzZ3NnV4S3NlZ3UwaThIcnJvVFFCR0s3YWQ4OHM3RjNnSFRfRWdERGdoeFE?oc=5';
console.log('Original:', testLink);
console.log('Decoded:', decodeGoogleNewsUrl(testLink));
