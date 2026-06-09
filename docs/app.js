const HISTORY_STORAGE_KEY = "quiz_history_v1";
const WRONG_STATS_STORAGE_KEY = "wrong_stats_v1";
const MODE_CONFIG = {
  unit10: {
    code: "unit10",
    label: "模式一",
    title: "單元隨機 10 題",
    questionCount: 10,
    usesTimer: false,
    storesHistory: false,
  },
  mixed50: {
    code: "mixed50",
    label: "模式二",
    title: "全庫平均抽 50 題",
    questionCount: 50,
    usesTimer: false,
    storesHistory: true,
  },
  mixed100: {
    code: "mixed100",
    label: "模式三",
    title: "全庫平均抽 100 題",
    questionCount: 100,
    usesTimer: true,
    storesHistory: true,
  },
};

const CHINESE_NUMERALS = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
  十一: 11,
  十二: 12,
};

const state = {
  bank: null,
  mode: null,
  selectedUnit: null,
  questions: [],
  currentIndex: 0,
  results: new Map(),
  quizStartedAt: null,
  deadlineAt: null,
  timerIntervalId: null,
  timeExpiredAt: null,
  history: {
    mixed50: [],
    mixed100: [],
  },
  wrongStats: {},
};

const elements = {
  setupPanel: document.querySelector("#setup-panel"),
  quizPanel: document.querySelector("#quiz-panel"),
  resultPanel: document.querySelector("#result-panel"),
  unitPicker: document.querySelector("#unit-picker"),
  unitSelect: document.querySelector("#unit-select"),
  dataMeta: document.querySelector("#data-meta"),
  progressText: document.querySelector("#progress-text"),
  quizModeText: document.querySelector("#quiz-mode-text"),
  questionSource: document.querySelector("#question-source"),
  questionUnit: document.querySelector("#question-unit"),
  questionStem: document.querySelector("#question-stem"),
  optionsList: document.querySelector("#options-list"),
  feedbackBox: document.querySelector("#feedback-box"),
  nextButton: document.querySelector("#next-button"),
  restartButton: document.querySelector("#restart-button"),
  restartResultButton: document.querySelector("#restart-result-button"),
  resultSummary: document.querySelector("#result-summary"),
  resultBody: document.querySelector("#result-body"),
  timerBox: document.querySelector("#timer-box"),
  timerLabel: document.querySelector("#timer-label"),
  timerValue: document.querySelector("#timer-value"),
  mixed50History: document.querySelector("#mixed50-history"),
  mixed100History: document.querySelector("#mixed100-history"),
  mixed50Average: document.querySelector("#mixed50-average"),
  mixed100Average: document.querySelector("#mixed100-average"),
  wrongStatsList: document.querySelector("#wrong-stats-list"),
  unitResultTemplate: document.querySelector("#unit-result-template"),
  historyEntryTemplate: document.querySelector("#history-entry-template"),
  wrongStatTemplate: document.querySelector("#wrong-stat-template"),
};

function shuffle(items) {
  const cloned = [...items];
  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [cloned[index], cloned[swapIndex]] = [cloned[swapIndex], cloned[index]];
  }
  return cloned;
}

function parseChineseNumber(value) {
  return CHINESE_NUMERALS[value] ?? Number.POSITIVE_INFINITY;
}

function getUnitSortMeta(unit) {
  if (unit.includes("政府採購全生命週期概論")) {
    return { bucket: 0, unitNumber: 0, chapterNumber: 0, label: unit };
  }

  const unitMatch = unit.match(/單元([一二三四五六七八九十]+)/);
  const chapterMatch = unit.match(/第([一二三四五六七八九十]+)章/);

  return {
    bucket: 1,
    unitNumber: unitMatch ? parseChineseNumber(unitMatch[1]) : Number.POSITIVE_INFINITY,
    chapterNumber: chapterMatch ? parseChineseNumber(chapterMatch[1]) : Number.POSITIVE_INFINITY,
    label: unit,
  };
}

function sortUnits(units) {
  return [...units].sort((left, right) => {
    const leftMeta = getUnitSortMeta(left);
    const rightMeta = getUnitSortMeta(right);
    return (
      leftMeta.bucket - rightMeta.bucket ||
      leftMeta.unitNumber - rightMeta.unitNumber ||
      leftMeta.chapterNumber - rightMeta.chapterNumber ||
      leftMeta.label.localeCompare(rightMeta.label, "zh-Hant")
    );
  });
}

