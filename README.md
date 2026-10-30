# Post Milestone Bluesky Bot

Bluesky bot for [Post Milestone](https://github.com/alextea/bsky-post-milestone) that posts to its followers about their post milestones.

## Features

Following the bot opts you in, unfollowing opts you out. Each follower gets:

- a welcome post when they follow
- a celebration when they reach a post milestone
- a weekly progress update towards their next milestone (day configurable)
- an anniversary post on the day they joined Bluesky

Anyone who mentions the bot, follower or not, gets a reply with their stats. People who don't follow the bot are asked to follow it for updates.

Every post mentions the follower and includes a link card to their Post Milestone page, using a screenshot of their `/social-share` page as the image.

The bot runs once an hour and exits. Followers get at most one scheduled post per run.

## Project Structure

```
├── src/
│   ├── post.js           # Main entry point (run this)
│   ├── bluesky.js        # Bluesky API client
│   ├── config.js         # Schedule and limit settings
│   ├── database.js       # PostgreSQL database queries
│   ├── followers.js      # Syncs followers from Bluesky
│   ├── mentions.js       # Fetches posts that mention the bot
│   ├── schedule.js       # Decides which post each follower is due
│   ├── screenshot.js     # Screenshot service client
│   └── stats.js          # Profiles and milestone stats
├── templates/
│   └── post_templates.js # Post text templates
├── package.json
├── railway.json          # Railway cron configuration
└── .env.example          # Environment variables template
```

## How it works

1. Fetch everyone following the bot and their post counts, and update the `followers` table. New followers start with their next milestone set from their current post count.
2. Reply to posts that have mentioned the bot since the last run. Replies to the bot's own posts only count if they mention the bot too, so people saying thanks don't get their stats back. Each person gets at most 3 replies a day.
3. For each follower, pick the post they are due, in this order: welcome, milestone, anniversary, weekly update.
4. For each post, fetch the follower's stats from the web app's `/api/info/:handle` endpoint, screenshot `/social-share/:handle/:type`, and post with a link card to `/info/:handle`.

The bot needs the web app to be deployed with the `/api/info` and `/social-share/:handle/:type` routes.

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

- **Bluesky:** the bot account's handle and an [app password](https://bsky.app/settings/app-passwords)
- **Database:** `DATABASE_URL` from the Railway Postgres service. Tables are created on the first run.
- **Site:** `SITE_URL` of the Post Milestone web app
- **Screenshot service:** the same settings as music-genre-ator. Add the `SITE_URL` domain to the screenshot service's allowed domains.
- **Schedule:** `WEEKLY_UPDATE_DAY` and `SCHEDULED_POST_HOUR` (UTC) control when weekly updates and anniversary posts are sent
- **Limits:** `MAX_POSTS_PER_RUN` (default 50) and `MIN_MILESTONE` (default 100)

## Test Locally

Run in dry-run mode to see what would be posted, without posting or saving anything:

```bash
npm test
```

Run for real:

```bash
npm start
```

## Deployment

Deploy to Railway as a new service in a project with a Postgres database:

```bash
railway login
railway init
railway up
```

Set the environment variables from `.env.example` in the Railway dashboard. `railway.json` runs the bot every hour (`0 * * * *`).

Check the logs with:

```bash
railway logs
```
