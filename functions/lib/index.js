"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.onTopicDeleted = exports.onTopicCreated = exports.searchNewsAI = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-functions/v2/firestore");
const v2_1 = require("firebase-functions/v2");
const admin = __importStar(require("firebase-admin"));
const rss_parser_1 = __importDefault(require("rss-parser"));
const https = __importStar(require("https"));
const zlib = __importStar(require("zlib"));
const crypto = __importStar(require("crypto"));
admin.initializeApp();
function decodeArticleUrl(encodedUrl) {
    try {
        const url = new URL(encodedUrl);
        if (url.hostname.includes('bing.com')) {
            const realUrl = url.searchParams.get('url');
            if (realUrl)
                return realUrl;
        }
        if (url.hostname.includes('news.google.com')) {
            const pathParts = url.pathname.split('/');
            let base64Str = pathParts[pathParts.length - 1] || pathParts[pathParts.length - 2];
            if (base64Str)
                base64Str = base64Str.split('?')[0];
            if (!base64Str)
                return encodedUrl;
            const normalized = base64Str.replace(/-/g, '+').replace(/_/g, '/');
            const buffer = Buffer.from(normalized, 'base64');
            const encodings = ['binary', 'utf8', 'ascii'];
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
    }
    catch (e) { }
    return encodedUrl;
}
function fetchWithRedirects(url, depth = 0) {
    return new Promise((resolve) => {
        if (depth > 5)
            return resolve(null);
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
            let stream = res;
            const encoding = res.headers['content-encoding'];
            if (encoding === 'gzip') {
                stream = res.pipe(zlib.createGunzip());
            }
            else if (encoding === 'deflate') {
                stream = res.pipe(zlib.createInflate());
            }
            let data = '';
            stream.on('data', (chunk) => data += chunk);
            stream.on('end', () => resolve(data));
            stream.on('error', (e) => {
                console.log(`[Cloud Function Enrichment] Stream error on ${url}: ${e.message}`);
                resolve(null);
            });
        }).on('error', (e) => {
            console.log(`[Cloud Function Enrichment] Error fetching ${url}: ${e.message}`);
            resolve(null);
        });
    });
}
async function fetchArticleData(url) {
    try {
        const realUrl = decodeArticleUrl(url);
        let html = await fetchWithRedirects(realUrl);
        if (!html)
            return { description: null, imageUrl: null };
        const googleMatch = html.match(/<a[^>]*rel="nofollow"[^>]*href="([^"]*)"/i);
        if (googleMatch) {
            const intermediateUrl = googleMatch[1];
            html = await fetchWithRedirects(intermediateUrl);
            if (!html)
                return { description: null, imageUrl: null };
        }
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
        const ogImageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"/i);
        const twitterImageMatch = html.match(/<meta[^>]*name="twitter:image"[^>]*content="([^"]*)"/i);
        let imageUrl = (ogImageMatch ? ogImageMatch[1] : (twitterImageMatch ? twitterImageMatch[1] : null));
        if (imageUrl && (imageUrl.includes('googleusercontent.com') || imageUrl.includes('gstatic.com') || imageUrl.includes('google.com/news'))) {
            imageUrl = null;
        }
        return { description, imageUrl };
    }
    catch (e) {
        return { description: null, imageUrl: null };
    }
}
(0, v2_1.setGlobalOptions)({ maxInstances: 10, region: "us-central1" });
const db = admin.firestore();
const parser = new rss_parser_1.default();
const TOPIC_FEEDS = {
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
async function processTopic(topic) {
    try {
        console.log(`--- Processing topic: ${topic} ---`);
        let items = [];
        if (TOPIC_FEEDS[topic]) {
            console.log(`Using direct publisher feeds for ${topic}`);
            for (const url of TOPIC_FEEDS[topic]) {
                try {
                    const feed = await parser.parseURL(url);
                    items = items.concat(feed.items.slice(0, 5));
                }
                catch (e) {
                    console.error(`Error fetching direct feed ${url}:`, e.message);
                }
            }
        }
        else {
            console.log(`No direct feed for ${topic}, falling back to Bing News RSS`);
            const feedUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(topic)}&format=rss`;
            try {
                const feed = await parser.parseURL(feedUrl);
                items = feed.items.slice(0, 5);
            }
            catch (e) {
                console.error(`Error fetching Bing News for ${topic}:`, e.message);
            }
        }
        if (items.length === 0)
            return;
        for (const article of items) {
            if (!article.link || !article.title)
                continue;
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
                }
                else {
                    const splitIndex = article.title.lastIndexOf(" - ");
                    if (splitIndex !== -1) {
                        source = article.title.substring(splitIndex + 3);
                        displayTitle = article.title.substring(0, splitIndex);
                    }
                    else {
                        try {
                            const urlObj = new URL(article.link);
                            source = urlObj.hostname.replace('www.', '').split('.')[0];
                            source = source.charAt(0).toUpperCase() + source.slice(1);
                        }
                        catch (e) { }
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
                    if (imgMatch && !imgMatch[1].includes('google.com') && !imgMatch[1].includes('gstatic.com')) {
                        imageUrl = imgMatch[1];
                    }
                }
                const articleData = await fetchArticleData(article.link);
                if (articleData.description)
                    description = articleData.description;
                if (articleData.imageUrl)
                    imageUrl = articleData.imageUrl;
                console.log(`[${topic}] New article found: ${displayTitle} (${source}) - Image: ${imageUrl ? 'YES' : 'NO'}`);
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
    }
    catch (error) {
        console.error(`Error in processTopic for ${topic}:`, error.message);
    }
}
exports.searchNewsAI = (0, scheduler_1.onSchedule)({
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
        console.log(`Starting scheduled news search for ${allTopics.length} topics...`);
        for (const topic of allTopics) {
            await processTopic(topic);
        }
        console.log("Scheduled news search completed successfully.");
    }
    catch (error) {
        console.error("Critical error in searchNewsAI function:", error);
    }
});
exports.onTopicCreated = (0, firestore_1.onDocumentCreated)("topics/{topicId}", async (event) => {
    var _a;
    const data = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!data || !data.name)
        return;
    console.log(`[Trigger] New topic added: ${data.name}. Fetching news...`);
    await processTopic(data.name);
});
exports.onTopicDeleted = (0, firestore_1.onDocumentDeleted)("topics/{topicId}", async (event) => {
    var _a;
    const data = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!data || !data.name)
        return;
    const topicName = data.name;
    console.log(`[Trigger] Topic deleted: ${topicName}. Cleaning up news...`);
    const newsRef = db.collection("news");
    const q = newsRef.where("topic", "==", topicName);
    const snapshot = await q.get();
    if (snapshot.empty)
        return;
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    console.log(`[Trigger] Deleted ${snapshot.size} news items for topic: ${topicName}`);
});
async function sendNotification(topic, title) {
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
    }
    catch (error) {
        console.error("Error sending notification:", error);
    }
}
//# sourceMappingURL=index.js.map