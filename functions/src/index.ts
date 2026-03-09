import * as functionsV1 from "firebase-functions/v1";
import * as admin from "firebase-admin";

// Initialize at the top level to ensure the default app is always available
admin.initializeApp();

export const searchNewsAI = functionsV1
  .runWith({
    timeoutSeconds: 540,
    memory: "512MB"
  })
  .region("us-central1")
  .pubsub
  .schedule("*/10 * * * *")
  .onRun(async (context) => {
    const { getDb, processTopic } = require("./logic");
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
    } catch (error) {
      console.error("Critical error in searchNewsAI function:", error);
    }
  });

/**
 * Triggered when a new topic is added (Gen 1)
 */
export const onTopicCreated = functionsV1.region("us-central1").firestore.document("topics/{topicId}").onCreate(async (doc, context) => {
  const { processTopic, getDb } = require("./logic");
  const data = doc.data();
  const topicId = context.params.topicId;
  
  console.log(`[Trigger] onCreate fired for ID: ${topicId}. Data:`, JSON.stringify(data));
  
  const topicName = data?.name || topicId;
  if (!topicName) {
    console.error(`[Trigger] Could not determine topic name for ${topicId}`);
    return;
  }
  
  console.log(`[Trigger] Fetching news for topic: ${topicName}...`);
  await processTopic(topicName);
  
  // Mark topic as ready so the frontend knows news is available
  const db = getDb();
  await db.collection("topics").doc(topicId).update({ status: 'ready' });
  console.log(`[Trigger] Topic ${topicName} marked as ready.`);
});

/**
 * Triggered when a topic is deleted (Gen 1)
 */
export const onTopicDeleted = functionsV1.region("us-central1").firestore.document("topics/{topicId}").onDelete(async (doc, context) => {
  const { getDb } = require("./logic");
  const data = doc.data();
  const topicId = context.params.topicId;
  const topicName = data?.name || topicId;
  
  console.log(`[Trigger] onDelete fired for ID: ${topicId}. Determined topic: ${topicName}`);
  
  if (!topicName) {
    console.error(`[Trigger] Could not determine topic name for ${topicId}`);
    return;
  }
  
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
