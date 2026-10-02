import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { Server as SocketIOServer } from "socket.io";
import { createSlidingLimiter } from "./rate-limit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FRONTEND = path.join(ROOT, "frontend");
const CURRICULUM_PATH = path.join(ROOT, "config", "curriculum_config.json");
const MATH_APPS_PATH = path.join(ROOT, "config", "math_apps.json");

const app = express();
const port = Number(process.env.PORT || 3000);
app.set("trust proxy", 1);
// Prefer the explicit compatible endpoint, but make OPENAI_API_KEY alone work
// with the official OpenAI API as well.
const AI_BASE_URL = String(
  process.env.AI_BASE_URL || (process.env.OPENAI_API_KEY ? "https://api.openai.com/v1" : "")
).replace(/\/$/, "");
const AI_API_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || process.env.OPENAI_MODEL || "gpt-4o";
const HF_API_TOKEN = process.env.HF_API_TOKEN || "";
const HF_MODEL = process.env.HF_MODEL || "Qwen/Qwen2.5-Math-7B-Instruct";

const systemPrompt = `Eres cure.math AI / MathTutor-Uni, un tutor universitario claro, paciente, riguroso y socrático. Puedes ayudar con aritmética, álgebra, geometría, cálculo, estadística, probabilidad, álgebra lineal, matemática discreta y matemática aplicada. Adapta el nivel al estudiante. Enseña mediante andamiaje: explica brevemente la idea, da un solo siguiente paso y pide al estudiante que responda antes de continuar. No reveles la respuesta completa de inmediato. Todo símbolo o expresión matemática debe escribirse en LaTeX limpio: usa \\( ... \\) para matemáticas en línea y \\[ ... \\] para bloques centrados. No uses bloques de código para fórmulas. Analiza los materiales del estudiante sin inventar contenido que no puedas leer. Si una pregunta no es matemática, redirígela con amabilidad. RESTRICCIÓN PEDAGÓGICA GLOBAL: no utilices el número e ni la función ln en ejemplos, fórmulas, pistas o respuestas; si el material los contiene, explica la idea usando una alternativa permitida o marca esa parte como fuera del temario.`;
const visionSystemPrompt = `${systemPrompt} Analiza la imagen o documento recibido, extrae con cuidado el enunciado matemático y enseña el procedimiento paso a paso. RESTRICCIÓN PEDAGÓGICA INMUTABLE: no uses el número e ni la función ln en ejemplos, fórmulas, pistas o respuestas. Si aparecen en el material, explica la idea con una alternativa permitida o indica que esa parte queda fuera del temario.`;
const quotaStore = new Map();
const FREE_LIMIT = 3;
const tutorDeviceLimiter = createSlidingLimiter({ limit: 5, windowMs: 60_000 });
const tutorIpLimiter = createSlidingLimiter({ limit: 15, windowMs: 60_000 });

function quotaMiddleware(req, res, next) {
  const deviceId = typeof req.body?.deviceId === "string" && req.body.deviceId.trim()
    ? req.body.deviceId.trim()
    : `ip:${req.ip || req.socket.remoteAddress || "anonymous"}`;
  const ip = req.ip || req.socket.remoteAddress || "anonymous";
  const deviceResult = tutorDeviceLimiter.check(deviceId);
  const ipResult = tutorIpLimiter.check(ip);
  const result = deviceResult.allowed && ipResult.allowed ? deviceResult : (!deviceResult.allowed ? deviceResult : ipResult);
  if (!deviceResult.allowed || !ipResult.allowed) {
    res.setHeader("Retry-After", String(result.retryAfter));
    return res.status(429).json({ error: "Límite temporal de tutoría alcanzado.", retryAfter: result.retryAfter, plan: "free" });
  }
  res.setHeader("X-Quota-Limit", "5/device, 15/ip");
  res.setHeader("X-Quota-Remaining", String(result.remaining));
  next();
}

function imageData(value) {
  return String(value || "").replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
}

function modelConfig() {
  if (AI_BASE_URL && AI_API_KEY) return { provider: "openai-compatible", model: AI_MODEL };
  if (HF_API_TOKEN) return { provider: "huggingface", model: HF_MODEL };
  return { provider: "ollama", model: process.env.OLLAMA_MODEL || "llama3" };
}

