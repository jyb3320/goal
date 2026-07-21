import { LIFE_DOMAIN_KEYS, seoulToday, shiftDate, str } from "./_logic.js";

export const AI_TASKS = [
  "weekly",
  "goal_architect",
  "alignment",
  "avoidance",
  "decision",
  "meeting",
  "monthly",
];

export const AI_SCOPE_KEYS = [
  "bigGoal",
  "profile",
  "domains",
  "season",
  "items",
  "goals",
  "activity",
  "reviews",
  "decisions",
];

const DOMAIN_LABELS = {
  health: "건강",
  work: "일과 커리어",
  money: "돈",
  relationships: "가족과 관계",
  love: "사랑과 우정",
  growth: "학습과 성장",
  mind: "정신 상태",
  experience: "여가와 경험",
  contribution: "사회적 기여",
};

const WEEKLY_SECTION_TITLES = [
  "이번 주 실제 변화",
  "말과 행동이 일치한 부분",
  "반복적으로 피한 문제",
  "큰 목표와 현재 행동의 불일치",
];

function isoDate(value) {
  return typeof value === "string" ? value.slice(0, 10) : "";
}

function clip(value, max = 520) {
  const clean = str(value, max);
  return clean.length === max ? `${clean.slice(0, max - 1)}…` : clean;
}

function evidence(id, kind, label, date, excerpt, owner) {
  return {
    id: String(id),
    kind,
    label: clip(label, 100),
    date: isoDate(date),
    excerpt: clip(excerpt, 620),
    owner,
  };
}

function selectedScopes(raw) {
  if (!Array.isArray(raw)) return new Set(AI_SCOPE_KEYS);
  const valid = raw.filter((key) => AI_SCOPE_KEYS.includes(key));
  return new Set(valid);
}

function goalTitleMap(state) {
  return new Map(state.goals.map((goal) => [goal.id, goal.title]));
}

function activityEvidence(state, owner, today, fromDate) {
  const rows = [];
  const goals = state.goals.filter((goal) => goal.owner === owner);
  for (const goal of goals) {
    const start = goal.createdAt && goal.createdAt > fromDate ? isoDate(goal.createdAt) : fromDate;
    const eligibleDates = [];
    for (let date = start; date <= today; date = shiftDate(date, 1)) eligibleDates.push(date);

    if (goal.type === "daily") {
      const completed = state.checkins
        .filter((item) => item.goalId === goal.id && item.date >= start && item.date <= today)
        .map((item) => item.date)
        .sort();
      const completedSet = new Set(completed);
      const missed = eligibleDates.filter((date) => !completedSet.has(date));
      rows.push(evidence(
        `activity:${goal.id}:${start}:${today}`,
        "activity",
        `${goal.title} 최근 실행 기록`,
        today,
        `${start}~${today}: ${completed.length}/${eligibleDates.length}회 수행. 수행일 ${completed.join(", ") || "없음"}. 미수행일 ${missed.slice(-12).join(", ") || "없음"}.`,
        owner
      ));
    } else {
      const progress = state.progress.filter(
        (item) => item.goalId === goal.id && item.date >= start && item.date <= today
      );
      const total = progress.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      rows.push(evidence(
        `activity:${goal.id}:${start}:${today}`,
        "activity",
        `${goal.title} 최근 진행`,
        today,
        `${start}~${today}: ${total}${goal.unit || "개"} 진행, 목표 ${goal.target || 1}${goal.unit || "개"}, 상태 ${goal.status || "진행 중"}.`,
        owner
      ));
    }
  }

  const titles = goalTitleMap(state);
  for (const item of state.excuses.filter((row) => row.owner === owner && row.date >= fromDate)) {
    rows.push(evidence(
      `excuse:${item.id || `${item.goalId}:${item.date}`}`,
      "excuse",
      `${titles.get(item.goalId) || "목표"} 미완료 이유`,
      item.date,
      item.text,
      owner
    ));
  }
  return rows;
}

