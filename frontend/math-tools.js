const FUNCTIONS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor,
  ceil: Math.ceil, round: Math.round, exp: Math.exp, log: Math.log10, ln: Math.log
};
const CONSTANTS = { pi: Math.PI, e: Math.E };

function tokenize(input) {
  const tokens = [];
  const source = String(input || "").replace(/π/g, "pi").replace(/√/g, "sqrt").replace(/−/g, "-");
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) { index += 1; continue; }
    const number = source.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
    if (number) { tokens.push({ type: "number", value: Number(number[0]) }); index += number[0].length; continue; }
    const name = source.slice(index).match(/^[a-z]+/i);
    if (name) { tokens.push({ type: "name", value: name[0].toLowerCase() }); index += name[0].length; continue; }
    if ("+-*/^(),%!".includes(char)) { tokens.push({ type: char, value: char }); index += 1; continue; }
    throw new Error(`Unknown symbol: ${char}`);
  }
  return tokens;
}

function addImplicitMultiplication(tokens) {
  const valueEnd = token => token.type === "number" || token.type === ")" || token.type === "!" || (token.type === "name" && (CONSTANTS[token.value] !== undefined || token.value === "x"));
  const valueStart = token => token.type === "number" || token.type === "(" || token.type === "name";
  const result = [];
  tokens.forEach((token, index) => {
    const previous = tokens[index - 1];
    const functionCall = previous?.type === "name" && FUNCTIONS[previous.value] && token.type === "(";
    if (((previous && valueEnd(previous) && valueStart(token)) || previous?.type === ")" && token.type === "name" || previous?.type === "!" && token.type === "name") && !functionCall) result.push({ type: "*", value: "*" });
    result.push(token);
  });
  return result;
}

function toRpn(input) {
  const output = []; const stack = [];
  // La potencia se evalúa antes del menos unario: -x^2 significa -(x^2).
  const precedence = { "u-": 3, "!": 5, "^": 3, "*": 2, "/": 2, "%": 2, "+": 1, "-": 1 };
  const rightAssociative = new Set(["^", "u-"]); let previous = "start";
  for (const token of addImplicitMultiplication(tokenize(input))) {
    if (token.type === "number") { output.push(token); previous = "value"; continue; }
    if (token.type === "name") {
      if (FUNCTIONS[token.value]) stack.push({ type: "function", value: token.value });
      else if (CONSTANTS[token.value] !== undefined || token.value === "x") output.push(token);
      else throw new Error(`Unknown name: ${token.value}`);
      previous = FUNCTIONS[token.value] ? "function" : "value"; continue;
    }
    if (token.type === "(") { stack.push(token); previous = "("; continue; }
    if (token.type === ")") {
      while (stack.length && stack.at(-1).type !== "(") output.push(stack.pop());
      if (!stack.length) throw new Error("Missing parenthesis");
      stack.pop(); if (stack.at(-1)?.type === "function") output.push(stack.pop());
      previous = "value"; continue;
    }
    if (token.type === ",") throw new Error("Multiple arguments are not supported");
    if (token.type === "!") {
      if (previous !== "value") throw new Error("Factorial needs a value");
      while (stack.length && stack.at(-1).type === "operator" && precedence[stack.at(-1).value] >= precedence["!"]) output.push(stack.pop());
      stack.push({ type: "operator", value: "!" }); previous = "value"; continue;
    }
    let operator = token.value;
    if (operator === "-" && ["start", "operator", "("].includes(previous)) operator = "u-";
    while (stack.length && stack.at(-1).type === "operator" && (rightAssociative.has(operator) ? precedence[operator] < precedence[stack.at(-1).value] : precedence[operator] <= precedence[stack.at(-1).value])) output.push(stack.pop());
    stack.push({ type: "operator", value: operator }); previous = "operator";
  }
  if (["operator", "function", "("].includes(previous)) throw new Error("Incomplete expression");
  while (stack.length) { const token = stack.pop(); if (token.type === "(") throw new Error("Missing parenthesis"); output.push(token); }
  return output;
}

function factorial(value) {
  if (!Number.isInteger(value) || value < 0 || value > 170) throw new Error("Factorial needs a non-negative integer");
  let result = 1; for (let index = 2; index <= value; index += 1) result *= index; return result;
}
function formatValue(value) { return Number(value.toPrecision(12)).toString(); }

