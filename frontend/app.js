import { evaluateExpression, initCalculator } from "./math-tools.js";
import { initGraph } from "./graph-tool.js";

const TOPIC_GUIDES = {
  all: {
    title: "Mezcla inteligente",
    focus: "Practica varios tipos de derivadas para reconocer cuándo usa cada regla.",
    strategy: "Observa el patrón general, identifica la estructura y luego deriva con la regla apropiada."
  },
  chain: {
    title: "Regla de la cadena",
    focus: "Busca la función exterior e interior antes de derivar.",
    strategy: "Deriva la capa externa, conserva la interna y multiplica por la derivada de la interna."
  },
  implicit: {
    title: "Diferenciación implícita",
    focus: "Cuando aparece y, trátala como función de x y multiplica por y'.",
    strategy: "Agrupa términos con y' y resuélvelos al final."
  },
  tangent: {
    title: "Rectas tangentes",
    focus: "La pendiente es la derivada evaluada en el punto dado.",
    strategy: "Usa la forma punto-pendiente y simplifica la ecuación final."
  },
  related: {
    title: "Razones relacionadas",
    focus: "Conecta cantidades que cambian con el tiempo antes de sustituir valores.",
    strategy: "Escribe la relación geométrica, deriva respecto al tiempo y sustituye al final."
  },
  extrema: {
    title: "Máximos y mínimos",
    focus: "Busca puntos críticos y compara los valores que determinan el comportamiento de la función.",
    strategy: "Calcula la derivada, encuentra candidatos y compara extremos del intervalo y puntos críticos."
  }
};

