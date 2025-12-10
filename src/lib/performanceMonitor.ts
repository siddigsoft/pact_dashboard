interface PerformanceMetrics {
  fps: number;
  memoryUsage: number | null;
  jsHeapSize: number | null;
  pageLoadTime: number | null;
  timeToFirstByte: number | null;
  timeToInteractive: number | null;
  longTasks: number;
  resourceCount: number;
  cacheHitRate: number;
}

interface NetworkMetrics {
  effectiveType: string;
  downlink: number | null;
  rtt: number | null;
  saveData: boolean;
}

interface ApiCallMetrics {
  url: string;
  method: string;
  duration: number;
  status: number;
  timestamp: number;
  cached: boolean;
}

interface ComponentRenderMetrics {
  componentName: string;
  renderTime: number;
  renderCount: number;
  lastRender: number;
}

type PerformanceLevel = 'excellent' | 'good' | 'fair' | 'poor';

class PerformanceMonitor {
  private fpsHistory: number[] = [];
  private apiCalls: ApiCallMetrics[] = [];
  private componentMetrics: Map<string, ComponentRenderMetrics> = new Map();
  private longTaskCount = 0;
  private frameCount = 0;
  private lastFrameTime = 0;
  private rafId: number | null = null;
  private isMonitoring = false;
  private observers: Set<(metrics: PerformanceMetrics) => void> = new Set();

  private readonly MAX_API_HISTORY = 100;
  private readonly FPS_SAMPLE_SIZE = 60;

  start(): void {
    if (this.isMonitoring) return;
    this.isMonitoring = true;

    this.measureFps();
    this.observeLongTasks();

    console.log('[PerformanceMonitor] Started monitoring');
  }

  stop(): void {
    this.isMonitoring = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    console.log('[PerformanceMonitor] Stopped monitoring');
  }

  private measureFps(): void {
    const now = performance.now();

    if (this.lastFrameTime) {
      const delta = now - this.lastFrameTime;
      const fps = 1000 / delta;

      this.fpsHistory.push(fps);
      if (this.fpsHistory.length > this.FPS_SAMPLE_SIZE) {
        this.fpsHistory.shift();
      }
    }

    this.lastFrameTime = now;
    this.frameCount++;

    if (this.isMonitoring) {
      this.rafId = requestAnimationFrame(() => this.measureFps());
    }
  }

