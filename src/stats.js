import { getPublicAgent } from './bluesky.js';

const PROFILES_PER_REQUEST = 25;

/**
 * Fetch profiles in batches, returned as a Map of did -> profile
 */
export async function getProfiles(dids) {
  const agent = getPublicAgent();
  const profiles = new Map();

  for (let i = 0; i < dids.length; i += PROFILES_PER_REQUEST) {
    const actors = dids.slice(i, i + PROFILES_PER_REQUEST);
    const response = await agent.getProfiles({ actors });
    for (const profile of response.data.profiles) {
      profiles.set(profile.did, profile);
    }
  }

  return profiles;
}

/**
 * Fetch a user's milestone stats from the Post Milestone web app
 */
export async function getStats(siteUrl, handle) {
  const response = await fetch(`${siteUrl}/api/info/${encodeURIComponent(handle)}`);

  if (!response.ok) {
    throw new Error(`Could not fetch stats for ${handle}: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

// Milestones are every power of ten up to 1,000, then every 1,000
// This matches getMilestoneStep in the web app
function getMilestoneStep(n) {
  return Math.pow(10, Math.min(String(n).length, 4) - 1);
}

export function getNextMilestone(n) {
  const step = getMilestoneStep(n);
  return Math.ceil(n / step) * step;
}

export function getLastMilestone(n) {
  const step = getMilestoneStep(n);
  return Math.floor(n / step) * step;
}