async function chatRequest({ messages, model, images = [] }) {
  const config = modelConfig();
  if (config.provider === "openai-compatible") {
    const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_API_KEY}` },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ model: model || config.model, messages, temperature: 0.2 })
    });
    return { response, parse: async data => data?.choices?.[0]?.message?.content };
  }

  if (config.provider === "huggingface") {
    const prompt = messages.map(message => `${message.role.toUpperCase()}: ${message.content}`).join("\n\n");
    const hfModelPath = (model || config.model).split("/").map(encodeURIComponent).join("/");
    const response = await fetch(`https://router.huggingface.co/hf-inference/models/${hfModelPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${HF_API_TOKEN}` },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({ inputs: `${prompt}\n\nASSISTANT:`, parameters: { max_new_tokens: 500, temperature: 0.25, return_full_text: false } })
    });
    return { response, parse: async data => Array.isArray(data) ? data[0]?.generated_text : data?.generated_text };
  }

  const ollamaMessages = messages.map(message => ({
    ...message,
    ...(message.images?.length ? { images: message.images } : {})
  }));
  const ollamaUrl = String(process.env.OLLAMA_URL || "http://localhost:11434").replace(/\/$/, "");
  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      model: model || process.env.OLLAMA_MODEL || "llama3",
      stream: false,
      messages: ollamaMessages,
      options: { temperature: 0.2 }
    })
  });
  return { response, parse: async data => data?.message?.content };
}

function visionRequest({ image, mimeType, prompt, language, subject, level, curriculum }) {
  return chatRequest({
    model: process.env.OLLAMA_VISION_MODEL || process.env.AI_VISION_MODEL || "llava",
    messages: [
      { role: "system", content: `${visionSystemPrompt}\nMateria: ${subject}. Nivel: ${level}. Idioma: ${language}. Currículo dinámico: ${curriculum.allowedTopics.join(", ")}` },
      { role: "user", content: prompt || "Analiza este ejercicio, transcribe lo esencial y enséñame el primer paso.", images: [imageData(image)] }
    ]
  });
}

function readCurriculum() {
  return JSON.parse(fs.readFileSync(CURRICULUM_PATH, "utf8"));
}

function readMathApps() {
  return JSON.parse(fs.readFileSync(MATH_APPS_PATH, "utf8"));
}

function localTutorAnswer(question, topic = "all", subject = "calculus", language = "es", action = "ask") {
  const lower = question.toLowerCase();
  const english = language === "English" || language === "en";
  const guide = {
    chain: english ? "Find the outer and inner functions. Differentiate the outer layer, keep the inner layer, and multiply by its derivative." : "Busca la función exterior e interior. Deriva la exterior conservando la interior y multiplica por la derivada de la interior.",
    implicit: english ? "Differentiate both sides with respect to x. Each term containing y contributes a factor y'. Then group the y' terms and isolate them." : "Deriva ambos lados respecto de x. Cada término que contenga y aporta un factor y'. Después agrupa y' y despeja.",
    tangent: english ? "Calculate y', evaluate it at the point to get the slope m, and use y-y₀=m(x-x₀)." : "Calcula y', evalúala en el punto para obtener la pendiente m y usa y-y₀=m(x-x₀).",
    all: english ? "First identify the structure: composition, product, quotient, implicit equation, or tangent line. Then apply the matching rule step by step." : "Primero identifica la estructura: composición, producto, cociente, ecuación implícita o una recta tangente. Luego aplica la regla correspondiente paso a paso."
  }[topic] || "";

  if (/fuera|temario/.test(lower)) {
    return english ? "I can help with arithmetic, algebra, geometry, calculus, statistics, linear algebra, discrete mathematics, and applied mathematics. Upload an image or choose a subject to begin." : "Puedo ayudarte con aritmética, álgebra, geometría, cálculo, estadística, álgebra lineal, matemática discreta y matemática aplicada. Sube una imagen o elige una materia para comenzar.";
  }

  const subjectHint = subject === "algebra" ? (english ? "Define the unknown, organize the terms, and check by substitution." : "Define la incógnita, ordena los términos y comprueba sustituyendo.") : subject === "geometry" ? (english ? "Draw the figure, note the data, and choose the geometric relationship connecting what you seek." : "Dibuja la figura, anota los datos y elige la relación geométrica que conecta lo que buscas.") : subject === "statistics" ? (english ? "Identify the population, variable, and measure requested before calculating." : "Identifica la población, la variable y la medida que te están pidiendo antes de calcular.") : guide;
  if (action === "question") return english ? `Control question for ${subject}: what is the outermost operation in this problem, and what would its derivative be?` : `Pregunta de control para ${subject}: ¿cuál es la operación más externa del problema y cuál sería su derivada?`;
  if (action === "review") return english ? `Guided review for ${subject}: identify the first line where your procedure changes the structure of the problem, then check the matching rule. Paste that line and I will review it.` : `Revisión guiada de ${subject}: identifica la primera línea donde tu procedimiento cambia la estructura del problema y comprueba la regla correspondiente. Pega esa línea y la revisaré.`;
  if (action === "hint") return english ? `Hint for ${subject}: ${subjectHint}\n\nDo not calculate everything yet; write only the next transformation.` : `Pista para ${subject}: ${subjectHint}\n\nNo calcules todo todavía; escribe solo la siguiente transformación.`;
  return english ? `Guided hint for ${subject}:\n\n${subjectHint}\n\nWrite the expression or step that is confusing you and we will work through it without skipping the reasoning.` : `Pista guiada para ${subject}:\n\n${subjectHint}\n\nEscribe la expresión o el paso que te confunde y lo resolvemos juntos sin saltarnos el razonamiento.`;
}

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(origin => origin.trim()).filter(Boolean)
  : ["https://cure-math-ai.onrender.com", "http://localhost:3000"];
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, { cors: { origin: allowedOrigins, methods: ["GET", "POST"] } });
let onlineUsers = 0;

