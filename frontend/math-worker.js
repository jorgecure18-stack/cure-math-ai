// Web Worker de matemáticas. Mantiene el hilo de la interfaz libre.
import { compilar, evaluarRPN, formatear } from "./math-evaluator.js";

const cache = new Map();
function obtenerRPN(expression) {
  if (!cache.has(expression)) {
    if (cache.size >= 20) cache.delete(cache.keys().next().value);
    cache.set(expression, compilar(expression));
  }
  return cache.get(expression);
}

self.onmessage = ({ data }) => {
  const { id, accion } = data || {};
  try {
    if (accion === "evaluate") {
      const rpn = obtenerRPN(data.expresion);
      if (rpn.some(token => token.type === "variable")) throw new Error("La variable x no está definida en la calculadora.");
      self.postMessage({ id, ok: true, resultado: formatear(evaluarRPN(rpn, Number.NaN, data.modoAngulo)) });
      return;
    }
    if (accion === "generatePoints") {
      const desde = Number(data.desde);
      const hasta = Number(data.hasta);
      if (!Number.isFinite(desde) || !Number.isFinite(hasta) || desde >= hasta) throw new Error("El rango Desde/Hasta no es válido.");
      const count = Math.min(4000, Math.max(2, Math.floor(data.pasos) || 400));
      const rpn = obtenerRPN(data.expresion);
      const points = new Float64Array(count * 2);
      const step = (hasta - desde) / (count - 1);
      let finite = 0;
      for (let index = 0; index < count; index += 1) {
        const x = desde + index * step;
        let y = Number.NaN;
        try { y = evaluarRPN(rpn, x, data.modoAngulo || "rad"); } catch { /* discontinuidad */ }
        points[index * 2] = x;
        points[index * 2 + 1] = y;
        if (Number.isFinite(y)) finite += 1;
      }
      if (finite < 2) throw new Error("No pude evaluar la función en el rango indicado.");
      self.postMessage({ id, ok: true, puntos: points }, [points.buffer]);
      return;
    }
    throw new Error("Acción desconocida.");
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || "Error matemático." });
  }
};
