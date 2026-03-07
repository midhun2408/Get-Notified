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

    // Map common topics to high-quality direct publisher feeds
    const TOPIC_FEEDS: { [key: string]: string[] } = {
      'Kerala': [
        'https://www.thehindu.com/news/national/kerala/feeder/default.rss',
        'https://www.onmanorama.com/rss/news.xml'
      ],
      'India': [
        'https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms',
        'https://www.thehindu.com/news/national/feeder/default.rss'
      ],
      'World': [
        'https://www.aljazeera.com/xml/rss/all.xml',
        'https://timesofindia.indiatimes.com/rssfeeds/29473334.cms'
      ],
      'Technology': [
        'https://gadgets360.com/rss/feeds'
      ]
    };

    console.log(`Searching for topics: ${allTopics.join(', ')}`);

    for (const topic of allTopics) {
      try {
        console.log(`--- Processing topic: ${topic} ---`);
        let items: any[] = [];
        
        if (TOPIC_FEEDS[topic]) {
            console.log(`Using direct publisher feeds for ${topic}`);
            for (const url of TOPIC_FEEDS[topic]) {
                try {
                    const feed = await parser.parseURL(url);
                    items = items.concat(feed.items.slice(0, 5));
                } catch (e: any) {
                    console.error(`Error fetching direct feed ${url}:`, e.message);
                }
            }
        } else {
            console.log(`No direct feed for ${topic}, falling back to Google News`);
            const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-IN&gl=IN&ceid=IN:en`;
            try {
                const feed = await parser.parseURL(feedUrl);
                items = feed.items.slice(0, 5);
            } catch (e: any) {
                console.error(`Error fetching Google News for ${topic}:`, e.message);
            }
        }

        if (items.length === 0) continue;

        for (const article of items) {
          if (!article.link || !article.title) continue;

          const articleHash = Buffer.from(article.link).toString('base64').substring(0, 100);
          const newsRef = db.collection('news').doc(articleHash);
          const doc = await newsRef.get();

          if (!doc.exists) {
            let source = "News";
            let displayTitle = article.title;
            let description = article.contentSnippet || article.description || article.content || "";
            
            description = description.replace(/<[^>]*>?/gm, '').trim();

            if (article.source && article.source.name) {
                source = article.source.name;
            } else {
                const splitIndex = article.title.lastIndexOf(" - ");
                if (splitIndex !== -1) {
                    source = article.title.substring(splitIndex + 3);
                    displayTitle = article.title.substring(0, splitIndex);
                } else {
                    try {
                        const urlObj = new URL(article.link);
                        source = urlObj.hostname.replace('www.', '').split('.')[0];
                        source = source.charAt(0).toUpperCase() + source.slice(1);
                    } catch(e) {}
                }
            }

            if (description.includes("Comprehensive up-to-date")) {
                description = displayTitle; 
            }

            console.log(`[${topic}] New article found: ${displayTitle} (${source})`);
            
            await newsRef.set({
              topic,
              title: displayTitle,
              description: description,
              url: article.link,
              imageUrl: null,
              time: article.pubDate || new Date().toISOString(),
              source: source,
              timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            await sendNotification(topic, displayTitle);
          }
        }
      } catch (error: any) {
        console.error(`Error searching news for topic ${topic}:`, error.message);
      }
    }

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
