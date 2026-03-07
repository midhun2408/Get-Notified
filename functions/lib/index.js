"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchNewsAI = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const axios_1 = require("axios");
const v2_1 = require("firebase-functions/v2");
admin.initializeApp();
(0, v2_1.setGlobalOptions)({ maxInstances: 10 });
const db = admin.firestore();
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
                const apiKey = process.env.GNEWS_API_KEY || "REPLACE_WITH_YOUR_GNEWS_API_KEY";
                const response = await axios_1.default.get(`https://gnews.io/api/v4/search?q=${encodeURIComponent(topic)}&token=${apiKey}&lang=en&max=3`);
                const articles = response.data.articles;
                if (!articles || articles.length === 0)
                    return;
                await Promise.all(articles.map(async (article) => {
                    const articleHash = Buffer.from(article.url).toString("base64");
                    const newsRef = db.collection("news").doc(articleHash);
                    const doc = await newsRef.get();
                    if (!doc.exists) {
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
                        await sendNotification(topic, article.title);
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