export function buildEvidenceBundle(state, owner, options = {}) {
  const task = AI_TASKS.includes(options.task) ? options.task : "weekly";
  const scopes = selectedScopes(options.scopes);
  const today = seoulToday();
  const rangeDays = task === "monthly" ? 62 : task === "avoidance" ? 56 : 21;
  const fromDate = shiftDate(today, -rangeDays);
  const rows = [];

  if (scopes.has("bigGoal")) {
    const record = state.bigGoals.find((item) => item.owner === owner);
    if (record?.text) {
      rows.push(evidence("big-goal", "bigGoal", "가장 큰 목표", record.updatedAt, record.text, owner));
    }
  }

  if (scopes.has("profile")) {
    const record = state.lifeProfiles.find((item) => item.owner === owner);
    if (record) {
      const fields = [
        ["identity", "되고 싶은 사람"],
        ["values", "가치"],
        ["principles", "삶의 원칙"],
        ["nonNegotiables", "어려워도 지킬 것"],
        ["stopDoing", "하지 않기로 한 것"],
      ];
      for (const [key, label] of fields) {
        if (record[key]) rows.push(evidence(`profile:${key}`, "profile", label, record.updatedAt, record[key], owner));
      }
    }
  }

  if (scopes.has("domains")) {
    for (const record of state.lifeDomains.filter((item) => item.owner === owner)) {
      rows.push(evidence(
        `domain:${record.key}`,
        "domain",
        `${DOMAIN_LABELS[record.key] || record.key} 영역`,
        record.updatedAt,
        `만족도 ${record.score}/5. 지금: ${record.current || "기록 없음"} / 원하는 모습: ${record.desired || "기록 없음"} / 다음 한 걸음: ${record.nextStep || "기록 없음"}`,
        owner
      ));
    }
  }

  if (scopes.has("season")) {
    const record = state.seasons.find((item) => item.owner === owner && item.status === "active");
    if (record) {
      rows.push(evidence(
        `season:${record.id}`,
        "season",
        `현재 12주 시즌 · ${record.title}`,
        record.updatedAt,
        `${record.startDate}~${record.endDate}. 집중 영역: ${record.focusAreas || "미정"}. 완료 기준: ${record.outcomes}. 하지 않을 것: ${record.notDoing || "기록 없음"}`,
        owner
      ));
    }
  }

  if (scopes.has("items")) {
    for (const item of state.lifeItems.filter((row) => row.owner === owner)) {
      rows.push(evidence(
        `life-item:${item.id}`,
        "lifeItem",
        `${item.kind === "routine" ? "루틴" : item.kind === "problem" ? "해결할 문제" : "프로젝트"} · ${item.title}`,
        item.updatedAt || item.createdAt,
        `영역 ${DOMAIN_LABELS[item.domainKey] || "미분류"}, 상태 ${item.status || "active"}, 완료 기준 ${item.doneDefinition || "없음"}`,
        owner
      ));
    }
  }

  if (scopes.has("goals")) {
    for (const goal of state.goals.filter((item) => item.owner === owner)) {
      rows.push(evidence(
        `goal:${goal.id}`,
        "goal",
        `${goal.type === "milestone" ? "기간 목표" : "도장 목표"} · ${goal.title}`,
        goal.createdAt,
        `영역 ${DOMAIN_LABELS[goal.domainKey] || "미분류"}, 상태 ${goal.status || "active"}${goal.deadline ? `, 마감 ${goal.deadline}` : ""}${goal.failureReason ? `, 미완료 이유 ${goal.failureReason}` : ""}`,
        owner
      ));
    }
  }

  if (scopes.has("activity")) rows.push(...activityEvidence(state, owner, today, fromDate));

  if (scopes.has("reviews")) {
    for (const review of state.weeklyReviews.filter(
      (item) => item.owner === owner && item.weekStart >= fromDate
    )) {
      const parts = [
        ["사실", review.facts],
        ["잘한 선택", review.wins],
        ["피한 문제", review.avoidance],
        ["시간과 돈", review.timeMoney],
        ["걱정", review.worry],
        ["다음 약속", review.promises],
        ["우선순위", review.priority],
      ].filter(([, value]) => value);
      rows.push(evidence(
        `weekly:${review.id || review.weekStart}`,
        "weeklyReview",
        `${review.weekStart} 주간 복기`,
        review.weekStart,
        parts.map(([label, value]) => `${label}: ${value}`).join(" / "),
        owner
      ));
    }
    for (const review of state.monthlyReviews.filter((item) => item.owner === owner)) {
      rows.push(evidence(
        `monthly:${review.id || review.month}`,
        "monthlyReview",
        `${review.month} 월간 복기`,
        `${review.month}-01`,
        `나아진 것: ${review.improvement || "없음"} / 미룬 것: ${review.postponed || "없음"} / 패턴: ${review.pattern || "없음"} / 중단할 것: ${review.stop || "없음"} / 다음 집중: ${review.nextFocus || "없음"}`,
        owner
      ));
    }
  }

  if (scopes.has("decisions")) {
    const chosenId = str(options.decisionId, 60);
    const decisions = state.decisions.filter(
      (item) => item.owner === owner && (!chosenId || item.id === chosenId || item.result)
    );
    for (const item of decisions.slice(-12)) {
      rows.push(evidence(
        `decision:${item.id}`,
        "decision",
        `결정 · ${item.title}`,
        item.createdAt,
        `상황: ${item.context || "없음"} / 선택지: ${item.options || "없음"} / 예상: ${item.expectation || "없음"} / 두려움: ${item.fear || "없음"} / 이유: ${item.reason || "없음"} / 실제 결과: ${item.result || "아직 없음"}`,
        owner
      ));
    }
  }

  if (task === "meeting" && options.friendName) {
    for (const review of state.weeklyReviews.filter(
      (item) => item.owner === options.friendName && item.weekStart >= shiftDate(today, -14)
    )) {
      rows.push(evidence(
        `shared-weekly:${review.id || review.weekStart}`,
        "sharedWeeklyReview",
        `${options.friendName}의 공유된 ${review.weekStart} 주간 복기`,
        review.weekStart,
        `사실: ${review.facts || "없음"} / 잘한 선택: ${review.wins || "없음"} / 피한 문제: ${review.avoidance || "없음"} / 대화할 것: ${review.honestTalk || "없음"} / 다음 약속: ${review.promises || "없음"}`,
        options.friendName
      ));
    }
  }

  return {
    task,
    owner,
    generatedForDate: today,
    range: { from: fromDate, to: today },
    evidence: rows.slice(-90),
  };
}

