import { describe, expect, it } from "vitest";
import { runConcurrent } from "../src/lib/pipeline";

describe("concurrent pipeline", () => {
  it("does not start more items after cancellation", async () => {
    const started: number[] = [];
    let stopped = false;

    await runConcurrent([1, 2, 3, 4], 2, async (item) => {
      started.push(item);
      if (started.length === 2) stopped = true;
    }, () => stopped);

    expect(started).toEqual([1, 2]);
  });
});
