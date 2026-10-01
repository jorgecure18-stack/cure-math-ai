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
  }
};

const state = {
  topic: "all",
  language: localStorage.getItem("cureLanguage") || "es",
  subject: localStorage.getItem("cureSubject") || "calculus",
  level: localStorage.getItem("cureLevel") || "explore",
  materials: [],
  question: null,
  number: 0,
  sim: [],
  recent: {
    all: [],
    chain: [],
    implicit: [],
    tangent: []
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
      tangent: { attempted: 0, correct: 0, streak: 0 }
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
    .replace(/′|'/g, "");
}

function answerIsCorrect(value, question) {
  return [question.answer, ...(question.aliases || [])].some(
    answer => normalize(value) === normalize(answer)
  );
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
  es: { hero: "Aprende como si tuvieras tus apuntes abiertos.", subtitle: "Un tutor que sigue tu temario, lee tus materiales y te guía paso a paso.", practice: "Práctica", sim: "Simulacro", tutor: "Tutor IA", rules: "Currículo", placeholder: "¿Cómo aplico la regla de la cadena?", status: "Tutor listo", synced: "Contenido sincronizado", streak: "Racha", session: "Tu sesión", attempts: "Intentos", correct: "Aciertos", accuracy: "Precisión", focus: "Tu foco", filter: "Filtro curricular", allTopics: "Todos los temas", plan: "Plan de estudio", review: "Qué revisar", activeGuide: "Guía activa", hint: "Pista", solution: "Ver procedimiento", check: "Comprobar", newQuestion: "Otra pregunta ↻", universe: "Elige tu territorio", level: "Nivel", route: "Ruta de aprendizaje", tryIdea: "Prueba una idea", materials: "Trae tus materiales aquí", materialHelp: "PDF, imágenes o apuntes · hasta 10 MB por archivo", choose: "Seleccionar archivos", syllabus: "Temario activo", thinking: "Pensando…", welcome: "Hola, soy cure.math AI. Puedo ayudarte con matemáticas paso a paso. Elige una materia o sube una foto del ejercicio para comenzar.", cookieTitle: "Tu privacidad importa.", cookieBody: "Usamos almacenamiento local para recordar tu progreso y preferencia de idioma.", cookieAccept: "Entendido", footer: "Diseñado para aprender, no para copiar." },
  en: { hero: "Learn as if your notes were open beside you.", subtitle: "A tutor that follows your syllabus, reads your materials, and guides you step by step.", practice: "Practice", sim: "Mock exam", tutor: "AI tutor", rules: "Curriculum", placeholder: "How do I use the chain rule?", status: "Tutor ready", synced: "Content synced", streak: "Streak", session: "Your session", attempts: "Attempts", correct: "Correct", accuracy: "Accuracy", focus: "Your focus", filter: "Curriculum filter", allTopics: "All topics", plan: "Study plan", review: "Review next", activeGuide: "Active guide", hint: "Hint", solution: "Show steps", check: "Check", newQuestion: "New question ↻", universe: "Choose your territory", level: "Level", route: "Learning path", tryIdea: "Try an idea", materials: "Bring your materials here", materialHelp: "PDFs, images or notes · up to 10 MB per file", choose: "Choose files", syllabus: "Active curriculum", thinking: "Thinking…", welcome: "Hi, I am cure.math AI. I can guide you through math step by step. Choose a subject or upload a photo of your exercise to begin.", cookieTitle: "Your privacy matters.", cookieBody: "We use local storage to remember your progress and language preference.", cookieAccept: "Got it", footer: "Designed for learning, not copying." }
};

function t(key) { return UI_COPY[state.language]?.[key] || UI_COPY.es[key] || key; }

const GUIDE_COPY = {
  all: { es: ["Mezcla inteligente", "Practica varios tipos de derivadas para reconocer cuándo usar cada regla."], en: ["Smart mix", "Practice several derivative types and learn when each rule applies."] },
  chain: { es: ["Regla de la cadena", "Busca la función exterior e interior antes de derivar."], en: ["Chain rule", "Find the outer and inner functions before differentiating."] },
  implicit: { es: ["Diferenciación implícita", "Cuando aparece y, trátala como función de x y multiplica por y'."], en: ["Implicit differentiation", "Treat y as a function of x and multiply its terms by y'."] },
  tangent: { es: ["Rectas tangentes", "La pendiente es la derivada evaluada en el punto dado."], en: ["Tangent lines", "The slope is the derivative evaluated at the given point."] }
};

function guideTitle(topic) { return GUIDE_COPY[topic]?.[state.language]?.[0] || TOPIC_GUIDES[topic]?.title || topic; }
function guideFocus(topic) { return GUIDE_COPY[topic]?.[state.language]?.[1] || TOPIC_GUIDES[topic]?.focus || ""; }

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
  const hero = document.querySelector(".topbar h1");
  const subtitle = document.querySelector(".topbar p");
  if (hero) hero.textContent = copy.hero;
  if (subtitle) subtitle.textContent = copy.subtitle;
  $("#aiStatus").textContent = copy.status;
  $("#updateNote").textContent = copy.synced;
  $("#languageToggle").textContent = state.language === "es" ? "EN" : "ES";
  $("#chatInput").placeholder = copy.placeholder;
  const tabs = $$(".tab");
  [copy.practice, copy.sim, copy.tutor, copy.rules].forEach((label, index) => { if (tabs[index]) tabs[index].textContent = label; });
  const labels = {
    "#streakLabel": "streak", "#sessionLabel": "session", "#attemptsLabel": "attempts", "#correctLabel": "correct",
    "#accuracyLabel": "accuracy", "#focusLabel": "focus", "#filterLabel": "filter", "#planLabel": "plan",
    "#reviewLabel": "review", "#activeGuideLabel": "activeGuide", "#universeLabel": "universe",
    "#levelLabel": "level", "#routeLabel": "route", "#tryIdeaLabel": "tryIdea", "#materialsTitle": "materials",
    "#materialHelp": "materialHelp", "#chooseMaterials": "choose", "#rulesTitle": "syllabus",
    "#cookieTitle": "cookieTitle", "#cookieBody": "cookieBody", "#acceptCookies": "cookieAccept", "#footerTagline": "footer"
  };
  Object.entries(labels).forEach(([selector, key]) => { const element = $(selector); if (element) element.textContent = t(key); });
  const questionTitle = $("#practiceTitle"); if (questionTitle) questionTitle.textContent = state.language === "en" ? "Guided practice" : "Práctica guiada";
  const questionEyebrow = $("#questionEyebrow"); if (questionEyebrow) questionEyebrow.textContent = state.language === "en" ? "QUESTION" : "PREGUNTA";
  const simTitle = $("#simTitle"); if (simTitle) simTitle.textContent = state.language === "en" ? "Quick mock exam" : "Simulacro rápido";
  const assistantTitle = $("#assistantTitle"); if (assistantTitle) assistantTitle.textContent = state.language === "en" ? "Your study desk" : "Tu mesa de estudio";
  const level = $("#levelSelect"); if (level) [...level.options].forEach(option => { option.textContent = state.language === "en" ? ({ explore: "Explore", school: "School", college: "College", olympiad: "Advanced challenge" }[option.value]) : ({ explore: "Explorar", school: "Secundaria", college: "Universidad", olympiad: "Reto avanzado" }[option.value]); });
  const filter = $("#topicFilter"); if (filter) [...filter.options].forEach(option => { option.textContent = option.value === "all" ? t("allTopics") : option.value === "chain" ? (state.language === "en" ? "Derivative rules" : "Reglas de derivación") : option.value === "implicit" ? (state.language === "en" ? "Implicit differentiation" : "Implícita") : (state.language === "en" ? "Tangents" : "Tangentes"); });
  $$("[data-prompt]").forEach(button => { button.textContent = state.language === "en" ? (button.dataset.promptEn || button.dataset.prompt) : button.dataset.prompt; });
  const topicLabels = state.language === "en" ? { all: "Smart mix", chain: "Chain rule & combined rules", implicit: "Implicit differentiation", tangent: "Tangent lines" } : { all: "Mezcla inteligente", chain: "Cadena y reglas combinadas", implicit: "Implícita", tangent: "Tangentes" };
  $$(".topic").forEach(button => { const text = button.firstChild; if (text) text.textContent = `${topicLabels[button.dataset.topic]} `; });
  renderSubjectGrid();
  renderMaterials();
  updateStats();
  updateCoachPanel();
  loadLearningPlan();
  localStorage.setItem("cureLanguage", state.language);
}

async function renderMath() {
  if (window.MathJax?.typesetPromise) await window.MathJax.typesetPromise();
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
  list.innerHTML = state.materials.map((item, index) => `<div class="material-item"><span>📎 ${item.name}</span><span>${Math.ceil(item.size / 1024)} KB <button type="button" data-remove-material="${index}" aria-label="Remove ${item.name}">×</button></span></div>`).join("");
  $$("[data-remove-material]").forEach(button => { button.onclick = () => { state.materials.splice(Number(button.dataset.removeMaterial), 1); renderMaterials(); }; });
}

function setupMaterials() {
  const input = $("#materialInput");
  const dropzone = $("#materialDropzone");
  if (!input || !dropzone) return;
  $("#chooseMaterials").onclick = () => input.click();
  input.onchange = () => [...input.files].filter(file => file.size <= 10 * 1024 * 1024).forEach(addMaterial);
  ["dragenter", "dragover"].forEach(event => dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach(event => dropzone.addEventListener(event, e => { e.preventDefault(); dropzone.classList.remove("dragover"); }));
  dropzone.addEventListener("drop", e => [...e.dataTransfer.files].filter(file => file.size <= 10 * 1024 * 1024).forEach(addMaterial));
}

function getTopicAccuracy(topic) {
  ensureTopicStats(topic);
  const stats = state.study.topicStats[topic];
  const attempts = stats.attempted || 0;
  return attempts ? Math.round((stats.correct / attempts) * 100) : 0;
}

function getWeakestTopic() {
  const topics = ["chain", "implicit", "tangent"];
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
  $("#coachStrategy").textContent = focusGuide.strategy;

  const rows = ["chain", "implicit", "tangent"]
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
  const params = new URLSearchParams({ topic });

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
  try {
    state.question = await getExercise();
    state.number += 1;
    renderQuestion();
  } catch (error) {
    $("#questionArea").innerHTML =
      `<div class="feedback bad">${error.message}</div>`;
  }
}

function renderQuestion() {
  const question = state.question;
  const activeGuide = TOPIC_GUIDES[question.topic] || TOPIC_GUIDES.all;

  $("#number").textContent = state.number;

  $("#questionArea").innerHTML = `
    <div class="coach-tip">
      <div class="eyebrow">${t("activeGuide")}</div>
      <h3>${guideTitle(question.topic)}</h3>
      <p>${guideFocus(question.topic)}</p>
      <small>${activeGuide.strategy}</small>
    </div>

    <div class="question-meta">
      <span class="pill">${question.tag}</span>
      <span class="pill">${question.topic}</span>
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
    feedback.innerHTML = state.language === "en" ? `Not quite. Expected answer: <b>${state.question.answer}</b>` : `Incorrecto. Respuesta esperada: <b>${state.question.answer}</b>`;
    $("#solution").classList.remove("hidden");
  }

  save();
}

async function makeSim() {
  state.sim = await Promise.all(
    Array.from({ length: 8 }, () => getExercise("all"))
  );

  $("#simArea").innerHTML = state.sim
    .map(
      (question, index) => `
        <article class="sim-card">
          <h3>${index + 1}. ${question.tag}</h3>
          <p>${question.question}</p>
          <input data-index="${index}" placeholder="Tu respuesta…" />
        </article>
      `
    )
    .join("");

  $("#simResult").classList.add("hidden");
}

function gradeSim() {
  let score = 0;

  $$("#simArea input").forEach(input => {
    const question = state.sim[Number(input.dataset.index)];
    const correct = answerIsCorrect(input.value, question);

    input.style.borderColor = correct ? "var(--good)" : "var(--bad)";
    if (correct) score += 1;
  });

  state.profile.attempted += 8;
  state.profile.correct += score;

  const answerEntries = $$("#simArea input");
  state.sim.forEach((question, index) => {
    const value = answerEntries[index]?.value || "";
    updateStudyStats(question.topic, answerIsCorrect(value, question));
  });

  save();

  $("#simResult").textContent = state.language === "en" ? `Result: ${score}/8` : `Resultado: ${score}/8`;
  $("#simResult").classList.remove("hidden");
}

function showView(view) {
  $$(".tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.view === view);
  });

  $$(".view").forEach(section => {
    section.classList.toggle("hidden", section.id !== `${view}View`);
  });

  if (view === "sim") makeSim();
  if (view === "rules") loadCurriculum();
}

async function loadCurriculum() {
  const response = await fetch("/api/curriculum");
  const data = await response.json();

  $("#curriculumRules").innerHTML = `
    <p><b>Secciones:</b> ${data.sections.join(", ")}</p>
    <p><b>Temas autorizados:</b> ${(data.allowedTopics || data.topics || []).join(", ")}</p>
    <h3>Reglas del sistema</h3>
      <ul>
      ${(data.systemRules || data.rules || []).map(rule => `<li>${rule}</li>`).join("")}
    </ul>
  `;
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
    status.textContent = data.provider === "openai-compatible"
      ? (state.language === "en" ? "Cloud AI connected" : "IA en la nube conectada")
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
  input.value = "";

  const loading = addChat("assistant", t("thinking"));
  $("#chatSubmit").disabled = true;

  try {
    const response = await fetch("/api/chat", {
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
        materialContext: state.materials.map(item => `${item.name}\n${item.text || "(archivo adjunto; usa su nombre como referencia)"}`).join("\n\n").slice(0, 16000)
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

    if (data.mode === "fallback") {
      loading.textContent = `${data.answer}\n\n[Guía local activa: ${data.notice}]`;
    }
  } catch (error) {
    loading.textContent = error.message;
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

$$(".tab").forEach(tab => {
  tab.onclick = () => showView(tab.dataset.view);
});

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
  if (state.question) renderQuestion();
  loadAiStatus();
};

$$('[data-prompt]').forEach(button => {
  button.onclick = () => { $("#chatInput").value = button.dataset.prompt; $("#chatForm").requestSubmit(); };
});

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
loadLearningPlan();
checkAppUpdate();
loadAiStatus();
newQuestion();
