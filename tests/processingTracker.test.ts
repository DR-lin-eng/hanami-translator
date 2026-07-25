import { describe, expect, it } from "vitest";
import { ProcessingTracker } from "../src/lib/processingTracker";

describe("processing tracker", () => {
  it("accepts any number of independently submitted pages", () => {
    const tracker = new ProcessingTracker();
    for (let index = 0; index < 32; index += 1) {
      const jobId = `job-${index}`;
      tracker.startJob(jobId);
      expect(tracker.tryClaimPage(`page-${index}`, jobId)).toBe(true);
    }
    expect(tracker.jobCount).toBe(32);
  });

  it("prevents duplicate work for one page and releases only from its owner", () => {
    const tracker = new ProcessingTracker();
    tracker.startJob("first");
    tracker.startJob("second");
    expect(tracker.tryClaimPage("page", "first")).toBe(true);
    expect(tracker.tryClaimPage("page", "second")).toBe(false);
    tracker.releasePage("page", "second");
    expect(tracker.tryClaimPage("page", "second")).toBe(false);
    tracker.releasePage("page", "first");
    expect(tracker.tryClaimPage("page", "second")).toBe(true);
  });
});
