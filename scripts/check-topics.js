const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function checkTopics() {
    const snapshot = await db.collection('topics').get();
    console.log('Topics in DB:');
    snapshot.forEach(doc => {
        console.log(` - ${doc.id}: ${JSON.stringify(doc.data())}`);
    });
}

checkTopics().then(() => process.exit(0));
