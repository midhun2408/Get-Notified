var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/logic.ts
var logic_exports = {};
__export(logic_exports, {
  TOPIC_FEEDS: () => TOPIC_FEEDS,
  decodeArticleUrl: () => decodeArticleUrl,
  fetchArticleData: () => fetchArticleData,
  fetchWithRedirects: () => fetchWithRedirects,
  getAdmin: () => getAdmin,
  getDb: () => getDb,
  getParser: () => getParser,
  processTopic: () => processTopic,
  sendNotification: () => sendNotification,
  subscribeToTopic: () => subscribeToTopic,
  unsubscribeFromTopic: () => unsubscribeFromTopic
});
function getAdmin() {
  return admin;
}
function getDb() {
  return admin.firestore();
}
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
        await sendNotification(topic, displayTitle, imageUrl);
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
async function sendNotification(topic, title, imageUrl) {
  const admin3 = getAdmin();
  if (admin3.apps.length === 0) admin3.initializeApp();
  const payload = {
    notification: {
      title: `News Update: ${topic}`,
      body: title
    },
    topic: topic.replace(/\s+/g, "_")
  };
  if (imageUrl) {
    payload.notification.imageUrl = imageUrl;
  }
  try {
    await admin3.messaging().send(payload);
    console.log(`Notification sent for topic: ${topic} with image: ${imageUrl ? "YES" : "NO"}`);
  } catch (error) {
    console.error("Error sending notification:", error);
  }
}
async function subscribeToTopic(token, topic) {
  const admin3 = getAdmin();
  const topicName = topic.replace(/\s+/g, "_");
  try {
    await admin3.messaging().subscribeToTopic(token, topicName);
    console.log(`Successfully subscribed token to topic: ${topicName}`);
    return { success: true };
  } catch (error) {
    console.error(`Error subscribing to topic ${topicName}:`, error);
    return { success: false, error: error.message };
  }
}
async function unsubscribeFromTopic(token, topic) {
  const admin3 = getAdmin();
  const topicName = topic.replace(/\s+/g, "_");
  try {
    await admin3.messaging().unsubscribeFromTopic(token, topicName);
    console.log(`Successfully unsubscribed token from topic: ${topicName}`);
    return { success: true };
  } catch (error) {
    console.error(`Error unsubscribing from topic ${topicName}:`, error);
    return { success: false, error: error.message };
  }
}
var admin, https, zlib, crypto, _parser, TOPIC_FEEDS;
var init_logic = __esm({
  "src/logic.ts"() {
    admin = __toESM(require("firebase-admin"));
    https = __toESM(require("https"));
    zlib = __toESM(require("zlib"));
    crypto = __toESM(require("crypto"));
    TOPIC_FEEDS = {
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
  }
});

// src/index.ts
var index_exports = {};
__export(index_exports, {
  onTopicCreated: () => onTopicCreated,
  onTopicDeleted: () => onTopicDeleted,
  searchNewsAI: () => searchNewsAI,
  subscribeToTopic: () => subscribeToTopic2,
  unsubscribeToTopic: () => unsubscribeToTopic
});
module.exports = __toCommonJS(index_exports);
var functionsV1 = __toESM(require("firebase-functions/v1"));
var admin2 = __toESM(require("firebase-admin"));
if (admin2.apps.length === 0) {
  admin2.initializeApp();
}
var searchNewsAI = functionsV1.runWith({
  timeoutSeconds: 540,
  memory: "512MB"
}).region("us-central1").pubsub.schedule("*/10 * * * *").onRun(async (context) => {
  const { getDb: getDb2, processTopic: processTopic2 } = (init_logic(), __toCommonJS(logic_exports));
  try {
    const db = getDb2();
    const topicsSnapshot = await db.collection("topics").get();
    const allTopics = topicsSnapshot.docs.map((doc) => doc.data().name);
    if (allTopics.length === 0) {
      console.log("No topics found in Firestore.");
      return;
    }
    console.log(`Starting scheduled news search for ${allTopics.length} topics...`);
    for (const topic of allTopics) {
      await processTopic2(topic);
    }
  } catch (error) {
    console.error("Critical error in searchNewsAI function:", error);
  }
});
var onTopicCreated = functionsV1.region("us-central1").firestore.document("topics/{topicId}").onCreate(async (doc, context) => {
  const { getDb: getDb2, processTopic: processTopic2 } = (init_logic(), __toCommonJS(logic_exports));
  const data = doc.data();
  const topicId = context.params.topicId;
  console.log(`[Trigger] onCreate fired for ID: ${topicId}. Data:`, JSON.stringify(data));
  const topicName = data?.name || topicId;
  if (!topicName) {
    console.error(`[Trigger] Could not determine topic name for ${topicId}`);
    return;
  }
  console.log(`[Trigger] Fetching news for topic: ${topicName}...`);
  await processTopic2(topicName);
  const db = getDb2();
  await db.collection("topics").doc(topicId).update({ status: "ready" });
  console.log(`[Trigger] Topic ${topicName} marked as ready.`);
});
var onTopicDeleted = functionsV1.region("us-central1").firestore.document("topics/{topicId}").onDelete(async (doc, context) => {
  const { getDb: getDb2 } = (init_logic(), __toCommonJS(logic_exports));
  const data = doc.data();
  const topicId = context.params.topicId;
  const topicName = data?.name || topicId;
  console.log(`[Trigger] onDelete fired for ID: ${topicId}. Determined topic: ${topicName}`);
  if (!topicName) {
    console.error(`[Trigger] Could not determine topic name for ${topicId}`);
    return;
  }
  const db = getDb2();
  const newsRef = db.collection("news");
  const q = newsRef.where("topic", "==", topicName);
  const snapshot = await q.get();
  if (snapshot.empty) return;
  const batch = db.batch();
  snapshot.docs.forEach((doc2) => batch.delete(doc2.ref));
  await batch.commit();
  console.log(`[Trigger] Deleted ${snapshot.size} news items for topic: ${topicName}`);
});
var subscribeToTopic2 = functionsV1.region("us-central1").https.onCall(async (data, context) => {
  const { subscribeToTopic: logicSubscribe } = (init_logic(), __toCommonJS(logic_exports));
  const { token, topic } = data;
  if (!token || !topic) {
    throw new functionsV1.https.HttpsError("invalid-argument", "The function must be called with a token and topic.");
  }
  return await logicSubscribe(token, topic);
});
var unsubscribeToTopic = functionsV1.region("us-central1").https.onCall(async (data, context) => {
  const { unsubscribeFromTopic: logicUnsubscribe } = (init_logic(), __toCommonJS(logic_exports));
  const { token, topic } = data;
  if (!token || !topic) {
    throw new functionsV1.https.HttpsError("invalid-argument", "The function must be called with a token and topic.");
  }
  return await logicUnsubscribe(token, topic);
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  onTopicCreated,
  onTopicDeleted,
  searchNewsAI,
  subscribeToTopic,
  unsubscribeToTopic
});
