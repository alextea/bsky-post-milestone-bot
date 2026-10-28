#!/usr/bin/env node
// Load environment variables before anything reads them
import 'dotenv/config';
import { initBluesky, createPost } from './bluesky.js';
import { initDatabase, createTables, closeDatabase, updateFollower, recordPost } from './database.js';
import { fetchBlueskyFollowers, syncFollowers } from './followers.js';
import { getProfiles, getStats } from './stats.js';
import { getDuePost, getPostedUpdates } from './schedule.js';
import { captureScreenshot, fetchImage } from './screenshot.js';
import { getConfig } from './config.js';
import { formatPost, formatLinkCard } from '../templates/post_templates.js';

const DRY_RUN = process.argv.includes('--dry-run');

// Welcome posts show the user's progress
const SHARE_TYPES = {
  welcome: 'progress',
  milestone: 'milestone',
  progress: 'progress',
  anniversary: 'anniversary'
};

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

    if (!DRY_RUN) {
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

    console.log(`${duePosts.length} post${duePosts.length === 1 ? '' : 's'} due`);

    if (duePosts.length > config.maxPostsPerRun) {
      console.log(`Sending ${config.maxPostsPerRun}, the rest will be sent next run`);
    }
    console.log('');

    let sent = 0;
    for (const { follower, post, updates } of duePosts.slice(0, config.maxPostsPerRun)) {
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

async function sendPost(follower, post, updates, config, now) {
  const stats = await getStats(config.siteUrl, updates.handle);
  const text = formatPost(post.type, stats, post.milestone);
  const card = formatLinkCard(post.type, stats, post.milestone);
  const url = `${config.siteUrl}/info/${stats.handle}`;

  let shareUrl = `${config.siteUrl}/social-share/${stats.handle}/${SHARE_TYPES[post.type]}`;
  if (post.milestone) {
    shareUrl += `?milestone=${post.milestone}`;
  }

  console.log(`Generated ${post.type} post for ${stats.handle}:`);
  console.log('─'.repeat(60));
  console.log(text);
  console.log('─'.repeat(60));
  console.log(`URL: ${url}`);
  console.log(`Share image: ${shareUrl}`);

  // Post without an image rather than not at all
  let image = null;
  try {
    const date = now.toISOString().slice(0, 10);
    const imageUrl = await captureScreenshot(shareUrl, `${follower.did}/${post.type}-${date}`);
    console.log(`Screenshot: ${imageUrl}`);
    image = await fetchImage(imageUrl);
  } catch (error) {
    console.warn('Could not create screenshot:', error.message);
  }

  if (!DRY_RUN) {
    const response = await createPost(text, { url, ...card, image });
    await updateFollower(follower.did, { ...updates, ...getPostedUpdates(post.type, now) });
    await recordPost(follower.did, post.type, post.milestone || null, response.uri);
    console.log(`✅ ${post.type} post published!`);
  }

  console.log('');
}

// Run the bot
main();
