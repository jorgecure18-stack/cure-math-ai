function buildLimiter({ limit, windowMs, cleanupMs = windowMs }) {
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

export const createSlidingLimiter = options => buildLimiter(options);
export function crearLimitador(max, ventanaMs, ahora = () => Date.now()) {
  const registros = new Map();
  return {
    intentar(clave) {
      const ahoraMs = ahora();
      const vigentes = (registros.get(clave) || []).filter(timestamp => ahoraMs - timestamp < ventanaMs);
      if (vigentes.length >= max) {
        registros.set(clave, vigentes);
        return { ok: false, reintentarEn: Math.max(1, Math.ceil((vigentes[0] + ventanaMs - ahoraMs) / 1000)) };
      }
      vigentes.push(ahoraMs);
      registros.set(clave, vigentes);
      return { ok: true, reintentarEn: 0 };
    },
    limpiar() {
      const ahoraMs = ahora();
      for (const [clave, timestamps] of registros) {
        const vigentes = timestamps.filter(timestamp => ahoraMs - timestamp < ventanaMs);
        if (vigentes.length) registros.set(clave, vigentes);
        else registros.delete(clave);
      }
    },
    get tamano() { return registros.size; }
  };
}
