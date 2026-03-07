import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import Parser from "rss-parser";

admin.initializeApp();

// Set global options for all v2 functions
setGlobalOptions({ maxInstances: 10 });

const db = admin.firestore();
const parser = new Parser();

// Scheduled function to run every 10 minutes
export const searchNewsAI = onSchedule({
  schedule: "*/10 * * * *",
  timeoutSeconds: 540,
  memory: "512MiB",
}, async (event) => {
  try {
    const topicsSnapshot = await db.collection("topics").get();
    const allTopics = topicsSnapshot.docs.map(doc => doc.data().name);

    if (allTopics.length === 0) {
      console.log("No topics found in Firestore.");
      return;
    }

    console.log(`Starting news search for ${allTopics.length} topics...`);

    // Process all topics in parallel
    await Promise.all(allTopics.map(async (topic) => {
      try {
        // Construct Google News RSS URL targeted at India/English for better regional results
        const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-IN&gl=IN&ceid=IN:en`;
        const feed = await parser.parseURL(feedUrl);
        
        // Take the top 3 items
        const articles = feed.items.slice(0, 3);
        if (!articles || articles.length === 0) return;

        await Promise.all(articles.map(async (article) => {
          if (!article.link || !article.title) return;

          const articleHash = Buffer.from(article.link).toString("base64");
          const newsRef = db.collection("news").doc(articleHash);
          const doc = await newsRef.get();

          if (!doc.exists) {
            // New news found!
            
            // Extract source from title if possible (Google usually appends "- SourceName")
            let source = "Internet";
            let cleanTitle = article.title;
            const splitIndex = article.title.lastIndexOf(" - ");
            if (splitIndex !== -1) {
              source = article.title.substring(splitIndex + 3);
              cleanTitle = article.title.substring(0, splitIndex);
            }

            await newsRef.set({
              topic,
              title: cleanTitle,
              description: article.contentSnippet || article.content || "",
              url: article.link,
              image: null, // RSS rarely provides a clean image, UI should handle this
              publishedAt: article.pubDate || new Date().toISOString(),
              source: source,
              timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            // Trigger Push Notification
            await sendNotification(topic, cleanTitle);
          }
        }));
      } catch (error) {
        console.error(`Error searching news for topic ${topic}:`, error);
      }
    }));

    console.log("News search completed successfully.");  } catch (error) {
    console.error("Critical error in searchNewsAI function:", error);
  }
});

async function sendNotification(topic: string, title: string) {
  const payload = {
    notification: {
      title: `Match found for: ${topic}`,
      body: title,
    },
    topic: topic.replace(/\s+/g, "_")
  };

  try {
    await admin.messaging().send(payload);
    console.log(`Notification sent for topic: ${topic}`);
  } catch (error) {
    console.error("Error sending notification:", error);
  }
}
