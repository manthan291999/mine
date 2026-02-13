export class SlidingWindowRateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly maxPerWindow: number,
    private readonly windowMs: number
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const list = this.hits.get(key) ?? [];
    const floor = now - this.windowMs;
    const next = list.filter((ts) => ts >= floor);
    if (next.length >= this.maxPerWindow) {
      this.hits.set(key, next);
      return false;
    }

    next.push(now);
    this.hits.set(key, next);
    return true;
  }
}
