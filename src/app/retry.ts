import { ASSETS } from '@/config';

/** Пауза на `ms` миллисекунд (для повторов загрузки). */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Повторяет асинхронную задачу после ошибки с задержками `delaysMs` (FR-11.2):
 * первая попытка сразу, затем по одной на каждую задержку. Последняя ошибка пробрасывается.
 */
export async function retry<T>(
  task: (attempt: number) => Promise<T>,
  delaysMs: readonly number[] = ASSETS.RETRY_BACKOFF_MS,
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await task(attempt);
    } catch (error: unknown) {
      const wait = delaysMs[attempt];
      if (wait === undefined) {
        throw error;
      }
      console.warn(
        `retry: attempt ${String(attempt + 1)} failed, next in ${String(wait)} ms`,
        error,
      );
      attempt++;
      await delay(wait);
    }
  }
}
