import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated, onDocumentDeleted } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";

// Set global options for all functions
setGlobalOptions({ region: "us-central1" });

/**
 * Scheduled function to search for news using AI and RSS (Gen 2)
 */
export const searchNewsAiV2 = onSchedule({
  schedule: "*/10 * * * *",
  timeoutSeconds: 540,
  memory: "512MiB",
}, async (event) => {
  const { getFirestore } = await import("firebase-admin/firestore");
  const logic = await import("./logic");
  
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
  const { getFirestore } = await import("firebase-admin/firestore");
  const logic = await import("./logic");
  
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
  const { getFirestore } = await import("firebase-admin/firestore");
  
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
  const logic = await import("./logic");
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
  const logic = await import("./logic");
  const { data } = request;
  if (!data || !data.token || !data.topic) {
    throw new HttpsError('invalid-argument', 'The function must be called with a token and topic.');
  }

  return await logic.unsubscribeFromTopic(data.token, data.topic);
});

/**
 * TEST VERSION: Renamed and moved token to environment or hardcoded for now
 */
export const telegramMonitor = onSchedule({
  schedule: "*/2 * * * *",
  timeoutSeconds: 120,
  memory: "256MiB",
}, async (_event) => {
  // Using a test token or reading from env directly to avoid Secret Manager metadata hang
  const botToken = process.env.TELEGRAM_BOT_TOKEN || "";
  if (!botToken) return;

  const { getFirestore } = await import("firebase-admin/firestore");
  const logic = await import("./logic");
  const db = getFirestore();

  const [channelsSnap, keywordsSnap] = await Promise.all([
    db.collection("telegramChannels").get(),
    db.collection("telegramKeywords").get(),
  ]);

  if (channelsSnap.empty || keywordsSnap.empty) return;

  const keywords = keywordsSnap.docs.map((d: any) => d.data().keyword as string).filter(Boolean);

  for (const channelDoc of channelsSnap.docs) {
    const channelData = channelDoc.data();
    try {
      const matches = await logic.pollTelegramChannel(botToken, channelData.username, channelData.lastMessageId || 0, keywords);
      if (matches.length === 0) continue;

      let newLastId = channelData.lastMessageId || 0;
      for (const match of matches) {
        await logic.sendTelegramKeywordNotification(channelData.username, match.matchedKeyword, match.matchedText);
        if (match.newLastId > newLastId) newLastId = match.newLastId;
      }
      await db.collection("telegramChannels").doc(channelDoc.id).update({ lastMessageId: newLastId });
    } catch (err) {}
  }
});



