import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, ApiError } from '../api';

// Railway Serverless: a slept backend's first requests can get 502/503/504 while it boots.
describe('api — waking a slept backend', () => {
  const waking = () => ({ ok: false, status: 502, json: vi.fn().mockRejectedValue(new Error('not json')) });
  const ready = () => ({ ok: true, status: 200, json: vi.fn().mockResolvedValue({ success: true, data: { up: true } }) });

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('retries a GET until the backend answers', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(waking() as unknown as Response)
      .mockResolvedValueOnce(waking() as unknown as Response)
      .mockResolvedValueOnce(ready() as unknown as Response);

    const result = api.get('/wake-test-get');
    await vi.runAllTimersAsync();

    await expect(result).resolves.toEqual({ success: true, data: { up: true } });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('does not resend a write', async () => {
    vi.mocked(fetch).mockResolvedValue(waking() as unknown as Response);

    const result = api.post('/wake-test-post', { a: 1 });
    const settled = expect(result).rejects.toThrow(ApiError);
    await vi.runAllTimersAsync();

    await settled;
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
