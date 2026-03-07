function manualDecode(googleUrl) {
    try {
        const parts = googleUrl.split('/');
        const hex = parts[parts.length - 1].split('?')[0];
        const data = Buffer.from(hex, 'base64');
        
        // This is a rough attempt to find the URL in the binary data
        const str = data.toString('latin1');
        
        // Look for the last occurrence of http
        const lastHttp = str.lastIndexOf('http');
        if (lastHttp !== -1) {
            // Find the end of the URL (until a non-printable or special char)
            let end = lastHttp;
            while (end < str.length) {
                const code = str.charCodeAt(end);
                if (code < 32 || code > 126 || code === 34 || code === 39 || code === 62 || code === 60) {
                    break;
                }
                end++;
            }
            const foundUrl = str.substring(lastHttp, end);
            return foundUrl;
        }
        return null;
    } catch (e) {
        return null;
    }
}

const url = 'https://news.google.com/rss/articles/CBMif0FVX3lxTE5wUXhXN2pWcXRUVlp6ZXZKWWVUMXZ1WUt6LVZleFdhbHRia0tHajh2UmV2R0NBMWh1cml0Q050bXlId19QajhVUG5zV0Vncnoyc3NkbjAwdnREUXhHZnNURzZ3NnV4S3NlZ3UwaThIcnJvVFFCR0s3YWQ4OHM3RjNnSFRfRWdERGdoeFE?oc=5';
console.log('Decoded:', manualDecode(url));