function evaluateWithMathJs(input, variables, angleMode) {
  const mathLib = globalThis.math;
  if (!mathLib?.evaluate) return null;
  const toRadians = value => angleMode === "deg" ? value * Math.PI / 180 : value;
  const fromRadians = value => angleMode === "deg" ? value * 180 / Math.PI : value;
  const scope = {
    x: Number(variables.x ?? 0), pi: Math.PI, e: Math.E,
    sin: value => Math.sin(toRadians(value)), cos: value => Math.cos(toRadians(value)), tan: value => Math.tan(toRadians(value)),
    asin: value => fromRadians(Math.asin(value)), acos: value => fromRadians(Math.acos(value)), atan: value => fromRadians(Math.atan(value)),
    sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round,
    exp: Math.exp, log: Math.log10, ln: Math.log
  };
  try {
    const evaluated = mathLib.evaluate(String(input || ""), scope);
    const value = typeof evaluated?.toNumber === "function" ? evaluated.toNumber() : evaluated;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function evaluateExpression(input, variables = {}, angleMode = "rad") {
  const mathJsResult = evaluateWithMathJs(input, variables, angleMode);
  if (mathJsResult !== null) return mathJsResult;
  const values = [];
  for (const token of toRpn(input)) {
    if (token.type === "number") values.push(token.value);
    else if (token.type === "name") values.push(token.value === "x" ? Number(variables.x ?? 0) : CONSTANTS[token.value]);
    else if (token.type === "operator") {
      if (token.value === "u-") { const value = values.pop(); if (value === undefined) throw new Error("Incomplete expression"); values.push(-value); }
      else if (token.value === "!") { const value = values.pop(); if (value === undefined) throw new Error("Incomplete expression"); values.push(factorial(value)); }
      else { const right = values.pop(); const left = values.pop(); if (left === undefined || right === undefined) throw new Error("Incomplete expression"); values.push({ "+": (a, b) => a + b, "-": (a, b) => a - b, "*": (a, b) => a * b, "/": (a, b) => a / b, "%": (a, b) => a % b, "^": (a, b) => a ** b }[token.value](left, right)); }
    } else if (token.type === "function") {
      const value = values.pop(); if (value === undefined) throw new Error("Incomplete function");
      const isTrig = ["sin", "cos", "tan"].includes(token.value); const isInverseTrig = ["asin", "acos", "atan"].includes(token.value);
      const argument = angleMode === "deg" && isTrig ? value * Math.PI / 180 : value; let result = FUNCTIONS[token.value](argument);
      if (angleMode === "deg" && isInverseTrig) result *= 180 / Math.PI; values.push(result);
    }
  }
  if (values.length !== 1 || !Number.isFinite(values[0])) throw new Error("Expression has no finite result");
  return values[0];
}

const CALC_COPY = {
  es: { angle: "Ángulo", radians: "Radianes", degrees: "Grados", error: "Revisa la expresión.", empty: "Escribe una expresión.", memory: "Memoria", history: "Historial", clearHistory: "Borrar", copy: "Copiar resultado", copied: "¡Copiado!", copyQuestion: "Copiar a la pregunta activa", copiedQuestion: "¡Enviado a la pregunta!", noQuestion: "Abre una pregunta activa primero.", noHistory: "Aún no hay cálculos." },
  en: { angle: "Angle", radians: "Radians", degrees: "Degrees", error: "Check the expression.", empty: "Enter an expression.", memory: "Memory", history: "History", clearHistory: "Clear", copy: "Copy result", copied: "Copied!", copyQuestion: "Copy to active question", copiedQuestion: "Sent to the question!", noQuestion: "Open an active question first.", noHistory: "No calculations yet." }
};

export function initCalculator({ language = "es" } = {}) {
  const root = document.querySelector("#calculatorView"); if (!root) return { setLanguage() {} };
  let currentLanguage = language; let expression = ""; let angleMode = "rad"; let memory = Number(localStorage.getItem("cureCalculatorMemory") || 0) || 0; let history = JSON.parse(localStorage.getItem("cureCalculatorHistory") || "[]"); let lastValue = null;
  const display = root.querySelector("#calculatorDisplay"); const result = root.querySelector("#calculatorResult"); const keypad = root.querySelector("#calculatorKeys"); const angleButton = root.querySelector("#angleMode"); const copyButton = root.querySelector("#copyResult"); const questionButton = root.querySelector("#copyToQuestion"); const memoryValue = root.querySelector("#calculatorMemoryValue"); const historyList = root.querySelector("#calculatorHistory"); const copy = () => CALC_COPY[currentLanguage];
  const renderHistory = () => { historyList.replaceChildren(); if (!history.length) { const empty = document.createElement("li"); empty.className = "history-empty"; empty.textContent = copy().noHistory; historyList.appendChild(empty); return; } history.forEach((item, index) => { const row = document.createElement("li"); const button = document.createElement("button"); button.type = "button"; button.dataset.historyIndex = index; button.textContent = `${item.expression} = ${item.result}`; row.appendChild(button); historyList.appendChild(row); }); };
  const render = () => { display.value = expression; angleButton.textContent = `${copy().angle}: ${angleMode === "rad" ? copy().radians : copy().degrees}`; memoryValue.textContent = formatValue(memory); copyButton.textContent = copy().copy; questionButton.textContent = copy().copyQuestion; root.querySelector("#calculatorMemoryLabel").textContent = copy().memory; root.querySelector("#calculatorHistoryTitle").textContent = copy().history; root.querySelector("#clearCalculatorHistory").textContent = copy().clearHistory; renderHistory(); };
  const calculate = () => { if (!expression.trim()) { result.textContent = copy().empty; result.className = "tool-result bad"; return null; } try { lastValue = evaluateExpression(expression, {}, angleMode); const formatted = formatValue(lastValue); result.textContent = formatted; result.className = "tool-result good"; history = [{ expression, result: formatted }, ...history.filter(item => item.expression !== expression)].slice(0, 8); localStorage.setItem("cureCalculatorHistory", JSON.stringify(history)); renderHistory(); return lastValue; } catch (error) { lastValue = null; result.textContent = `${copy().error} ${error.message}`; result.className = "tool-result bad"; return null; } };
  const valueForMemory = () => lastValue ?? (expression.trim() ? evaluateExpression(expression, {}, angleMode) : 0);
  keypad.addEventListener("click", event => { const button = event.target.closest("button[data-key]"); if (!button) return; const key = button.dataset.key; if (key === "clear") { expression = ""; lastValue = null; result.textContent = ""; result.className = "tool-result"; } else if (key === "back") expression = expression.slice(0, -1); else if (key === "equals") calculate(); else expression += key; render(); });
  root.querySelector(".calculator-memory").addEventListener("click", event => { const button = event.target.closest("button[data-memory]"); if (!button) return; try { const action = button.dataset.memory; if (action === "clear") memory = 0; if (action === "recall") expression += formatValue(memory); if (action === "store") memory = valueForMemory(); if (action === "add") memory += valueForMemory(); if (action === "subtract") memory -= valueForMemory(); localStorage.setItem("cureCalculatorMemory", String(memory)); render(); } catch { result.textContent = copy().error; result.className = "tool-result bad"; } });
  historyList.addEventListener("click", event => { const button = event.target.closest("button[data-history-index]"); if (!button) return; expression = history[Number(button.dataset.historyIndex)].expression; render(); display.focus(); });
  root.querySelector("#clearCalculatorHistory").addEventListener("click", () => { history = []; localStorage.removeItem("cureCalculatorHistory"); renderHistory(); }); display.addEventListener("input", () => { expression = display.value; lastValue = null; }); display.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); calculate(); } }); angleButton.addEventListener("click", () => { angleMode = angleMode === "rad" ? "deg" : "rad"; render(); });
  copyButton.addEventListener("click", async () => { if (!result.textContent || lastValue === null) return; await navigator.clipboard?.writeText(result.textContent); copyButton.textContent = copy().copied; window.setTimeout(render, 900); });
  questionButton.addEventListener("click", () => {
    if (lastValue === null && expression.trim()) calculate();
    const activeInput = document.querySelector("#answerInput");
    if (!activeInput) { result.textContent = copy().noQuestion; result.className = "tool-result bad"; return; }
    const value = lastValue === null ? expression.trim() : formatValue(lastValue);
    if (!value) { result.textContent = copy().empty; result.className = "tool-result bad"; return; }
    activeInput.value = value;
    activeInput.dispatchEvent(new Event("input", { bubbles: true }));
    questionButton.textContent = copy().copiedQuestion;
    window.setTimeout(render, 1100);
  });
  render();
  return { setLanguage(next) { currentLanguage = next; render(); } };
}