function taskInstruction(task) {
  switch (task) {
    case "weekly":
      return `정확히 다음 네 섹션을 순서대로 작성하라: ${WEEKLY_SECTION_TITLES.join(", ")}. 이어서 다음 주에 검증할 가설 하나와 친구와 이야기할 질문 하나를 제안하라.`;
    case "alignment":
      return "큰 목표·가치·12주 시즌·프로젝트·루틴의 연결을 검사하라. 결론을 단정하지 말고 불일치 가능성을 질문으로 전환하라.";
    case "avoidance":
      return "최근 반복되는 회피 가능성을 찾되 성격이나 정신 상태를 진단하지 말라. 가능한 해석을 둘 이상 열어두고 이번 주에 검증할 작은 실험을 제안하라.";
    case "decision":
      return "중요한 결정의 가정, 사실과 감정, 아무것도 하지 않을 비용, 회복 가능성, 사후 검토 기준을 반대편 참모처럼 질문하라.";
    case "meeting":
      return "둘의 공유된 주간 복기를 바탕으로 사실 확인, 서로 잘한 선택, 피한 문제, 의견이 다를 수 있는 부분, 다음 약속, 필요한 지원 순서의 회의 안건을 만들어라. 답보다 대화를 깊게 하는 질문을 우선하라.";
    case "monthly":
      return "이번 달 삶의 중심, 실제로 나아진 영역, 외면한 영역, 행동으로 드러난 우선순위, 달라진 판단, 다음 달에 덜어낼 것을 하나의 서사로 정리하라.";
    default:
      return "";
  }
}

