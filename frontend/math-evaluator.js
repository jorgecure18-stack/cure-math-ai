// Evaluador matemático seguro: tokenización → RPN → evaluación.
// No usa eval() ni new Function(). También se puede importar desde Node para pruebas.

const FUNCTIONS = new Set(["sin", "cos", "tan", "sqrt", "abs", "log", "ln", "exp"]);
const CONSTANTS = { pi: Math.PI, e: Math.E };
const OPERATORS = {
  "+": { precedence: 1, associativity: "left" },
  "-": { precedence: 1, associativity: "left" },
  "*": { precedence: 2, associativity: "left" },
  "/": { precedence: 2, associativity: "left" },
  neg: { precedence: 3, associativity: "right" },
  "^": { precedence: 4, associativity: "right" }
};
const MAX_LENGTH = 200;

export function tokenizar(expression) {
  if (typeof expression !== "string" || !expression.trim()) throw new Error("La expresión está vacía.");
  if (expression.length > MAX_LENGTH) throw new Error("La expresión es demasiado larga (máximo 200 caracteres).");

  const source = expression.toLowerCase().replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/π/g, "pi").replace(/√/g, "sqrt");
  const tokenPattern = /\s*(\d+(?:\.\d+)?(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?|[a-z]+|[-+*/^()])/y;
  const tokens = [];
  let position = 0;

  while (position < source.length) {
    tokenPattern.lastIndex = position;
    const match = tokenPattern.exec(source);
    if (!match) throw new Error(`Carácter no válido: "${source[position]}".`);
    position = tokenPattern.lastIndex;
    const raw = match[1];
    let token;
    if (/^[\d.]/.test(raw)) token = { type: "number", value: Number(raw) };
    else if (/^[a-z]/.test(raw)) {
      if (raw === "x") token = { type: "variable" };
      else if (Object.hasOwn(CONSTANTS, raw)) token = { type: "number", value: CONSTANTS[raw] };
      else if (FUNCTIONS.has(raw)) token = { type: "function", value: raw };
      else throw new Error(`Símbolo desconocido: "${raw}".`);
    } else if (raw === "(") token = { type: "left" };
    else if (raw === ")") token = { type: "right" };
    else token = { type: "operator", value: raw };

    const previous = tokens.at(-1);
    const previousIsValue = previous && ["number", "variable", "right"].includes(previous.type);
    const startsValue = ["number", "variable", "function", "left"].includes(token.type);
    if (previousIsValue && startsValue) tokens.push({ type: "operator", value: "*" });
    tokens.push(token);
  }
  return tokens;
}

export function aRPN(tokens) {
  const output = [];
  const stack = [];
  let previous = "operator";

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === "number" || token.type === "variable") {
      output.push(token); previous = "value"; continue;
    }
    if (token.type === "function") {
      if (tokens[index + 1]?.type !== "left") throw new Error(`La función "${token.value}" necesita paréntesis.`);
      stack.push(token); previous = "operator"; continue;
    }
    if (token.type === "left") { stack.push(token); previous = "operator"; continue; }
    if (token.type === "right") {
      let closed = false;
      while (stack.length) {
        const top = stack.pop();
        if (top.type === "left") { closed = true; break; }
        output.push(top);
      }
      if (!closed) throw new Error("Paréntesis desbalanceados.");
      if (stack.at(-1)?.type === "function") output.push(stack.pop());
      previous = "value"; continue;
    }

    let operator = token.value;
    if (previous !== "value") {
      if (operator === "+") continue;
      if (operator === "-") operator = "neg";
      else throw new Error(`Operador "${operator}" inesperado.`);
    }
    const current = OPERATORS[operator];
    // El menos unario es prefijo: no debe desapilar una potencia que viene antes.
    if (operator !== "neg") {
      while (stack.length && stack.at(-1).type === "operator") {
        const top = OPERATORS[stack.at(-1).value];
        const shouldPop = top.precedence > current.precedence || (top.precedence === current.precedence && current.associativity === "left");
        if (!shouldPop) break;
        output.push(stack.pop());
      }
    }
    stack.push({ type: "operator", value: operator });
    previous = "operator";
  }

  if (previous !== "value") throw new Error("Expresión incompleta o mal formada.");
  while (stack.length) {
    const token = stack.pop();
    if (token.type === "left") throw new Error("Paréntesis desbalanceados.");
    output.push(token);
  }
  return output;
}

function applyFunction(name, value, angleFactor) {
  if (name === "sin") return Math.sin(value * angleFactor);
  if (name === "cos") return Math.cos(value * angleFactor);
  if (name === "tan") return Math.tan(value * angleFactor);
  if (name === "sqrt") { if (value < 0) throw new Error("Dominio inválido: raíz de un número negativo."); return Math.sqrt(value); }
  if (name === "abs") return Math.abs(value);
  if (name === "log" || name === "ln") { if (value <= 0) throw new Error("Dominio inválido: logaritmo de un número no positivo."); return name === "log" ? Math.log10(value) : Math.log(value); }
  if (name === "exp") return Math.exp(value);
  throw new Error(`Función desconocida: ${name}.`);
}

export function evaluarRPN(rpn, x = Number.NaN, angleMode = "rad") {
  const angleFactor = angleMode === "deg" ? Math.PI / 180 : 1;
  const values = [];
  for (const token of rpn) {
    if (token.type === "number") values.push(token.value);
    else if (token.type === "variable") values.push(x);
    else if (token.type === "function") {
      if (!values.length) throw new Error("Expresión incompleta o mal formada.");
      values.push(applyFunction(token.value, values.pop(), angleFactor));
    } else if (token.value === "neg") {
      if (!values.length) throw new Error("Expresión incompleta o mal formada.");
      values.push(-values.pop());
    } else {
      if (values.length < 2) throw new Error("Expresión incompleta o mal formada.");
      const right = values.pop();
      const left = values.pop();
      if (token.value === "/" && right === 0) throw new Error("División entre cero.");
      const result = token.value === "+" ? left + right : token.value === "-" ? left - right : token.value === "*" ? left * right : token.value === "/" ? left / right : left ** right;
      values.push(result);
    }
  }
  if (values.length !== 1 || !Number.isFinite(values[0])) throw new Error("El resultado no es un número finito.");
  return values[0];
}

export const compilar = expression => aRPN(tokenizar(expression));
export const evaluar = (expression, x = Number.NaN, angleMode = "rad") => evaluarRPN(compilar(expression), x, angleMode);

export function formatear(value) {
  const formatted = Number(value.toPrecision(12)).toString();
  return /^-?\d+(\.\d+)?(e[+-]?\d+)?$/.test(formatted) ? formatted : "Error";
}