  private observeLongTasks(): void {
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 50) {
              this.longTaskCount++;
            }
          }
        });

        observer.observe({ entryTypes: ['longtask'] });
      } catch (e) {
      }
    }
  }

  getCurrentFps(): number {
    if (this.fpsHistory.length === 0) return 60;
    const sum = this.fpsHistory.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.fpsHistory.length);
  }

  getMemoryUsage(): { used: number; total: number; percentage: number } | null {
    const memory = (performance as any).memory;
    if (!memory) return null;

    return {
      used: memory.usedJSHeapSize,
      total: memory.jsHeapSizeLimit,
      percentage: Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100),
    };
  }

  getNetworkMetrics(): NetworkMetrics {
    const connection = (navigator as any).connection;

    return {
      effectiveType: connection?.effectiveType || 'unknown',
      downlink: connection?.downlink || null,
      rtt: connection?.rtt || null,
      saveData: connection?.saveData || false,
    };
  }

  getPageLoadMetrics(): {
    loadTime: number | null;
    ttfb: number | null;
    domContentLoaded: number | null;
  } {
    const timing = performance.timing;
    if (!timing) return { loadTime: null, ttfb: null, domContentLoaded: null };

    return {
      loadTime: timing.loadEventEnd - timing.navigationStart,
      ttfb: timing.responseStart - timing.navigationStart,
      domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
    };
  }

  trackApiCall(url: string, method: string, duration: number, status: number, cached = false): void {
    const metric: ApiCallMetrics = {
      url,
      method,
      duration,
      status,
      timestamp: Date.now(),
      cached,
    };

    this.apiCalls.push(metric);
    if (this.apiCalls.length > this.MAX_API_HISTORY) {
      this.apiCalls.shift();
    }

    if (duration > 3000) {
      console.warn(`[Performance] Slow API call: ${method} ${url} took ${duration}ms`);
    }
  }

  trackComponentRender(componentName: string, renderTime: number): void {
    const existing = this.componentMetrics.get(componentName);

    if (existing) {
      existing.renderTime = renderTime;
      existing.renderCount++;
      existing.lastRender = Date.now();
    } else {
      this.componentMetrics.set(componentName, {
        componentName,
        renderTime,
        renderCount: 1,
        lastRender: Date.now(),
      });
    }

    if (renderTime > 16) {
      console.warn(`[Performance] Slow render: ${componentName} took ${renderTime.toFixed(2)}ms`);
    }
  }

  getApiMetrics(): {
    averageLatency: number;
    successRate: number;
    cacheHitRate: number;
    slowCalls: ApiCallMetrics[];
  } {
    if (this.apiCalls.length === 0) {
      return { averageLatency: 0, successRate: 100, cacheHitRate: 0, slowCalls: [] };
    }

    const totalLatency = this.apiCalls.reduce((sum, call) => sum + call.duration, 0);
    const successfulCalls = this.apiCalls.filter(call => call.status >= 200 && call.status < 300);
    const cachedCalls = this.apiCalls.filter(call => call.cached);
    const slowCalls = this.apiCalls.filter(call => call.duration > 1000);

    return {
      averageLatency: Math.round(totalLatency / this.apiCalls.length),
      successRate: Math.round((successfulCalls.length / this.apiCalls.length) * 100),
      cacheHitRate: Math.round((cachedCalls.length / this.apiCalls.length) * 100),
      slowCalls: slowCalls.slice(-10),
    };
  }

  getSlowComponents(): ComponentRenderMetrics[] {
    return Array.from(this.componentMetrics.values())
      .filter(m => m.renderTime > 16)
      .sort((a, b) => b.renderTime - a.renderTime)
      .slice(0, 10);
  }

  getAllMetrics(): PerformanceMetrics {
    const memory = this.getMemoryUsage();
    const loadMetrics = this.getPageLoadMetrics();
    const apiMetrics = this.getApiMetrics();

    return {
      fps: this.getCurrentFps(),
      memoryUsage: memory?.percentage || null,
      jsHeapSize: memory?.used || null,
      pageLoadTime: loadMetrics.loadTime,
      timeToFirstByte: loadMetrics.ttfb,
      timeToInteractive: loadMetrics.domContentLoaded,
      longTasks: this.longTaskCount,
      resourceCount: performance.getEntriesByType('resource').length,
      cacheHitRate: apiMetrics.cacheHitRate,
    };
  }

  getPerformanceLevel(): PerformanceLevel {
    const fps = this.getCurrentFps();
    const memory = this.getMemoryUsage();
    const apiMetrics = this.getApiMetrics();

    let score = 100;

    if (fps < 30) score -= 30;
    else if (fps < 45) score -= 15;
    else if (fps < 55) score -= 5;

    if (memory && memory.percentage > 80) score -= 20;
    else if (memory && memory.percentage > 60) score -= 10;

    if (apiMetrics.averageLatency > 2000) score -= 20;
    else if (apiMetrics.averageLatency > 1000) score -= 10;

    if (this.longTaskCount > 20) score -= 15;
    else if (this.longTaskCount > 10) score -= 5;

    if (score >= 80) return 'excellent';
    if (score >= 60) return 'good';
    if (score >= 40) return 'fair';
    return 'poor';
  }

  getPerformanceReport(): string {
    const metrics = this.getAllMetrics();
    const network = this.getNetworkMetrics();
    const level = this.getPerformanceLevel();
    const apiMetrics = this.getApiMetrics();

    return `
=== Performance Report ===
Level: ${level.toUpperCase()}

Frame Rate: ${metrics.fps} FPS
Memory: ${metrics.memoryUsage ? metrics.memoryUsage + '%' : 'N/A'}
Long Tasks: ${metrics.longTasks}

Network:
- Type: ${network.effectiveType}
- Downlink: ${network.downlink ? network.downlink + ' Mbps' : 'N/A'}
- RTT: ${network.rtt ? network.rtt + 'ms' : 'N/A'}

API Calls:
- Avg Latency: ${apiMetrics.averageLatency}ms
- Success Rate: ${apiMetrics.successRate}%
- Cache Hit Rate: ${apiMetrics.cacheHitRate}%

Page Load:
- Total: ${metrics.pageLoadTime ? metrics.pageLoadTime + 'ms' : 'N/A'}
- TTFB: ${metrics.timeToFirstByte ? metrics.timeToFirstByte + 'ms' : 'N/A'}
==========================
    `.trim();
  }

  subscribe(callback: (metrics: PerformanceMetrics) => void): () => void {
    this.observers.add(callback);
    return () => this.observers.delete(callback);
  }

  reset(): void {
    this.fpsHistory = [];
    this.apiCalls = [];
    this.componentMetrics.clear();
    this.longTaskCount = 0;
    this.frameCount = 0;
  }
}

export const performanceMonitor = new PerformanceMonitor();

export function usePerformanceMetrics(updateInterval = 1000): PerformanceMetrics {
  const React = require('react');
  const [metrics, setMetrics] = React.useState(performanceMonitor.getAllMetrics() as PerformanceMetrics);

  React.useEffect(() => {
    performanceMonitor.start();

    const interval = setInterval(() => {
      setMetrics(performanceMonitor.getAllMetrics());
    }, updateInterval);

    return () => {
      clearInterval(interval);
    };
  }, [updateInterval]);

  return metrics;
}

export function trackRender(componentName: string) {
  return function <T extends (...args: any[]) => any>(fn: T): T {
    return function (this: any, ...args: any[]) {
      const start = performance.now();
      const result = fn.apply(this, args);
      const end = performance.now();
      performanceMonitor.trackComponentRender(componentName, end - start);
      return result;
    } as T;
  };
}

export type { PerformanceMetrics, NetworkMetrics, ApiCallMetrics, ComponentRenderMetrics, PerformanceLevel };
