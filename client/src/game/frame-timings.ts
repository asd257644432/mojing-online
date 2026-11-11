export interface FrameSummary { samples: number; p50?: number; p95?: number; max?: number; }

export class FrameTimings {
  private readonly durations = new Float64Array(240);
  private next = 0;
  private count = 0;

  record(duration: number) {
    if (!Number.isFinite(duration) || duration <= 0) return;
    this.durations[this.next] = duration;
    this.next = (this.next + 1) % this.durations.length;
    this.count = Math.min(this.count + 1,this.durations.length);
  }

  reset() {
    this.count = 0;
    this.next = 0;
  }

  summary(): FrameSummary {
    if (!this.count) return { samples: 0 };
    const sorted = this.durations.slice(0,this.count).sort();
    const percentile = (fraction: number) => sorted[Math.ceil(sorted.length*fraction)-1];
    return { samples: sorted.length, p50: percentile(.5), p95: percentile(.95), max: sorted[sorted.length-1] };
  }
}
