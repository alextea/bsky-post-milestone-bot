#!/usr/bin/env node
// Load environment variables before anything reads them
import 'dotenv/config';
import { initBluesky, createPost } from './bluesky.js';
import {
  initDatabase, createTables, closeDatabase, updateFollower, recordPost,
  getState, setState, hasRepliedTo, countRecentReplies
} from './database.js';
import { fetchBlueskyFollowers, syncFollowers } from './followers.js';
import { fetchMentions, getReplyRef } from './mentions.js';
import { getProfiles, getStats } from './stats.js';
import { getDuePost, getPostedUpdates } from './schedule.js';
import { captureScreenshot, fetchImage } from './screenshot.js';
import { getConfig } from './config.js';
import { formatPost, formatLinkCard } from '../templates/post_templates.js';

const DRY_RUN = process.argv.includes('--dry-run');

// Welcome posts and replies show the user's progress
const SHARE_TYPES = {
  welcome: 'progress',
  milestone: 'milestone',
  progress: 'progress',
  anniversary: 'anniversary',
  reply: 'progress',
  reply_follow: 'progress'
};

// Stop people, or other bots, using the bot to spam a thread
const MAX_REPLIES_PER_USER_PER_DAY = 3;

const MENTIONS_SEEN_KEY = 'mentions_seen_at';

// Screenshots made this run, so several posts to one person share an image
const images = new Map();

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  try {
    console.log('🤖 Post Milestone Bluesky Bot Starting...\n');

    if (DRY_RUN) {
      console.log('🧪 DRY RUN MODE - No posts will be published or saved\n');
    }

    const config = getConfig();
    if (!config.siteUrl) {
      throw new Error('SITE_URL environment variable is required');
    }
    if (!process.env.BLUESKY_IDENTIFIER) {
      throw new Error('BLUESKY_IDENTIFIER environment variable is required');
    }

    // Initialize connections
    console.log('Connecting to database...');
    initDatabase();
    await createTables();

    // Reading mentions needs to be logged in, so dry runs log in when they can
    const canReadMentions = !DRY_RUN || Boolean(process.env.BLUESKY_PASSWORD);
    if (canReadMentions) {
      console.log('Authenticating with Bluesky...');
      await initBluesky();
    }

    console.log('');

    // Find out who follows the bot and how many posts they have
    console.log('Syncing followers...');
    const blueskyFollowers = await fetchBlueskyFollowers(process.env.BLUESKY_IDENTIFIER);
    const profiles = await getProfiles(blueskyFollowers.map(follower => follower.did));
    const followers = await syncFollowers(blueskyFollowers, profiles, DRY_RUN);
    console.log('');

    const now = new Date();

    // Reply to mentions first, as someone is waiting for an answer
    let sent = 0;
    if (canReadMentions) {
      const followerDids = new Set(followers.map(follower => follower.did));
      sent += await replyToMentions(followerDids, config, now);
    }

    const duePosts = [];

    for (const follower of followers) {
      const profile = profiles.get(follower.did);
      if (!profile) {
        continue;
      }

      const { post, updates } = getDuePost(follower, profile, now, config);

      if (post) {
        duePosts.push({ follower, post, updates });
      } else if (!DRY_RUN) {
        await updateFollower(follower.did, updates);
      }
    }

    const remaining = Math.max(config.maxPostsPerRun - sent, 0);
    console.log(`${duePosts.length} scheduled post${duePosts.length === 1 ? '' : 's'} due`);

    if (duePosts.length > remaining) {
      console.log(`Sending ${remaining}, the rest will be sent next run`);
    }
    console.log('');

    for (const { follower, post, updates } of duePosts.slice(0, remaining)) {
      try {
        await sendPost(follower, post, updates, config, now);
        sent++;
      } catch (error) {
        // Carry on with everyone else, this follower will be tried again next run
        console.error(`❌ Could not post to ${follower.handle}:`, error.message, '\n');
      }

      if (!DRY_RUN) {
        await sleep(2000);
      }
    }

    console.log(`🎉 Bot completed successfully! ${sent} post${sent === 1 ? '' : 's'} ${DRY_RUN ? 'generated' : 'sent'}.`);

  } catch (error) {
    console.error('❌ Error running bot:', error);
    process.exitCode = 1;
  } finally {
    // Clean up database connection
    await closeDatabase();
  }
}

/**
 * Reply to anyone who has mentioned the bot since the last run
 * Returns the number of replies sent
 */
