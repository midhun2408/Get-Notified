const admin = require('firebase-admin');
const Parser = require('rss-parser');
const https = require('https');
const zlib = require('zlib');
const crypto = require('crypto');

// USE HARDCODED PATH FOR DIAGNOSIS
const serviceAccount = require('d:/Downloads/get-notifiy-firebase-adminsdk-fbsvc-f31a7e89a6.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const parser = new Parser();

async function runDebug() {
    console.log('--- DEBUG FETCH START ---');
    const topicsRef = await db.collection('topics').get();
    const topics = topicsRef.docs.map(doc => doc.data().name);
    console.log(`Topics in DB: ${topics.join(', ')}`);

    for (const topic of topics) {
        console.log(`\nProcessing Topic: ${topic}`);
        const url = `https://www.bing.com/news/search?q=${encodeURIComponent(topic)}&format=rss`;
        console.log(`URL: ${url}`);
        
        try {
            const feed = await parser.parseURL(url);
            console.log(`Items in feed: ${feed.items.length}`);
            
            for (const item of feed.items.slice(0, 5)) {
                console.log(` - Processing: ${item.title}`);
                const articleHash = crypto.createHash('md5').update(item.link).digest('hex');
                const newsRef = db.collection('news').doc(articleHash);
                const doc = await newsRef.get();
                
                if (!doc.exists) {
                    console.log(`   * NEW ARTICLE. Saving...`);
                    await newsRef.set({
                        topic: topic,
                        title: item.title,
                        description: item.contentSnippet || item.description || "",
                        url: item.link,
                        time: item.pubDate || new Date().toISOString(),
                        source: "Bing",
                        timestamp: admin.firestore.FieldValue.serverTimestamp()
                    });
                    console.log(`   * Saved.`);
                } else {
                    console.log(`   * Already exists.`);
                }
            }
        } catch (e) {
            console.error(`ERROR for ${topic}:`, e.message);
        }
    }
}

runDebug().then(() => {
    console.log('\n--- DEBUG FETCH FINISHED ---');
    process.exit(0);
});