io.on("connection", socket => {
  onlineUsers += 1;
  io.emit("presence_update", { onlineUsers });
  socket.on("disconnect", () => {
    onlineUsers = Math.max(0, onlineUsers - 1);
    io.emit("presence_update", { onlineUsers });
  });
});

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "15mb" }));
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://cdn.socket.io https://cdnjs.cloudflare.com; style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'; font-src 'self' https://cdn.jsdelivr.net data:; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self' https://api.openai.com https://router.huggingface.co wss://cure-math-ai.onrender.com https://cure-math-ai.onrender.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self'");
  next();
});
app.use(express.static(FRONTEND));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "cure.math AI", time: new Date().toISOString() });
});

app.get("/api/app-meta", (_req, res) => {
  res.json({ name: "cure.math AI", version: "0.7.0", updatedAt: new Date().toISOString(), status: "ready", capabilities: ["vision", "dynamic-curriculum", "free-tier", "bilingual-ui", "installable-web-app", "katex", "worker-graph", "realtime-presence"], ai: modelConfig().provider });
});

app.get("/api/ai/status", (_req, res) => {
  const config = modelConfig();
  res.json({ provider: config.provider, model: config.model, vision: Boolean(process.env.AI_VISION_MODEL || process.env.OLLAMA_VISION_MODEL), configured: config.provider !== "ollama" || Boolean(process.env.OLLAMA_URL) });
});

app.get("/api/presence", (_req, res) => {
  res.json({ onlineUsers });
});

const deviceProfiles = new Map();
app.post("/api/auth/session", (req, res) => {
  const requestedId = typeof req.body?.deviceId === "string" ? req.body.deviceId.trim() : "";
  const deviceId = /^[a-zA-Z0-9._-]{8,128}$/.test(requestedId) ? requestedId : randomUUID();
  if (!deviceProfiles.has(deviceId)) deviceProfiles.set(deviceId, { streak: 0, attempts: 0, correct: 0, history: [] });
  return res.json({ deviceId, profile: deviceProfiles.get(deviceId) });
});

app.get("/api/quota", (req, res) => {
  const key = req.ip || req.socket.remoteAddress || "anonymous";
  const current = quotaStore.get(key);
  const demoPremium = process.env.NODE_ENV !== "production" && process.env.ALLOW_DEMO_PREMIUM === "true";
  res.json({ plan: demoPremium && req.get("x-plan") === "premium" ? "premium" : "free", limit: FREE_LIMIT, used: current?.count || 0, remaining: Math.max(0, FREE_LIMIT - (current?.count || 0)) });
});