export function initGraph({ language = "es" } = {}) {
  const root = document.querySelector("#graphView"); if (!root) return { setLanguage() {} }; let currentLanguage = language; let bounds = { min: -10, max: 10 };
  const canvas = root.querySelector("#graphCanvas"); const context = canvas.getContext("2d"); const expression = root.querySelector("#graphExpression"); const minInput = root.querySelector("#graphMin"); const maxInput = root.querySelector("#graphMax"); const description = root.querySelector("#graphDescription"); const message = root.querySelector("#graphMessage"); const copy = () => currentLanguage === "en" ? { empty: "Enter a function of x, such as sin(x).", plotted: "Showing" } : { empty: "Escribe una función de x, como sin(x).", plotted: "Mostrando" };
  const draw = () => { const width = canvas.clientWidth || 720; const height = canvas.clientHeight || 360; context.clearRect(0, 0, width, height); context.fillStyle = "#fbfdfc"; context.fillRect(0, 0, width, height); const xSpan = bounds.max - bounds.min; const ySpan = xSpan * height / width; const yMin = -ySpan / 2; const yMax = ySpan / 2; const mapX = x => (x - bounds.min) / xSpan * width; const mapY = y => height - (y - yMin) / ySpan * height; const step = xSpan > 30 ? 5 : xSpan > 12 ? 2 : 1; context.strokeStyle = "#e5eeee"; context.lineWidth = 1; for (let x = Math.ceil(bounds.min / step) * step; x <= bounds.max; x += step) { context.beginPath(); context.moveTo(mapX(x), 0); context.lineTo(mapX(x), height); context.stroke(); } for (let y = Math.ceil(yMin / step) * step; y <= yMax; y += step) { context.beginPath(); context.moveTo(0, mapY(y)); context.lineTo(width, mapY(y)); context.stroke(); } context.strokeStyle = "#17324d"; context.lineWidth = 1.6; if (bounds.min <= 0 && bounds.max >= 0) { context.beginPath(); context.moveTo(mapX(0), 0); context.lineTo(mapX(0), height); context.stroke(); } if (yMin <= 0 && yMax >= 0) { context.beginPath(); context.moveTo(0, mapY(0)); context.lineTo(width, mapY(0)); context.stroke(); } const raw = expression.value.trim(); if (!raw) { message.textContent = copy().empty; description.textContent = ""; return; } context.strokeStyle = "#ed765e"; context.lineWidth = 2.5; context.beginPath(); let started = false; let lastY = 0; for (let px = 0; px <= width; px += 2) { const x = bounds.min + px / width * xSpan; try { const y = evaluateExpression(raw, { x }); const py = mapY(y); if (!Number.isFinite(py) || Math.abs(py) > height * 4) { started = false; continue; } if (!started || Math.abs(py - lastY) > height) context.moveTo(px, py); else context.lineTo(px, py); started = true; lastY = py; } catch { started = false; } } context.stroke(); message.textContent = ""; description.textContent = `${copy().plotted} y = ${raw} · ${bounds.min} ≤ x ≤ ${bounds.max}`; };
  const resize = () => { const ratio = window.devicePixelRatio || 1; const box = canvas.getBoundingClientRect(); canvas.width = Math.max(320, box.width * ratio); canvas.height = Math.max(260, box.height * ratio); context.setTransform(ratio, 0, 0, ratio, 0, 0); draw(); };
  root.querySelector("#plotGraph").addEventListener("click", draw); root.querySelector("#resetGraph").addEventListener("click", () => { bounds = { min: -10, max: 10 }; minInput.value = -10; maxInput.value = 10; draw(); }); root.querySelector("#zoomOut").addEventListener("click", () => { const center = (bounds.min + bounds.max) / 2; const span = (bounds.max - bounds.min) * 1.35; bounds = { min: center - span / 2, max: center + span / 2 }; minInput.value = bounds.min.toFixed(2); maxInput.value = bounds.max.toFixed(2); draw(); }); root.querySelector("#zoomIn").addEventListener("click", () => { const center = (bounds.min + bounds.max) / 2; const span = (bounds.max - bounds.min) * 0.7; bounds = { min: center - span / 2, max: center + span / 2 }; minInput.value = bounds.min.toFixed(2); maxInput.value = bounds.max.toFixed(2); draw(); }); root.querySelector("#applyRange").addEventListener("click", () => { const min = Number(minInput.value); const max = Number(maxInput.value); if (Number.isFinite(min) && Number.isFinite(max) && max > min) { bounds = { min, max }; draw(); } }); expression.addEventListener("input", draw); canvas.addEventListener("wheel", event => { event.preventDefault(); const factor = event.deltaY > 0 ? 1.15 : 0.85; const center = (bounds.min + bounds.max) / 2; const span = (bounds.max - bounds.min) * factor; bounds = { min: center - span / 2, max: center + span / 2 }; minInput.value = bounds.min.toFixed(2); maxInput.value = bounds.max.toFixed(2); draw(); }, { passive: false }); window.addEventListener("resize", resize); resize(); return { setLanguage(next) { currentLanguage = next; draw(); } };
}
