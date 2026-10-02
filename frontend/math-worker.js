/*
 * Evaluates graph samples away from the UI thread.
 * math.js is loaded inside the worker because workers do not share window.
 */
importScripts("https://cdn.jsdelivr.net/npm/mathjs@14.0.1/lib/browser/math.js");

self.onmessage = event => {
  const { requestId, expression, min, max, count } = event.data || {};
  try {
    const compiled = math.compile(expression);
    const points = [];
    let finitePoints = 0;

    for (let index = 0; index <= count; index += 1) {
      const x = min + (index / count) * (max - min);
      let y = null;
      try {
        const value = compiled.evaluate({ x });
        if (typeof value === "number" && Number.isFinite(value) && Math.abs(value) < 1e8) {
          y = value;
          finitePoints += 1;
        }
      } catch {
        // A discontinuity is represented as a gap in the chart.
      }
      points.push({ x, y });
    }

    self.postMessage({ requestId, success: finitePoints >= 2, points });
  } catch (error) {
    self.postMessage({ requestId, success: false, error: error.message });
  }
};
