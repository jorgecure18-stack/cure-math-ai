export function createSlidingLimiter({ limit, windowMs, cleanupMs = windowMs }) {
  const buckets = new Map();
  const cleanup = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, timestamps] of buckets) {
      const fresh = timestamps.filter(timestamp => timestamp > cutoff);
      if (fresh.length) buckets.set(key, fresh);
      else buckets.delete(key);
    }
  }, cleanupMs);
  cleanup.unref?.();

  return {
    check(key) {
      const now = Date.now();
      const cutoff = now - windowMs;
      const timestamps = (buckets.get(key) || []).filter(timestamp => timestamp > cutoff);
      const allowed = timestamps.length < limit;
      if (allowed) timestamps.push(now);
      buckets.set(key, timestamps);
      const retryAfter = timestamps.length ? Math.max(1, Math.ceil((timestamps[0] + windowMs - now) / 1000)) : 1;
      return { allowed, remaining: Math.max(0, limit - timestamps.length), retryAfter };
    },
    clear() {
      clearInterval(cleanup);
      buckets.clear();
    }
  };
}
