const targetUrl = process.env['TARGET_URL'];

if (!targetUrl) {
  throw new Error('TARGET_URL is required (e.g. http://localhost:8080)');
}

export const TARGET_URL = targetUrl.replace(/\/$/, '');
