const admin = require('firebase-admin');
const Parser = require('rss-parser');

// Initialize Firebase Admin using Service Account from environment variable
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const parser = new Parser();

async function runSearch() {
  console.log('--- Starting News Search ---');
  
  try {
    const topicsSnapshot = await db.collection('topics').get();
    const allTopics = topicsSnapshot.docs.map(doc => doc.data().name);

    if (allTopics.length === 0) {
      console.log('No topics found. Exiting.');
      return;
    }

    console.log(`Searching for topics: ${allTopics.join(', ')}`);

    // Process all topics in parallel
    await Promise.all(allTopics.map(async (topic) => {
      try {
        console.log(`Fetching news for: ${topic}`);
        const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-IN&gl=IN&ceid=IN:en`;
        const feed = await parser.parseURL(feedUrl);
        
        const articles = feed.items.slice(0, 3);
        if (!articles || articles.length === 0) return;

        // Process articles for this topic in parallel
        await Promise.all(articles.map(async (article) => {
          if (!article.link || !article.title) return;

          const articleHash = Buffer.from(article.link).toString('base64');
          const newsRef = db.collection('news').doc(articleHash);
          const doc = await newsRef.get();

          if (!doc.exists) {
            let source = "Internet";
            let cleanTitle = article.title;
            const splitIndex = article.title.lastIndexOf(" - ");
            if (splitIndex !== -1) {
              source = article.title.substring(splitIndex + 3);
              cleanTitle = article.title.substring(0, splitIndex);
            }

            console.log(`[${topic}] New article found: ${cleanTitle}`);
            await newsRef.set({
              topic,
              title: cleanTitle,
              description: article.contentSnippet || article.content || "",
              url: article.link,
              imageUrl: null,
              time: article.pubDate || new Date().toISOString(),
              source: source,
              timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            // Trigger Push Notification
            await sendNotification(topic, cleanTitle);
          }
        }));
      } catch (error) {
        console.error(`Error searching news for topic ${topic}:`, error.message);
      }
    }));
  } catch (error) {
    console.error('Critical Error:', error.message);
  }
}

async function sendNotification(topic, title) {
  const payload = {
    notification: {
      title: `Match found for: ${topic}`,
      body: title,
    },
    topic: topic.replace(/\s+/g, '_') // Subscribe users to topics
  };

  try {
    await admin.messaging().send(payload);
    console.log(`Notification sent for topic: ${topic}`);
  } catch (error) {
    console.error('Error sending notification:', error.message);
  }
}

runSearch().then(() => {
  console.log('--- News Search Finished ---');
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
