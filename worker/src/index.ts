import { FirebaseLite, ServiceAccount } from './firebase-lite';
import { processAllTopics, processTopic } from './news-worker';
import { pollTelegram } from './telegram-worker';

export interface Env {
    FIREBASE_SERVICE_ACCOUNT: string;
    TELEGRAM_BOT_TOKEN: string;
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);
        const serviceAccount = typeof env.FIREBASE_SERVICE_ACCOUNT === 'string' 
            ? JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) 
            : env.FIREBASE_SERVICE_ACCOUNT;
        const firebase = new FirebaseLite(serviceAccount as ServiceAccount);

        // CORS Headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            // Subscription Endpoints
            if (url.pathname === '/subscribe' && request.method === 'POST') {
                const { token, topic } = await request.json() as any;
                const normalizedTopic = FirebaseLite.normalizeTopic(topic);
                
                // 1. Subscribe in FCM
                ctx.waitUntil(firebase.subscribeToTopic(token, topic));
                
                // 2. Store in Firestore for record-keeping
                await firebase.createDocument('subscriptions', { 
                    token, 
                    topic, 
                    normalizedTopic,
                    createdAt: new Date().toISOString() 
                }, `${token}_${normalizedTopic}`);
                
                return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
            }

            if (url.pathname === '/unsubscribe' && request.method === 'POST') {
                const { token, topic } = await request.json() as any;
                const normalizedTopic = FirebaseLite.normalizeTopic(topic);

                // 1. Unsubscribe in FCM
                ctx.waitUntil(firebase.unsubscribeFromTopic(token, topic));

                // 2. Remove from Firestore
                await firebase.deleteDocument(`subscriptions/${token}_${normalizedTopic}`);
                
                return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
            }

            // Topic Triggers
            if (url.pathname === '/topic/create' && request.method === 'POST') {
                const { name, id } = await request.json() as any;
                // Trigger immediate news search for new topic
                ctx.waitUntil(processTopic(firebase, name, id, { subrequestCount: 0, maxSubrequests: 48 }));
                return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
            }

            if (url.pathname === '/debug-logs' && request.method === 'GET') {
                try {
                    const res = await firebase.createDocument('news', { 
                        title: 'Test Diagnostics Feed', 
                        topic: 'Kerala',
                        url: 'https://example.com/test-article',
                        timestamp: new Date(),
                        source: 'Diagnostics'
                    }, 'test_diag_article_id');
                    return new Response(JSON.stringify({ success: true, response: res }), { headers: corsHeaders });
                } catch (e: any) {
                    return new Response(JSON.stringify({ success: false, error: e.message }), { headers: corsHeaders });
                }
            }

            if (url.pathname === '/topic/delete' && request.method === 'POST') {
                const { name } = await request.json() as any;
                if (!name) return new Response(JSON.stringify({ error: 'Missing name' }), { status: 400, headers: corsHeaders });

                // Clean up news articles using runQuery via REST
                ctx.waitUntil((async () => {
                    try {
                        const queryBody = {
                            structuredQuery: {
                                from: [{ collectionId: 'news' }],
                                where: {
                                    fieldFilter: {
                                        field: { fieldPath: 'topic' },
                                        op: 'EQUAL',
                                        value: { stringValue: name }
                                    }
                                }
                            }
                        };
                        const response = await firebase.firestoreRequest(':runQuery', {
                            method: 'POST',
                            body: JSON.stringify(queryBody)
                        });

                        if (response && Array.isArray(response)) {
                            const deleteWrites: any[] = [];
                            for (const item of response) {
                                if (item.document && item.document.name) {
                                    deleteWrites.push({ delete: item.document.name });
                                }
                            }
                            if (deleteWrites.length > 0) {
                                await firebase.commit(deleteWrites);
                                console.log(`[Trigger] Cleaned up ${deleteWrites.length} news items for topic: ${name}`);
                            }
                        }
                    } catch (e: any) {
                        console.error(`Error deleting news for topic ${name}:`, e.message);
                    }
                })());

                return new Response(JSON.stringify({ success: true, message: 'News cleanup triggered.' }), { headers: corsHeaders });
            }

            if (url.pathname === '/inspect' && request.method === 'GET') {
                try {
                    const topics = await firebase.listDocuments('topics');
                    const logs = await firebase.listDocuments('debug_logs');
                    return new Response(JSON.stringify({ success: true, topics, logs: logs.slice(0, 50) }), { headers: corsHeaders });
                } catch (e: any) {
                    return new Response(JSON.stringify({ success: false, error: e.message }), { headers: corsHeaders });
                }
            }

            // Manual Triggers for Testing
            if (url.pathname === '/trigger/news') {
                ctx.waitUntil(processAllTopics(firebase));
                return new Response(JSON.stringify({ success: true, message: 'News search triggered.' }), { headers: corsHeaders });
            }

            if (url.pathname === '/trigger/telegram') {
                ctx.waitUntil(pollTelegram(firebase, env.TELEGRAM_BOT_TOKEN));
                return new Response(JSON.stringify({ success: true, message: 'Telegram monitor triggered.' }), { headers: corsHeaders });
            }

            if (url.pathname === '/migrate-subscriptions') {
                ctx.waitUntil((async () => {
                    const subs = await firebase.listDocuments('subscriptions');
                    console.log(`Migrating ${subs.length} subscriptions...`);
                    for (const sub of subs) {
                        try {
                            await firebase.subscribeToTopic(sub.token, sub.topic);
                            console.log(`Migrated: ${sub.token.substring(0, 10)}... -> ${sub.topic}`);
                        } catch (e: any) {
                            console.error(`Migration failed for ${sub.token.substring(0, 10)}...: ${e.message}`);
                        }
                    }
                    console.log('Migration complete.');
                })());
                return new Response(JSON.stringify({ success: true, message: 'Migration triggered.' }), { headers: corsHeaders });
            }

            if (url.pathname === '/news/delete-all' && request.method === 'POST') {
                ctx.waitUntil((async () => {
                    try {
                        const now = new Date().toISOString();
                        
                        // 1. Delete all news articles
                        const queryBody = {
                            structuredQuery: {
                                from: [{ collectionId: 'news' }]
                            }
                        };
                        const response = await firebase.firestoreRequest(':runQuery', {
                            method: 'POST',
                            body: JSON.stringify(queryBody)
                        });

                        if (response && Array.isArray(response)) {
                            const deleteWrites: any[] = [];
                            for (const item of response) {
                                if (item.document && item.document.name) {
                                    deleteWrites.push({ delete: item.document.name });
                                }
                            }
                            // Firestore batch limit is 500. For now, we assume it's within limits or we'll need chunking.
                            if (deleteWrites.length > 0) {
                                // Chunk into 400s to be safe
                                for (let i = 0; i < deleteWrites.length; i += 400) {
                                    await firebase.commit(deleteWrites.slice(i, i + 400));
                                }
                                console.log(`[Admin] Deleted ${deleteWrites.length} news items.`);
                            }
                        }

                        // 2. Update global minFetchTime (using commit/set for idempotency)
                        await firebase.commit([
                            firebase.createSetWrite('config/global', { minFetchTime: now })
                        ]);

                        // 3. Update all topics to sync with this deletion time
                        const topics = await firebase.listDocuments('topics');
                        const topicWrites = topics.map(t => firebase.createPatchWrite(`topics/${t.id}`, { lastProcessedTime: now }));
                        if (topicWrites.length > 0) {
                            for (let i = 0; i < topicWrites.length; i += 400) {
                                await firebase.commit(topicWrites.slice(i, i + 400));
                            }
                        }
                        
                        console.log(`[Admin] Global deletion complete at ${now}.`);
                    } catch (e: any) {
                        console.error(`Error in global news deletion:`, e.message);
                    }
                })());
                return new Response(JSON.stringify({ success: true, message: 'Global deletion triggered.' }), { headers: corsHeaders });
            }

            return new Response('Not Found', { status: 404, headers: corsHeaders });
        } catch (error: any) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
        }
    },

    async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
        const serviceAccount = typeof env.FIREBASE_SERVICE_ACCOUNT === 'string' 
            ? JSON.parse(env.FIREBASE_SERVICE_ACCOUNT) 
            : env.FIREBASE_SERVICE_ACCOUNT;
        const firebase = new FirebaseLite(serviceAccount as ServiceAccount);

        switch (event.cron) {
            case "*/10 * * * *": // News Search
                ctx.waitUntil(processAllTopics(firebase));
                break;
            case "*/2 * * * *": // Telegram Monitor
                ctx.waitUntil(pollTelegram(firebase, env.TELEGRAM_BOT_TOKEN));
                break;
        }
    },
};
