var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  onTopicCreatedV2: () => onTopicCreatedV2,
  onTopicDeletedV2: () => onTopicDeletedV2,
  searchNewsAiV2: () => searchNewsAiV2,
  subscribeToTopicV2: () => subscribeToTopicV2,
  unsubscribeToTopicV2: () => unsubscribeToTopicV2
});
module.exports = __toCommonJS(index_exports);
var import_scheduler = require("firebase-functions/v2/scheduler");
var import_firestore = require("firebase-functions/v2/firestore");
var import_https = require("firebase-functions/v2/https");
var import_v2 = require("firebase-functions/v2");
var import_app = require("firebase-admin/app");
var import_firestore2 = require("firebase-admin/firestore");

// src/logic.ts
function getAdmin() {
  const admin = require("firebase-admin");
  return admin;
}
function getDb() {
  const admin = require("firebase-admin");
  return admin.firestore();
}
var _parser;
function getParser() {
  if (!_parser) {
    const Parser = require("rss-parser");
    _parser = new Parser();
  }
  return _parser;
}
function decodeArticleUrl(encodedUrl) {
  try {
    const url = new URL(encodedUrl);
    if (url.hostname.includes("bing.com")) {
      const realUrl = url.searchParams.get("url");
      if (realUrl) return realUrl;
    }
    if (url.hostname.includes("news.google.com")) {
      const pathParts = url.pathname.split("/");
      let base64Str = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];
      if (base64Str) base64Str = base64Str.split("?")[0];
      if (!base64Str) return encodedUrl;
      const normalized = base64Str.replace(/-/g, "+").replace(/_/g, "/");
      const buffer = Buffer.from(normalized, "base64");
      const encodings = ["binary", "utf8", "ascii"];
      for (const enc of encodings) {
        const text = buffer.toString(enc);
        const matches = text.match(/https?:\/\/[^\s\x00-\x1f\x7f-\xff]*/g);
        if (matches && matches.length > 0) {
          const filtered = matches.filter((m) => !m.includes("google.com"));
          if (filtered.length > 0) {
            return filtered.sort((a, b) => b.length - a.length)[0];
          }
        }
      }
    }
  } catch (e) {
  }
  return encodedUrl;
}
function fetchWithRedirects(url, depth = 0) {
  const https = require("https");
  const zlib = require("zlib");
  return new Promise((resolve) => {
    if (depth > 5) return resolve(null);
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Referer": "https://www.google.com/",
        "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        "Cookie": "CONSENT=YES+cb.20230501-14-p0.en+FX+386;"
      },
      timeout: 1e4
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
      let stream = res;
      const encoding = res.headers["content-encoding"];
      if (encoding === "gzip") {
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === "deflate") {
        stream = res.pipe(zlib.createInflate());
      }
      let data = "";
      stream.on("data", (chunk) => data += chunk);
      stream.on("end", () => resolve(data));
      stream.on("error", (e) => {
        console.log(`[Cloud Function Enrichment] Stream error on ${url}: ${e.message}`);
        resolve(null);
      });
    }).on("error", (e) => {
      console.log(`[Cloud Function Enrichment] Error fetching ${url}: ${e.message}`);
      resolve(null);
    });
  });
}
async function fetchArticleData(url) {
  try {
    const realUrl = decodeArticleUrl(url);
    let html = await fetchWithRedirects(realUrl);
    if (!html) return { description: null, imageUrl: null };
    const googleMatch = html.match(/<a[^>]*rel="nofollow"[^>]*href="([^"]*)"/i);
    if (googleMatch) {
      const intermediateUrl = googleMatch[1];
      html = await fetchWithRedirects(intermediateUrl);
      if (!html) return { description: null, imageUrl: null };
    }
    const paragraphs = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    let description = null;
    if (paragraphs) {
      const cleanParagraphs = paragraphs.map((p) => p.replace(/<[^>]*>?/gm, "").replace(/\s+/g, " ").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').trim()).filter((p) => {
        return p.length > 120 && !p.includes("{") && !p.toLowerCase().includes("subscribe") && !p.toLowerCase().includes("sign in") && !p.toLowerCase().includes("weather") && !p.toLowerCase().includes("epaper") && !p.toLowerCase().includes("copyright");
      });
      if (cleanParagraphs.length > 0) {
        description = cleanParagraphs.slice(0, 4).join("\n\n");
      }
    }
    const ogImageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"/i);
    const twitterImageMatch = html.match(/<meta[^>]*name="twitter:image"[^>]*content="([^"]*)"/i);
    let imageUrl = ogImageMatch ? ogImageMatch[1] : twitterImageMatch ? twitterImageMatch[1] : null;
    if (imageUrl && (imageUrl.includes("googleusercontent.com") || imageUrl.includes("gstatic.com") || imageUrl.includes("google.com/news"))) {
      imageUrl = null;
    }
    return { description, imageUrl };
  } catch (e) {
    return { description: null, imageUrl: null };
  }
}
var TOPIC_FEEDS = {
  "Kerala": [
    "https://www.thehindu.com/news/national/kerala/feeder/default.rss",
    "https://www.onmanorama.com/rss/news.xml"
  ],
  "India": [
    "https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms",
    "https://www.thehindu.com/news/national/feeder/default.rss"
  ],
  "World": [
    "https://www.aljazeera.com/xml/rss/all.xml",
    "https://timesofindia.indiatimes.com/rssfeeds/29473334.cms"
  ],
  "Technology": [
    "https://gadgets360.com/rss/feeds"
  ]
};
async function processTopic(topic) {
  try {
    const db = getDb();
    const parser = getParser();
    const topicQuery = await db.collection("topics").where("name", "==", topic).limit(1).get();
    let lastProcessedTime = 0;
    let topicDocRef = null;
    if (!topicQuery.empty) {
      const topicDoc = topicQuery.docs[0];
      topicDocRef = topicDoc.ref;
      const data = topicDoc.data();
      if (data.lastProcessedTime) {
        lastProcessedTime = new Date(data.lastProcessedTime).getTime();
      }
    }
    console.log(`--- Processing topic: ${topic} (Last Processed: ${lastProcessedTime ? new Date(lastProcessedTime).toISOString() : "Never"}) ---`);
    let items = [];
    if (TOPIC_FEEDS[topic]) {
      console.log(`Using direct publisher feeds for ${topic}`);
      for (const url of TOPIC_FEEDS[topic]) {
        try {
          const feed = await parser.parseURL(url);
          items = items.concat(feed.items.slice(0, 10));
        } catch (e) {
          console.error(`Error fetching direct feed ${url}:`, e.message);
        }
      }
    } else {
      console.log(`No direct feed for ${topic}, falling back to Bing News RSS`);
      const feedUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(topic)}&format=rss`;
      try {
        const feed = await parser.parseURL(feedUrl);
        items = feed.items.slice(0, 10);
      } catch (e) {
        console.error(`Error fetching Bing News for ${topic}:`, e.message);
      }
    }
    if (items.length === 0) return;
    items.sort((a, b) => {
      const timeA = new Date(a.pubDate || 0).getTime();
      const timeB = new Date(b.pubDate || 0).getTime();
      return timeA - timeB;
    });
    let latestTimeInThisBatch = lastProcessedTime;
    for (const article of items) {
      if (!article.link || !article.title) continue;
      const articleTime = new Date(article.pubDate || 0).getTime();
      if (lastProcessedTime > 0 && articleTime <= lastProcessedTime) {
        continue;
      }
      const todayUTCStart = /* @__PURE__ */ new Date();
      todayUTCStart.setUTCHours(0, 0, 0, 0);
      const todayUTCEnd = todayUTCStart.getTime() + 24 * 60 * 60 * 1e3;
      if (articleTime > 0 && (articleTime < todayUTCStart.getTime() || articleTime >= todayUTCEnd)) {
        console.log(`[${topic}] Skipping old article (not today): ${article.title}`);
        continue;
      }
      const crypto = require("crypto");
      const articleHash = crypto.createHash("md5").update(article.link).digest("hex");
      const newsRef = db.collection("news").doc(articleHash);
      const doc = await newsRef.get();
      if (!doc.exists) {
        let source = "News";
        let displayTitle = article.title;
        let description = article.contentSnippet || article.description || article.content || "";
        description = description.replace(/<[^>]*>?/gm, "").trim();
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
              source = urlObj.hostname.replace("www.", "").split(".")[0];
              source = source.charAt(0).toUpperCase() + source.slice(1);
            } catch (e) {
            }
          }
        }
        if (description.includes("Comprehensive up-to-date")) {
          description = displayTitle;
        }
        console.log(`[${topic}] Processing story: ${displayTitle}`);
        let imageUrl = null;
        const content = article.content || article.contentSnippet || "";
        if (content) {
          const imgMatch = content.match(/<img[^>]*src="([^"]*)"/i);
          if (imgMatch && !imgMatch[1].includes("google.com") && !imgMatch[1].includes("gstatic.com")) {
            imageUrl = imgMatch[1];
          }
        }
        const articleData = await fetchArticleData(article.link);
        if (articleData.description) description = articleData.description;
        if (articleData.imageUrl) imageUrl = articleData.imageUrl;
        console.log(`[${topic}] New article found: ${displayTitle} (${source}) - Image: ${imageUrl ? "YES" : "NO"}`);
        await newsRef.set({
          topic,
          title: displayTitle,
          description,
          url: article.link,
          imageUrl,
          time: article.pubDate || (/* @__PURE__ */ new Date()).toISOString(),
          source,
          timestamp: getAdmin().firestore.FieldValue.serverTimestamp()
        });
        await sendNotification(topic, displayTitle, imageUrl, {
          id: articleHash,
          url: article.link,
          source
        });
        if (articleTime > latestTimeInThisBatch) {
          latestTimeInThisBatch = articleTime;
        }
        await new Promise((r) => setTimeout(r, 1e3 + Math.random() * 1500));
      } else {
        if (articleTime > latestTimeInThisBatch) {
          latestTimeInThisBatch = articleTime;
        }
      }
    }
    if (topicDocRef && latestTimeInThisBatch > lastProcessedTime) {
      await topicDocRef.update({
        lastProcessedTime: new Date(latestTimeInThisBatch).toISOString()
      });
      console.log(`[${topic}] Updated lastProcessedTime to ${new Date(latestTimeInThisBatch).toISOString()}`);
    }
  } catch (error) {
    console.error(`Error in processTopic for ${topic}:`, error.message);
  }
}
async function sendNotification(topic, title, imageUrl, metadata) {
  const admin = getAdmin();
  if (admin.apps.length === 0) admin.initializeApp();
  const topicName = topic.replace(/\s+/g, "_");
  const payload = {
    notification: {
      title: `News Update: ${topic}`,
      body: title
    },
    data: {
      topic,
      title
    },
    topic: topicName
  };
  if (imageUrl) {
    payload.notification.image = imageUrl;
    payload.data.imageUrl = imageUrl;
  }
  if (metadata) {
    if (metadata.id) payload.data.id = metadata.id;
    if (metadata.url) payload.data.url = metadata.url;
    if (metadata.source) payload.data.source = metadata.source;
  }
  try {
    const response = await admin.messaging().send(payload);
    console.log(`Notification sent for topic: ${topic} (Message ID: ${response})`);
  } catch (error) {
    console.error("Error sending notification:", error);
  }
}
async function subscribeToTopic(token, topic) {
  const admin = getAdmin();
  const topicName = topic.replace(/\s+/g, "_");
  try {
    await admin.messaging().subscribeToTopic(token, topicName);
    console.log(`Successfully subscribed token to topic: ${topicName}`);
    return { success: true };
  } catch (error) {
    console.error(`Error subscribing to topic ${topicName}:`, error);
    return { success: false, error: error.message };
  }
}
async function unsubscribeFromTopic(token, topic) {
  const admin = getAdmin();
  const topicName = topic.replace(/\s+/g, "_");
  try {
    await admin.messaging().unsubscribeFromTopic(token, topicName);
    console.log(`Successfully unsubscribed token from topic: ${topicName}`);
    return { success: true };
  } catch (error) {
    console.error(`Error unsubscribing from topic ${topicName}:`, error);
    return { success: false, error: error.message };
  }
}

// src/index.ts
(0, import_v2.setGlobalOptions)({ region: "us-central1" });
if ((0, import_app.getApps)().length === 0) {
  (0, import_app.initializeApp)();
}
var searchNewsAiV2 = (0, import_scheduler.onSchedule)({
  schedule: "*/10 * * * *",
  timeoutSeconds: 540,
  memory: "512MiB"
}, async (event) => {
  try {
    const db = (0, import_firestore2.getFirestore)();
    const topicsSnapshot = await db.collection("topics").get();
    const allTopics = topicsSnapshot.docs.map((doc) => doc.data().name);
    if (allTopics.length === 0) {
      console.log("No topics found in Firestore.");
      return;
    }
    console.log(`Starting scheduled news search for ${allTopics.length} topics...`);
    for (const topic of allTopics) {
      await processTopic(topic);
    }
  } catch (error) {
    console.error("Critical error in searchnewsai function:", error);
  }
});
var onTopicCreatedV2 = (0, import_firestore.onDocumentCreated)("topics/{topicId}", async (event) => {
  const data = event.data?.data();
  const topicId = event.params.topicId;
  console.log(`[Trigger] onCreate fired for ID: ${topicId}. Data:`, JSON.stringify(data));
  const topicName = data?.name || topicId;
  if (!topicName) {
    console.error(`[Trigger] Could not determine topic name for ${topicId}`);
    return;
  }
  console.log(`[Trigger] Fetching news for topic: ${topicName}...`);
  await processTopic(topicName);
  const db = (0, import_firestore2.getFirestore)();
  await db.collection("topics").doc(topicId).update({ status: "ready" });
  console.log(`[Trigger] Topic ${topicName} marked as ready.`);
});
var onTopicDeletedV2 = (0, import_firestore.onDocumentDeleted)("topics/{topicId}", async (event) => {
  const data = event.data?.data();
  const topicId = event.params.topicId;
  const topicName = data?.name || topicId;
  console.log(`[Trigger] onDelete fired for ID: ${topicId}. Determined topic: ${topicName}`);
  if (!topicName) {
    console.error(`[Trigger] Could not determine topic name for ${topicId}`);
    return;
  }
  const db = (0, import_firestore2.getFirestore)();
  const newsRef = db.collection("news");
  const q = newsRef.where("topic", "==", topicName);
  const snapshot = await q.get();
  if (snapshot.empty) return;
  const batch = db.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  console.log(`[Trigger] Deleted ${snapshot.size} news items for topic: ${topicName}`);
});
var subscribeToTopicV2 = (0, import_https.onCall)(async (request) => {
  const { data } = request;
  if (!data || !data.token || !data.topic) {
    throw new import_https.HttpsError("invalid-argument", "The function must be called with a token and topic.");
  }
  return await subscribeToTopic(data.token, data.topic);
});
var unsubscribeToTopicV2 = (0, import_https.onCall)(async (request) => {
  const { data } = request;
  if (!data || !data.token || !data.topic) {
    throw new import_https.HttpsError("invalid-argument", "The function must be called with a token and topic.");
  }
  return await unsubscribeFromTopic(data.token, data.topic);
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  onTopicCreatedV2,
  onTopicDeletedV2,
  searchNewsAiV2,
  subscribeToTopicV2,
  unsubscribeToTopicV2
});