function getDeviceId() {
  try {
    const stored = localStorage.getItem("cureDeviceId");
    if (stored) return stored;
    const generated = globalThis.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("cureDeviceId", generated);
    return generated;
  } catch {
    return `memory-device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

const state = {
  deviceId: getDeviceId(),
  serverProfile: null,
  onlineUsers: 0,
  topic: "all",
  language: localStorage.getItem("cureLanguage") || "es",
  subject: localStorage.getItem("cureSubject") || "calculus",
  level: localStorage.getItem("cureLevel") || "explore",
  materials: [],
  selectedCurriculumMaterial: null,
  question: null,
  number: 0,
  sim: [],
  simGraded: false,
  simScore: 0,
  simAnswered: 0,
  simLoading: false,
  chatHistory: [],
  chatAction: "ask",
  recent: {
    all: [],
    chain: [],
    implicit: [],
    tangent: [],
    related: [],
    extrema: []
  },
  profile: JSON.parse(
    localStorage.getItem("fedraProfileV2") ||
      '{"attempted":0,"correct":0,"streak":0}'
  ),
  study: getStoredStudyState()
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function getStoredStudyState() {
  const defaults = {
    topicStats: {
      all: { attempted: 0, correct: 0, streak: 0 },
      chain: { attempted: 0, correct: 0, streak: 0 },
      implicit: { attempted: 0, correct: 0, streak: 0 },
      tangent: { attempted: 0, correct: 0, streak: 0 },
      related: { attempted: 0, correct: 0, streak: 0 },
      extrema: { attempted: 0, correct: 0, streak: 0 }
    },
    sessionCount: 0,
    lastFocus: "all"
  };

  try {
    const stored = JSON.parse(localStorage.getItem("fedraStudyV2") || "null");
    if (!stored) return defaults;

    return {
      ...defaults,
      ...stored,
      topicStats: { ...defaults.topicStats, ...(stored.topicStats || {}) }
    };
  } catch {
    return defaults;
  }
}

function normalize(value) {
  return String(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[(){}\[\]]/g, "")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/π/g, "pi")
    .replace(/−/g, "-")
    .replace(/\*/g, "")
    .replace(/′|'/g, "");
}

function numericAnswer(value) {
  const candidate = String(value || "")
    .trim()
    .replace(/^answer\s*[:=]\s*/i, "")
    .replace(/=/g, "")
    .replace(/,(?=\d)/g, ".");
  if (!candidate || /[a-df-z]/i.test(candidate.replace(/pi/gi, ""))) return null;
  try {
    const result = evaluateExpression(candidate, {}, "rad");
    return Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

function answerIsCorrect(value, question) {
  const answers = [question.answer, ...(question.aliases || [])];
  if (answers.some(answer => normalize(value) === normalize(answer))) return true;
  const submittedNumber = numericAnswer(value);
  return submittedNumber !== null && answers.some(answer => {
    const expectedNumber = numericAnswer(answer);
    return expectedNumber !== null && Math.abs(submittedNumber - expectedNumber) <= 1e-9 * Math.max(1, Math.abs(expectedNumber));
  });
}

function ensureTopicStats(topic) {
  if (!state.study.topicStats[topic]) {
    state.study.topicStats[topic] = { attempted: 0, correct: 0, streak: 0 };
  }
}

function updateStudyStats(topic, wasCorrect) {
  ensureTopicStats("all");
  ensureTopicStats(topic);

  state.study.topicStats.all.attempted += 1;
  state.study.topicStats.all.correct += wasCorrect ? 1 : 0;
  state.study.topicStats.all.streak = wasCorrect
    ? state.study.topicStats.all.streak + 1
    : 0;

  state.study.topicStats[topic].attempted += 1;
  state.study.topicStats[topic].correct += wasCorrect ? 1 : 0;
  state.study.topicStats[topic].streak = wasCorrect
    ? state.study.topicStats[topic].streak + 1
    : 0;

  const weakest = getWeakestTopic();
  state.study.lastFocus = weakest;
  state.study.sessionCount += 1;
}

function saveStudyState() {
  localStorage.setItem("fedraStudyV2", JSON.stringify(state.study));
}

function save() {
  localStorage.setItem("fedraProfileV2", JSON.stringify(state.profile));
  saveStudyState();
  updateStats();
  updateCoachPanel();
}

function updateStats() {
  const profile = state.profile;

  $("#attempted").textContent = profile.attempted;
  $("#correct").textContent = profile.correct;
  $("#streak").textContent = profile.streak;

  $("#accuracy").textContent = `${
    profile.attempted
      ? Math.round((profile.correct / profile.attempted) * 100)
      : 0
  }%`;
  const summary = $("#sessionSummary");
  if (summary) summary.textContent = `${profile.attempted} ${t("attempts").toLowerCase()} · ${profile.attempted ? Math.round((profile.correct / profile.attempted) * 100) : 0}% ${t("accuracy").toLowerCase()}`;
}

const UI_COPY = {
  es: { hero: "Aprende como si tuvieras tus apuntes abiertos.", subtitle: "Un tutor que sigue tu temario, lee tus materiales y te guía paso a paso.", heroEyebrow: "LABORATORIO INFINITO", heroTitle: "Una derivada a la vez.", heroBody: "Regla de la cadena, producto, cociente, diferenciación implícita y rectas tangentes. Sin temas fuera del currículo.", roadmap: "tu hoja de ruta", roadmapHint: "exterior · interior · conecta las capas", rhythm: "Ritmo", question: "PREGUNTA", questions: "PREGUNTAS", privacy: "Privacidad · Uso educativo", generate: "Generar simulacro", grade: "Calificar", ask: "Preguntar", assistantDescription: "Pregunta sobre los temas configurados.", practice: "Práctica", sim: "Simulacro", tutor: "Tutor IA", rules: "Currículo", placeholder: "¿Cómo aplico la regla de la cadena?", status: "Tutor listo", synced: "Contenido sincronizado", streak: "Racha", session: "Tu sesión", attempts: "Intentos", correct: "Aciertos", accuracy: "Precisión", focus: "Tu foco", filter: "Filtro curricular", allTopics: "Todos los temas", plan: "Plan de estudio", review: "Qué revisar", activeGuide: "Guía activa", hint: "Pista", solution: "Ver procedimiento", check: "Comprobar", newQuestion: "Otra pregunta ↻", universe: "Elige tu territorio", level: "Nivel", route: "Ruta de aprendizaje", tryIdea: "Prueba una idea", materials: "Trae tus materiales aquí", materialHelp: "PDF, imágenes o apuntes · hasta 10 MB por archivo", choose: "Seleccionar archivos", syllabus: "Temario activo", thinking: "Pensando…", welcome: "Hola, soy cure.math AI. Puedo ayudarte con matemáticas paso a paso. Elige una materia o sube una foto del ejercicio para comenzar.", cookieTitle: "Tu privacidad importa.", cookieBody: "Usamos almacenamiento local para recordar tu progreso y preferencia de idioma.", cookieAccept: "Entendido", footer: "Diseñado para aprender, no para copiar.", assistantEyebrow: "TUTOR CURRICULAR", universeEyebrow: "UNIVERSO MATEMÁTICO", rulesEyebrow: "CONFIGURACIÓN CURRICULAR", retry: "Intentar de nuevo", simLoading: "Creando preguntas…", simError: "No pude crear el simulacro. Intenta de nuevo.", simPartial: "respondidas", simDone: "Este simulacro ya fue calificado." },
  en: { hero: "Learn as if your notes were open beside you.", subtitle: "A tutor that follows your syllabus, reads your materials, and guides you step by step.", heroEyebrow: "INFINITE LAB", heroTitle: "One derivative at a time.", heroBody: "Chain, product and quotient rules, implicit differentiation, and tangent lines. Always inside your curriculum.", roadmap: "your roadmap", roadmapHint: "outer · inner · connect the layers", rhythm: "Pace", question: "QUESTION", questions: "QUESTIONS", privacy: "Privacy · Educational use", generate: "Generate mock exam", grade: "Grade", ask: "Ask", assistantDescription: "Ask about the configured topics.", practice: "Practice", sim: "Mock exam", tutor: "AI tutor", rules: "Curriculum", placeholder: "How do I use the chain rule?", status: "Tutor ready", synced: "Content synced", streak: "Streak", session: "Your session", attempts: "Attempts", correct: "Correct", accuracy: "Accuracy", focus: "Your focus", filter: "Curriculum filter", allTopics: "All topics", plan: "Study plan", review: "Review next", activeGuide: "Active guide", hint: "Hint", solution: "Show steps", check: "Check", newQuestion: "New question ↻", universe: "Choose your territory", level: "Level", route: "Learning path", tryIdea: "Try an idea", materials: "Bring your materials here", materialHelp: "PDFs, images or notes · up to 10 MB per file", choose: "Choose files", syllabus: "Active curriculum", thinking: "Thinking…", welcome: "Hi, I am cure.math AI. I can guide you through math step by step. Choose a subject or upload a photo of your exercise to begin.", cookieTitle: "Your privacy matters.", cookieBody: "We use local storage to remember your progress and language preference.", cookieAccept: "Got it", footer: "Designed for learning, not copying.", assistantEyebrow: "CURRICULUM TUTOR", universeEyebrow: "MATH UNIVERSE", rulesEyebrow: "CURRICULUM SETTINGS", retry: "Try again", simLoading: "Creating questions…", simError: "I could not create the mock exam. Try again.", simPartial: "answered", simDone: "This mock exam has already been graded." }
};

function t(key) { return UI_COPY[state.language]?.[key] || UI_COPY.es[key] || key; }

const TOOL_COPY = {
  es: {
    calculatorEyebrow: "HERRAMIENTA DE CÁLCULO", calculatorTitle: "Calculadora científica", calculatorDescription: "Calcula con funciones trigonométricas, potencias y paréntesis.",
    angleHint: "Enter = calcular · x² = x^2", keypad: "Teclado de calculadora", graphEyebrow: "LABORATORIO VISUAL", graphTitle: "Graficador de funciones", graphDescriptionHelp: "Escribe una función de x y explora su forma.", expressionLabel: "f(x)", plot: "Graficar", reset: "Restablecer", from: "Desde", to: "Hasta", applyRange: "Aplicar rango", graphLabel: "Gráfica de la función", graphHelp: "Funciones: sin, cos, tan, sin⁻¹, cos⁻¹, tan⁻¹, sqrt, abs, log, exp, pi. Usa la rueda para zoom."
  },
  en: {
    calculatorEyebrow: "CALCULATION TOOL", calculatorTitle: "Scientific calculator", calculatorDescription: "Calculate with trigonometric functions, powers, and parentheses.",
    angleHint: "Enter = calculate · x² = x^2", keypad: "Calculator keypad", graphEyebrow: "VISUAL LAB", graphTitle: "Function grapher", graphDescriptionHelp: "Enter a function of x and explore its shape.", expressionLabel: "f(x)", plot: "Plot", reset: "Reset", from: "From", to: "To", applyRange: "Apply range", graphLabel: "Function graph", graphHelp: "Functions: sin, cos, tan, sin⁻¹, cos⁻¹, tan⁻¹, sqrt, abs, log, exp, pi. Use the mouse wheel to zoom."
  }
};

function toolText(key) { return TOOL_COPY[state.language]?.[key] || TOOL_COPY.es[key] || key; }

const APP_COPY = {
  es: {
    eyebrow: "RECURSOS CURADOS",
    title: "Mejores apps de matemáticas",
    intro: "Herramientas confiables para practicar, visualizar y aprender matemáticas.",
    official: "Sitio oficial ↗",
    source: "Fuente verificada",
    updated: "Actualizado",
    loading: "Cargando recomendaciones…",
    error: "No se pudo cargar el catálogo ahora. Intenta de nuevo más tarde."
  },
  en: {
    eyebrow: "CURATED RESOURCES",
    title: "Best math apps",
    intro: "Trusted tools for practicing, visualizing, and learning mathematics.",
    official: "Official site ↗",
    source: "Verified source",
    updated: "Updated",
    loading: "Loading recommendations…",
    error: "The catalog could not load right now. Please try again later."
  }
};

function appText(key) { return APP_COPY[state.language]?.[key] || APP_COPY.es[key] || key; }

const GUIDE_COPY = {
  all: { es: ["Mezcla inteligente", "Practica varios tipos de derivadas para reconocer cuándo usar cada regla."], en: ["Smart mix", "Practice several derivative types and learn when each rule applies."] },
  chain: { es: ["Regla de la cadena", "Busca la función exterior e interior antes de derivar."], en: ["Chain rule", "Find the outer and inner functions before differentiating."] },
  implicit: { es: ["Diferenciación implícita", "Cuando aparece y, trátala como función de x y multiplica por y'."], en: ["Implicit differentiation", "Treat y as a function of x and multiply its terms by y'."] },
  tangent: { es: ["Rectas tangentes", "La pendiente es la derivada evaluada en el punto dado."], en: ["Tangent lines", "The slope is the derivative evaluated at the given point."] },
  related: { es: ["Razones relacionadas", "Conecta cantidades que cambian con el tiempo."], en: ["Related rates", "Connect quantities that change with time."] },
  extrema: { es: ["Máximos y mínimos", "Compara puntos críticos y extremos del intervalo."], en: ["Maximum and minimum", "Compare critical numbers and interval endpoints."] }
};

const GUIDE_STRATEGY = {
  all: { es: "Observa el patrón general, identifica la estructura y luego deriva con la regla apropiada.", en: "Observe the pattern, identify the structure, then differentiate with the matching rule." },
  chain: { es: "Deriva la capa externa, conserva la interna y multiplica por la derivada de la interna.", en: "Differentiate the outer layer, keep the inner layer, and multiply by its derivative." },
  implicit: { es: "Agrupa términos con y' y resuélvelos al final.", en: "Group the y' terms and isolate them at the end." },
  tangent: { es: "Usa la forma punto-pendiente y simplifica la ecuación final.", en: "Use point-slope form and simplify the final equation." },
  related: { es: "Escribe la relación, deriva respecto al tiempo y sustituye al final.", en: "Write the relation, differentiate with respect to time, then substitute." },
  extrema: { es: "Calcula la derivada, encuentra candidatos y compara sus valores.", en: "Differentiate, find candidates, and compare their values." }
};

function guideTitle(topic) { return GUIDE_COPY[topic]?.[state.language]?.[0] || TOPIC_GUIDES[topic]?.title || topic; }
function guideFocus(topic) { return GUIDE_COPY[topic]?.[state.language]?.[1] || TOPIC_GUIDES[topic]?.focus || ""; }
function guideStrategy(topic) { return GUIDE_STRATEGY[topic]?.[state.language] || TOPIC_GUIDES[topic]?.strategy || ""; }

function localizedExercise(question) {
  if (!question) return question;
  const english = state.language === "en";
  return {
    ...question,
    tag: english ? (question.tagEn || question.tag) : question.tag,
    question: english ? (question.questionEn || question.question) : question.question,
    hint: english ? (question.hintEn || question.hint) : question.hint,
    steps: english ? (question.stepsEn || question.steps) : question.steps
  };
}

const UNIVERSAL_SUBJECTS = [
  { id: "arithmetic", icon: "＋", titleEs: "Aritmética", titleEn: "Arithmetic", noteEs: "Números, fracciones y proporciones", noteEn: "Numbers, fractions and ratios" },
  { id: "algebra", icon: "x²", titleEs: "Álgebra", titleEn: "Algebra", noteEs: "Ecuaciones, funciones y patrones", noteEn: "Equations, functions and patterns" },
  { id: "geometry", icon: "△", titleEs: "Geometría", titleEn: "Geometry", noteEs: "Formas, medidas y demostraciones", noteEn: "Shapes, measures and proofs" },
  { id: "calculus", icon: "∫", titleEs: "Cálculo", titleEn: "Calculus", noteEs: "Límites, derivadas e integrales", noteEn: "Limits, derivatives and integrals" },
  { id: "statistics", icon: "σ", titleEs: "Estadística", titleEn: "Statistics", noteEs: "Datos, probabilidad e inferencia", noteEn: "Data, probability and inference" },
  { id: "linear", icon: "▦", titleEs: "Álgebra lineal", titleEn: "Linear algebra", noteEs: "Vectores, matrices y espacios", noteEn: "Vectors, matrices and spaces" },
  { id: "discrete", icon: "∑", titleEs: "Discreta", titleEn: "Discrete math", noteEs: "Lógica, conteo y algoritmos", noteEn: "Logic, counting and algorithms" },
  { id: "physics", icon: "↗", titleEs: "Matemática aplicada", titleEn: "Applied math", noteEs: "Modelos para ciencia y vida real", noteEn: "Models for science and real life" }
];

function renderSubjectGrid() {
  const grid = $("#subjectGrid");
  if (!grid) return;
  grid.innerHTML = UNIVERSAL_SUBJECTS.map(subject => `<button class="subject-card ${state.subject === subject.id ? "active" : ""}" data-subject="${subject.id}" aria-pressed="${state.subject === subject.id}"><span class="subject-icon">${subject.icon}</span><strong>${state.language === "en" ? subject.titleEn : subject.titleEs}</strong><small>${state.language === "en" ? subject.noteEn : subject.noteEs}</small></button>`).join("");
  $$('[data-subject]').forEach(button => { button.onclick = () => { state.subject = button.dataset.subject; localStorage.setItem("cureSubject", state.subject); renderSubjectGrid(); updateCoachPanel(); showView("assistant"); addChat("assistant", state.language === "en" ? `Subject selected: ${button.textContent.trim()}. Ask me for a guided challenge.` : `Materia seleccionada: ${button.textContent.trim()}. Pídeme un reto guiado.`); }; });
}

function applyLanguage() {
  const copy = UI_COPY[state.language];
  document.documentElement.lang = state.language;
  const hero = document.querySelector(".topbar h1");
  const subtitle = document.querySelector(".topbar p");
  if (hero) hero.textContent = copy.hero;
  if (subtitle) subtitle.textContent = copy.subtitle;
  $("#aiStatus").textContent = copy.status;
  $("#updateNote").textContent = copy.synced;
  $("#languageToggle").textContent = state.language === "es" ? "EN" : "ES";
  $("#chatInput").placeholder = copy.placeholder;
  const tabs = $$(".tab");
  [copy.practice, copy.sim, copy.tutor, copy.rules, toolText("calculatorTitle"), toolText("graphTitle")].forEach((label, index) => { if (tabs[index]) tabs[index].textContent = label; });
  const labels = {
    "#streakLabel": "streak", "#sessionLabel": "session", "#attemptsLabel": "attempts", "#correctLabel": "correct",
    "#accuracyLabel": "accuracy", "#focusLabel": "focus", "#filterLabel": "filter", "#planLabel": "plan",
    "#reviewLabel": "review", "#activeGuideLabel": "activeGuide", "#universeLabel": "universe",
    "#levelLabel": "level", "#routeLabel": "route", "#tryIdeaLabel": "tryIdea", "#materialsTitle": "materials",
    "#materialHelp": "materialHelp", "#chooseMaterials": "choose", "#rulesTitle": "syllabus",
    "#cookieTitle": "cookieTitle", "#cookieBody": "cookieBody", "#acceptCookies": "cookieAccept", "#footerTagline": "footer", "#assistantEyebrow": "assistantEyebrow", "#universeEyebrow": "universeEyebrow", "#routeHeading": "route", "#rulesEyebrow": "rulesEyebrow",
    "#heroEyebrow": "heroEyebrow", "#heroTitle": "heroTitle", "#heroBody": "heroBody", "#roadmapLabel": "roadmap", "#roadmapHint": "roadmapHint", "#rhythmLabel": "rhythm", "#attemptsLabel": "attempts", "#correctLabel": "correct", "#accuracyLabel": "accuracy", "#newQuestion": "newQuestion", "#simEyebrow": "questions", "#assistantDescription": "assistantDescription", "#footerPrivacy": "privacy", "#newSim": "generate", "#gradeSim": "grade", "#chatSubmit": "ask"
  };
  Object.entries(labels).forEach(([selector, key]) => { const element = $(selector); if (element) element.textContent = t(key); });
  const questionTitle = $("#practiceTitle"); if (questionTitle) questionTitle.textContent = state.language === "en" ? "Guided practice" : "Práctica guiada";
  const questionEyebrow = $("#questionEyebrow"); if (questionEyebrow) questionEyebrow.textContent = state.language === "en" ? "QUESTION" : "PREGUNTA";
  const simTitle = $("#simTitle"); if (simTitle) simTitle.textContent = state.language === "en" ? "Quick mock exam" : "Simulacro rápido";
  const assistantTitle = $("#assistantTitle"); if (assistantTitle) assistantTitle.textContent = state.language === "en" ? "Your study desk" : "Tu mesa de estudio";
  const assistantDescription = $("#assistantDescription"); if (assistantDescription) assistantDescription.textContent = state.language === "en" ? "Ask about the configured topics." : "Pregunta sobre los temas configurados.";
  const toolLabels = { "#calculatorEyebrow": "calculatorEyebrow", "#calculatorTitle": "calculatorTitle", "#calculatorDescription": "calculatorDescription", "#graphEyebrow": "graphEyebrow", "#graphTitle": "graphTitle", "#graphDescriptionHelp": "graphDescriptionHelp", "#graphExpressionLabel": "expressionLabel", "#plotGraph": "plot", "#resetGraph": "reset", "#graphMinLabel": "from", "#graphMaxLabel": "to", "#applyRange": "applyRange", "#graphHelp": "graphHelp" };
  Object.entries(toolLabels).forEach(([selector, key]) => { const element = $(selector); if (element) element.textContent = toolText(key); });
  const calculatorHint = document.querySelector("#calculatorView .calculator-toolbar .muted"); if (calculatorHint) calculatorHint.textContent = toolText("angleHint");
  const keypad = $("#calculatorKeys"); if (keypad) keypad.setAttribute("aria-label", toolText("keypad"));
  const memory = document.querySelector(".calculator-memory"); if (memory) memory.setAttribute("aria-label", state.language === "en" ? "Calculator memory" : "Memoria de calculadora");
  const zoomIn = $("#zoomIn"); if (zoomIn) zoomIn.setAttribute("aria-label", state.language === "en" ? "Zoom in" : "Acercar");
  const zoomOut = $("#zoomOut"); if (zoomOut) zoomOut.setAttribute("aria-label", state.language === "en" ? "Zoom out" : "Alejar");
  const canvas = $("#graphCanvas"); if (canvas) canvas.setAttribute("aria-label", toolText("graphLabel"));
  calculatorTool?.setLanguage(state.language); graphTool?.setLanguage(state.language);
  const level = $("#levelSelect"); if (level) [...level.options].forEach(option => { option.textContent = state.language === "en" ? ({ explore: "Explore", school: "School", college: "College", olympiad: "Advanced challenge" }[option.value]) : ({ explore: "Explorar", school: "Secundaria", college: "Universidad", olympiad: "Reto avanzado" }[option.value]); });
  const filter = $("#topicFilter"); if (filter) [...filter.options].forEach(option => { option.textContent = option.value === "all" ? t("allTopics") : option.value === "chain" ? (state.language === "en" ? "Derivative rules" : "Reglas de derivación") : option.value === "implicit" ? (state.language === "en" ? "Implicit differentiation" : "Implícita") : option.value === "tangent" ? (state.language === "en" ? "Tangents" : "Tangentes") : option.value === "related" ? (state.language === "en" ? "Related rates" : "Razones relacionadas") : (state.language === "en" ? "Maximum and minimum" : "Máximos y mínimos"); });
  $$("[data-prompt]").forEach(button => { button.textContent = state.language === "en" ? (button.dataset.promptEn || button.dataset.prompt) : button.dataset.prompt; });
  const topicLabels = state.language === "en" ? { all: "Smart mix", chain: "Chain rule & combined rules", implicit: "Implicit differentiation", tangent: "Tangent lines", related: "Related rates", extrema: "Maximum and minimum" } : { all: "Mezcla inteligente", chain: "Cadena y reglas combinadas", implicit: "Implícita", tangent: "Tangentes", related: "Razones relacionadas", extrema: "Máximos y mínimos" };
  $$(".topic").forEach(button => { const text = button.firstChild; if (text) text.textContent = `${topicLabels[button.dataset.topic]} `; });
  renderSubjectGrid();
  renderMaterials();
  loadCurriculumMaterials();
  const appsEyebrow = $("#appsEyebrow"); if (appsEyebrow) appsEyebrow.textContent = appText("eyebrow");
  const appsTitle = $("#recommendedAppsTitle"); if (appsTitle) appsTitle.textContent = appText("title");
  const appsIntro = $("#appsIntro"); if (appsIntro) appsIntro.textContent = appText("intro");
  loadMathApps();
  if (state.sim.length && !$("#simView")?.classList.contains("hidden")) renderSim();
  updateStats();
  updateCoachPanel();
  loadLearningPlan();
  localStorage.setItem("cureLanguage", state.language);
}

async function renderMath() {
  if (window.renderMathInElement) {
    window.renderMathInElement(document.body, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
        { left: "\\(", right: "\\)", display: false },
        { left: "\\[", right: "\\]", display: true }
      ],
      throwOnError: false
    });
  }
}

async function initDeviceSession() {
  try {
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: state.deviceId })
    });
    if (!response.ok) return;
    const data = await response.json();
    state.deviceId = data.deviceId;
    state.serverProfile = data.profile;
    localStorage.setItem("cureDeviceId", state.deviceId);
  } catch {
    // The app remains usable if the optional server profile is unavailable.
  }
}

function updatePresenceCount(count = 0) {
  state.onlineUsers = count;
  const label = $("#onlineCount");
  if (!label) return;
  label.textContent = state.language === "en"
    ? `${count} university students online`
    : `${count} universitarios en línea`;
}

function initPresence() {
  if (!window.io) return;
  const socket = window.io({ transports: ["websocket", "polling"] });
  socket.on("presence_update", payload => updatePresenceCount(Number(payload?.onlineUsers) || 0));
  fetch("/api/presence").then(response => response.json()).then(payload => updatePresenceCount(payload.onlineUsers)).catch(() => {});
}

function addMaterial(file) {
  const reader = new FileReader();
  const material = { name: file.name, size: file.size, text: "" };
  state.materials.push(material);
  if (/\.(txt|md|csv)$/i.test(file.name)) {
    reader.onload = () => { material.text = String(reader.result || "").slice(0, 8000); renderMaterials(); };
    reader.readAsText(file);
  } else if (/\.pdf$/i.test(file.name)) {
    material.text = "(leyendo PDF...)";
    import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs")
      .then(async pdfjs => {
        pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
        const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
        const pages = [];
        for (let pageNumber = 1; pageNumber <= Math.min(doc.numPages, 8); pageNumber += 1) {
          const page = await doc.getPage(pageNumber);
          const content = await page.getTextContent();
          pages.push(content.items.map(item => item.str).join(" "));
        }
        material.text = pages.join("\n").slice(0, 12000) || "(PDF sin texto seleccionable; usa su nombre como referencia)";
        renderMaterials();
      })
      .catch(() => { material.text = "(no se pudo extraer texto; usa su nombre como referencia)"; renderMaterials(); });
  }
  renderMaterials();
  if (/^(image\/png|image\/jpeg|application\/pdf)$/i.test(file.type) || /\.pdf$/i.test(file.name)) analyzeVisionFile(file);
}

async function analyzeVisionFile(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    addChat("user", `📎 ${file.name}`);
    const loading = addChat("assistant", state.language === "en" ? "Reading your material…" : "Analizando tu material…");
    try {
      const response = await fetch("/api/vision/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: reader.result,
          mimeType: file.type || "application/pdf",
          language: state.language,
          subject: state.subject,
          level: state.level,
          prompt: "Extrae el ejercicio matemático de este material. No resuelvas todo todavía: identifica los datos, el tema y dame solo el primer paso guiado."
        })
      });
      const data = await response.json();
      loading.textContent = data.answer || data.error || "No pude analizar el material.";
    } catch (error) {
      loading.textContent = state.language === "en" ? "I could not connect to the vision tutor. Try again." : "No pude conectar con el analizador visual. Puedes intentar de nuevo.";
    }
  };
  reader.readAsDataURL(file);
}

function renderMaterials() {
  const list = $("#materialList");
  if (!list) return;
  list.innerHTML = state.materials.map((item, index) => `<div class="material-item"><span>📎 ${escapeHtml(item.name)}</span><span>${Math.ceil(item.size / 1024)} KB <button type="button" data-remove-material="${index}" aria-label="${state.language === "en" ? "Remove" : "Quitar"} ${escapeHtml(item.name)}">×</button></span></div>`).join("");
  $$("[data-remove-material]").forEach(button => { button.onclick = () => { state.materials.splice(Number(button.dataset.removeMaterial), 1); renderMaterials(); }; });
}

async function loadCurriculumMaterials() {
  const library = $("#curriculumMaterials");
  if (!library) return;
  library.innerHTML = `<p class="muted">${state.language === "en" ? "Loading study materials…" : "Cargando materiales de estudio…"}</p>`;
  try {
    const response = await fetch(`/api/materials?language=${state.language}`);
    if (!response.ok) throw new Error("materials unavailable");
    const data = await response.json();
    library.innerHTML = (data.items || []).map(item => `
      <article class="material-card">
        <div class="material-card-head">
          <div><span class="material-section">${escapeHtml(item.section)}</span><h4>${escapeHtml(item.title)}</h4></div>
          <span aria-hidden="true">📘</span>
        </div>
        <p>${escapeHtml(item.description)}</p>
        <div class="material-card-actions">
          <a class="button secondary" href="${escapeHtml(item.fileUrl)}" target="_blank" rel="noopener noreferrer">${state.language === "en" ? "Open PDF" : "Abrir PDF"}</a>
          <button class="button primary" type="button" data-material-id="${escapeHtml(item.id)}" data-material-topic="${escapeHtml(item.practiceTopic)}">${state.language === "en" ? "Practice this" : "Practicar este tema"}</button>
        </div>
      </article>
    `).join("") || `<p class="muted">${state.language === "en" ? "No curriculum materials yet." : "Aún no hay materiales curriculares."}</p>`;
    const updated = $("#materialsUpdated");
    if (updated) updated.textContent = `${state.language === "en" ? "Updated" : "Actualizado"}: ${escapeHtml(data.updatedAt || "")}`;
    $$('[data-material-topic]').forEach(button => {
      button.onclick = () => {
        state.selectedCurriculumMaterial = data.items.find(item => item.id === button.dataset.materialId) || null;
        state.topic = button.dataset.materialTopic || "all";
        const filter = $("#topicFilter");
        if (filter) filter.value = state.topic;
        $$(".topic").forEach(item => item.classList.toggle("selected", item.dataset.topic === state.topic));
        showView("practice");
        newQuestion();
      };
    });
  } catch {
    library.innerHTML = `<p class="muted">${state.language === "en" ? "The material library is temporarily unavailable." : "La biblioteca de materiales no está disponible temporalmente."}</p>`;
  }
}

function setupMaterials() {
  const input = $("#materialInput");
  const dropzone = $("#materialDropzone");
  const choose = $("#chooseMaterials");
  if (!input || !dropzone || !choose) return;
  const handleFiles = files => {
    [...files].forEach(file => {
      if (file.size > 10 * 1024 * 1024) {
        addChat("assistant", state.language === "en" ? `${file.name} is larger than 10 MB.` : `${file.name} supera los 10 MB.`);
        return;
      }
      if (!/\.(png|jpe?g|pdf|txt|md|csv)$/i.test(file.name)) {
        addChat("assistant", state.language === "en" ? "Use a PNG, JPEG, PDF, TXT, MD, or CSV file." : "Usa un archivo PNG, JPEG, PDF, TXT, MD o CSV.");
        return;
      }
      addMaterial(file);
    });
    input.value = "";
  };
  choose.onclick = () => input.click();
  input.onchange = event => handleFiles(event.target.files);
  ["dragenter", "dragover"].forEach(event => dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach(event => dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.remove("dragover"); }));
  dropzone.addEventListener("drop", e => handleFiles(e.dataTransfer.files));
}

function getTopicAccuracy(topic) {
  ensureTopicStats(topic);
  const stats = state.study.topicStats[topic];
  const attempts = stats.attempted || 0;
  return attempts ? Math.round((stats.correct / attempts) * 100) : 0;
}

function getWeakestTopic() {
  const topics = ["chain", "implicit", "tangent", "related", "extrema"];
  const ranked = topics
    .map(topic => ({
      topic,
      accuracy: getTopicAccuracy(topic),
      attempts: state.study.topicStats[topic]?.attempted || 0
    }))
    .sort((a, b) => {
      if (a.attempts === 0 && b.attempts === 0) return 0;
      if (a.attempts === 0) return 1;
      if (b.attempts === 0) return -1;
      return a.accuracy - b.accuracy;
    });

  return ranked[0]?.topic || "chain";
}

function updateCoachPanel() {
  const activeTopic = state.topic === "all" ? getWeakestTopic() : state.topic;
  const guide = TOPIC_GUIDES[activeTopic] || TOPIC_GUIDES.all;
  const focusTopic = getWeakestTopic();
  const focusGuide = TOPIC_GUIDES[focusTopic] || TOPIC_GUIDES.all;

  $("#studyGoal").textContent = state.language === "en" ? `Next focus: ${guideTitle(focusTopic)}` : `Siguiente foco: ${guideTitle(focusTopic)}`;
  $("#studyReason").textContent = guideFocus(focusTopic);
  $("#coachStrategy").textContent = guideStrategy(focusTopic);

  const rows = ["chain", "implicit", "tangent", "related", "extrema"]
    .map(topic => {
      const stats = state.study.topicStats[topic] || { attempted: 0, correct: 0 };
      const accuracy = stats.attempted ? Math.round((stats.correct / stats.attempted) * 100) : 0;
      const percent = Math.max(10, accuracy);
      const active = state.topic === topic ? "active" : "";

      return `
        <div class="progress-row ${active}">
          <div class="progress-label">
            <span>${guideTitle(topic)}</span>
            <b>${accuracy}%</b>
          </div>
          <div class="progress-track">
            <span style="width:${percent}%"></span>
          </div>
        </div>
      `;
    })
    .join("");

  $("#progressList").innerHTML = rows;
  $("#topicOverview").textContent = `${guideTitle(activeTopic)}: ${guideFocus(activeTopic)}`;
  $("#learningReminder").textContent = state.language === "en" ? `Your current focus is ${guideTitle(focusTopic)}. Explain the steps aloud before answering.` : `Tu foco actual está en ${guideTitle(focusTopic)}. Intenta explicar el procedimiento en voz alta antes de responder.`;
}

async function getExercise(topic = state.topic) {
  const recent = state.recent[topic] || [];
  const params = new URLSearchParams({ topic, language: state.language });

  if (recent.length) {
    params.set("exclude", recent.join(","));
  }

  const response = await fetch(`/api/exercises/random?${params.toString()}`);

  if (response.status === 404 && recent.length) {
    state.recent[topic] = [];
    return getExercise(topic);
  }

  if (!response.ok) {
    throw new Error("No se pudo cargar el ejercicio.");
  }

  const exercise = await response.json();
  state.recent[topic] = [...recent, exercise.id].slice(-8);
  return exercise;
}

async function newQuestion() {
  const button = $("#newQuestion");
  if (button?.disabled) return;
  if (button) button.disabled = true;
  $("#questionArea").innerHTML = `<div class="feedback">${state.language === "en" ? "Loading a guided question…" : "Cargando una pregunta guiada…"}</div>`;
  try {
    state.question = await getExercise();
    state.number += 1;
    renderQuestion();
  } catch {
    $("#questionArea").innerHTML = `<div class="feedback bad">${state.language === "en" ? "I could not load a question." : "No pude cargar una pregunta."} <button class="button secondary" id="retryQuestion">${t("retry")}</button></div>`;
    $("#retryQuestion").onclick = newQuestion;
  } finally {
    if (button) button.disabled = false;
  }
}

function renderQuestion() {
  const question = localizedExercise(state.question);
  const activeGuide = TOPIC_GUIDES[question.topic] || TOPIC_GUIDES.all;

  $("#number").textContent = state.number;

  $("#questionArea").innerHTML = `
    <div class="coach-tip">
      <div class="eyebrow">${t("activeGuide")}</div>
      <h3>${guideTitle(question.topic)}</h3>
      <p>${guideFocus(question.topic)}</p>
      <small>${guideStrategy(question.topic)}</small>
    </div>

    <div class="question-meta">
      <span class="pill">${question.tag}</span>
      <span class="pill">${question.topic}</span>
      ${question.section ? `<span class="pill">MATH 122 · ${escapeHtml(question.section)}</span>` : ""}
    </div>

    <div class="question">${question.question}</div>

    <div class="answer-row">
      <input
        id="answerInput"
        placeholder="${state.language === "en" ? "Write your answer…" : "Escribe tu respuesta…"}"
        autocomplete="off"
      />

      <button class="button primary" id="checkAnswer">${t("check")}</button>
    </div>

    <div class="actions">
      <button class="button secondary" id="showHint">${t("hint")}</button>
      <button class="button secondary" id="showSolution">${t("solution")}</button>
    </div>

    <div id="hint" class="hint hidden">
      <b>${t("hint")}:</b> ${question.hint}
    </div>

    <div id="feedback"></div>

    <div id="solution" class="hidden">
      ${question.steps
        .map(
          (step, index) => `
            <div class="step">
              <b>${index + 1}.</b> ${step}
            </div>
          `
        )
        .join("")}
    </div>
  `;

  $("#checkAnswer").onclick = checkAnswer;

  $("#answerInput").onkeydown = event => {
    if (event.key === "Enter") {
      checkAnswer();
    }
  };

  $("#showHint").onclick = () => $("#hint").classList.toggle("hidden");
  $("#showSolution").onclick = () => $("#solution").classList.remove("hidden");
  $("#answerInput").focus();
  renderMath();
}

function checkAnswer() {
  const input = $("#answerInput");
  const feedback = $("#feedback");

  if (!input.value.trim()) {
    feedback.className = "feedback bad";
    feedback.textContent = state.language === "en" ? "Write an answer first." : "Escribe una respuesta primero.";
    return;
  }

  if (state.question.answered) {
    feedback.className = "feedback bad";
    feedback.textContent = state.language === "en" ? "This question has already been graded." : "Esta pregunta ya fue calificada.";
    return;
  }

  state.question.answered = true;
  state.profile.attempted += 1;

  const topic = state.question.topic || state.topic;
  const correct = answerIsCorrect(input.value, state.question);

  if (correct) {
    state.profile.correct += 1;
    state.profile.streak += 1;
    updateStudyStats(topic, true);

    feedback.className = "feedback good";
    feedback.textContent = state.language === "en" ? "Correct! Review the steps to make it stick." : "¡Correcto! Revisa el procedimiento para consolidarlo.";
  } else {
    state.profile.streak = 0;
    updateStudyStats(topic, false);

    feedback.className = "feedback bad";
    feedback.textContent = state.language === "en" ? "Not quite yet. Use the hint, then try to explain where your result differs." : "Todavía no. Usa la pista y revisa en qué paso se separa tu resultado.";
    $("#hint").classList.remove("hidden");
  }

  save();
}

function renderSim() {
  $("#simArea").innerHTML = state.sim
    .map(
      (rawQuestion, index) => {
        const question = localizedExercise(rawQuestion);
        return `
        <article class="sim-card">
          <h3>${index + 1}. ${question.tag}</h3>
          <p>${question.question}</p>
          <input data-index="${index}" placeholder="${state.language === "en" ? "Your answer…" : "Tu respuesta…"}" ${state.simGraded ? "disabled" : ""} />
        </article>
      `;
      }
    )
    .join("");

  const result = $("#simResult");
  if (state.simGraded) {
    result.textContent = `${state.language === "en" ? "Result" : "Resultado"}: ${state.simScore}/${state.sim.length} · ${state.simAnswered} ${t("simPartial")}`;
    result.classList.remove("hidden");
  } else {
    result.classList.add("hidden");
  }
  $("#gradeSim").disabled = state.simGraded || !state.sim.length;
}

async function makeSim() {
  if (state.simLoading) return;
  state.simLoading = true;
  state.simGraded = false;
  state.sim = [];
  $("#newSim").disabled = true;
  $("#gradeSim").disabled = true;
  $("#simArea").innerHTML = `<div class="feedback">${t("simLoading")}</div>`;
  try {
    for (let index = 0; index < 8; index += 1) state.sim.push(await getExercise("all"));
    renderSim();
  } catch {
    state.sim = [];
    $("#simArea").innerHTML = `<div class="feedback bad">${t("simError")} <button class="button secondary" id="retrySim">${t("retry")}</button></div>`;
    $("#retrySim").onclick = makeSim;
  } finally {
    state.simLoading = false;
    $("#newSim").disabled = false;
  }
}

function gradeSim() {
  if (state.simGraded || !state.sim.length) return;
  let score = 0;
  let answered = 0;

  $$("#simArea input").forEach(input => {
    const question = state.sim[Number(input.dataset.index)];
    if (!input.value.trim()) {
      input.style.borderColor = "var(--line)";
      return;
    }
    answered += 1;
    const correct = answerIsCorrect(input.value, question);

    input.style.borderColor = correct ? "var(--good)" : "var(--bad)";
    if (correct) score += 1;
  });

  state.profile.attempted += answered;
  state.profile.correct += score;

  const answerEntries = $$("#simArea input");
  state.sim.forEach((question, index) => {
    const value = answerEntries[index]?.value || "";
    if (value.trim()) updateStudyStats(question.topic, answerIsCorrect(value, question));
  });

  state.simGraded = true;
  state.simScore = score;
  state.simAnswered = answered;
  $$("#simArea input").forEach(input => { input.disabled = true; });
  $("#gradeSim").disabled = true;

  save();

  $("#simResult").textContent = state.language === "en" ? `Result: ${score}/8 · ${answered} answered` : `Resultado: ${score}/8 · ${answered} respondidas`;
  $("#simResult").classList.remove("hidden");
}

function showView(view) {
  $$(".tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.view === view);
    tab.setAttribute("aria-selected", String(tab.dataset.view === view));
    tab.tabIndex = tab.dataset.view === view ? 0 : -1;
  });

  $$(".view").forEach(section => {
    const active = section.id === `${view}View`;
    section.classList.toggle("hidden", !active);
    section.hidden = !active;
  });

  if (view === "sim" && !state.sim.length) makeSim();
  if (view === "rules") loadCurriculum();
}

function initAccessibleTabs() {
  const tabs = $$(".tab");
  tabs.forEach((tab, index) => {
    tab.onclick = () => showView(tab.dataset.view);
    tab.onkeydown = event => {
      const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
      const targetIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + direction + tabs.length) % tabs.length;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        showView(tab.dataset.view);
        return;
      }
      if (event.key === "Home" || event.key === "End" || direction) {
        event.preventDefault();
        const target = tabs[targetIndex];
        target.focus();
        showView(target.dataset.view);
      }
    };
  });
  showView(tabs.find(tab => tab.getAttribute("aria-selected") === "true")?.dataset.view || "practice");
}

async function loadCurriculum() {
  try {
    const response = await fetch("/api/curriculum");
    if (!response.ok) throw new Error("curriculum unavailable");
    const data = await response.json();
    const heading = state.language === "en" ? "Sections" : "Secciones";
    const topics = state.language === "en" ? "Allowed topics" : "Temas autorizados";
    const rules = state.language === "en" ? "System rules" : "Reglas del sistema";
    $("#curriculumRules").innerHTML = `
      <p><b>${heading}:</b> ${(data.sections || []).map(escapeHtml).join(", ")}</p>
      <p><b>${topics}:</b> ${(data.allowedTopics || data.topics || []).map(escapeHtml).join(", ")}</p>
      <h3>${rules}</h3>
        <ul>${(data.systemRules || data.rules || []).map(rule => `<li>${escapeHtml(rule)}</li>`).join("")}</ul>
    `;
  } catch {
    $("#curriculumRules").innerHTML = `<div class="feedback bad">${state.language === "en" ? "The curriculum could not load." : "No se pudo cargar el temario."} <button class="button secondary" id="retryCurriculum">${t("retry")}</button></div>`;
    $("#retryCurriculum").onclick = loadCurriculum;
  }
}

async function loadLearningPlan() {
  try {
    const response = await fetch(`/api/learning-plan?language=${state.language}`);
    const data = await response.json();
    const cards = data.focus
      .map(
        item => `
          <div class="mini-plan">
            <strong>${item.title}</strong>
            <span>${item.tip}</span>
          </div>
        `
      )
      .join("");

    $("#learningPlan").innerHTML = cards;
    $("#learningGeneral").textContent = data.general;
  } catch {
    $("#learningPlan").innerHTML = "";
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  }[character]));
}

async function loadMathApps() {
  const grid = $("#mathAppsGrid");
  if (!grid) return;
  grid.innerHTML = `<p class="muted apps-loading">${appText("loading")}</p>`;
  try {
    const response = await fetch(`/api/math-apps?language=${state.language}`);
    if (!response.ok) throw new Error("catalog unavailable");
    const data = await response.json();
    grid.innerHTML = data.items.map(item => `
      <article class="app-recommendation-card">
        <div class="app-card-head">
          <span class="app-icon" aria-hidden="true">${escapeHtml(item.icon)}</span>
          <div><h4>${escapeHtml(item.name)}</h4><span class="app-category">${escapeHtml(item.category)}</span></div>
        </div>
        <p>${escapeHtml(item.description)}</p>
        <div class="app-benefit"><span aria-hidden="true">✦</span><span>${escapeHtml(item.benefit)}</span></div>
        <div class="app-card-footer">
          <a class="app-card-link" href="${escapeHtml(item.officialUrl)}" target="_blank" rel="noopener noreferrer">${appText("official")}</a>
          <a class="app-source-link" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener noreferrer" title="${appText("source")}">${appText("source")} · ${escapeHtml(item.verifiedAt)}</a>
        </div>
      </article>
    `).join("");
    const updated = $("#appsUpdated");
    if (updated) updated.textContent = `${appText("updated")}: ${escapeHtml(data.updatedAt)}`;
  } catch {
    grid.innerHTML = `<p class="muted apps-loading">${appText("error")}</p>`;
  }
}

async function checkAppUpdate() {
  try {
    const response = await fetch("/api/app-meta");
    if (!response.ok) return;
    const data = await response.json();
    if (data.version) $("#updateNote").textContent = `cure.math AI · v${data.version}`;
  } catch {
    // The experience remains usable when the metadata endpoint is unavailable.
  }
}

async function loadAiStatus() {
  try {
    const response = await fetch("/api/ai/status");
    const data = await response.json();
    const status = $("#aiStatus");
    if (!status) return;
    status.textContent = data.configured
      ? (state.language === "en" ? `${data.provider === "ollama" ? "Local" : "Cloud"} AI connected` : `${data.provider === "ollama" ? "IA local" : "IA en la nube"} conectada`)
      : (state.language === "en" ? "Guided tutor ready" : "Tutor guiado listo");
  } catch {
    // Keep the interface usable if the status endpoint is temporarily unavailable.
  }
}

function addChat(role, text) {
  const item = document.createElement("div");
  item.className = `chat-message ${role}`;
  item.textContent = text;

  $("#chatMessages").appendChild(item);
  $("#chatMessages").scrollTop = $("#chatMessages").scrollHeight;
  return item;
}

function initChat() {
  if (!$("#chatMessages").children.length) {
    addChat(
      "assistant",
      t("welcome")
    );
  }
}

async function sendChat(event) {
  event.preventDefault();

  const input = $("#chatInput");
  const question = input.value.trim();

  if (!question) return;

  addChat("user", question);
  state.chatHistory.push({ role: "user", content: question });
  input.value = "";

  const loading = addChat("assistant", t("thinking"));
  $("#chatSubmit").disabled = true;

  try {
    const response = await fetch("/api/tutor", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        question,
        topic: state.topic,
        subject: state.subject,
        level: state.level,
        language: state.language,
        action: state.chatAction,
        deviceId: state.deviceId,
        conversation: state.chatHistory.slice(-8),
        materialContext: [
          state.selectedCurriculumMaterial
            ? `${state.selectedCurriculumMaterial.title} · ${state.selectedCurriculumMaterial.section}\n${state.selectedCurriculumMaterial.description}`
            : "",
          ...state.materials.map(item => `${item.name}\n${item.text || "(archivo adjunto; usa su nombre como referencia)"}`)
        ].filter(Boolean).join("\n\n").slice(0, 16000)
      })
    });

    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : { error: "El servidor devolvió una respuesta inesperada." };

    if (!response.ok) {
      throw new Error(data.error || "Error de conexión.");
    }

    loading.textContent = data.answer;
    state.chatHistory.push({ role: "assistant", content: data.answer || "" });
    renderMath();

    if (data.mode === "fallback") {
      loading.textContent = `${data.answer}\n\n[Guía local activa: ${data.notice}]`;
      renderMath();
    }
    state.chatAction = "ask";
  } catch (error) {
    loading.textContent = state.language === "en" ? "The tutor is temporarily unavailable. Try again in a moment." : "El tutor no está disponible temporalmente. Intenta de nuevo en un momento.";
    state.chatAction = "ask";
  } finally {
    $("#chatSubmit").disabled = false;
    input.focus();
  }
}

function initCookieBanner() {
  const banner = $("#cookieBanner");
  if (!banner || localStorage.getItem("cureCookieConsent")) return;
  banner.classList.remove("hidden");
  $("#acceptCookies").onclick = () => { localStorage.setItem("cureCookieConsent", "accepted"); banner.classList.add("hidden"); };
}

initAccessibleTabs();

$$(".topic").forEach(button => {
  button.onclick = () => {
    state.topic = button.dataset.topic;
    $("#topicFilter").value = state.topic;

    $$(".topic").forEach(item => item.classList.remove("selected"));
    button.classList.add("selected");
    newQuestion();
  };
});

$("#topicFilter").onchange = event => {
  state.topic = event.target.value;

  $$(".topic").forEach(item => {
    item.classList.toggle("selected", item.dataset.topic === state.topic);
  });

  newQuestion();
};

$("#newQuestion").onclick = newQuestion;
$("#newSim").onclick = makeSim;
$("#gradeSim").onclick = gradeSim;
$("#chatForm").onsubmit = sendChat;

$("#languageToggle").onclick = () => {
  state.language = state.language === "es" ? "en" : "es";
  applyLanguage();
  updatePresenceCount(state.onlineUsers);
  if (state.question) renderQuestion();
  loadAiStatus();
};

  $$('[data-prompt]').forEach(button => {
    button.onclick = () => {
      state.chatAction = button.dataset.action || "ask";
      $("#chatInput").value = state.language === "en" ? (button.dataset.promptEn || button.dataset.prompt) : button.dataset.prompt;
      $("#chatForm").requestSubmit();
    };
  });

const calculatorTool = initCalculator({ language: state.language });
const graphTool = initGraph({ language: state.language });

updateStats();
updateCoachPanel();
initChat();
applyLanguage();
setupMaterials();
renderSubjectGrid();
if ($("#levelSelect")) {
  $("#levelSelect").value = state.level;
  $("#levelSelect").onchange = event => { state.level = event.target.value; localStorage.setItem("cureLevel", state.level); };
}
initCookieBanner();
initDeviceSession();
initPresence();
loadLearningPlan();
checkAppUpdate();
loadAiStatus();
newQuestion();