// Multimodal endpoint: accepts a base64 image buffer in JSON so the frontend can stream
// browser-selected files without persisting them on disk. It is ready to swap to multer/S3.
app.post("/api/vision/tutor", quotaMiddleware, express.json({ limit: "15mb" }), async (req, res) => {
  const image = imageData(req.body?.imageBase64);
  const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType : "image/jpeg";
  if (!image || !["image/png", "image/jpeg", "application/pdf"].includes(mimeType)) {
    return res.status(400).json({ error: "Envía una imagen PNG/JPEG o un PDF como base64." });
  }

  try {
    const curriculum = readCurriculum();
    const language = req.body?.language === "en" ? "English" : "Spanish";
    const vision = await visionRequest({ image, mimeType, prompt: req.body?.prompt, language, subject: req.body?.subject || "calculus", level: req.body?.level || "explore", curriculum });
    if (!vision.response.ok) throw new Error(await vision.response.text());
    const data = await vision.response.json();
    return res.json({ mode: "vision", answer: await vision.parse(data) || (req.body?.language === "en" ? "I could not interpret the image." : "No pude interpretar la imagen."), model: process.env.OLLAMA_VISION_MODEL || process.env.AI_VISION_MODEL || "llava" });
  } catch (error) {
    console.warn("Visión Ollama no disponible:", error.message);
    const english = req.body?.language === "en";
    return res.json({ mode: "vision-fallback", answer: english ? "I received your material, but the vision model is not available yet. Configure OLLAMA_VISION_MODEL (for example, llava) to analyze photos and PDFs." : "Recibí tu material, pero el modelo de visión no está disponible todavía. Configura OLLAMA_VISION_MODEL (por ejemplo, llava) para analizar fotos y PDFs.", notice: english ? "The file was not saved on the server." : "El archivo no se guardó en el servidor." });
  }
});

app.get("/api/exercises/random", (req, res) => {
  try {
    const curriculum = readCurriculum();
    const requestedTopic = typeof req.query.topic === "string" ? req.query.topic : "all";
    const excluded = new Set(String(req.query.exclude || "").split(",").filter(Boolean));
    const pool = curriculum.exerciseBank.filter(exercise =>
      requestedTopic === "all" || exercise.topic === requestedTopic
    );

    const available = pool.filter(exercise => !excluded.has(exercise.id));
    const source = available.length ? available : pool;
    if (!source.length) return res.status(404).json({ error: "No hay ejercicios para este tema." });

    const exercise = source[Math.floor(Math.random() * source.length)];
    // Keep both language variants in the payload so the client can switch
    // language instantly without losing the current exercise.
    return res.json({ ...exercise, answered: false });
  } catch (error) {
    console.warn("Exercise bank error:", error.message);
    return res.status(500).json({ error: "No se pudo cargar el banco de ejercicios." });
  }
});

app.get("/api/learning-plan", (req, res) => {
  const english = req.query.language === "en";
  return res.json({
    focus: english ? [
      { title: "Chain rule", tip: "Identify layers before differentiating." },
      { title: "Implicit differentiation", tip: "Group the y' terms and isolate them." },
      { title: "Tangent lines", tip: "The slope is y' evaluated at the point." }
    ] : [
      { title: "Regla de la cadena", tip: "Identifica capas antes de derivar." },
      { title: "Diferenciación implícita", tip: "Agrupa los términos con y' y despeja." },
      { title: "Rectas tangentes", tip: "La pendiente es y' evaluada en el punto." }
    ],
    general: english ? "Practice one question, explain your work, and use a hint only when you get stuck." : "Practica una pregunta, explica tu procedimiento y usa la pista solo cuando te atasques."
  });
});

// Re-read the catalog for every request so content editors can publish updates
// without restarting the production server.
app.get("/api/math-apps", (req, res) => {
  try {
    const catalog = readMathApps();
    const english = req.query.language === "en";
    return res.json({
      version: catalog.version,
      updatedAt: catalog.updatedAt,
      refreshPolicy: catalog.refreshPolicy,
      language: english ? "en" : "es",
      items: catalog.items.map(item => ({
        id: item.id,
        name: item.name,
        icon: item.icon,
        category: english ? item.categoryEn : item.categoryEs,
        description: english ? item.descriptionEn : item.descriptionEs,
        benefit: english ? item.benefitEn : item.benefitEs,
        officialUrl: item.officialUrl,
        sourceUrl: item.sourceUrl,
        sourceLabel: item.sourceLabel,
        verifiedAt: item.verifiedAt
      }))
    });
  } catch (error) {
    console.warn("Math apps catalog error:", error.message);
    return res.status(500).json({ error: "No se pudo leer el catálogo de apps matemáticas." });
  }
});

