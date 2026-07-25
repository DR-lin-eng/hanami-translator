export class ProcessingTracker {
  private readonly jobs = new Set<string>();
  private readonly pageJobs = new Map<string, string>();

  startJob(jobId: string): void {
    this.jobs.add(jobId);
  }

  finishJob(jobId: string): void {
    this.jobs.delete(jobId);
    for (const [pageId, owner] of this.pageJobs) {
      if (owner === jobId) this.pageJobs.delete(pageId);
    }
  }

  tryClaimPage(pageId: string, jobId: string): boolean {
    if (this.pageJobs.has(pageId)) return false;
    this.pageJobs.set(pageId, jobId);
    return true;
  }

  releasePage(pageId: string, jobId: string): void {
    if (this.pageJobs.get(pageId) === jobId) this.pageJobs.delete(pageId);
  }

  activeJobIds(): string[] {
    return [...this.jobs];
  }

  get jobCount(): number {
    return this.jobs.size;
  }
}
