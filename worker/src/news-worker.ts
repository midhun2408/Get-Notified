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

  // Fetch global config for minFetchTime (to ensure new topics respect global deletions)
  let minFetchTime = 0;
  try {
    const globalConfig = await firebase.getDocument('config/global');
    if (globalConfig && globalConfig.minFetchTime) {
      minFetchTime = new Date(globalConfig.minFetchTime).getTime();
    }
  } catch (e) {
    console.warn("Could not fetch global config, continuing with 0 minFetchTime.");
  }

  // Cloudflare Workers Free plan has a 50 subrequest limit.
  // We need to manage a global budget for this run.
  const context = {
    subrequestCount: 0,
    maxSubrequests: 48 // Leave some room for other calls
  };

  console.log(`Starting news search for ${topics.length} topics... (Min Fetch: ${minFetchTime > 0 ? new Date(minFetchTime).toISOString() : 'None'})`);
  for (const topic of topics) {
    if (context.subrequestCount >= context.maxSubrequests) {
      console.warn("Stopping early: reached subrequest limit for this run.");
      break;
    }
    await processTopic(firebase, topic.name, topic.id, context, topic.lastProcessedTime, minFetchTime);
  }
}

export async function processTopic(firebase: FirebaseLite, topicName: string, topicId: string, context: {subrequestCount: number, maxSubrequests: number}, lastProcessedTimeStr?: string, minFetchTimeMs: number = 0) {
  let lastProcessedTime = lastProcessedTimeStr ? new Date(lastProcessedTimeStr).getTime() : 0;
  
  // Respect global deletion time
  lastProcessedTime = Math.max(lastProcessedTime, minFetchTimeMs);
  
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
          context.subrequestCount++;
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
        context.subrequestCount++;
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
    const writes: any[] = [];
    const notificationArticles: any[] = [];
    let processedCount = 0;
    const MAX_ARTICLES_PER_RUN = 5;

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
      if (description.includes("Intercepted transmission")) description = "";

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

      // Enrichment logic: Fetch high-quality content if budget allows
      if (context.subrequestCount < context.maxSubrequests - 2) { // Reserve some for commit and notification
        try {
          context.subrequestCount++;
          console.log(`[${topicName}] Enriching: ${displayTitle}`);
          const articleData = await enrichArticle(article.link);
          if (articleData.description) {
            description = articleData.description;
          }
          if (articleData.imageUrl) {
            imageUrl = articleData.imageUrl;
          }
        } catch (e: any) {
          console.warn(`[${topicName}] Enrichment failed: ${e.message}`);
        }
      }

      const newsData = {
        topic: topicName,
        title: displayTitle,
        description: description,
        url: article.link,
        imageUrl: imageUrl,
        time: article.pubDate || new Date().toISOString(),
        source: source,
        timestamp: new Date()
      };

      writes.push(firebase.createSetWrite(`news/${articleId}`, newsData));
      
      notificationArticles.push({
        id: articleId,
        title: displayTitle,
        imageUrl,
        source,
        url: article.link
      });

      processedCount++;
    }

    if (writes.length > 0) {
      console.log(`[${topicName}] Committing ${writes.length} articles...`);
      // Add topic status update to the same batch
      const topicUpdate: any = { status: 'ready' };
      if (latestTimeInThisBatch > lastProcessedTime) {
        topicUpdate.lastProcessedTime = new Date(latestTimeInThisBatch).toISOString();
      }
      writes.push(firebase.createPatchWrite(`topics/${topicId}`, topicUpdate));
      
      context.subrequestCount++;
      await firebase.commit(writes);
      console.log(`[${topicName}] Batch commit successful.`);

      // Send notifications (Individual as requested by user)
      if (notificationArticles.length > 0) {
        console.log(`[${topicName}] Sending ${notificationArticles.length} notifications...`);
        for (const art of notificationArticles) {
          if (context.subrequestCount >= context.maxSubrequests) break;
          context.subrequestCount++;
          await sendNotification(firebase, topicName, art.title, art.imageUrl, {
            id: art.id,
            url: art.url,
            source: art.source
          });
        }
      }
    } else {
      context.subrequestCount++;
      // Still update topic status if no new articles
      await firebase.patchDocument(`topics/${topicId}`, { status: 'ready' });
    }

    console.log(`[${topicName}] Done processing.`);

  } catch (error: any) {
    console.error(`Error in processTopic for ${topicName}:`, error.message);
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
  };

  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    
    //@ts-ignore
    const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
    clearTimeout(id);
    
    if (!res.ok) return { description: null, imageUrl: null };

    let ogDescription = '';
    let bodyText = '';
    let imageUrl: string | null = null;

    const hostname = new URL(url).hostname.toLowerCase();
    
    const rewriter = new HTMLRewriter()
      // Prioritize OG description for high-quality summary (as lead-in)
      .on('meta[property="og:description"]', {
        element(el) {
          ogDescription = el.getAttribute('content') || '';
        }
      })
      .on('meta[property="og:image"]', {
        element(el) {
          imageUrl = el.getAttribute('content');
        }
      })
      // Target ACTUAL article body containers exclusively for major sites
      // The Hindu: div.articlebody-container or div[id^="content-body-"]
      // TOI: div.main-content, div._3YYi3, .v_container
      // Al Jazeera: div.wysiwyg
      .on('div[id^="content-body-"] p, .articlebody-container p, .article-body-container p, div.main-content p, div._3YYi3 p, div.wysiwyg p, div.article-content p, div.content_text p, .article__content p, .story-details p', {
        text(textChunk) {
          if (bodyText.length < 2500) {
            const t = textChunk.text;
            // Filter out common marketing/newsletter blurbs
            const garbagePhrases = [
              "Looking at World Affairs",
              "News and reviews from the world of cinema",
              "Your download of the top 5",
              "weekly newsletter from science",
              "Ramya Kannan writes to you",
              "subscribe to the newsletter",
              "Support quality journalism",
              "strictly for subscribers"
            ];
            
            if (garbagePhrases.some(phrase => t.includes(phrase))) {
              return; // Skip this chunk
            }
            
            bodyText += t;
          }
        }
      })
      // General fallback only if bodyText is still empty
      .on('p', {
        text(textChunk) {
          if (bodyText.length === 0) {
            const t = textChunk.text.trim();
            if (t.length > 50 && !t.includes('cookie') && !t.includes('copyright') && !t.includes('Newsletter')) {
              bodyText += textChunk.text;
            }
          }
        }
      });
    
    await rewriter.transform(res).arrayBuffer();
    
    // Clean up text
    const cleanedBody = bodyText.replace(/\s+/g, ' ').trim();
    
    // Choose the best content
    let finalDescription = null;
    if (cleanedBody.length > 150) {
      finalDescription = cleanedBody.substring(0, 2000);
    } else if (ogDescription && ogDescription.length > 50) {
      finalDescription = ogDescription;
    } else if (cleanedBody.length > 0) {
      finalDescription = cleanedBody;
    }
    
    return { description: finalDescription, imageUrl };
  } catch (e) {
    return { description: null, imageUrl: null };
  }
}
