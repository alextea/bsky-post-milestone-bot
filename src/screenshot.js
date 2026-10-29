// Screenshot configuration from environment variables
const config = {
  screenshotServiceUrl: process.env.SCREENSHOT_SERVICE_URL,
  screenshotServiceApiKey: process.env.SCREENSHOT_SERVICE_API_KEY,
  saveS3Bucket: process.env.SAVE_S3_BUCKET,
  saveS3Region: process.env.SAVE_S3_REGION,
  screenshotW: 1200,
  screenshotH: 630,
  // JPEG keeps images under Bluesky's 1MB blob limit
  screenshotFormat: 'jpeg',
  appName: 'post-milestone'
};

const POLL_INTERVAL = 2000;
const POLL_TIMEOUT = 60000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Request a screenshot from the screenshot service and wait for it to finish
 * @param {string} url - Page to screenshot
 * @param {string} key - S3 key, without the app name or extension
 * @returns {Promise<string>} URL of the uploaded image
 */
export async function captureScreenshot(url, key) {
  const body = {
    url,
    storage: {
      provider: 's3',
      bucket: config.saveS3Bucket,
      region: config.saveS3Region,
      key: `${config.appName}/${key}.jpg`
    },
    viewport: {
      width: config.screenshotW,
      height: config.screenshotH
    },
    format: config.screenshotFormat,
    options: {
      waitUntil: 'networkidle0',
      timeout: 30000,
      quality: 85
    },
    metadata: {
      app: config.appName,
      resourceId: key,
      resourceType: 'social-share'
    }
  };

  await request('/v1/screenshot', {
    method: 'POST',
    body: JSON.stringify(body)
  });

  // Wait for the image to appear in S3, rather than polling the job status.
  // The service runs on more than one machine and keeps jobs in memory, so
  // a status request can go to a machine that doesn't know about the job.
  const { bucket, region, key: s3Key } = body.storage;
  const imageUrl = `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`;

  const started = Date.now();
  while (Date.now() - started < POLL_TIMEOUT) {
    await sleep(POLL_INTERVAL);
    const response = await fetch(imageUrl, { method: 'HEAD' });

    if (response.ok) {
      return imageUrl;
    }
  }

  throw new Error(`Screenshot timed out for ${url}`);
}

/**
 * Download an image so it can be uploaded to Bluesky
 */
export async function fetchImage(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Could not fetch image ${url}: ${response.status}`);
  }

  return {
    data: new Uint8Array(await response.arrayBuffer()),
    mimeType: response.headers.get('content-type') || 'image/jpeg'
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${config.screenshotServiceUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.screenshotServiceApiKey}`
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP error status: ${response.status}\n` +
      `URL: ${config.screenshotServiceUrl}${path}\n` +
      `Response: ${await response.text()}`);
  }

  return response.json();
}
