const admin = require('firebase-admin');
const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');

// Initialize Firebase Admin using Service Account from environment variable
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const parser = new Parser();

async function runSearch() {
  console.log('--- Starting News Search ---');
  
  try {
    const topicsSnapshot = await db.collection('topics').get();
    const allTopics = topicsSnapshot.docs.map(doc => doc.data().name);

    if (allTopics.length === 0) {
      console.log('No topics found. Exiting.');
      return;
    }

    console.log(`Searching for topics: ${allTopics.join(', ')}`);

    // Process all topics in parallel
    await Promise.all(allTopics.map(async (topic) => {
      try {
        console.log(`Fetching news for: ${topic}`);
        const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-IN&gl=IN&ceid=IN:en`;
        const feed = await parser.parseURL(feedUrl);
        
        const articles = feed.items.slice(0, 3);
        if (!articles || articles.length === 0) return;

        // Process articles for this topic in parallel
        await Promise.all(articles.map(async (article) => {
          if (!article.link || !article.title) return;

          const articleHash = Buffer.from(article.link).toString('base64');
          const newsRef = db.collection('news').doc(articleHash);
          const doc = await newsRef.get();

          if (!doc.exists) {
            let source = "Internet";
            let cleanTitle = article.title;
            const splitIndex = article.title.lastIndexOf(" - ");
            if (splitIndex !== -1) {
              source = article.title.substring(splitIndex + 3);
              cleanTitle = article.title.substring(0, splitIndex);
            }

            // Google News RSS returns just the title in the description
            let description = article.contentSnippet || article.content || "";
            // The generic Google News redirect description we want to avoid
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
                 // Fetch the Google News redirect page
                 const initialReponse = await axios.get(article.link, fetchConfig);
                 
                 // Google News uses a c-wiz element with an a tag that has the real URL
                 const initial$ = cheerio.load(initialReponse.data);
                 let realUrl = initial$('a[rel="nofollow"]').attr('href') || article.link;
                 
                 // If that fails, see if it's just a meta refresh
                 if (realUrl === article.link) {
                     const refresh = initial$('meta[http-equiv="Refresh"]').attr('content');
                     if (refresh) {
                         const match = refresh.match(/URL=['"]?([^'"]+)['"]?/i);
                         if (match) realUrl = match[1];
                     }
                 }

                 // Now fetch the real article page
                 const articleHtml = await axios.get(realUrl, fetchConfig);
                 const $ = cheerio.load(articleHtml.data);
                 description = $('meta[property="og:description"]').attr('content') || 
                               $('meta[name="description"]').attr('content') || 
                               cleanTitle;
               } catch(e) {
                 console.log(`Could not scrape description for ${cleanTitle}: ${e.message}`);
                 description = cleanTitle; // fallback
               }
            }

            console.log(`[${topic}] New article found: ${cleanTitle}`);
            await newsRef.set({
              topic,
              title: cleanTitle,
              description: description,
              url: article.link,
              imageUrl: null,
              time: article.pubDate || new Date().toISOString(),
              source: source,
              timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            // Trigger Push Notification
            await sendNotification(topic, cleanTitle);
          }
        }));
      } catch (error) {
        console.error(`Error searching news for topic ${topic}:`, error.message);
      }
    }));
  } catch (error) {
    console.error('Critical Error:', error.message);
  }
}

async function sendNotification(topic, title) {
  const payload = {
    notification: {
      title: `Match found for: ${topic}`,
      body: title,
    },
    topic: topic.replace(/\s+/g, '_') // Subscribe users to topics
  };

  try {
    await admin.messaging().send(payload);
    console.log(`Notification sent for topic: ${topic}`);
  } catch (error) {
    console.error('Error sending notification:', error.message);
  }
}

runSearch().then(() => {
  console.log('--- News Search Finished ---');
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