async function handleTutorRequest(req, res) {
  try {
    const rawQuestion = typeof req.body?.mensaje === "string" ? req.body.mensaje : req.body?.question;
    const question = typeof rawQuestion === "string" ? rawQuestion.trim() : "";

    if (!question) {
      return res.status(400).json({ error: "La pregunta es obligatoria." });
    }
    if (question.length > 1500) {
      return res.status(400).json({ error: "La pregunta no puede superar 1500 caracteres." });
    }

    const curriculum = readCurriculum();
    const topic = typeof req.body?.topic === "string" ? req.body.topic : "all";
    const language = req.body?.language === "en" ? "English" : "Spanish";
    const subject = typeof req.body?.subject === "string" ? req.body.subject : "calculus";
    const level = typeof req.body?.level === "string" ? req.body.level : "explore";
    const action = ["hint", "question", "review", "ask"].includes(req.body?.action)
      ? req.body.action
      : req.body?.nivelPista === 1 ? "hint" : req.body?.nivelPista === 2 ? "question" : req.body?.nivelPista === 3 ? "review" : "ask";
    const materialContext = typeof req.body?.materialContext === "string" ? req.body.materialContext.slice(0, 16000) : "";
    const historyInput = Array.isArray(req.body?.conversation)
      ? req.body.conversation
      : Array.isArray(req.body?.historial)
        ? req.body.historial.map(message => ({ role: message?.rol, content: message?.contenido }))
        : [];
    const priorConversation = historyInput
      .filter(message => ["user", "assistant"].includes(message?.role) && typeof message?.content === "string")
      .map(message => ({ role: message.role, content: message.content.trim().slice(0, 1500) }))
      .filter(message => message.content)
      .slice(-8);
    const { response: ollamaResponse, parse } = await chatRequest({
      messages: [
        {
          role: "system",
          content: `${systemPrompt}\nCurso seleccionado: ${subject}. Nivel: ${level}. Currículo disponible como referencia: ${curriculum.allowedTopics.join(", ")}. Tema seleccionado: ${topic}. Responde en ${language}, con un máximo de cuatro frases cortas y termina con una pregunta. Usa \\( ... \\) para matemáticas en línea y \\[ ... \\] para ecuaciones destacadas. No uses bloques de código para matemáticas. Acción solicitada: ${action === "hint" ? "da una sola pista progresiva y no reveles la respuesta" : action === "question" ? "haz una pregunta de control que ayude al estudiante a descubrir el siguiente paso" : action === "review" ? "evalúa el procedimiento del estudiante, señala el primer punto que debe revisar y propone una corrección guiada" : "responde como tutor socrático, empezando por una pista antes de la solución"}.`
        },
        ...priorConversation.slice(0, -1),
        { role: "user", content: materialContext ? `${question}\n\nMateriales disponibles:\n${materialContext}` : question }
      ]
    });

    if (!ollamaResponse.ok) {
      const errorText = await ollamaResponse.text();
      console.warn("Ollama respondió con error:", errorText);
      return res.json({
        mode: "fallback",
        answer: localTutorAnswer(question, topic, subject, language, action),
        notice: language === "English" ? "Ollama did not respond correctly; this answer uses the local curriculum guide." : "Ollama no respondió correctamente; esta respuesta usa la guía curricular local."
      });
    }

    const data = await ollamaResponse.json();
    const answer = await parse(data) || "No pude generar una respuesta.";

    return res.json({ answer });
  } catch (error) {
    console.warn("Ollama no disponible; se activa el tutor local:", error.message);
    return res.json({
      mode: "fallback",
      answer: localTutorAnswer(req.body?.question || "", req.body?.topic || "all", req.body?.subject || "calculus", req.body?.language === "en" ? "English" : "Spanish", req.body?.action || "ask"),
      notice: req.body?.language === "en" ? "Ollama is not available now; this answer uses the local curriculum guide." : "Ollama no está disponible ahora; esta respuesta usa la guía curricular local."
    });
  }
}

// Canonical tutor endpoint for the public API.
app.post("/api/tutor", quotaMiddleware, handleTutorRequest);

// Backward-compatible alias used by older frontend builds.
app.post("/api/chat", quotaMiddleware, handleTutorRequest);

app.get("/api/curriculum", (_req, res) => {
  fs.readFile(CURRICULUM_PATH, "utf8", (err, data) => {
    if (err) {
      return res.status(500).json({ error: "No se pudo leer el curriculum." });
    }

    try {
      const curriculum = JSON.parse(data);
      return res.json(curriculum);
    } catch (parseErr) {
      return res.status(500).json({ error: "El archivo de curriculum no es válido JSON." });
    }
  });
});

app.get("/*", (_req, res) => {
  res.sendFile(path.join(FRONTEND, "index.html"));
});

function shutdown(signal) {
  console.log(`Cerrando servidor por ${signal}...`);
  tutorDeviceLimiter.clear();
  tutorIpLimiter.clear();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});
