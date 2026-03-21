import { FirebaseLite } from './firebase-lite';
import Parser from 'rss-parser';

const TOPIC_FEEDS: { [key: string]: string[] } = {
  'kerala': [
    'https://www.thehindu.com/news/national/kerala/feeder/default.rss',
    'https://www.onmanorama.com/rss/news.xml'
  ],
  'india': [
    'https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms',
    'https://www.thehindu.com/news/national/feeder/default.rss'
  ],
  'world': [
    'https://www.aljazeera.com/xml/rss/all.xml',
    'https://timesofindia.indiatimes.com/rssfeeds/29473334.cms'
  ],
  'technology': [
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

    const normalizedTopicName = topicName.trim().toLowerCase();

    if (TOPIC_FEEDS[normalizedTopicName]) {
      console.log(`Using direct publisher feeds for ${topicName}`);
      const feedPromises = TOPIC_FEEDS[normalizedTopicName].map(async (url) => {
        try {
          const res = await fetch(url, fetchOptions);
          if (!res.ok) throw new Error(`Status ${res.status}`);
          const text = await res.text();
          const feed = await parser.parseString(text);
          return feed.items.slice(0, 10);
        } catch (e: any) {
          console.error(`Error fetching direct feed ${url}:`, e.message);
          return [];
        }
      });
      const feedResults = await Promise.all(feedPromises);
      items = feedResults.flat();
    } else {
      console.log(`No direct feed for ${topicName}, falling back to Bing News RSS`);
      const feedUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(topicName)}&format=rss`;
      try {
        const res = await fetch(feedUrl, fetchOptions);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const text = await res.text();
        const feed = await parser.parseString(text);
        items = feed.items.slice(0, 10);
      } catch (e: any) {
        console.error(`Error fetching Bing News for ${topicName}:`, e.message);
      }
    }

    if (items.length === 0) return;

    // Sort items by date ascending
    items.sort((a, b) => {
      const timeA = new Date(a.pubDate || 0).getTime();
      const timeB = new Date(b.pubDate || 0).getTime();
      return timeA - timeB;
    });

    latestTimeInThisBatch = lastProcessedTime;
    let processedCount = 0;
    const MAX_ARTICLES_PER_RUN = 8;

    // SEQUENTIAL PROCESSING to strictly stay within subrequest limits
    for (const article of items) {
      if (!article.link || !article.title) continue;

      const articleTime = new Date(article.pubDate).getTime() || Date.now();
      if (articleTime > latestTimeInThisBatch) {
        latestTimeInThisBatch = articleTime;
      }

      // Skip old articles
      if (lastProcessedTime > 0 && articleTime <= lastProcessedTime) continue;

      // Limit processed articles
      if (processedCount >= MAX_ARTICLES_PER_RUN) break;

      const encoder = new TextEncoder();
      const linkData = encoder.encode(article.link);
      const hashBuffer = await crypto.subtle.digest('SHA-256', linkData);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const articleId = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);

      let source = "News";
      let displayTitle = article.title;
      let description = article.contentSnippet || article.description || article.content || "";
      let imageUrl = null;

      description = description.replace(/<[^>]*>?/gm, '').trim();

      if (article.enclosure && article.enclosure.url) {
        imageUrl = article.enclosure.url;
      } else if (article.content) {
        const imgMatch = article.content.match(/<img[^>]*src="([^"]*)"/i);
        if (imgMatch && !imgMatch[1].includes('google.com') && !imgMatch[1].includes('gstatic.com')) {
          imageUrl = imgMatch[1];
        }
      }

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

      try {
        await firebase.createDocument('news', {
          topic: topicName,
          title: displayTitle,
          description: description,
          url: article.link,
          imageUrl: imageUrl,
          time: article.pubDate || new Date().toISOString(),
          source: source,
          timestamp: new Date()
        }, articleId);

        processedCount++;
        console.log(`[${topicName}] Added: ${displayTitle}`);

        // Enrichment
        try {
          const articleData = await enrichArticle(article.link);
          if (articleData.description || articleData.imageUrl) {
            const updates: any = {};
            if (articleData.description && articleData.description.length > description.length) {
              updates.description = articleData.description;
            }
            if (articleData.imageUrl) {
              updates.imageUrl = articleData.imageUrl;
              imageUrl = articleData.imageUrl;
            }
            if (Object.keys(updates).length > 0) {
              await firebase.patchDocument(`news/${articleId}`, updates);
            }
          }
        } catch (e) { }

        sendNotification(firebase, topicName, displayTitle, imageUrl, {
          id: articleId,
          url: article.link,
          source: source
        });

      } catch (e: any) {
        if (e.message.includes('409') || e.message.includes('ALREADY_EXISTS')) continue;
        console.error(`[${topicName}] Article error:`, e.message);
      }
    }

    console.log(`[${topicName}] Done processing.`);

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
  const topicName = FirebaseLite.normalizeTopic(topic);
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

async function enrichArticle(url: string, timeoutMs: number = 8000): Promise<{description: string | null, imageUrl: string | null}> {
  const fetchOptions = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    // Cloudflare fetch doesn't support signal in the same way, but we can use Promise.race
  };

  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    
    //@ts-ignore
    const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
    clearTimeout(id);
    
    if (!res.ok) return { description: null, imageUrl: null };

    let fullText = '';
    let imageUrl: string | null = null;
    
    const rewriter = new HTMLRewriter()
      .on('p', {
        text(textChunk) {
          fullText += textChunk.text;
        }
      })
      .on('meta[property="og:image"]', {
        element(el) {
          imageUrl = el.getAttribute('content');
        }
      })
      .on('meta[name="twitter:image"]', {
        element(el) {
          if (!imageUrl) imageUrl = el.getAttribute('content');
        }
      });
    
    await rewriter.transform(res).arrayBuffer();
    
    // Clean up text
    const cleanedText = fullText.replace(/\s+/g, ' ').trim();
    // Return first 1000 chars for safety
    const description = cleanedText.length > 0 ? cleanedText.substring(0, 1000) : null;
    
    return { description, imageUrl };
  } catch (e) {
    return { description: null, imageUrl: null };
  }
}
