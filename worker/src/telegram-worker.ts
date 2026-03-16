import { FirebaseLite } from './firebase-lite';

export async function pollTelegram(firebase: FirebaseLite, botToken: string) {
  const channels = await firebase.listDocuments('telegramChannels');
  const keywordsSnap = await firebase.listDocuments('telegramKeywords');

  if (channels.length === 0 || keywordsSnap.length === 0) return;

  const keywords = keywordsSnap.map(d => d.keyword).filter(Boolean);

  for (const channel of channels) {
    try {
      const lastId = channel.lastMessageId || 0;
      const offset = lastId > 0 ? lastId + 1 : 0;
      const apiUrl = `https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}&limit=50&allowed_updates=["channel_post"]&timeout=0`;

      const response = await fetch(apiUrl);
      const data: any = await response.json();

      if (!data.ok) continue;

      let maxId = lastId;
      const matches: any[] = [];

      for (const update of data.result) {
        const post = update.channel_post;
        if (!post) continue;

        const chat = post.chat;
        const chatUsername = (chat?.username || "").toLowerCase();
        const targetUsername = channel.username.replace(/^@/, "").toLowerCase();

        if (chatUsername !== targetUsername) continue;

        if (update.update_id > maxId) maxId = update.update_id;

        const text = post.text || post.caption || "";
        if (!text) continue;

        for (const kw of keywords) {
          if (text.toLowerCase().includes(kw.toLowerCase())) {
            matches.push({ text, keyword: kw });
            break;
          }
        }
      }

      if (matches.length > 0) {
        await sendTelegramNotifications(firebase, channel.username, matches);
        await firebase.patchDocument(`telegramChannels/${channel.id}`, { lastMessageId: maxId });
      }
    } catch (err) {
      console.error(`Error polling telegram for ${channel.username}:`, err);
    }
  }
}

async function sendTelegramNotifications(firebase: FirebaseLite, channel: string, matches: any[]) {
    const tokensSnap = await firebase.listDocuments('fcmTokens');
    const tokens = tokensSnap.map(d => d.token).filter(Boolean);

    if (tokens.length === 0) return;

    for (const match of matches) {
        const body = match.text.length > 180 ? match.text.substring(0, 177) + "..." : match.text;
        
        // send to each token (simple version, could optimize with multicast if needed)
        for (const token of tokens) {
            const message = {
                token: token,
                notification: {
                    title: `🔔 Keyword match: "${match.keyword}"`,
                    body: body,
                },
                data: {
                    keyword: match.keyword,
                    channel: channel,
                    source: "telegram",
                }
            };
            await firebase.sendFcmMessage(message);
        }
    }
}
