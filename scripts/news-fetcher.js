const admin = require('firebase-admin');
const axios = require('axios');

// Initialize Firebase Admin using Service Account from environment variable
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const GNEWS_API_KEY = process.env.GNEWS_API_KEY;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

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
        const response = await axios.get(`https://gnews.io/api/v4/search?q=${encodeURIComponent(topic)}&token=${GNEWS_API_KEY}&lang=en&max=3`);
        
        const articles = response.data.articles || [];

        // Process articles for this topic in parallel
        await Promise.all(articles.map(async (article) => {
          const articleHash = Buffer.from(article.url).toString('base64');
          const newsRef = db.collection('news').doc(articleHash);
          const doc = await newsRef.get();

          if (!doc.exists) {
            console.log(`[${topic}] New article found: ${article.title}`);
            await newsRef.set({
              topic,
              title: article.title,
              description: article.description,
              url: article.url,
              imageUrl: article.image,
              time: article.publishedAt,
              source: article.source.name,
              timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            // Trigger Push Notification
            await sendNotification(topic, article.title);
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
