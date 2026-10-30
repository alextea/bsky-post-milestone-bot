import { getAgent } from './bluesky.js';

/**
 * Fetch posts that mention the bot, newer than since, oldest first
 *
 * Replies to the bot's posts only count if they mention the bot too, so
 * people saying thanks for a celebration don't get their stats back
 */
export async function fetchMentions(since) {
  const agent = getAgent();
  const botDid = agent.session.did;
  const mentions = [];
  let cursor;

  pages:
  do {
    const response = await agent.listNotifications({ limit: 50, cursor, reasons: ['mention', 'reply'] });

    for (const notification of response.data.notifications) {
      if (notification.indexedAt <= since) {
        break pages;
      }

      if (notification.author.did !== botDid && mentionsDid(notification.record, botDid)) {
        mentions.push(notification);
      }
    }

    cursor = response.data.cursor;
  } while (cursor);

  return mentions.reverse();
}

/**
 * The reply reference for replying to a notification's post, in the same thread
 */
export function getReplyRef(notification) {
  const parent = { uri: notification.uri, cid: notification.cid };
  return {
    root: notification.record.reply?.root || parent,
    parent
  };
}

function mentionsDid(record, did) {
  return (record.facets || []).some(facet =>
    facet.features.some(feature =>
      feature.$type === 'app.bsky.richtext.facet#mention' && feature.did === did
    )
  );
}
