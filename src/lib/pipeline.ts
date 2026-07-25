export async function runConcurrent<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
  shouldStop: () => boolean = () => false,
): Promise<void> {
  let cursor = 0;
  const count = Math.max(1, Math.min(concurrency, items.length));
  const runners = Array.from({ length: count }, async () => {
    while (cursor < items.length && !shouldStop()) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}
