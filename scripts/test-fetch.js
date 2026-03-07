async function testFetch() {
    const url = 'https://timesofindia.indiatimes.com/india/modi-leads-bjp-to-landslide-victory-in-haryana/articleshow/104321321.cms';
    console.log(`Testing Fetch: ${url}`);
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            },
            redirect: 'follow'
        });
        console.log(`Status: ${response.status}`);
        if (response.ok) {
            const html = await response.text();
            console.log(`HTML Loaded: ${html.length}`);
            const paragraphs = (html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [])
                .map(p => p.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim())
                .filter(p => p.length > 120);
            console.log(`Paragraphs: ${paragraphs.length}`);
        }
    } catch (e) {
        console.log(`Error: ${e.message}`);
    }
}

testFetch();
