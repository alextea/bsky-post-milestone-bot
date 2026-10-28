import { getLastMilestone, getNextMilestone } from './stats.js';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Work out which post, if any, a follower is due
 * Followers get at most one post per run, in order of priority:
 * welcome, milestone, anniversary, weekly update
 *
 * Returns { post, updates }, where post is { type, milestone } or null, and
 * updates are changes to save to the follower's row even if nothing is posted
 */
export function getDuePost(follower, profile, now, config) {
  const postCount = profile.postsCount;
  const updates = { handle: profile.handle, last_post_count: postCount };

  if (!follower.welcomed_at) {
    return { post: { type: 'welcome' }, updates };
  }

  if (postCount >= follower.next_milestone) {
    // Celebrate the biggest milestone reached, in case they've passed more than one
    const milestone = getLastMilestone(postCount);
    updates.next_milestone = getNextMilestone(postCount + 1);

    if (milestone >= config.minMilestone) {
      return { post: { type: 'milestone', milestone }, updates };
    }
  }

  const isScheduledHour = now.getUTCHours() >= config.scheduledPostHour;
  const postedRecently = follower.last_posted_at && now - new Date(follower.last_posted_at) < 20 * 60 * 60 * 1000;

  if (isScheduledHour && isAnniversary(profile.createdAt, now) && follower.last_anniversary_year != now.getUTCFullYear()) {
    return { post: { type: 'anniversary' }, updates };
  }

  if (isScheduledHour && !postedRecently && now.getUTCDay() === config.weeklyUpdateDay &&
      (!follower.last_weekly_at || now - new Date(follower.last_weekly_at) >= 6 * DAY)) {
    return { post: { type: 'progress' }, updates };
  }

  return { post: null, updates };
}

/**
 * Changes to save to a follower's row after a post is sent
 */
export function getPostedUpdates(type, now) {
  const updates = { last_posted_at: now };

  if (type === 'welcome') {
    updates.welcomed_at = now;
  } else if (type === 'anniversary') {
    updates.last_anniversary_year = now.getUTCFullYear();
  } else if (type === 'progress') {
    updates.last_weekly_at = now;
  }

  return updates;
}

function isAnniversary(createdAt, now) {
  const created = new Date(createdAt);
  if (now.getUTCFullYear() <= created.getUTCFullYear()) {
    return false;
  }

  let month = created.getUTCMonth();
  let date = created.getUTCDate();

  // Accounts created on 29 February celebrate on 28 February in other years
  if (month === 1 && date === 29 && !isLeapYear(now.getUTCFullYear())) {
    date = 28;
  }

  return now.getUTCMonth() === month && now.getUTCDate() === date;
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
