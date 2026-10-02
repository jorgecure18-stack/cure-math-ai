import test from "node:test";
import assert from "node:assert/strict";
import { evaluateExpression } from "./math-tools.js";

test("respeta operaciones y precedencia", () => {
  assert.equal(evaluateExpression("2+3*4"), 14);
  assert.equal(evaluateExpression("2^3^2"), 512);
  assert.equal(evaluateExpression("-x^2", { x: 3 }), -9);
  assert.equal(evaluateExpression("2x", { x: 4 }), 8);
  assert.equal(evaluateExpression("sin(pi/2)"), 1);
});

test("devuelve errores controlados", () => {
  assert.throws(() => evaluateExpression("1/0"));
  assert.throws(() => evaluateExpression("(2+3"));
  assert.throws(() => evaluateExpression("sqrt(-1)"));
});
