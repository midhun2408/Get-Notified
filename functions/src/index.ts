import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2";
import * as admin from "firebase-admin";
import Parser from "rss-parser";
import * as https from "https";

admin.initializeApp();

/**
 * Fetches the actual article page and extracts the first few paragraphs
 * for a more detailed summary (bypass Node 18 ReferenceError by using native https)
 */
function fetchFullDescription(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36'
      },
      timeout: 5000
    };

    https.get(url, options, (res) => {
      if (res.statusCode !== 200) return resolve(null);
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          // Extract text from <p> tags using regex
          const paragraphs = data.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
          if (!paragraphs) return resolve(null);

          const cleanParagraphs = paragraphs
            .map(p => p.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim())
            .filter(p => p.length > 120 && !p.includes('{') && !p.includes('Subscribe') && !p.includes('Sign in'));

          if (cleanParagraphs.length > 0) {
            // Join first 3-4 paragraphs
            resolve(cleanParagraphs.slice(0, 4).join('\n\n'));
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => {
      resolve(null);
    });
  });
}

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

            // ENRICHMENT: Fetch longer description for new articles
            console.log(`[${topic}] Fetching full content for: ${displayTitle}`);
            const fullDesc = await fetchFullDescription(article.link);
            if (fullDesc) {
                description = fullDesc;
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
