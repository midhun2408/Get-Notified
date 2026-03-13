import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated, onDocumentDeleted } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as logic from "./logic";

// Set global options for all functions
setGlobalOptions({ region: "us-central1" });

// Initialize admin on load
if (getApps().length === 0) {
  initializeApp();
}

/**
 * Scheduled function to search for news using AI and RSS (Gen 2)
 */
export const searchNewsAiV2 = onSchedule({
  schedule: "*/10 * * * *",
  timeoutSeconds: 540,
  memory: "512MiB",
}, async (event) => {
  try {
    const db = getFirestore();
    const topicsSnapshot = await db.collection("topics").get();
    const allTopics = topicsSnapshot.docs.map((doc: any) => doc.data().name);

    if (allTopics.length === 0) {
      console.log("No topics found in Firestore.");
      return;
    }

    console.log(`Starting scheduled news search for ${allTopics.length} topics...`);
    for (const topic of allTopics) {
      await logic.processTopic(topic);
    }
  } catch (error) {
    console.error("Critical error in searchnewsai function:", error);
  }
});

/**
 * Triggered when a new topic is added (Gen 2)
 */
export const onTopicCreatedV2 = onDocumentCreated("topics/{topicId}", async (event) => {
  const data = event.data?.data();
  const topicId = event.params.topicId;

  console.log(`[Trigger] onCreate fired for ID: ${topicId}. Data:`, JSON.stringify(data));

  const topicName = data?.name || topicId;
  if (!topicName) {
    console.error(`[Trigger] Could not determine topic name for ${topicId}`);
    return;
  }

  console.log(`[Trigger] Fetching news for topic: ${topicName}...`);
  await logic.processTopic(topicName);

  // Mark topic as ready so the frontend knows news is available
  const db = getFirestore();
  await db.collection("topics").doc(topicId).update({ status: 'ready' });
  console.log(`[Trigger] Topic ${topicName} marked as ready.`);
});

/**
 * Triggered when a topic is deleted (Gen 2)
 */
export const onTopicDeletedV2 = onDocumentDeleted("topics/{topicId}", async (event) => {
  const data = event.data?.data();
  const topicId = event.params.topicId;
  const topicName = data?.name || topicId;

  console.log(`[Trigger] onDelete fired for ID: ${topicId}. Determined topic: ${topicName}`);

  if (!topicName) {
    console.error(`[Trigger] Could not determine topic name for ${topicId}`);
    return;
  }

  const db = getFirestore();
  const newsRef = db.collection("news");
  const q = newsRef.where("topic", "==", topicName);
  const snapshot = await q.get();

  if (snapshot.empty) return;

  const batch = db.batch();
  snapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
  await batch.commit();
  console.log(`[Trigger] Deleted ${snapshot.size} news items for topic: ${topicName}`);
});

/**
 * Callable function to subscribe a device to a topic (Gen 2)
 */
export const subscribeToTopicV2 = onCall(async (request) => {
  const { data } = request;
  if (!data || !data.token || !data.topic) {
    throw new HttpsError('invalid-argument', 'The function must be called with a token and topic.');
  }

  return await logic.subscribeToTopic(data.token, data.topic);
});

/**
 * Callable function to unsubscribe a device from a topic (Gen 2)
 */
export const unsubscribeToTopicV2 = onCall(async (request) => {
  const { data } = request;
  if (!data || !data.token || !data.topic) {
    throw new HttpsError('invalid-argument', 'The function must be called with a token and topic.');
  }

  return await logic.unsubscribeFromTopic(data.token, data.topic);
});