function reportSystemPrompt(task) {
  return `너는 두 사람이 더 정직하고 현실적으로 살아가도록 돕는 '인생 운영 참모'다.
사용자가 제공한 EVIDENCE JSON만 근거로 사용한다. 기록에 없는 사실·날짜·원인을 만들지 않는다.
성격, 질환, 정신건강을 진단하지 않는다. 게으르다, 의지가 약하다 같은 낙인을 쓰지 않는다.
관찰과 해석을 구분하고 "가능성이 있습니다", "확인이 필요합니다"처럼 불확실성을 드러낸다.
각 분석 섹션에는 반드시 실제 evidence id를 evidenceIds 배열로 넣는다. 근거가 부족하면 억지로 채우지 말고 text에 판단 보류를 명시한다.
AI는 목표나 기록을 수정하지 않고 질문과 실험만 제안한다.
한국어로 간결하고 구체적으로 작성한다.
${taskInstruction(task)}
오직 다음 JSON 형식으로 답하라:
{
  "title": "보고서 제목",
  "stance": "전체를 관통하는 1~2문장",
  "sections": [{"title":"섹션 제목","text":"관찰과 해석","evidenceIds":["실제 id"]}],
  "experiment": {"hypothesis":"검증할 가설","test":"7일 안에 할 작은 실험","evidenceIds":["실제 id"]},
  "questions": ["친구 또는 자신에게 물을 질문"],
  "limits": "근거의 한계"
}`;
}

function architectSystemPrompt() {
  return `너는 완벽주의로 시작이 늦어지는 사람을 돕는 목표 구조 설계자다.
큰 목표를 과도한 계획이 아니라 12주 안에 검증 가능한 구조로 번역한다.
12주 결과는 최대 2개, 프로젝트는 최대 3개, 루틴은 최대 3개다.
프로젝트에는 관찰 가능한 완료 기준을, 루틴에는 빈도와 10분짜리 최소 버전을 넣는다.
사용자가 검토할 초안일 뿐 자동 등록되지 않는다.
인생 영역 key는 health, work, money, relationships, love, growth, mind, experience, contribution 중에서만 고른다.
한국어로 작성하고 오직 다음 JSON 형식으로 답하라:
{
  "northStar":"큰 목표를 현실 언어로 정리한 한 문장",
  "domainKeys":["money","work"],
  "season":{"title":"시즌 이름","focusAreas":"영역명 최대 두 개","outcomes":["완료 기준"],"why":"이유","notDoing":"이번 시즌에 하지 않을 것"},
  "projects":[{"title":"프로젝트","domainKey":"work","doneDefinition":"완료 기준"}],
  "routines":[{"title":"루틴","domainKey":"work","doneDefinition":"빈도와 최소 버전"}],
  "firstStep":"오늘 10분 안에 할 첫 행동",
  "caution":"계획 과잉을 막기 위한 주의점"
}`;
}

export function buildAiMessages(task, bundle, objective = "") {
  if (task === "goal_architect") {
    return [
      { role: "system", content: architectSystemPrompt() },
      {
        role: "user",
        content: `큰 목표: ${clip(objective, 500)}\n현재 사용자 기록:\n${JSON.stringify(bundle)}`,
      },
    ];
  }
  return [
    { role: "system", content: reportSystemPrompt(task) },
    { role: "user", content: `EVIDENCE:\n${JSON.stringify(bundle)}` },
  ];
}

function parseJsonContent(content) {
  if (content && typeof content === "object") return content;
  const text = String(content || "").trim();
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf("{");
    const end = unfenced.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(unfenced.slice(start, end + 1));
    throw new Error("AI가 읽을 수 없는 형식으로 응답했습니다.");
  }
}

function validEvidenceMap(bundle) {
  return new Map(bundle.evidence.map((item) => [item.id, item]));
}

function attachEvidence(ids, map) {
  const unique = [...new Set(Array.isArray(ids) ? ids.map(String) : [])];
  return unique.map((id) => map.get(id)).filter(Boolean).slice(0, 6);
}

