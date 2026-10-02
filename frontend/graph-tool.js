import { evaluateExpression } from "./math-tools.js";

const GRAPH_COPY = {
  es: {
    empty: "Escribe una función de x, como sin(x).",
    invalidRange: "El rango debe tener un mínimo menor que el máximo.",
    invalidFunction: "No pude evaluar esa función en el rango indicado.",
    showing: "Mostrando",
    zoomIn: "Acercar",
    zoomOut: "Alejar"
  },
  en: {
    empty: "Enter a function of x, such as sin(x).",
    invalidRange: "The range needs a minimum smaller than the maximum.",
    invalidFunction: "I could not evaluate that function in the selected range.",
    showing: "Showing",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out"
  }
};

function niceStep(span) {
  const rough = span / 8;
  const power = 10 ** Math.floor(Math.log10(rough || 1));
  const normalized = rough / power;
  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * power;
}

export function initGraph({ language = "es" } = {}) {
  const root = document.querySelector("#graphView");
  if (!root) return { setLanguage() {} };

  let currentLanguage = language;
  let bounds = { min: -10, max: 10 };
  let chart = null;
  const canvas = root.querySelector("#graphCanvas");
  const context = canvas.getContext("2d");
  const expression = root.querySelector("#graphExpression");
  const minInput = root.querySelector("#graphMin");
  const maxInput = root.querySelector("#graphMax");
  const description = root.querySelector("#graphDescription");
  const message = root.querySelector("#graphMessage");
  const copy = () => GRAPH_COPY[currentLanguage] || GRAPH_COPY.es;
  const ChartClass = globalThis.Chart;

  const readRange = () => {
    const min = Number(minInput.value);
    const max = Number(maxInput.value);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) throw new Error(copy().invalidRange);
    bounds = { min, max };
    return bounds;
  };

  const makePoints = raw => {
    const count = Math.min(900, Math.max(320, Math.round((bounds.max - bounds.min) * 28)));
    const points = [];
    let finitePoints = 0;
    for (let index = 0; index <= count; index += 1) {
      const x = bounds.min + (index / count) * (bounds.max - bounds.min);
      try {
        const y = evaluateExpression(raw, { x });
        if (Number.isFinite(y) && Math.abs(y) < 1e8) {
          points.push({ x, y });
          finitePoints += 1;
        } else points.push({ x, y: null });
      } catch {
        points.push({ x, y: null });
      }
    }
    if (finitePoints < 2) throw new Error(copy().invalidFunction);
    return points;
  };

  const drawWithChart = (raw, points) => {
    if (!ChartClass) return false;
    if (chart) chart.destroy();
    chart = new ChartClass(context, {
      type: "line",
      data: {
        datasets: [{
          label: `y = ${raw}`,
          data: points,
          parsing: false,
          borderColor: "#ed765e",
          backgroundColor: "rgba(237,118,94,.12)",
          borderWidth: 2.5,
          pointRadius: 0,
          pointHitRadius: 8,
          spanGaps: false,
          tension: 0.12,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 180 },
        interaction: { intersect: false, mode: "index" },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: item => `(${item.parsed.x.toFixed(3)}, ${item.parsed.y.toFixed(3)})` } }
        },
        scales: {
          x: { type: "linear", min: bounds.min, max: bounds.max, title: { display: true, text: "x" }, grid: { color: "#e5eeee" } },
          y: { title: { display: true, text: "y" }, grid: { color: "#e5eeee" } }
        }
      }
    });
    return true;
  };

  const drawFallback = (raw, points) => {
    const width = canvas.clientWidth || 720;
    const height = canvas.clientHeight || 360;
    const yValues = points.map(point => point.y).filter(Number.isFinite);
    const yMax = Math.max(1, Math.max(...yValues.map(Math.abs)) * 1.12);
    const yMin = -yMax;
    const mapX = x => (x - bounds.min) / (bounds.max - bounds.min) * width;
    const mapY = y => height - (y - yMin) / (yMax - yMin) * height;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#fbfdfc";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#e5eeee";
    context.lineWidth = 1;
    const step = niceStep(bounds.max - bounds.min);
    for (let x = Math.ceil(bounds.min / step) * step; x <= bounds.max; x += step) { context.beginPath(); context.moveTo(mapX(x), 0); context.lineTo(mapX(x), height); context.stroke(); }
    for (let y = Math.ceil(yMin / step) * step; y <= yMax; y += step) { context.beginPath(); context.moveTo(0, mapY(y)); context.lineTo(width, mapY(y)); context.stroke(); }
    context.strokeStyle = "#ed765e";
    context.lineWidth = 2.5;
    context.beginPath();
    let started = false;
    points.forEach(point => {
      if (!Number.isFinite(point.y)) { started = false; return; }
      const px = mapX(point.x); const py = mapY(point.y);
      if (!started) context.moveTo(px, py); else context.lineTo(px, py);
      started = true;
    });
    context.stroke();
    context.fillStyle = "#17324d";
    context.font = "12px ui-monospace, monospace";
    context.fillText(`y = ${raw}`, 12, 20);
  };

  const draw = () => {
    const raw = expression.value.trim();
    message.textContent = "";
    if (!raw) { description.textContent = ""; message.textContent = copy().empty; if (chart) { chart.destroy(); chart = null; } return; }
    try {
      readRange();
      const points = makePoints(raw);
      if (!drawWithChart(raw, points)) drawFallback(raw, points);
      description.textContent = `${copy().showing} y = ${raw} · ${bounds.min} ≤ x ≤ ${bounds.max}`;
    } catch (error) {
      message.textContent = error.message;
      description.textContent = "";
    }
  };

  root.querySelector("#plotGraph").addEventListener("click", draw);
  root.querySelector("#resetGraph").addEventListener("click", () => { minInput.value = -10; maxInput.value = 10; bounds = { min: -10, max: 10 }; draw(); });
  root.querySelector("#zoomOut").addEventListener("click", () => { const center = (bounds.min + bounds.max) / 2; const span = (bounds.max - bounds.min) * 1.35; minInput.value = (center - span / 2).toFixed(2); maxInput.value = (center + span / 2).toFixed(2); draw(); });
  root.querySelector("#zoomIn").addEventListener("click", () => { const center = (bounds.min + bounds.max) / 2; const span = (bounds.max - bounds.min) * 0.7; minInput.value = (center - span / 2).toFixed(2); maxInput.value = (center + span / 2).toFixed(2); draw(); });
  root.querySelector("#applyRange").addEventListener("click", draw);
  expression.addEventListener("input", draw);
  [minInput, maxInput].forEach(input => input.addEventListener("keydown", event => { if (event.key === "Enter") draw(); }));
  canvas.addEventListener("wheel", event => { event.preventDefault(); const factor = event.deltaY > 0 ? 1.15 : 0.85; const center = (bounds.min + bounds.max) / 2; const span = (bounds.max - bounds.min) * factor; minInput.value = (center - span / 2).toFixed(2); maxInput.value = (center + span / 2).toFixed(2); draw(); }, { passive: false });
  window.addEventListener("resize", () => { if (!chart) draw(); else chart.resize(); });
  draw();
  return { setLanguage(next) { currentLanguage = next; draw(); } };
}
