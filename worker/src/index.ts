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
                // Cloudflare Worker can't directly use admin.messaging().subscribeToTopic
                // We store the subscription in Firestore for now, or use a separate FCM subscription API if available.
                // For this migration, we'll store it in a 'subscriptions' collection.
                await firebase.createDocument('subscriptions', { token, topic, createdAt: new Date() }, `${token}_${topic.replace(/\s+/g, '_')}`);
                return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
            }

            if (url.pathname === '/unsubscribe' && request.method === 'POST') {
                const { token, topic } = await request.json() as any;
                await firebase.deleteDocument(`subscriptions/${token}_${topic.replace(/\s+/g, '_')}`);
                return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
            }

            // Topic Triggers
            if (url.pathname === '/topic/create' && request.method === 'POST') {
                const { name, id } = await request.json() as any;
                // Trigger immediate news search for new topic
                ctx.waitUntil(processTopic(firebase, name, id));
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
                            for (const item of response) {
                                if (item.document && item.document.name) {
                                    const docPath = item.document.name.split('/documents/')[1];
                                    if (docPath) {
                                        await firebase.deleteDocument(docPath);
                                    }
                                }
                            }
                            console.log(`[Trigger] Cleaned up news items for topic: ${name}`);
                        }
                    } catch (e: any) {
                        console.error(`Error deleting news for topic ${name}:`, e.message);
                    }
                })());

                return new Response(JSON.stringify({ success: true, message: 'News cleanup triggered.' }), { headers: corsHeaders });
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