export function validateReport(raw, bundle) {
  const data = parseJsonContent(raw);
  const map = validEvidenceMap(bundle);
  const sections = (Array.isArray(data.sections) ? data.sections : []).slice(0, 7).map((section) => {
    const sources = attachEvidence(section.evidenceIds, map);
    return {
      title: clip(section.title, 80) || "관찰",
      text: sources.length
        ? clip(section.text, 900)
        : "이 항목은 현재 기록만으로 근거를 확인하기 어려워 판단을 보류합니다.",
      evidence: sources,
    };
  });
  if (sections.length === 0) throw new Error("AI 보고서에 분석 항목이 없습니다.");
  const experimentSources = attachEvidence(data.experiment?.evidenceIds, map);
  return {
    title: clip(data.title, 100) || "AI 참모 보고서",
    stance: clip(data.stance, 600),
    sections,
    experiment: {
      hypothesis: experimentSources.length ? clip(data.experiment?.hypothesis, 500) : "검증할 근거가 아직 충분하지 않습니다.",
      test: experimentSources.length ? clip(data.experiment?.test, 500) : "이번 주 기록을 조금 더 남긴 뒤 다시 확인해보세요.",
      evidence: experimentSources,
    },
    questions: (Array.isArray(data.questions) ? data.questions : []).map((item) => clip(item, 300)).filter(Boolean).slice(0, 5),
    limits: clip(data.limits, 500) || "AI의 해석은 기록에 기반한 가설이며 사실이나 진단이 아닙니다.",
    generatedAt: new Date().toISOString(),
    model: "",
  };
}

export function validateGoalDraft(raw) {
  const data = parseJsonContent(raw);
  const cleanItem = (item, kind) => {
    const domainKey = LIFE_DOMAIN_KEYS.includes(item?.domainKey) ? item.domainKey : "work";
    const title = clip(item?.title, 120);
    if (!title) return null;
    return {
      id: `draft_${kind}_${Math.random().toString(36).slice(2, 8)}`,
      kind,
      title,
      domainKey,
      doneDefinition: clip(item?.doneDefinition, 400),
      selected: true,
    };
  };
  const outcomes = (Array.isArray(data.season?.outcomes) ? data.season.outcomes : [])
    .map((item) => clip(item, 300))
    .filter(Boolean)
    .slice(0, 2);
  if (!clip(data.season?.title, 100) || outcomes.length === 0) {
    throw new Error("AI 목표 초안에 12주 시즌의 이름이나 완료 기준이 없습니다.");
  }
  return {
    northStar: clip(data.northStar, 300),
    domainKeys: (Array.isArray(data.domainKeys) ? data.domainKeys : [])
      .filter((key) => LIFE_DOMAIN_KEYS.includes(key))
      .slice(0, 2),
    season: {
      title: clip(data.season?.title, 100),
      focusAreas: clip(data.season?.focusAreas, 200),
      outcomes,
      why: clip(data.season?.why, 500),
      notDoing: clip(data.season?.notDoing, 500),
      selected: true,
    },
    projects: (Array.isArray(data.projects) ? data.projects : [])
      .map((item) => cleanItem(item, "project"))
      .filter(Boolean)
      .slice(0, 3),
    routines: (Array.isArray(data.routines) ? data.routines : [])
      .map((item) => cleanItem(item, "routine"))
      .filter(Boolean)
      .slice(0, 3),
    firstStep: clip(data.firstStep, 400),
    caution: clip(data.caution, 400),
    generatedAt: new Date().toISOString(),
    model: "",
  };
}

