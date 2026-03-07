function decodeGoogleNewsUrl(googleUrl) {
  try {
    const parts = googleUrl.split('/');
    const base64Part = parts[parts.length - 1].split('?')[0];
    
    // Convert base64 to buffer
    const decoded = Buffer.from(base64Part, 'base64');
    
    // In many versions of Google News URLs, the actual URL is embedded in the binary data.
    // We can search for the "http" string in the buffer.
    const str = decoded.toString('latin1'); // Use latin1 to keep byte values
    
    // Look for http or https
    const urlMatch = str.match(/https?:\/\/[^\s\x00-\x1F\x7F-\x9F]+/);
    if (urlMatch) {
        return urlMatch[0];
    }
    
    // If straightforward match fails, try to find it by skipping common headers
    // The structure is often: [some bytes] [url length] [url]
    // Let's look for common domains or patterns.
    return null;
  } catch (e) {
    return null;
  }
}

// Test with a few sample URLs
const testUrls = [
  'https://news.google.com/rss/articles/CBMiUmh0dHBzOi8vd3d3LnRoZWhpbmR1LmNvbS9uZXdzL25hdGlvbmFsL2tlcmFsYS93ZWxjb21lLXRvLWtlcmFsYS1zaWduYm9hcmQtc3BhcmtzLXRlbnNpb24taW4tdGhlLW5pbGf8cmFzL2FydGljbGU2OTI5ODg1OS5lY2XSAQA?oc=5',
  'https://news.google.com/rss/articles/CBMif0FVX3lxTE5wUXhXN2pWcXRUVlp6ZXZKWWVUMXZ1WUt6LVZleFdhbHRia0tHajh2UmV2R0NBMWh1cml0Q050bXlId19QajhVUG5zV0Vncnoyc3NkbjAwdnREUXhHZnNURzZ3NnV4S3NlZ3UwaThIcnJvVFFCR0s3YWQ4OHM3RjNnSFRfRWdERGdoeFE?oc=5'
];

testUrls.forEach(u => {
    console.log(`Original: ${u}`);
    console.log(`Decoded:  ${decodeGoogleNewsUrl(u)}`);
});
