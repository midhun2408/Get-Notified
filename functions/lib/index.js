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
exports.searchNewsAI = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const v2_1 = require("firebase-functions/v2");
const admin = __importStar(require("firebase-admin"));
const rss_parser_1 = __importDefault(require("rss-parser"));
const https = __importStar(require("https"));
admin.initializeApp();
const urlModule = __importStar(require("url"));
function fetchWithRedirects(url, depth = 0) {
    return new Promise((resolve) => {
        if (depth > 5)
            return resolve(null);
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
                'Cookie': 'CONSENT=YES+cb.20230501-14-p0.en+FX+386;'
            },
            timeout: 8000
        };
        https.get(url, options, (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const nextUrl = urlModule.resolve(url, res.headers.location);
                return resolve(fetchWithRedirects(nextUrl, depth + 1));
            }
            if (res.statusCode !== 200)
                return resolve(null);
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', () => resolve(null));
    });
}
async function fetchArticleData(url) {
    try {
        let html = await fetchWithRedirects(url);
        if (!html)
            return { description: null, imageUrl: null };
        const googleMatch = html.match(/<a[^>]*rel="nofollow"[^>]*href="([^"]*)"/i);
        if (googleMatch) {
            const realUrl = googleMatch[1];
            html = await fetchWithRedirects(realUrl);
            if (!html)
                return { description: null, imageUrl: null };
        }
        const paragraphs = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
        let description = null;
        if (paragraphs) {
            const cleanParagraphs = paragraphs
                .map(p => p.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim())
                .filter(p => p.length > 120 && !p.includes('{') && !p.includes('Subscribe') && !p.includes('Sign in'));
            if (cleanParagraphs.length > 0) {
                description = cleanParagraphs.slice(0, 4).join('\n\n');
            }
        }
        const ogImageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"/i);
        const twitterImageMatch = html.match(/<meta[^>]*name="twitter:image"[^>]*content="([^"]*)"/i);
        const imageUrl = (ogImageMatch ? ogImageMatch[1] : (twitterImageMatch ? twitterImageMatch[1] : null));
        return { description, imageUrl };
    }
    catch (e) {
        return { description: null, imageUrl: null };
    }
}
(0, v2_1.setGlobalOptions)({ maxInstances: 10 });
const db = admin.firestore();
const parser = new rss_parser_1.default();
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
        console.log(`Starting news search for ${allTopics.length} topics...`);
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
        console.log(`Searching for topics: ${allTopics.join(', ')}`);
        for (const topic of allTopics) {
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
                    console.log(`No direct feed for ${topic}, falling back to Google News`);
                    const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-IN&gl=IN&ceid=IN:en`;
                    try {
                        const feed = await parser.parseURL(feedUrl);
                        items = feed.items.slice(0, 5);
                    }
                    catch (e) {
                        console.error(`Error fetching Google News for ${topic}:`, e.message);
                    }
                }
                if (items.length === 0)
                    continue;
                for (const article of items) {
                    if (!article.link || !article.title)
                        continue;
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
                        console.log(`[${topic}] Fetching article data for: ${displayTitle}`);
                        const articleData = await fetchArticleData(article.link);
                        if (articleData.description) {
                            description = articleData.description;
                        }
                        const imageUrl = articleData.imageUrl;
                        console.log(`[${topic}] New article found: ${displayTitle} (${source})`);
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
                    }
                }
            }
            catch (error) {
                console.error(`Error searching news for topic ${topic}:`, error.message);
            }
        }
        console.log("News search completed successfully.");
    }
    catch (error) {
        console.error("Critical error in searchNewsAI function:", error);
    }
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