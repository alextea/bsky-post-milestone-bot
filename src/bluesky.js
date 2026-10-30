import { AtpAgent, RichText } from '@atproto/api';

let agent;

// Reads don't need to be logged in, so dry runs work without credentials
const publicAgent = new AtpAgent({
  service: 'https://public.api.bsky.app'
});

export async function initBluesky() {
  if (!process.env.BLUESKY_IDENTIFIER || !process.env.BLUESKY_PASSWORD) {
    throw new Error('BLUESKY_IDENTIFIER and BLUESKY_PASSWORD environment variables are required');
  }

  agent = new AtpAgent({
    service: 'https://bsky.social'
  });

  await agent.login({
    identifier: process.env.BLUESKY_IDENTIFIER,
    password: process.env.BLUESKY_PASSWORD
  });

  console.log('✓ Authenticated with Bluesky');
  return agent;
}

/**
 * Create a post with a link card
 * Mentions in the text are turned into facets, which notify the mentioned user
 * Pass reply as { root, parent }, each { uri, cid }, to reply to a post
 */
export async function createPost(text, link, reply = null) {
  if (!agent) {
    await initBluesky();
  }

  try {
    const rt = new RichText({ text });
    await rt.detectFacets(agent);

    const postRecord = {
      text: rt.text,
      facets: rt.facets,
      createdAt: new Date().toISOString()
    };

    if (reply) {
      postRecord.reply = reply;
    }

    if (link) {
      const external = {
        uri: link.url,
        title: link.title,
        description: link.description || ''
      };

      if (link.image) {
        try {
          const uploadResponse = await agent.uploadBlob(link.image.data, { encoding: link.image.mimeType });
          external.thumb = uploadResponse.data.blob;
          console.log('✓ Image uploaded successfully');
        } catch (imageError) {
          console.warn('Could not upload image:', imageError.message);
        }
      }

      postRecord.embed = {
        $type: 'app.bsky.embed.external',
        external
      };
    }

    const response = await agent.post(postRecord);
    console.log('✓ Post created successfully');
    return response;
  } catch (error) {
    console.error('Error creating post:', error);
    throw error;
  }
}

export function getAgent() {
  return agent;
}

export function getPublicAgent() {
  return publicAgent;
}
