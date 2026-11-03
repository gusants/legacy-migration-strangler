import { TARGET_URL } from './target.js';

describe('health', () => {
  it('answers GET /health with status ok', async () => {
    const response = await fetch(`${TARGET_URL}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok' });
  });
});
