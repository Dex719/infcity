import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { retry } from '@/app/retry';

describe('retry — повторы загрузки (FR-11.2, AC-11.2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('две неудачи, затем успех: три попытки с задержками 500 и 1500 мс', async () => {
    const task = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockRejectedValueOnce(new Error('500'))
      .mockRejectedValueOnce(new Error('500'))
      .mockResolvedValueOnce('ok');
    const promise = retry(task, [500, 1500]);
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(499);
    expect(task).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1500);
    expect(task).toHaveBeenCalledTimes(3);
    await expect(promise).resolves.toBe('ok');
  });

  it('после исчерпания повторов пробрасывает последнюю ошибку', async () => {
    const task = vi.fn(() => Promise.reject(new Error('down')));
    const promise = retry(task, [10, 20]);
    const settled = promise.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(100);
    const error = await settled;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('down');
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('без задержек — одна попытка', async () => {
    const task = vi.fn(() => Promise.reject(new Error('x')));
    await expect(retry(task, [])).rejects.toThrow('x');
    expect(task).toHaveBeenCalledTimes(1);
  });
});