function compareUnits(left, right) {
  const [first] = sortUnits([left, right]);
  if (first === left && left !== right) {
    return -1;
  }
  if (left === right) {
    return 0;
  }
  return 1;
}

function formatPercent(decimal) {
  return `${Math.round(decimal * 1000) / 10}%`;
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatDateTime(isoString) {
  return new Date(isoString).toLocaleString("zh-TW", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function safeReadStorage(key, fallbackValue) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallbackValue;
  } catch (error) {
    console.error(`Failed to read storage key: ${key}`, error);
    return fallbackValue;
  }
}

function safeWriteStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Failed to write storage key: ${key}`, error);
  }
}

function loadStoredStats() {
  const history = safeReadStorage(HISTORY_STORAGE_KEY, { mixed50: [], mixed100: [] });
  state.history = {
    mixed50: Array.isArray(history.mixed50) ? history.mixed50 : [],
    mixed100: Array.isArray(history.mixed100) ? history.mixed100 : [],
  };
  state.wrongStats = safeReadStorage(WRONG_STATS_STORAGE_KEY, {});
}

function persistStoredStats() {
  safeWriteStorage(HISTORY_STORAGE_KEY, state.history);
  safeWriteStorage(WRONG_STATS_STORAGE_KEY, state.wrongStats);
}

function parseQuestionText(questionText) {
  const normalized = questionText.replace(/\r/g, "");
  const optionPattern = /\(A\)([\s\S]*?)\(B\)([\s\S]*?)\(C\)([\s\S]*?)\(D\)([\s\S]*)$/;
  const match = normalized.match(optionPattern);

  if (!match) {
    return {
      stem: normalized,
      options: [
        { key: "A", text: "A" },
        { key: "B", text: "B" },
        { key: "C", text: "C" },
        { key: "D", text: "D" },
      ],
    };
  }

  const stem = normalized.slice(0, match.index).trim();
  return {
    stem,
    options: [
      { key: "A", text: match[1].trim() },
      { key: "B", text: match[2].trim() },
      { key: "C", text: match[3].trim() },
      { key: "D", text: match[4].trim() },
    ],
  };
}

function setPanelVisibility(panelName) {
  elements.setupPanel.classList.toggle("hidden", panelName !== "setup");
  elements.quizPanel.classList.toggle("hidden", panelName !== "quiz");
  elements.resultPanel.classList.toggle("hidden", panelName !== "result");
}

function stopTimer() {
  if (state.timerIntervalId) {
    window.clearInterval(state.timerIntervalId);
    state.timerIntervalId = null;
  }
  state.deadlineAt = null;
  state.timeExpiredAt = null;
  elements.timerBox.classList.add("hidden");
  elements.timerBox.classList.remove("overtime");
  elements.timerLabel.textContent = "剩餘時間";
  elements.timerValue.textContent = "90:00";
}

function resetState() {
  stopTimer();
  state.mode = null;
  state.selectedUnit = null;
  state.questions = [];
  state.currentIndex = 0;
  state.results = new Map();
  state.quizStartedAt = null;
  elements.unitPicker.classList.add("hidden");
  elements.feedbackBox.className = "feedback-box hidden";
  elements.nextButton.disabled = true;
  setPanelVisibility("setup");
  renderHistoryPanels();
}

function renderMeta() {
  const { questionCount, unitCount } = state.bank.meta;
  elements.dataMeta.textContent = `目前載入 ${questionCount} 題、${unitCount} 個單元。`;
}

function renderUnitOptions() {
  elements.unitSelect.innerHTML = "";
  sortUnits(state.bank.units).forEach((unit) => {
    const option = document.createElement("option");
    option.value = unit;
    option.textContent = unit;
    elements.unitSelect.append(option);
  });
}

function buildUnitBuckets() {
  const buckets = new Map();
  state.bank.units.forEach((unit) => buckets.set(unit, []));
  state.bank.questions.forEach((question) => {
    if (!buckets.has(question.unit)) {
      buckets.set(question.unit, []);
    }
    buckets.get(question.unit).push(question);
  });
  return buckets;
}

function pickUnitQuiz(unit) {
  const buckets = buildUnitBuckets();
  return shuffle(buckets.get(unit)).slice(0, MODE_CONFIG.unit10.questionCount);
}

function pickBalancedQuiz(targetCount) {
  const buckets = buildUnitBuckets();
  const units = shuffle(sortUnits(state.bank.units));
  const baseQuota = Math.floor(targetCount / units.length);
  let remainder = targetCount % units.length;
  const selected = [];
  const leftoversByUnit = new Map();

  units.forEach((unit) => {
    const pool = shuffle(buckets.get(unit));
    const quota = Math.min(pool.length, baseQuota);
    selected.push(...pool.slice(0, quota));
    leftoversByUnit.set(unit, pool.slice(quota));
  });

  while (remainder > 0) {
    let distributed = false;
    for (const unit of shuffle(units)) {
      if (remainder <= 0) {
        break;
      }
      const leftovers = leftoversByUnit.get(unit) ?? [];
      if (leftovers.length > 0) {
        selected.push(leftovers.shift());
        leftoversByUnit.set(unit, leftovers);
        remainder -= 1;
        distributed = true;
      }
    }
    if (!distributed) {
      break;
    }
  }

  if (selected.length < targetCount) {
    const selectedIds = new Set(selected.map((item) => item.id));
    const fallbackPool = shuffle(
      [...leftoversByUnit.values()].flat().filter((item) => !selectedIds.has(item.id))
    );
    selected.push(...fallbackPool.slice(0, targetCount - selected.length));
  }

  return shuffle(selected).slice(0, targetCount);
}

function getModeText(mode) {
  if (mode === "unit10") {
    return `模式一：${state.selectedUnit}`;
  }
  if (mode === "mixed50") {
    return "模式二：全題庫平均抽 50 題";
  }
  return "模式三：全題庫平均抽 100 題";
}

function updateTimerDisplay() {
  if (!MODE_CONFIG[state.mode]?.usesTimer || !state.deadlineAt) {
    return;
  }

  const diff = state.deadlineAt - Date.now();
  if (diff >= 0) {
    elements.timerBox.classList.remove("overtime");
    elements.timerLabel.textContent = "剩餘時間";
    elements.timerValue.textContent = formatDuration(diff);
    return;
  }

  if (!state.timeExpiredAt) {
    state.timeExpiredAt = state.deadlineAt;
  }
  elements.timerBox.classList.add("overtime");
  elements.timerLabel.textContent = "超時計時";
  elements.timerValue.textContent = formatDuration(Math.abs(diff));
}

function startModeTimer(mode) {
  stopTimer();
  if (!MODE_CONFIG[mode].usesTimer) {
    return;
  }

  state.deadlineAt = Date.now() + 90 * 60 * 1000;
  elements.timerBox.classList.remove("hidden");
  updateTimerDisplay();
  state.timerIntervalId = window.setInterval(updateTimerDisplay, 1000);
}

function startQuiz(mode) {
  stopTimer();
  state.mode = mode;
  state.currentIndex = 0;
  state.results = new Map();
  state.quizStartedAt = Date.now();

  if (mode === "unit10") {
    state.selectedUnit = elements.unitSelect.value;
    state.questions = pickUnitQuiz(state.selectedUnit);
  } else {
    state.selectedUnit = null;
    state.questions = pickBalancedQuiz(MODE_CONFIG[mode].questionCount);
  }

  startModeTimer(mode);
  setPanelVisibility("quiz");
  renderQuestion();
}

function renderQuestion() {
  const question = state.questions[state.currentIndex];
  const parsed = parseQuestionText(question.questionText);
  const result = state.results.get(question.id);
  const isLastQuestion = state.currentIndex === state.questions.length - 1;

  elements.progressText.textContent = `第 ${state.currentIndex + 1} / ${state.questions.length} 題`;
  elements.quizModeText.textContent = getModeText(state.mode);
  elements.questionSource.textContent = `來源序號 ${question.sourceOrder}`;
  elements.questionUnit.textContent = question.unit;
  elements.questionStem.textContent = parsed.stem;
  elements.optionsList.innerHTML = "";
  elements.feedbackBox.className = "feedback-box hidden";
  elements.feedbackBox.textContent = "";

  parsed.options.forEach((option) => {
    const button = document.createElement("button");
    button.className = "option-button";
    button.type = "button";
    button.dataset.option = option.key;
    button.innerHTML = `<strong>(${option.key})</strong><span>${option.text}</span>`;
    button.disabled = Boolean(result);

    if (result) {
      if (option.key === result.selectedOption) {
        button.classList.add("selected");
      }
      if (option.key === question.answer) {
        button.classList.add("correct");
      } else if (option.key === result.selectedOption && !result.isCorrect) {
        button.classList.add("wrong");
      }
    }

    button.addEventListener("click", () => answerQuestion(option.key));
    elements.optionsList.append(button);
  });

  elements.nextButton.textContent = isLastQuestion ? "查看結果" : "下一題";
  elements.nextButton.disabled = !result;

  if (result) {
    showFeedback(result.isCorrect, question.answer);
  }
}

function answerQuestion(selectedOption) {
  const question = state.questions[state.currentIndex];
  if (state.results.has(question.id)) {
    return;
  }

  const isCorrect = selectedOption === question.answer;
  state.results.set(question.id, {
    selectedOption,
    isCorrect,
    answeredAt: new Date().toISOString(),
  });
  renderQuestion();
}

function showFeedback(isCorrect, correctAnswer) {
  elements.feedbackBox.className = `feedback-box ${isCorrect ? "correct" : "wrong"}`;
  elements.feedbackBox.textContent = isCorrect
    ? `答對了，正確答案是 ${correctAnswer}。`
    : `答錯了，正確答案是 ${correctAnswer}。`;
}

function buildResults() {
  const answeredQuestions = state.questions.map((question) => ({
    question,
    result: state.results.get(question.id),
  }));
  const correctCount = answeredQuestions.filter((item) => item.result?.isCorrect).length;
  const wrongCount = answeredQuestions.length - correctCount;
  const elapsedMs = state.quizStartedAt ? Date.now() - state.quizStartedAt : 0;

  if (state.mode === "unit10") {
    return { correctCount, wrongCount, elapsedMs };
  }

  const byUnitMap = new Map();
  answeredQuestions.forEach(({ question, result }) => {
    const existing = byUnitMap.get(question.unit) ?? { unit: question.unit, correct: 0, wrong: 0 };
    if (result?.isCorrect) {
      existing.correct += 1;
    } else {
      existing.wrong += 1;
    }
    byUnitMap.set(question.unit, existing);
  });

  const overtimeMs = state.mode === "mixed100" && state.deadlineAt ? Math.max(0, Date.now() - state.deadlineAt) : 0;
  return {
    mode: state.mode,
    totalCorrect: correctCount,
    totalWrong: wrongCount,
    accuracy: answeredQuestions.length === 0 ? 0 : correctCount / answeredQuestions.length,
    byUnit: sortUnits([...byUnitMap.keys()]).map((unit) => byUnitMap.get(unit)),
    elapsedMs,
    overtimeMs,
    isOvertime: overtimeMs > 0,
    finishedAt: new Date().toISOString(),
  };
}

function saveQuizRecord(summary) {
  if (!MODE_CONFIG[state.mode].storesHistory) {
    return;
  }

  const record = {
    mode: summary.mode,
    finishedAt: summary.finishedAt,
    correct: summary.totalCorrect,
    wrong: summary.totalWrong,
    accuracy: summary.accuracy,
    elapsedMs: summary.elapsedMs,
    byUnit: summary.byUnit,
  };

  if (summary.mode === "mixed100") {
    record.overtimeMs = summary.overtimeMs;
    record.isOvertime = summary.isOvertime;
  }

  state.history[summary.mode] = [record, ...(state.history[summary.mode] ?? [])].slice(0, 10);
  summary.byUnit.forEach((entry) => {
    state.wrongStats[entry.unit] = (state.wrongStats[entry.unit] ?? 0) + entry.wrong;
  });
  persistStoredStats();
  renderHistoryPanels();
}

function appendScoreCard(label, value) {
  const card = document.createElement("div");
  card.className = "score-card";
  card.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
  elements.resultBody.append(card);
}

function renderResults() {
  const summary = buildResults();
  stopTimer();
  elements.resultBody.innerHTML = "";

  if (state.mode === "unit10") {
    elements.resultSummary.textContent = `${state.selectedUnit} 測驗完成`;
    appendScoreCard("總成績", `答對 ${summary.correctCount} 題 / 答錯 ${summary.wrongCount} 題`);
    appendScoreCard("作答時間", formatDuration(summary.elapsedMs));
    setPanelVisibility("result");
    return;
  }

  saveQuizRecord(summary);
  elements.resultSummary.textContent = `${MODE_CONFIG[state.mode].label}測驗完成`;
  appendScoreCard("全部成績", `答對 ${summary.totalCorrect} 題 / 答錯 ${summary.totalWrong} 題`);
  appendScoreCard("正確率", formatPercent(summary.accuracy));
  appendScoreCard("作答時間", formatDuration(summary.elapsedMs));

  if (state.mode === "mixed100") {
    appendScoreCard(
      "計時狀態",
      summary.isOvertime ? `超時 ${formatDuration(summary.overtimeMs)}` : "90 分鐘內完成"
    );
  }

  summary.byUnit.forEach((entry) => {
    const fragment = elements.unitResultTemplate.content.cloneNode(true);
    fragment.querySelector(".unit-result-name").textContent = entry.unit;
    fragment.querySelector(".unit-result-score").textContent = `答對 ${entry.correct} / 答錯 ${entry.wrong}`;
    elements.resultBody.append(fragment);
  });

  setPanelVisibility("result");
}

function renderHistoryList(modeKey, container, averageNode) {
  const records = state.history[modeKey] ?? [];
  container.innerHTML = "";

  const average =
    records.length === 0
      ? 0
      : records.reduce((sum, record) => sum + (record.accuracy ?? 0), 0) / records.length;
  averageNode.textContent = `平均正確率 ${formatPercent(average)}`;

  if (records.length === 0) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "目前沒有紀錄。";
    container.append(empty);
    return;
  }

  records.forEach((record, index) => {
    const fragment = elements.historyEntryTemplate.content.cloneNode(true);
    const title = `${index + 1}. ${formatDateTime(record.finishedAt)}`;
    const metaParts = [`答對 ${record.correct} / 答錯 ${record.wrong}`, `耗時 ${formatDuration(record.elapsedMs)}`];
    if (modeKey === "mixed100" && record.isOvertime) {
      metaParts.push(`超時 ${formatDuration(record.overtimeMs ?? 0)}`);
    }
    fragment.querySelector(".history-entry-title").textContent = title;
    fragment.querySelector(".history-entry-meta").textContent = metaParts.join(" ・ ");
    fragment.querySelector(".history-entry-score").textContent = formatPercent(record.accuracy ?? 0);
    container.append(fragment);
  });
}

function renderWrongStats() {
  elements.wrongStatsList.innerHTML = "";
  const ranked = Object.entries(state.wrongStats)
    .map(([unit, wrongCount]) => ({ unit, wrongCount }))
    .sort((left, right) => right.wrongCount - left.wrongCount || compareUnits(left.unit, right.unit));

  if (ranked.length === 0) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "目前沒有錯題統計。";
    elements.wrongStatsList.append(empty);
    return;
  }

  ranked.forEach((entry, index) => {
    const fragment = elements.wrongStatTemplate.content.cloneNode(true);
    fragment.querySelector(".history-entry-title").textContent = `${index + 1}. ${entry.unit}`;
    fragment.querySelector(".history-entry-meta").textContent = "累積錯題數";
    fragment.querySelector(".history-entry-score").textContent = `${entry.wrongCount} 題`;
    elements.wrongStatsList.append(fragment);
  });
}

function renderHistoryPanels() {
  renderHistoryList("mixed50", elements.mixed50History, elements.mixed50Average);
  renderHistoryList("mixed100", elements.mixed100History, elements.mixed100Average);
  renderWrongStats();
}

async function loadBank() {
  const response = await fetch("./questions.json");
  if (!response.ok) {
    throw new Error("Failed to load questions.json");
  }
  state.bank = await response.json();
  state.bank.units = sortUnits(state.bank.units);
  renderMeta();
  renderUnitOptions();
}

function bindEvents() {
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.mode;
      if (mode === "unit10") {
        state.mode = mode;
        elements.unitPicker.classList.remove("hidden");
      } else {
        startQuiz(mode);
      }
    });
  });

  document.querySelector("#start-unit-quiz").addEventListener("click", () => startQuiz("unit10"));
  elements.nextButton.addEventListener("click", () => {
    if (state.currentIndex === state.questions.length - 1) {
      renderResults();
      return;
    }
    state.currentIndex += 1;
    renderQuestion();
  });
  elements.restartButton.addEventListener("click", resetState);
  elements.restartResultButton.addEventListener("click", resetState);
}

async function init() {
  bindEvents();
  loadStoredStats();
  renderHistoryPanels();
  resetState();
  try {
    await loadBank();
  } catch (error) {
    elements.dataMeta.textContent = "題庫載入失敗，請先執行清洗腳本。";
    console.error(error);
  }
}

init();
