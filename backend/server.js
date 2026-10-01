import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FRONTEND = path.join(ROOT, "frontend");
const CURRICULUM_PATH = path.join(ROOT, "config", "curriculum_config.json");

const app = express();
const port = Number(process.env.PORT || 3000);
app.set("trust proxy", 1);
const AI_BASE_URL = String(process.env.AI_BASE_URL || "").replace(/\/$/, "");
const AI_API_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";

const systemPrompt = `Eres cure.math AI, un tutor universal de matemáticas: claro, paciente, riguroso y socrático. Puedes ayudar con aritmética, álgebra, geometría, cálculo, estadística, probabilidad, álgebra lineal, matemática discreta y matemática aplicada. Adapta el nivel al estudiante. Da una pista antes de revelar una solución completa, comprueba supuestos y usa notación legible. Si el usuario adjunta materiales, trátalos como contexto de estudio y no inventes contenido que no puedas leer. Si una pregunta no es matemática, redirígela con amabilidad.`;
const visionSystemPrompt = `${systemPrompt} Analiza la imagen o documento recibido, extrae con cuidado el enunciado matemático y enseña el procedimiento paso a paso. RESTRICCIÓN PEDAGÓGICA INMUTABLE: no uses el número e ni la función ln en ejemplos, fórmulas, pistas o respuestas. Si aparecen en el material, explica la idea con una alternativa permitida o indica que esa parte queda fuera del temario.`;
const quotaStore = new Map();
const FREE_LIMIT = 3;

function quotaMiddleware(req, res, next) {
  if (req.get("x-plan") === "premium") return next();
  const key = req.ip || req.socket.remoteAddress || "anonymous";
  const current = quotaStore.get(key) || { count: 0, resetAt: Date.now() + 24 * 60 * 60 * 1000 };
  if (Date.now() > current.resetAt) { current.count = 0; current.resetAt = Date.now() + 24 * 60 * 60 * 1000; }
  if (current.count >= FREE_LIMIT) {
    return res.status(429).json({ error: "Free Tier agotado.", plan: "free", limit: FREE_LIMIT, upgrade: "Activa Premium para continuar sin límite." });
  }
  current.count += 1;
  quotaStore.set(key, current);
  res.setHeader("X-Quota-Limit", FREE_LIMIT);
  res.setHeader("X-Quota-Remaining", Math.max(0, FREE_LIMIT - current.count));
  next();
}

function imageData(value) {
  return String(value || "").replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
}

function modelConfig() {
  if (AI_BASE_URL && AI_API_KEY) return { provider: "openai-compatible", model: AI_MODEL };
  return { provider: "ollama", model: process.env.OLLAMA_MODEL || "llama3" };
}

