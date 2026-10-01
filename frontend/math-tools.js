const FUNCTIONS = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  log: Math.log10
};

const CONSTANTS = { pi: Math.PI, e: Math.E };

function tokenize(input) {
  const tokens = [];
  const source = input.replace(/π/g, "pi").replace(/√/g, "sqrt").replace(/−/g, "-");
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) { index += 1; continue; }
    const number = source.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
    if (number) { tokens.push({ type: "number", value: Number(number[0]) }); index += number[0].length; continue; }
    const name = source.slice(index).match(/^[a-z]+/i);
    if (name) { tokens.push({ type: "name", value: name[0].toLowerCase() }); index += name[0].length; continue; }
    if ("+-*/^(),".includes(char)) { tokens.push({ type: char, value: char }); index += 1; continue; }
    throw new Error(`Unknown symbol: ${char}`);
  }
  return tokens;
}

function toRpn(input) {
  const output = [];
  const stack = [];
  const precedence = { "u-": 4, "^": 3, "*": 2, "/": 2, "+": 1, "-": 1 };
  const rightAssociative = new Set(["^", "u-"]);
  let previous = "start";
  for (const token of tokenize(input)) {
    if (token.type === "number") { output.push(token); previous = "value"; continue; }
    if (token.type === "name") {
      if (FUNCTIONS[token.value]) stack.push({ type: "function", value: token.value });
      else if (CONSTANTS[token.value] !== undefined || token.value === "x") output.push(token);
      else throw new Error(`Unknown name: ${token.value}`);
      previous = FUNCTIONS[token.value] ? "function" : "value";
      continue;
    }
    if (token.type === "(") { stack.push(token); previous = "("; continue; }
    if (token.type === ")") {
      while (stack.length && stack.at(-1).type !== "(") output.push(stack.pop());
      if (!stack.length) throw new Error("Missing parenthesis");
      stack.pop();
      if (stack.at(-1)?.type === "function") output.push(stack.pop());
      previous = "value";
      continue;
    }
    if (token.type === ",") continue;
    let operator = token.value;
    if (operator === "-" && ["start", "operator", "("].includes(previous)) operator = "u-";
    while (stack.length && (stack.at(-1).type === "operator") &&
      (rightAssociative.has(operator) ? precedence[operator] < precedence[stack.at(-1).value] : precedence[operator] <= precedence[stack.at(-1).value])) output.push(stack.pop());
    stack.push({ type: "operator", value: operator });
    previous = "operator";
  }
  while (stack.length) {
    const token = stack.pop();
    if (token.type === "(") throw new Error("Missing parenthesis");
    output.push(token);
  }
  return output;
}

export function evaluateExpression(input, variables = {}, angleMode = "rad") {
  const values = [];
  for (const token of toRpn(input)) {
    if (token.type === "number") values.push(token.value);
    else if (token.type === "name") values.push(token.value === "x" ? Number(variables.x ?? 0) : CONSTANTS[token.value]);
    else if (token.type === "operator") {
      if (token.value === "u-") values.push(-values.pop());
      else {
        const right = values.pop(); const left = values.pop();
        if (left === undefined || right === undefined) throw new Error("Incomplete expression");
        values.push({ "+": (a, b) => a + b, "-": (a, b) => a - b, "*": (a, b) => a * b, "/": (a, b) => a / b, "^": (a, b) => a ** b }[token.value](left, right));
      }
    } else if (token.type === "function") {
      const value = values.pop();
      if (value === undefined) throw new Error("Incomplete function");
      const argument = angleMode === "deg" && ["sin", "cos", "tan"].includes(token.value) ? value * Math.PI / 180 : value;
      values.push(FUNCTIONS[token.value](argument));
    }
  }
  if (values.length !== 1 || !Number.isFinite(values[0])) throw new Error("Expression has no finite result");
  return values[0];
}

const CALC_COPY = {
  es: { angle: "Ángulo", radians: "Radianes", degrees: "Grados", error: "Revisa la expresión." },
  en: { angle: "Angle", radians: "Radians", degrees: "Degrees", error: "Check the expression." }
};

export function initCalculator({ language = "es" } = {}) {
  const root = document.querySelector("#calculatorView");
  if (!root) return { setLanguage() {} };
  let currentLanguage = language; let expression = ""; let angleMode = "rad";
  const display = root.querySelector("#calculatorDisplay"); const result = root.querySelector("#calculatorResult"); const keypad = root.querySelector("#calculatorKeys"); const angleButton = root.querySelector("#angleMode");
  const copy = () => CALC_COPY[currentLanguage];
  const render = () => { display.value = expression; angleButton.textContent = `${copy().angle}: ${angleMode === "rad" ? copy().radians : copy().degrees}`; };
  const calculate = () => { try { const value = evaluateExpression(expression, {}, angleMode); result.textContent = Number(value.toFixed(10)).toString(); result.className = "tool-result good"; } catch { result.textContent = copy().error; result.className = "tool-result bad"; } };
  keypad.addEventListener("click", event => { const button = event.target.closest("button[data-key]"); if (!button) return; const key = button.dataset.key; if (key === "clear") { expression = ""; result.textContent = ""; result.className = "tool-result"; } else if (key === "back") expression = expression.slice(0, -1); else if (key === "equals") calculate(); else expression += key; render(); });
  display.addEventListener("input", () => { expression = display.value; }); display.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); calculate(); } }); angleButton.addEventListener("click", () => { angleMode = angleMode === "rad" ? "deg" : "rad"; render(); }); render();
  return { setLanguage(next) { currentLanguage = next; render(); } };
}

