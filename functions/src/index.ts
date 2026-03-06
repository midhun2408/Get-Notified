import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";

admin.initializeApp();

const db = admin.firestore();

// Scheduled function to run every 60 minutes
export const searchNewsAI = functions.pubsub.schedule("every 60 minutes").onRun(async (context) => {
  const topicsSnapshot = await db.collection("topics").get();
  const allTopics = topicsSnapshot.docs.map(doc => doc.data().name);

  if (allTopics.length === 0) return null;

  for (const topic of allTopics) {
    try {
      // Using GNews API for real-time news search
      // Note: User will need to add their GNEWS_API_KEY to firebase config
      const apiKey = process.env.GNEWS_API_KEY || "REPLACE_WITH_YOUR_GNEWS_API_KEY";
      const response = await axios.get(`https://gnews.io/api/v4/search?q=${encodeURIComponent(topic)}&token=${apiKey}&lang=en&max=3`);
      
      const articles = response.data.articles;

      for (const article of articles) {
        const articleHash = Buffer.from(article.url).toString("base64");
        const newsRef = db.collection("news").doc(articleHash);
        const doc = await newsRef.get();

        if (!doc.exists) {
          // New news found!
          await newsRef.set({
            topic,
            title: article.title,
            description: article.description,
            url: article.url,
            image: article.image,
            publishedAt: article.publishedAt,
            source: article.source.name,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
          });

          // Trigger Push Notification
          await sendNotification(topic, article.title);
        }
      }
    } catch (error) {
      console.error(`Error searching news for topic ${topic}:`, error);
    }
  }
  return null;
});

async function sendNotification(topic: string, title: string) {
  const payload = {
    notification: {
      title: `Match found for: ${topic}`,
      body: title,
      clickAction: "FLUTTER_NOTIFICATION_CLICK" // Placeholder for deep linking
    },
    topic: topic.replace(/\s+/g, "_") // Subscribe users to topics
  };

  try {
    await admin.messaging().send(payload);
    console.log(`Notification sent for topic: ${topic}`);
  } catch (error) {
    console.error("Error sending notification:", error);
  }
}
