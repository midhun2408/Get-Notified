import { FirebaseLite } from './firebase-lite';
import Parser from 'rss-parser';

const TOPIC_FEEDS: { [key: string]: string[] } = {
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

export async function processAllTopics(firebase: FirebaseLite) {
  const topics = await firebase.listDocuments('topics');
  if (topics.length === 0) {
    console.log("No topics found in Firestore.");
    return;
  }

  console.log(`Starting news search for ${topics.length} topics...`);
  for (const topic of topics) {
    await processTopic(firebase, topic.name, topic.id, topic.lastProcessedTime);
  }
}

export async function processTopic(firebase: FirebaseLite, topicName: string, topicId: string, lastProcessedTimeStr?: string) {
  let lastProcessedTime = lastProcessedTimeStr ? new Date(lastProcessedTimeStr).getTime() : 0;
  let latestTimeInThisBatch = lastProcessedTime;

  try {
    const parser = new Parser();

    console.log(`--- Processing topic: ${topicName} (Last Processed: ${lastProcessedTimeStr || 'Never'}) ---`);
    let items: any[] = [];

    const fetchOptions = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/xml,application/rss+xml,text/xml;q=0.9'
      }
    };

    if (TOPIC_FEEDS[topicName]) {
      console.log(`Using direct publisher feeds for ${topicName}`);
      for (const url of TOPIC_FEEDS[topicName]) {
        try {
          const res = await fetch(url, fetchOptions);
          if (!res.ok) throw new Error(`Status ${res.status}`);
          const text = await res.text();
          const feed = await parser.parseString(text);
          console.log(`[${topicName}] Feed ${url} parsed. Items: ${feed.items?.length || 0}`);
          
          await firebase.createDocument('debug_logs', {
            topic: topicName,
            status: 'parsed',
            url: url,
            count: feed.items?.length || 0,
            timestamp: new Date().toISOString()
          });

          items = items.concat(feed.items.slice(0, 10));
        } catch (e: any) {
          console.error(`Error fetching direct feed ${url}:`, e.message);
        }
      }
    } else {
      console.log(`No direct feed for ${topicName}, falling back to Bing News RSS`);
      const feedUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(topicName)}&format=rss`;
      try {
        const res = await fetch(feedUrl, fetchOptions);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const text = await res.text();
        const feed = await parser.parseString(text);
        console.log(`[${topicName}] Bing feed parsed. Items: ${feed.items?.length || 0}`);
        
        await firebase.createDocument('debug_logs', {
          topic: topicName,
          status: 'parsed_bing',
          url: feedUrl,
          count: feed.items?.length || 0,
          timestamp: new Date().toISOString()
        });

        items = feed.items.slice(0, 10);
      } catch (e: any) {
        console.error(`Error fetching Bing News for ${topicName}:`, e.message);
      }
    }

    if (items.length === 0) return;

    // Sort items by date ascending (oldest first)
    items.sort((a, b) => {
      const timeA = new Date(a.pubDate || 0).getTime();
      const timeB = new Date(b.pubDate || 0).getTime();
      return timeA - timeB;
    });

    latestTimeInThisBatch = lastProcessedTime;

    for (const article of items) {
      if (!article.link || !article.title) continue;

      const articleTime = new Date(article.pubDate || 0).getTime();

      // SKIP if article is older than or equal to what we've already processed
      if (lastProcessedTime > 0 && articleTime <= lastProcessedTime) continue;

      // Generate a simple ID from the URL safely via digest
      const encoder = new TextEncoder();
      const linkData = encoder.encode(article.link);
      const hashBuffer = await crypto.subtle.digest('SHA-256', linkData);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const articleId = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
      
      // Check if exists
      const existing = await firebase.getDocument(`news/${articleId}`);

      if (!existing) {
        let source = "News";
        let displayTitle = article.title;
        let description = article.contentSnippet || article.description || article.content || "";

        description = description.replace(/<[^>]*>?/gm, '').trim();

        if (article.source && article.source.name) {
          source = article.source.name;
        } else {
          const splitIndex = article.title.lastIndexOf(" - ");
          if (splitIndex !== -1) {
            source = article.title.substring(splitIndex + 3);
            displayTitle = article.title.substring(0, splitIndex);
          } else {
            try {
              const urlObj = new URL(article.link);
              source = urlObj.hostname.replace('www.', '').split('.')[0];
              source = source.charAt(0).toUpperCase() + source.slice(1);
            } catch (e) { }
          }
        }

        console.log(`[${topicName}] New article: ${displayTitle}`);

        await firebase.createDocument('news', {
          topic: topicName,
          title: displayTitle,
          description: description,
          url: article.link,
          imageUrl: null, // Enrichment skipped for simplicity in first pass
          time: article.pubDate || new Date().toISOString(),
          source: source,
          timestamp: new Date()
        }, articleId);

        await sendNotification(firebase, topicName, displayTitle, null, {
          id: articleId,
          url: article.link,
          source: source
        });

        if (articleTime > latestTimeInThisBatch) {
          latestTimeInThisBatch = articleTime;
        }
      }
    }

    console.log(`[${topicName}] Processed successfully.`);

  } catch (error: any) {
    console.error(`Error in processTopic for ${topicName}:`, error.message);
  } finally {
    // Unconditionally mark as ready to avoid infinite UI loader on crashes
    try {
      const updateData: any = { status: 'ready' };
      if (latestTimeInThisBatch > lastProcessedTime) {
        updateData.lastProcessedTime = new Date(latestTimeInThisBatch).toISOString();
      }

      // Retry up to 3 times to account for Firestore write propagation lag
      for (let i = 0; i < 3; i++) {
        const res = await firebase.patchDocument(`topics/${topicId}`, updateData);
        if (res !== null) {
          console.log(`[${topicName}] Topic status updated to ready.`);
          break;
        }
        console.warn(`[${topicName}] Retry updating status (${i + 1}/3)...`);
        await new Promise(r => setTimeout(r, 1500));
      }
    } catch (e: any) {
      console.error(`Failed to mark topic ${topicName} as ready in finally:`, e.message);
    }
  }
}

async function sendNotification(firebase: FirebaseLite, topic: string, title: string, imageUrl: string | null, metadata: any) {
  const topicName = topic.replace(/\s+/g, "_");
  const message: any = {
    topic: topicName,
    notification: {
      title: `News Update: ${topic}`,
      body: title,
    },
    data: {
      topic: topic,
      title: title,
      ...metadata
    }
  };

  if (imageUrl) {
    message.notification.image = imageUrl;
    message.data.imageUrl = imageUrl;
  }

  try {
    await firebase.sendFcmMessage(message);
    console.log(`Notification sent for topic: ${topic}`);
  } catch (error) {
    console.error("Error sending notification:", error);
  }
}