async function chatRequest({ messages, model, images = [] }) {
  const config = modelConfig();
  if (config.provider === "openai-compatible") {
    const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_API_KEY}` },
      body: JSON.stringify({ model: model || config.model, messages, temperature: 0.2 })
    });
    return { response, parse: async data => data?.choices?.[0]?.message?.content };
  }

  const ollamaMessages = messages.map(message => ({
    ...message,
    ...(message.images?.length ? { images: message.images } : {})
  }));
  const response = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

function localTutorAnswer(question, topic = "all", subject = "calculus") {
  const lower = question.toLowerCase();
  const guide = {
    chain: "Busca la función exterior e interior. Deriva la exterior conservando la interior y multiplica por la derivada de la interior.",
    implicit: "Deriva ambos lados respecto de x. Cada término que contenga y aporta un factor y'. Después agrupa y' y despeja.",
    tangent: "Calcula y', evalúala en el punto para obtener la pendiente m y usa y-y₀=m(x-x₀).",
    all: "Primero identifica la estructura: composición, producto, cociente, ecuación implícita o una recta tangente. Luego aplica la regla correspondiente paso a paso."
  }[topic] || "";

  if (/fuera|temario/.test(lower)) {
    return "Puedo ayudarte con aritmética, álgebra, geometría, cálculo, estadística, álgebra lineal, matemática discreta y física matemática. Sube una imagen o elige una materia para comenzar.";
  }

  const subjectHint = subject === "algebra" ? "Define la incógnita, ordena los términos y comprueba sustituyendo." : subject === "geometry" ? "Dibuja la figura, anota los datos y elige la relación geométrica que conecta lo que buscas." : subject === "statistics" ? "Identifica la población, la variable y la medida que te están pidiendo antes de calcular." : guide;
  return `Pista guiada para ${subject}:\n\n${subjectHint}\n\nEscribe la expresión o el paso que te confunde y lo resolvemos juntos sin saltarnos el razonamiento.`;
}

const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : true;
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "15mb" }));
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});
app.use(express.static(FRONTEND));

app.get("/api/app-meta", (_req, res) => {
  res.json({ name: "cure.math AI", version: "0.6.0", updatedAt: new Date().toISOString(), status: "ready", capabilities: ["vision", "dynamic-curriculum", "free-tier", "bilingual-ui", "installable-web-app"], ai: modelConfig().provider });
});

app.get("/api/ai/status", (_req, res) => {
  const config = modelConfig();
  res.json({ provider: config.provider, model: config.model, vision: Boolean(process.env.AI_VISION_MODEL || process.env.OLLAMA_VISION_MODEL), configured: config.provider === "openai-compatible" || Boolean(process.env.OLLAMA_URL) });
});

app.get("/api/quota", (req, res) => {
  const key = req.ip || req.socket.remoteAddress || "anonymous";
  const current = quotaStore.get(key);
  res.json({ plan: req.get("x-plan") === "premium" ? "premium" : "free", limit: FREE_LIMIT, used: current?.count || 0, remaining: Math.max(0, FREE_LIMIT - (current?.count || 0)) });
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
    return res.json({ mode: "vision", answer: await vision.parse(data) || "No pude interpretar la imagen.", model: process.env.OLLAMA_VISION_MODEL || process.env.AI_VISION_MODEL || "llava" });
  } catch (error) {
    console.warn("Visión Ollama no disponible:", error.message);
    return res.json({ mode: "vision-fallback", answer: "Recibí tu material, pero el modelo de visión no está disponible todavía. Configura OLLAMA_VISION_MODEL (por ejemplo, llava) para analizar fotos y PDFs.", notice: "El archivo no se guardó en el servidor." });
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
    const english = req.query.language === "en";
    return res.json({
      ...exercise,
      tag: english ? (exercise.tagEn || exercise.tag) : exercise.tag,
      question: english ? (exercise.questionEn || exercise.question) : exercise.question,
      hint: english ? (exercise.hintEn || exercise.hint) : exercise.hint,
      steps: english ? (exercise.stepsEn || exercise.steps) : exercise.steps,
      answered: false
    });
  } catch (error) {
    return res.status(500).json({ error: "No se pudo cargar el banco de ejercicios.", details: error.message });
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

app.post("/api/chat", quotaMiddleware, async (req, res) => {
  try {
    const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";

    if (!question) {
      return res.status(400).json({ error: "La pregunta es obligatoria." });
    }

    const curriculum = readCurriculum();
    const topic = typeof req.body?.topic === "string" ? req.body.topic : "all";
    const language = req.body?.language === "en" ? "English" : "Spanish";
    const subject = typeof req.body?.subject === "string" ? req.body.subject : "calculus";
    const level = typeof req.body?.level === "string" ? req.body.level : "explore";
    const materialContext = typeof req.body?.materialContext === "string" ? req.body.materialContext.slice(0, 16000) : "";
    const { response: ollamaResponse, parse } = await chatRequest({
      messages: [
        {
          role: "system",
          content: `${systemPrompt}\nCurso seleccionado: ${subject}. Nivel: ${level}. Currículo disponible como referencia: ${curriculum.allowedTopics.join(", ")}. Tema seleccionado: ${topic}. Responde en ${language}, con una pista primero y pasos cortos. No des por hecho la respuesta del estudiante.`
        },
        { role: "user", content: materialContext ? `${question}\n\nMateriales disponibles:\n${materialContext}` : question }
      ]
    });

    if (!ollamaResponse.ok) {
      const errorText = await ollamaResponse.text();
      console.warn("Ollama respondió con error:", errorText);
      return res.json({
        mode: "fallback",
        answer: localTutorAnswer(question, topic, subject),
        notice: "Ollama no respondió correctamente; esta respuesta usa la guía curricular local."
      });
    }

    const data = await ollamaResponse.json();
    const answer = await parse(data) || "No pude generar una respuesta.";

    return res.json({ answer });
  } catch (error) {
    console.warn("Ollama no disponible; se activa el tutor local:", error.message);
    return res.json({
      mode: "fallback",
      answer: localTutorAnswer(req.body?.question || "", req.body?.topic || "all", req.body?.subject || "calculus"),
      notice: "Ollama no está disponible ahora; esta respuesta usa la guía curricular local."
    });
  }
});

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

app.listen(port, "0.0.0.0", () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});
