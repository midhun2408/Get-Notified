const admin = require('firebase-admin');

const serviceAccount = require('d:/Downloads/get-notifiy-firebase-adminsdk-fbsvc-f31a7e89a6.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function deleteCollection(collectionPath, batchSize) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.orderBy('__name__').limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(db, query, resolve).catch(reject);
  });
}

async function deleteQueryBatch(db, query, resolve) {
  const snapshot = await query.get();

  const batchSize = snapshot.size;
  if (batchSize === 0) {
    resolve();
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  process.nextTick(() => {
    deleteQueryBatch(db, query, resolve);
  });
}

async function run() {
  console.log("Deleting all news...");
  await deleteCollection('news', 500);
  console.log("Database news cleared successfully.");
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
