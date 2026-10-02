import test from "node:test";
import assert from "node:assert/strict";
import { createSlidingLimiter } from "../rate-limit.js";

test("limita y luego libera una clave cuando termina la ventana", async () => {
  const limiter = createSlidingLimiter({ limit: 2, windowMs: 25, cleanupMs: 25 });
  assert.equal(limiter.check("device-a").allowed, true);
  assert.equal(limiter.check("device-a").allowed, true);
  const blocked = limiter.check("device-a");
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  await new Promise(resolve => setTimeout(resolve, 35));
  assert.equal(limiter.check("device-a").allowed, true);
  limiter.clear();
});

test("mantiene límites independientes por clave", () => {
  const limiter = createSlidingLimiter({ limit: 1, windowMs: 60_000 });
  assert.equal(limiter.check("a").allowed, true);
  assert.equal(limiter.check("a").allowed, false);
  assert.equal(limiter.check("b").allowed, true);
  limiter.clear();
});
