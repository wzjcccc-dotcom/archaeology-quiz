const state = {
  bank: null,
  mode: null,
  selectedUnit: null,
  questions: [],
  currentIndex: 0,
  results: new Map(),
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
  unitResultTemplate: document.querySelector("#unit-result-template"),
};

function shuffle(items) {
  const cloned = [...items];
  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [cloned[index], cloned[swapIndex]] = [cloned[swapIndex], cloned[index]];
  }
  return cloned;
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

function resetState() {
  state.mode = null;
  state.selectedUnit = null;
  state.questions = [];
  state.currentIndex = 0;
  state.results = new Map();
  elements.unitPicker.classList.add("hidden");
  elements.feedbackBox.className = "feedback-box hidden";
  elements.nextButton.disabled = true;
  setPanelVisibility("setup");
}

function renderMeta() {
  const { questionCount, unitCount } = state.bank.meta;
  elements.dataMeta.textContent = `目前載入 ${questionCount} 題、${unitCount} 個單元。`;
}

function renderUnitOptions() {
  elements.unitSelect.innerHTML = "";
  state.bank.units.forEach((unit) => {
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
  return shuffle(buckets.get(unit)).slice(0, 10);
}

function pickMixedQuiz() {
  const buckets = buildUnitBuckets();
  const units = shuffle(state.bank.units);
  const target = 50;
  const baseQuota = Math.floor(target / units.length);
  let remainder = target % units.length;

  const selected = [];
  const leftoversByUnit = new Map();

  units.forEach((unit) => {
    const pool = shuffle(buckets.get(unit));
    const quota = Math.min(pool.length, baseQuota);
    selected.push(...pool.slice(0, quota));
    leftoversByUnit.set(unit, pool.slice(quota));
  });

  for (const unit of shuffle(units)) {
    if (remainder <= 0) {
      break;
    }
    const leftovers = leftoversByUnit.get(unit) ?? [];
    if (leftovers.length > 0) {
      selected.push(leftovers.shift());
      leftoversByUnit.set(unit, leftovers);
      remainder -= 1;
    }
  }

  if (selected.length < target) {
    const fallbackPool = shuffle(
      [...leftoversByUnit.values()].flat().filter((item) => !selected.some((picked) => picked.id === item.id))
    );
    selected.push(...fallbackPool.slice(0, target - selected.length));
  }

  return shuffle(selected).slice(0, target);
}

function startQuiz(mode) {
  state.mode = mode;
  state.currentIndex = 0;
  state.results = new Map();

  if (mode === "unit") {
    state.selectedUnit = elements.unitSelect.value;
    state.questions = pickUnitQuiz(state.selectedUnit);
  } else {
    state.selectedUnit = null;
    state.questions = pickMixedQuiz();
  }

  setPanelVisibility("quiz");
  renderQuestion();
}

function renderQuestion() {
  const question = state.questions[state.currentIndex];
  const parsed = parseQuestionText(question.questionText);
  const result = state.results.get(question.id);
  const isLastQuestion = state.currentIndex === state.questions.length - 1;

  elements.progressText.textContent = `第 ${state.currentIndex + 1} / ${state.questions.length} 題`;
  elements.quizModeText.textContent =
    state.mode === "unit"
      ? `模式一：${state.selectedUnit}`
      : "模式二：全題庫平均抽題";
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

  if (state.mode === "unit") {
    return { correctCount, wrongCount };
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

  return {
    totalCorrect: correctCount,
    totalWrong: wrongCount,
    byUnit: [...byUnitMap.values()].sort((left, right) => left.unit.localeCompare(right.unit, "zh-Hant")),
  };
}

function renderResults() {
  const summary = buildResults();
  elements.resultBody.innerHTML = "";

  if (state.mode === "unit") {
    elements.resultSummary.textContent = `${state.selectedUnit} 測驗完成`;
    const card = document.createElement("div");
    card.className = "score-card";
    card.innerHTML = `<span>總成績</span><strong>答對 ${summary.correctCount} 題 / 答錯 ${summary.wrongCount} 題</strong>`;
    elements.resultBody.append(card);
  } else {
    elements.resultSummary.textContent = "綜合模式測驗完成";
    const totalCard = document.createElement("div");
    totalCard.className = "score-card";
    totalCard.innerHTML = `<span>全部成績</span><strong>答對 ${summary.totalCorrect} 題 / 答錯 ${summary.totalWrong} 題</strong>`;
    elements.resultBody.append(totalCard);

    summary.byUnit.forEach((entry) => {
      const fragment = elements.unitResultTemplate.content.cloneNode(true);
      fragment.querySelector(".unit-result-name").textContent = entry.unit;
      fragment.querySelector(".unit-result-score").textContent = `答對 ${entry.correct} / 答錯 ${entry.wrong}`;
      elements.resultBody.append(fragment);
    });
  }

  setPanelVisibility("result");
}

async function loadBank() {
  const response = await fetch("./questions.json");
  if (!response.ok) {
    throw new Error("Failed to load questions.json");
  }
  state.bank = await response.json();
  renderMeta();
  renderUnitOptions();
}

function bindEvents() {
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.mode;
      if (mode === "unit") {
        state.mode = "unit";
        elements.unitPicker.classList.remove("hidden");
      } else {
        startQuiz("mixed");
      }
    });
  });

  document.querySelector("#start-unit-quiz").addEventListener("click", () => startQuiz("unit"));
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
  resetState();
  try {
    await loadBank();
  } catch (error) {
    elements.dataMeta.textContent = "題庫載入失敗，請先執行清洗腳本。";
    console.error(error);
  }
}

init();