async function replyToMentions(followerDids, config, now) {
  console.log('Checking mentions...');

  let since = await getState(MENTIONS_SEEN_KEY);

  if (!since) {
    if (DRY_RUN) {
      // Look back a day, so dry runs have something to show
      since = new Date(now - 24 * 60 * 60 * 1000).toISOString();
      console.log('No saved position, looking back 24 hours');
    } else {
      // Don't reply to everything from before the bot could reply
      await setState(MENTIONS_SEEN_KEY, now.toISOString());
      console.log('✓ Starting from now\n');
      return 0;
    }
  }

  const mentions = await fetchMentions(since);
  console.log(`✓ ${mentions.length} new mention${mentions.length === 1 ? '' : 's'}\n`);

  let sent = 0;
  for (const mention of mentions) {
    if (sent >= config.maxPostsPerRun) {
      console.log('Reached the post limit, the rest will be answered next run\n');
      break;
    }

    const author = mention.author;

    try {
      if (await hasRepliedTo(mention.uri)) {
        console.log(`Already replied to ${mention.uri}\n`);
      } else if (await countRecentReplies(author.did, 24) >= MAX_REPLIES_PER_USER_PER_DAY) {
        console.log(`Skipping ${author.handle}, already replied ${MAX_REPLIES_PER_USER_PER_DAY} times today\n`);
      } else {
        await sendReply(mention, followerDids.has(author.did), config, now);
        sent++;

        if (!DRY_RUN) {
          await sleep(2000);
        }
      }
    } catch (error) {
      // Move on rather than retrying, so one bad mention can't block the rest
      console.error(`❌ Could not reply to ${author.handle}:`, error.message, '\n');
    }

    // Save progress after each mention, so a crash doesn't cause double replies
    if (!DRY_RUN) {
      await setState(MENTIONS_SEEN_KEY, mention.indexedAt);
    }
  }

  return sent;
}

async function sendReply(mention, isFollower, config, now) {
  const type = isFollower ? 'reply' : 'reply_follow';
  const stats = await getStats(config.siteUrl, mention.author.handle);
  const text = formatPost(type, stats);
  const card = formatLinkCard(type, stats);
  const url = `${config.siteUrl}/info/${stats.handle}`;

  console.log(`Generated reply to ${stats.handle}:`);
  console.log(`In reply to: ${mention.uri}`);
  logPost(text, url);

  const rkey = mention.uri.split('/').pop();
  const image = await createImage(config, stats.handle, SHARE_TYPES[type], null, `${stats.did}/reply-${rkey}`);

  if (!DRY_RUN) {
    const response = await createPost(text, { url, ...card, image }, getReplyRef(mention));
    await recordPost(stats.did, 'reply', null, response.uri, mention.uri);
    console.log('✅ Reply published!');
  }

  console.log('');
}

async function sendPost(follower, post, updates, config, now) {
  const stats = await getStats(config.siteUrl, updates.handle);
  const text = formatPost(post.type, stats, post.milestone);
  const card = formatLinkCard(post.type, stats, post.milestone);
  const url = `${config.siteUrl}/info/${stats.handle}`;

  console.log(`Generated ${post.type} post for ${stats.handle}:`);
  logPost(text, url);

  const date = now.toISOString().slice(0, 10);
  const image = await createImage(config, stats.handle, SHARE_TYPES[post.type], post.milestone, `${follower.did}/${post.type}-${date}`);

  if (!DRY_RUN) {
    const response = await createPost(text, { url, ...card, image });
    await updateFollower(follower.did, { ...updates, ...getPostedUpdates(post.type, now) });
    await recordPost(follower.did, post.type, post.milestone || null, response.uri);
    console.log(`✅ ${post.type} post published!`);
  }

  console.log('');
}

/**
 * Screenshot a share page for the link card
 * Returns null if it fails, so the post can go without an image rather than not at all
 */
async function createImage(config, handle, shareType, milestone, key) {
  let shareUrl = `${config.siteUrl}/social-share/${handle}/${shareType}`;
  if (milestone) {
    shareUrl += `?milestone=${milestone}`;
  }
  console.log(`Share image: ${shareUrl}`);

  if (images.has(shareUrl)) {
    console.log('Screenshot: reusing image from earlier in this run');
    return images.get(shareUrl);
  }

  try {
    const imageUrl = await captureScreenshot(shareUrl, key);
    console.log(`Screenshot: ${imageUrl}`);
    const image = await fetchImage(imageUrl);
    images.set(shareUrl, image);
    return image;
  } catch (error) {
    console.warn('Could not create screenshot:', error.message);
    return null;
  }
}

function logPost(text, url) {
  console.log('─'.repeat(60));
  console.log(text);
  console.log('─'.repeat(60));
  console.log(`URL: ${url}`);
}

// Run the bot
main();
