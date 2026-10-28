const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function parseDay(value) {
  const day = String(value).trim().toLowerCase();
  const index = DAYS.indexOf(day);
  if (index !== -1) {
    return index;
  }

  const number = parseInt(day, 10);
  if (number >= 0 && number <= 6) {
    return number;
  }

  throw new Error(`WEEKLY_UPDATE_DAY must be a day name or 0-6, got "${value}"`);
}

export function getConfig() {
  return {
    siteUrl: (process.env.SITE_URL || '').replace(/\/$/, ''),
    weeklyUpdateDay: parseDay(process.env.WEEKLY_UPDATE_DAY || 'sunday'),
    scheduledPostHour: parseInt(process.env.SCHEDULED_POST_HOUR || '12', 10),
    maxPostsPerRun: parseInt(process.env.MAX_POSTS_PER_RUN || '50', 10),
    minMilestone: parseInt(process.env.MIN_MILESTONE || '100', 10)
  };
}
