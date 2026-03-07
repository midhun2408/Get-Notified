function decodeGoogleNewsUrl(encodedUrl) {
  try {
    const url = new URL(encodedUrl);
    const pathParts = url.pathname.split('/');
    const base64Str = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];
    
    // Google News links are often CBMi followed by a base64 string
    // This string contains binary data including the URL
    if (base64Str.startsWith('CBMi')) {
      const hex = Buffer.from(base64Str, 'base64').toString('hex');
      // Look for the URL pattern in the hex/binary data
      const buffer = Buffer.from(base64Str, 'base64');
      const text = buffer.toString('binary');
      // URLs in there are often preceded by 0x01 or similar, so we search for http
      const match = text.match(/https?:\/\/[^\s\x00-\x1f\x7f-\xff]*/);
      if (match) return match[0];
    }
    return encodedUrl;
  } catch (e) {
    return encodedUrl;
  }
}

const testLinks = [
    'https://news.google.com/rss/articles/CBMif0FVX3lxTE5wUXhXN2pWcXRUVlp6ZXZKWWVUMXZ1WUt6LVZleFdhbHRia0tHajh2UmV2R0NBMWh1cml0Q050bXlId19QajhVUG5zV0Vncnoyc3NkbjAwdnREUXhHZnNURzZ3NnV4S3NlZ3UwaThIcnJvVFFCR0s3YWQ4OHM3RjNnSFRfRWdERGdoeFE?oc=5',
    'https://news.google.com/rss/articles/CBMiRGh0dHBzOi8vd3d3Lm9ubWFub3JhbWEuY29tL25ld3Mva2VyYWxhLzIwMjYvMDMvMDcvbW9keS1rZXJhbGEuaHRtbNIBTWh0dHBzOi8vd3d3Lm9ubWFub3JhbWEuY29tL25ld3Mva2VyYWxhLzIwMjYvMDMvMDcvbW9keS1rZXJhbGEuYW1wLmh0bWw?oc=5'
];

testLinks.forEach(l => console.log(`Decoded: ${decodeGoogleNewsUrl(l)}`));
