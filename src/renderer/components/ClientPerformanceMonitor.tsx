import { useEffect } from 'react';
import type { UIStallReport } from '../../shared/types';

const EVENT_LOOP_INTERVAL_MS = 500;
const EVENT_LOOP_THRESHOLD_MS = 120;
const REPORT_COOLDOWN_MS = 1000;

interface ClientPerformanceMonitorProps {
  source: string;
}

export default function ClientPerformanceMonitor({ source }: ClientPerformanceMonitorProps) {
  useEffect(() => {
    if (!window.electronAPI?.debug?.reportUIStall) {
      return;
    }

    let lastReportAt = 0;
    let stopped = false;
    let timeoutId: number | undefined;
    let observer: PerformanceObserver | undefined;

    const report = (payload: Omit<UIStallReport, 'source' | 'url' | 'visibilityState'>) => {
      const now = Date.now();
      if (now - lastReportAt < REPORT_COOLDOWN_MS) {
        return;
      }

      lastReportAt = now;
      window.electronAPI.debug.reportUIStall({
        ...payload,
        source,
        url: window.location.href,
        visibilityState: document.visibilityState,
      });
    };

    if ('PerformanceObserver' in window) {
      try {
        observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            report({
              type: 'long-task',
              name: entry.name,
              duration: entry.duration,
              startedAt: performance.timeOrigin + entry.startTime,
              blockedFor: Math.max(0, entry.duration - 50),
            });
          }
        });
        observer.observe({ entryTypes: ['longtask'] });
      } catch {
        observer = undefined;
      }
    }

    let expected = performance.now() + EVENT_LOOP_INTERVAL_MS;
    const tick = () => {
      if (stopped) {
        return;
      }

      const now = performance.now();
      const delay = now - expected;
      if (delay > EVENT_LOOP_THRESHOLD_MS) {
        report({
          type: 'event-loop',
          duration: delay,
          startedAt: Date.now() - delay,
          blockedFor: delay,
        });
      }

      expected = performance.now() + EVENT_LOOP_INTERVAL_MS;
      timeoutId = window.setTimeout(tick, EVENT_LOOP_INTERVAL_MS);
    };

    timeoutId = window.setTimeout(tick, EVENT_LOOP_INTERVAL_MS);

    return () => {
      stopped = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      observer?.disconnect();
    };
  }, [source]);

  return null;
}
