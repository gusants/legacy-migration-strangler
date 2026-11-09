export const INITIAL_BACKOFF_MS = 1_000;
export const MAX_BACKOFF_MS = 30_000;

export class ExponentialBackoff {
  private delayMs = 0;

  constructor(
    private readonly initialMs: number = INITIAL_BACKOFF_MS,
    private readonly maxMs: number = MAX_BACKOFF_MS,
  ) {}

  get isActive(): boolean {
    return this.delayMs > 0;
  }

  get current(): number {
    return this.delayMs;
  }

  escalate(): number {
    this.delayMs = this.isActive ? Math.min(this.delayMs * 2, this.maxMs) : this.initialMs;
    return this.delayMs;
  }

  reset(): void {
    this.delayMs = 0;
  }
}
