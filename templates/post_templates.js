// Post templates for each type of post
// Each template is given the user's stats from the Post Milestone web app

const n = (number) => Number(number).toLocaleString('en-GB');

const years = (count) => `${count} year${count === 1 ? '' : 's'}`;

const timesADay = (postTimes) => postTimes === 1 ? 'once a day' : `${n(postTimes)} times a day`;

export const WELCOME_TEMPLATES = [
  (s) => `👋 Thanks for following, @${s.handle}! You're ${n(s.postDifference)} posts away from ${n(s.nextMilestone)}. I'll let you know when you get there, and send you a progress update every week.`,
  (s) => `👋 Hello @${s.handle}! You've posted ${n(s.postCount)} times so far, so your next milestone is ${n(s.nextMilestone)}. I'll cheer you on when you reach it.`
];

export const MILESTONE_TEMPLATES = [
  (s, milestone) => `🎉 Congratulations @${s.handle}, you've reached ${n(milestone)} posts!`,
  (s, milestone) => `🎉 ${n(milestone)} posts! Nice one, @${s.handle}. Next stop: ${n(s.nextMilestone)}.`,
  (s, milestone) => `🥳 @${s.handle} just passed ${n(milestone)} posts. That's an average of ${n(s.averagePosts)} posts a day!`,
  (s, milestone) => `🎈 Milestone reached! @${s.handle} has made ${n(milestone)} posts on Bluesky.`
];

export const PROGRESS_TEMPLATES = [
  (s) => `📈 Weekly update for @${s.handle}: ${n(s.postCount)} posts, ${n(s.postDifference)} to go until ${n(s.nextMilestone)}.`,
  (s) => `📈 @${s.handle}, you're ${n(s.postDifference)} posts from ${n(s.nextMilestone)}. Post at least ${timesADay(s.postTimes)} to get there by your next anniversary.`,
  (s) => `📈 This week's progress for @${s.handle}: ${n(s.postCount)} posts so far, averaging ${n(s.averagePosts)} a day. ${n(s.nextMilestone)} is ${n(s.postDifference)} posts away.`
];

export const ANNIVERSARY_TEMPLATES = [
  (s) => `🎂 Happy Bluesky anniversary, @${s.handle}! ${years(s.ageYears)} and ${n(s.postCount)} posts.`,
  (s) => `🎂 @${s.handle} joined Bluesky ${years(s.ageYears)} ago today, and has posted ${n(s.postCount)} times since. Next milestone: ${n(s.nextMilestone)}.`,
  (s) => `🎂 ${years(s.ageYears)} on Bluesky! Happy anniversary, @${s.handle}. You've averaged ${n(s.averagePosts)} posts a day.`
];

const TEMPLATES = {
  welcome: WELCOME_TEMPLATES,
  milestone: MILESTONE_TEMPLATES,
  progress: PROGRESS_TEMPLATES,
  anniversary: ANNIVERSARY_TEMPLATES
};

// Get random template
export function getRandomWord(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// Count graphemes, which is how Bluesky measures post length
export function countGraphemes(text) {
  return [...new Intl.Segmenter().segment(text)].length;
}

// Format a post, falling back to the shortest template if a long handle
// pushes it over the 300 grapheme limit
export function formatPost(type, stats, milestone) {
  const templates = TEMPLATES[type];
  const post = getRandomWord(templates)(stats, milestone);

  if (countGraphemes(post) <= 300) {
    return post;
  }

  return templates
    .map(template => template(stats, milestone))
    .sort((a, b) => countGraphemes(a) - countGraphemes(b))[0];
}

// Text for the link card
export function formatLinkCard(type, stats, milestone) {
  const titles = {
    welcome: `${stats.handle}'s post milestone`,
    milestone: `${stats.handle} reached ${n(milestone)} posts`,
    progress: `${stats.handle} is ${n(stats.postDifference)} posts from ${n(stats.nextMilestone)}`,
    anniversary: `${stats.handle} has been on Bluesky for ${years(stats.ageYears)}`
  };

  return {
    title: titles[type],
    description: 'See your next post milestone and how often you need to post to reach it by your next anniversary.'
  };
}
