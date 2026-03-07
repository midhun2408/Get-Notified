import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated, onDocumentDeleted } from "firebase-functions/v2/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import * as https from "https";
import * as zlib from "zlib";
import * as crypto from "crypto";

let _admin: any;
function getAdmin() {
  if (!_admin) _admin = require("firebase-admin");
  return _admin;
}

let _db: any;
function getDb() {
  if (!_db) {
    const admin = getAdmin();
    if (admin.apps.length === 0) admin.initializeApp();
    _db = admin.firestore();
  }
  return _db;
}

let _parser: any;
function getParser() {
  if (!_parser) {
    const Parser = require("rss-parser");
    _parser = new Parser();
  }
  return _parser;
}

/**
 * Decodes Google News direct links from CBMi base64 pattern
 */
function decodeArticleUrl(encodedUrl: string): string {
  try {
    const url = new URL(encodedUrl);
    
    // Handle Bing News RSS URLs
    if (url.hostname.includes('bing.com')) {
      const realUrl = url.searchParams.get('url');
      if (realUrl) return realUrl;
    }

    // Handle Google News RSS URLs
    if (url.hostname.includes('news.google.com')) {
      const pathParts = url.pathname.split('/');
      let base64Str = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];
      if (base64Str) base64Str = base64Str.split('?')[0];
      
      if (!base64Str) return encodedUrl;

      const normalized = base64Str.replace(/-/g, '+').replace(/_/g, '/');
      const buffer = Buffer.from(normalized, 'base64');
      
      const encodings = ['binary', 'utf8', 'ascii'] as const;
      for (const enc of encodings) {
        const text = buffer.toString(enc);
        const matches = text.match(/https?:\/\/[^\s\x00-\x1f\x7f-\xff]*/g);
        if (matches && matches.length > 0) {
          const filtered = matches.filter(m => !m.includes('google.com'));
          if (filtered.length > 0) {
             return filtered.sort((a, b) => b.length - a.length)[0];
          }
        }
      }
    }
  } catch (e) { }
  return encodedUrl;
}

/**
 * Helper to fetch HTML while following redirects with browser-like headers
 */
function fetchWithRedirects(url: string, depth = 0): Promise<string | null> {
  return new Promise((resolve) => {
    if (depth > 5) return resolve(null);

    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': 'https://www.google.com/',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Cookie': 'CONSENT=YES+cb.20230501-14-p0.en+FX+386;'
      },
      timeout: 10000
    };

    https.get(url, options, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const nextUrl = new URL(res.headers.location, url).href;
        return resolve(fetchWithRedirects(nextUrl, depth + 1));
      }

      if (res.statusCode !== 200) {
        console.log(`[Cloud Function Enrichment] Failed to fetch ${url} - Status: ${res.statusCode}`);
        return resolve(null);
      }
      
      let stream: any = res;
      const encoding = res.headers['content-encoding'];
      if (encoding === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === 'deflate') {
        stream = res.pipe(zlib.createInflate());
      }

      let data = '';
      stream.on('data', (chunk: any) => data += chunk);
      stream.on('end', () => resolve(data));
      stream.on('error', (e: any) => {
        console.log(`[Cloud Function Enrichment] Stream error on ${url}: ${e.message}`);
        resolve(null);
      });
    }).on('error', (e) => {
      console.log(`[Cloud Function Enrichment] Error fetching ${url}: ${e.message}`);
      resolve(null);
    });
  });
}

/**
 * Fetches the actual article page and extracts the first few paragraphs and the lead image
 */
async function fetchArticleData(url: string): Promise<{ description: string | null, imageUrl: string | null }> {
  try {
    // 1. Decode Google News URL
    const realUrl = decodeArticleUrl(url);

    // 2. Fetch HTML
    let html = await fetchWithRedirects(realUrl);
    if (!html) return { description: null, imageUrl: null };

    // 3. Handle intermediate Google pages
    const googleMatch = html.match(/<a[^>]*rel="nofollow"[^>]*href="([^"]*)"/i);
    if (googleMatch) {
        const intermediateUrl = googleMatch[1];
        html = await fetchWithRedirects(intermediateUrl);
        if (!html) return { description: null, imageUrl: null };
    }

    // 4. Extract text from <p> tags
    const paragraphs = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    let description = null;
    if (paragraphs) {
      const cleanParagraphs = paragraphs
        .map(p => p.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').trim())
        .filter(p => {
            return p.length > 120 && 
                   !p.includes('{') && 
                   !p.toLowerCase().includes('subscribe') && 
                   !p.toLowerCase().includes('sign in') &&
                   !p.toLowerCase().includes('weather') &&
                   !p.toLowerCase().includes('epaper') &&
                   !p.toLowerCase().includes('copyright');
        });

      if (cleanParagraphs.length > 0) {
        description = cleanParagraphs.slice(0, 4).join('\n\n');
      }
    }

    // 5. Extract og:image
    const ogImageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"/i);
    const twitterImageMatch = html.match(/<meta[^>]*name="twitter:image"[^>]*content="([^"]*)"/i);
    let imageUrl = (ogImageMatch ? ogImageMatch[1] : (twitterImageMatch ? twitterImageMatch[1] : null));

    // Filter out generic logos
    if (imageUrl && (imageUrl.includes('googleusercontent.com') || imageUrl.includes('gstatic.com') || imageUrl.includes('google.com/news'))) {
        imageUrl = null;
    }

    return { description, imageUrl };
  } catch (e) {
    return { description: null, imageUrl: null };
  }
}

