import { getPublicAgent } from './bluesky.js';
import { getFollowers, insertFollower, setFollowersActive } from './database.js';
import { getNextMilestone } from './stats.js';

/**
 * Fetch everyone following the bot from Bluesky
 */
export async function fetchBlueskyFollowers(actor) {
  const agent = getPublicAgent();
  const followers = [];
  let cursor;

  do {
    const response = await agent.getFollowers({ actor, limit: 100, cursor });
    followers.push(...response.data.followers);
    cursor = response.data.cursor;
  } while (cursor);

  return followers;
}

/**
 * Bring the followers table in line with who follows the bot on Bluesky
 * Returns the active followers, including any new ones
 */
export async function syncFollowers(blueskyFollowers, profiles, dryRun) {
  const stored = new Map((await getFollowers()).map(row => [row.did, row]));
  const followingDids = new Set(blueskyFollowers.map(follower => follower.did));

  const newFollowers = [];
  const returningDids = [];

  for (const follower of blueskyFollowers) {
    const row = stored.get(follower.did);
    const profile = profiles.get(follower.did);

    if (!row) {
      // Profiles can be missing for deactivated or suspended accounts
      if (!profile) {
        continue;
      }

      newFollowers.push({
        did: follower.did,
        handle: follower.handle,
        active: true,
        last_post_count: profile.postsCount,
        next_milestone: getNextMilestone(profile.postsCount + 1),
        welcomed_at: null,
        last_weekly_at: null,
        last_anniversary_year: null,
        last_posted_at: null
      });
    } else if (!row.active) {
      returningDids.push(follower.did);
      row.active = true;
    }
  }

  const unfollowedDids = [...stored.values()]
    .filter(row => row.active && !followingDids.has(row.did))
    .map(row => row.did);

  console.log(`✓ ${blueskyFollowers.length} followers: ${newFollowers.length} new, ${returningDids.length} returning, ${unfollowedDids.length} unfollowed`);

  if (!dryRun) {
    for (const follower of newFollowers) {
      await insertFollower(follower);
    }
    await setFollowersActive(returningDids, true);
    await setFollowersActive(unfollowedDids, false);
  }

  return [
    ...[...stored.values()].filter(row => row.active && followingDids.has(row.did)),
    ...newFollowers
  ];
}
