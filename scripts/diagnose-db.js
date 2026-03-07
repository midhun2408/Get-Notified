const admin = require('firebase-admin');
const serviceAccount = require('d:/Downloads/get-notifiy-firebase-adminsdk-fbsvc-f31a7e89a6.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function diagnose() {
  console.log('--- Database Diagnosis ---');
  
  const topicsSnapshot = await db.collection('topics').get();
  console.log(`Topics found: ${topicsSnapshot.size}`);
  topicsSnapshot.forEach(doc => {
    console.log(` - [${doc.id}]: ${JSON.stringify(doc.data())}`);
  });

  const newsSnapshot = await db.collection('news').limit(5).get();
  console.log(`\nNews items found (top 5): ${newsSnapshot.size}`);
  newsSnapshot.forEach(doc => {
    console.log(` - [${doc.id}]: ${doc.data().title} (Topic: ${doc.data().topic})`);
  });
}

diagnose().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