// Set global options for all v2 functions
setGlobalOptions({ maxInstances: 10, region: "us-central1" });

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

/**
 * Processes a single topic: fetches, cleans, and saves news
 */
async function processTopic(topic: string) {
  try {
    const db = getDb();
    const parser = getParser();
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
        console.log(`No direct feed for ${topic}, falling back to Bing News RSS`);
        const feedUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(topic)}&format=rss`;
        try {
            const feed = await parser.parseURL(feedUrl);
            items = feed.items.slice(0, 5);
        } catch (e: any) {
            console.error(`Error fetching Bing News for ${topic}:`, e.message);
        }
    }

    if (items.length === 0) return;

    for (const article of items) {
      if (!article.link || !article.title) continue;

      // Use MD5 hash for a safe and consistent document ID
      const articleHash = crypto.createHash("md5").update(article.link).digest("hex");
      const newsRef = db.collection("news").doc(articleHash);
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

        // ENRICHMENT
        console.log(`[${topic}] Processing story: ${displayTitle}`);
        let imageUrl: string | null = null;
        const content = (article as any).content || article.contentSnippet || "";
        if (content) {
            const imgMatch = content.match(/<img[^>]*src="([^"]*)"/i);
            if (imgMatch && !imgMatch[1].includes('google.com') && !imgMatch[1].includes('gstatic.com')) {
                imageUrl = imgMatch[1];
            }
        }

        const articleData = await fetchArticleData(article.link);
        if (articleData.description) description = articleData.description;
        if (articleData.imageUrl) imageUrl = articleData.imageUrl;

        console.log(`[${topic}] New article found: ${displayTitle} (${source}) - Image: ${imageUrl ? 'YES' : 'NO'}`);
        
        const admin = getAdmin();
        await newsRef.set({
          topic,
          title: displayTitle,
          description: description,
          url: article.link,
          imageUrl: imageUrl,
          time: article.pubDate || new Date().toISOString(),
          source: source,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        await sendNotification(topic, displayTitle);
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 1500));
      }
    }
  } catch (error: any) {
    console.error(`Error in processTopic for ${topic}:`, error.message);
  }
}

// Scheduled function to run every 10 minutes
export const searchNewsAI = onSchedule({
  schedule: "*/10 * * * *",
  timeoutSeconds: 540,
  memory: "512MiB",
}, async (event) => {
  try {
    const db = getDb();
    const topicsSnapshot = await db.collection("topics").get();
    const allTopics = topicsSnapshot.docs.map((doc: any) => doc.data().name);

    if (allTopics.length === 0) {
      console.log("No topics found in Firestore.");
      return;
    }

    console.log(`Starting scheduled news search for ${allTopics.length} topics...`);
    for (const topic of allTopics) {
      await processTopic(topic);
    }
    console.log("Scheduled news search completed successfully.");
  } catch (error) {
    console.error("Critical error in searchNewsAI function:", error);
  }
});

/**
 * Triggered when a new topic is added
 */
export const onTopicCreated = onDocumentCreated("topics/{topicId}", async (event) => {
  const data = event.data?.data();
  if (!data || !data.name) return;
  
  console.log(`[Trigger] New topic added: ${data.name}. Fetching news...`);
  await processTopic(data.name);
});

/**
 * Triggered when a topic is deleted - Cleans up related news
 */
export const onTopicDeleted = onDocumentDeleted("topics/{topicId}", async (event) => {
  const data = event.data?.data();
  if (!data || !data.name) return;
  
  const topicName = data.name;
  console.log(`[Trigger] Topic deleted: ${topicName}. Cleaning up news...`);
  
  const db = getDb();
  const newsRef = db.collection("news");
  const q = newsRef.where("topic", "==", topicName);
  const snapshot = await q.get();
  
  if (snapshot.empty) return;
  
  const batch = db.batch();
  snapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
  await batch.commit();
  console.log(`[Trigger] Deleted ${snapshot.size} news items for topic: ${topicName}`);
});

async function sendNotification(topic: string, title: string) {
  const admin = getAdmin();
  if (admin.apps.length === 0) admin.initializeApp();
  
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
