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
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
admin.initializeApp();
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
        await Promise.all(allTopics.map(async (topic) => {
            try {
                const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-IN&gl=IN&ceid=IN:en`;
                const feed = await parser.parseURL(feedUrl);
                const articles = feed.items.slice(0, 3);
                if (!articles || articles.length === 0)
                    return;
                await Promise.all(articles.map(async (article) => {
                    if (!article.link || !article.title)
                        return;
                    const articleHash = Buffer.from(article.link).toString("base64");
                    const newsRef = db.collection("news").doc(articleHash);
                    const doc = await newsRef.get();
                    if (!doc.exists) {
                        let source = "Internet";
                        let cleanTitle = article.title;
                        const splitIndex = article.title.lastIndexOf(" - ");
                        if (splitIndex !== -1) {
                            source = article.title.substring(splitIndex + 3);
                            cleanTitle = article.title.substring(0, splitIndex);
                        }
                        let description = article.contentSnippet || article.content || "";
                        const genericGoogleDesc = "Comprehensive up-to-date news coverage, aggregated from sources all over the world by Google News.";
                        const fetchConfig = {
                            timeout: 8000,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36',
                                'Cookie': 'CONSENT=YES+cb.20230501-14-p0.en+FX+386;'
                            }
                        };
                        if (!description || description.includes(cleanTitle) || description === genericGoogleDesc) {
                            try {
                                const initialReponse = await axios_1.default.get(article.link, fetchConfig);
                                const initial$ = cheerio.load(initialReponse.data);
                                let realUrl = initial$('a[rel="nofollow"]').attr('href') || article.link;
                                if (realUrl === article.link) {
                                    const refresh = initial$('meta[http-equiv="Refresh"]').attr('content');
                                    if (refresh) {
                                        const match = refresh.match(/URL=['"]?([^'"]+)['"]?/i);
                                        if (match)
                                            realUrl = match[1];
                                    }
                                }
                                const articleHtml = await axios_1.default.get(realUrl, fetchConfig);
                                const $ = cheerio.load(articleHtml.data);
                                description = $('meta[property="og:description"]').attr('content') ||
                                    $('meta[name="description"]').attr('content') ||
                                    cleanTitle;
                            }
                            catch (e) {
                                console.log(`Could not scrape description for ${cleanTitle}: ${e.message}`);
                                description = cleanTitle;
                            }
                        }
                        await newsRef.set({
                            topic,
                            title: cleanTitle,
                            description: description,
                            url: article.link,
                            image: null,
                            publishedAt: article.pubDate || new Date().toISOString(),
                            source: source,
                            timestamp: admin.firestore.FieldValue.serverTimestamp()
                        });
                        await sendNotification(topic, cleanTitle);
                    }
                }));
            }
            catch (error) {
                console.error(`Error searching news for topic ${topic}:`, error);
            }
        }));
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