function providerConfig(env = process.env) {
  const provider = (env.AI_PROVIDER || "nvidia").toLowerCase();
  if (provider === "ollama") {
    return {
      provider,
      baseUrl: (env.AI_BASE_URL || "https://ollama.com/api").replace(/\/$/, ""),
      model: env.AI_MODEL || "kimi-k2.6",
      apiKey: env.AI_API_KEY || "",
    };
  }
  return {
    provider: "nvidia",
    baseUrl: (env.AI_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(/\/$/, ""),
    model: env.AI_MODEL || "moonshotai/kimi-k2.6",
    apiKey: env.AI_API_KEY || "",
  };
}

export async function requestAI(messages, env = process.env, fetchImpl = fetch) {
  const config = providerConfig(env);
  if (!config.apiKey) {
    const error = new Error("AI_API_KEY가 설정되지 않았습니다.");
    error.code = "missing_config";
    throw error;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);
  try {
    const isOllama = config.provider === "ollama";
    const url = `${config.baseUrl}${isOllama ? "/chat" : "/chat/completions"}`;
    const body = isOllama
      ? { model: config.model, messages, stream: false, format: "json", options: { temperature: 0.2 } }
      : {
          model: config.model,
          messages,
          temperature: 1,
          max_tokens: 2200,
          stream: false,
          ...(config.model.startsWith("qwen/qwen3.5-")
            ? { chat_template_kwargs: { enable_thinking: false } }
            : {}),
        };
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const providerBody = await response.text().catch(() => "");
      const error = new Error(response.status === 429 ? "오늘 AI 사용량이 많아 잠시 쉬어야 합니다." : "AI 제공업체가 요청을 처리하지 못했습니다.");
      error.code = response.status === 429 ? "rate_limited" : "provider_error";
      error.status = response.status;
      error.providerBody = providerBody.slice(0, 500);
      throw error;
    }
    const payload = await response.json();
    const content = isOllama ? payload.message?.content : payload.choices?.[0]?.message?.content;
    return { content, model: payload.model || config.model, provider: config.provider };
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("AI가 생각하는 시간이 너무 길어 요청을 멈췄습니다.");
      timeoutError.code = "timeout";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function mockAiResult(task, bundle, objective = "") {
  if (task === "goal_architect") {
    return validateGoalDraft({
      northStar: objective,
      domainKeys: ["work", "money"],
      season: {
        title: "선택권을 만드는 12주",
        focusAreas: "일과 커리어 · 돈",
        outcomes: ["월 지출 구조를 한 장으로 정리한다", "새 수입 가능성 하나를 실제 사람에게 검증한다"],
        why: "막연한 목표를 확인 가능한 결과로 바꾸기 위해",
        notDoing: "검증 전까지 새 프로젝트를 늘리지 않는다",
      },
      projects: [{ title: "월 지출 구조 파악", domainKey: "money", doneDefinition: "최근 3개월 고정·변동 지출을 한 장에 정리" }],
      routines: [{ title: "주 3회 포트폴리오 작업", domainKey: "work", doneDefinition: "40분, 힘든 날 최소 10분" }],
      firstStep: "최근 한 달 카드 내역 파일을 열고 고정 지출 세 개만 표시하기",
      caution: "시즌 결과 두 개가 자리 잡기 전에는 계획을 추가하지 않기",
    });
  }
  const first = bundle.evidence[0];
  const activity = bundle.evidence.find((item) => item.kind === "activity") || first;
  return validateReport({
    title: task === "weekly" ? "이번 주 참모 보고서" : "AI 참모의 기록 점검",
    stance: "현재 기록에서 확인되는 사실을 바탕으로 다음 행동을 작게 검증합니다.",
    sections: WEEKLY_SECTION_TITLES.map((title, index) => ({
      title,
      text: index === 0 ? "기록을 남기고 실제 행동을 확인하려는 흐름이 보입니다." : "아직 한 방향으로 단정하기보다 다음 기록에서 확인할 필요가 있습니다.",
      evidenceIds: [activity?.id].filter(Boolean),
    })),
    experiment: {
      hypothesis: "중요한 행동의 시작 기준을 낮추면 실행 빈도가 높아질 수 있습니다.",
      test: "다음 7일 동안 가장 중요한 행동을 10분짜리 최소 버전으로 한 번 시작해보세요.",
      evidenceIds: [activity?.id].filter(Boolean),
    },
    questions: ["이번 주에 친구가 해결책보다 먼저 물어봐줬으면 하는 질문은 무엇인가요?"],
    limits: "개발용 예시 보고서입니다. 실제 배포에서는 선택한 기록만 Kimi가 분석합니다.",
  }, bundle);
}