export function initGraph({ language = "es" } = {}) {
  const root = document.querySelector("#graphView");
  if (!root) return { setLanguage() {} };
  let currentLanguage = language; let bounds = { min: -10, max: 10 };
  const canvas = root.querySelector("#graphCanvas"); const context = canvas.getContext("2d"); const expression = root.querySelector("#graphExpression"); const minInput = root.querySelector("#graphMin"); const maxInput = root.querySelector("#graphMax"); const description = root.querySelector("#graphDescription"); const message = root.querySelector("#graphMessage");
  const copy = () => currentLanguage === "en" ? { empty: "Enter a function of x, such as sin(x).", plotted: "Showing" } : { empty: "Escribe una función de x, como sin(x).", plotted: "Mostrando" };
  const draw = () => {
    const width = canvas.clientWidth || 720; const height = canvas.clientHeight || 360; context.clearRect(0, 0, width, height); context.fillStyle = "#fbfdfc"; context.fillRect(0, 0, width, height);
    const xSpan = bounds.max - bounds.min; const ySpan = xSpan * height / width; const yMin = -ySpan / 2; const yMax = ySpan / 2; const mapX = x => (x - bounds.min) / xSpan * width; const mapY = y => height - (y - yMin) / ySpan * height; const step = xSpan > 30 ? 5 : xSpan > 12 ? 2 : 1;
    context.strokeStyle = "#e5eeee"; context.lineWidth = 1; for (let x = Math.ceil(bounds.min / step) * step; x <= bounds.max; x += step) { context.beginPath(); context.moveTo(mapX(x), 0); context.lineTo(mapX(x), height); context.stroke(); } for (let y = Math.ceil(yMin / step) * step; y <= yMax; y += step) { context.beginPath(); context.moveTo(0, mapY(y)); context.lineTo(width, mapY(y)); context.stroke(); }
    context.strokeStyle = "#17324d"; context.lineWidth = 1.6; if (bounds.min <= 0 && bounds.max >= 0) { context.beginPath(); context.moveTo(mapX(0), 0); context.lineTo(mapX(0), height); context.stroke(); } if (yMin <= 0 && yMax >= 0) { context.beginPath(); context.moveTo(0, mapY(0)); context.lineTo(width, mapY(0)); context.stroke(); }
    const raw = expression.value.trim(); if (!raw) { message.textContent = copy().empty; description.textContent = ""; return; }
    context.strokeStyle = "#ed765e"; context.lineWidth = 2.5; context.beginPath(); let started = false; let lastY = 0; for (let px = 0; px <= width; px += 2) { const x = bounds.min + px / width * xSpan; try { const y = evaluateExpression(raw, { x }); const py = mapY(y); if (!Number.isFinite(py) || Math.abs(py) > height * 4) { started = false; continue; } if (!started || Math.abs(py - lastY) > height) context.moveTo(px, py); else context.lineTo(px, py); started = true; lastY = py; } catch { started = false; } } context.stroke(); message.textContent = ""; description.textContent = `${copy().plotted} y = ${raw} · ${bounds.min} ≤ x ≤ ${bounds.max}`;
  };
  const resize = () => { const ratio = window.devicePixelRatio || 1; const box = canvas.getBoundingClientRect(); canvas.width = Math.max(320, box.width * ratio); canvas.height = Math.max(260, box.height * ratio); context.setTransform(ratio, 0, 0, ratio, 0, 0); draw(); };
  root.querySelector("#plotGraph").addEventListener("click", draw); root.querySelector("#resetGraph").addEventListener("click", () => { bounds = { min: -10, max: 10 }; minInput.value = -10; maxInput.value = 10; draw(); });
  root.querySelector("#zoomOut").addEventListener("click", () => { const center = (bounds.min + bounds.max) / 2; const span = (bounds.max - bounds.min) * 1.35; bounds = { min: center - span / 2, max: center + span / 2 }; minInput.value = bounds.min.toFixed(2); maxInput.value = bounds.max.toFixed(2); draw(); }); root.querySelector("#zoomIn").addEventListener("click", () => { const center = (bounds.min + bounds.max) / 2; const span = (bounds.max - bounds.min) * 0.7; bounds = { min: center - span / 2, max: center + span / 2 }; minInput.value = bounds.min.toFixed(2); maxInput.value = bounds.max.toFixed(2); draw(); });
  root.querySelector("#applyRange").addEventListener("click", () => { const min = Number(minInput.value); const max = Number(maxInput.value); if (Number.isFinite(min) && Number.isFinite(max) && max > min) { bounds = { min, max }; draw(); } }); expression.addEventListener("input", draw); canvas.addEventListener("wheel", event => { event.preventDefault(); const factor = event.deltaY > 0 ? 1.15 : 0.85; const center = (bounds.min + bounds.max) / 2; const span = (bounds.max - bounds.min) * factor; bounds = { min: center - span / 2, max: center + span / 2 }; minInput.value = bounds.min.toFixed(2); maxInput.value = bounds.max.toFixed(2); draw(); }, { passive: false }); window.addEventListener("resize", resize); resize();
  return { setLanguage(next) { currentLanguage = next; draw(); } };
}
