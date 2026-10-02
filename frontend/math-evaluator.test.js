import test from "node:test";
import assert from "node:assert/strict";
import { evaluar } from "./math-evaluator.js";

test("precedencia, asociatividad y multiplicación implícita", () => {
  assert.equal(evaluar("2+3*4"), 14);
  assert.equal(evaluar("2^3^2"), 512);
  assert.equal(evaluar("-x^2", 3), -9);
  assert.equal(evaluar("2^-1"), 0.5);
  assert.equal(evaluar("2x", 4), 8);
  assert.equal(evaluar("2(3+1)"), 8);
});

test("funciones, grados y errores controlados", () => {
  assert.equal(evaluar("sin(pi/2)"), 1);
  assert.equal(evaluar("sin(90)", Number.NaN, "deg"), 1);
  assert.equal(evaluar("log(1000)"), 3);
  assert.throws(() => evaluar("1/0"), /cero/);
  assert.throws(() => evaluar("(2+3"), /desbalanceados/);
  assert.throws(() => evaluar("sqrt(-1)"), /Dominio/);
  assert.throws(() => evaluar(""), /vacía/);
  assert.throws(() => evaluar("alert(1)"), /desconocido/);
});
