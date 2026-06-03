import { LegalRiskRagItem, retrieveRagContext } from "@/lib/rag";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type Classification = {
  categories: string[];
  reason: string;
  tavily_queries: string[];
};

type RiskLevel = "낮음" | "중간" | "높음";

type StructuredRisk = {
  risk_item: string;
  risk_level: RiskLevel;
  reason: string;
  check_required: string;
};

type StructuredReference = {
  title: string;
  url: string;
  reason: string;
};

type StructuredResult = {
  title: string;
  summary: string;
  risks: StructuredRisk[];
  related_regulations: string[];
  questions: string[];
  consultation_level: RiskLevel;
  consultation_reason: string;
  references: StructuredReference[];
  disclaimer: string;
};

type TavilyResult = {
  title: string;
  url: string;
  content: string;
  score?: number;
};

type TavilySearchResponse = {
  query: string;
  answer?: string;
  results?: TavilyResult[];
};

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";

const SYSTEM_PROMPT = `너는 창업 아이디어의 법적 리스크를 1차 검토하는 AI 보조 도구다.

역할:
- 사용자의 창업 아이디어를 분석한다.
- RAG 기준 문서에서 관련 리스크 카테고리를 찾는다.
- Tavily 검색 결과를 참고해 관련 법령·규제·공식자료를 요약한다.
- 최종 결과는 법률 자문이 아니라 정보 제공용 사전 체크리스트로 작성한다.

주의사항:
- 변호사처럼 단정하지 않는다.
- 확실하지 않은 내용은 "확인 필요"라고 표시한다.
- 법적 결론을 확정하지 않는다.
- 사용자가 바로 이해할 수 있도록 한국어로 작성한다.
- 마지막에 반드시 면책 문구를 포함한다.

면책 문구:
"본 결과는 법률 자문이 아닌 정보 제공용이며, 최종 판단은 변호사 등 전문가 검토가 필요합니다."`;

const classificationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    categories: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "개인정보",
          "전자상거래",
          "광고/표시",
          "위치정보",
          "금융",
          "의료",
          "법률/세무",
          "식품",
          "플랫폼 책임",
          "약관/환불",
          "미성년자",
          "지식재산권",
          "모빌리티",
        ],
      },
    },
    reason: { type: "string" },
    tavily_queries: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["categories", "reason", "tavily_queries"],
};

const structuredResultSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    risks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          risk_item: { type: "string" },
          risk_level: { type: "string", enum: ["낮음", "중간", "높음"] },
          reason: { type: "string" },
          check_required: { type: "string" },
        },
        required: ["risk_item", "risk_level", "reason", "check_required"],
      },
    },
    related_regulations: {
      type: "array",
      items: { type: "string" },
    },
    questions: {
      type: "array",
      items: { type: "string" },
    },
    consultation_level: { type: "string", enum: ["낮음", "중간", "높음"] },
    consultation_reason: { type: "string" },
    references: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          url: { type: "string" },
          reason: { type: "string" },
        },
        required: ["title", "url", "reason"],
      },
    },
    disclaimer: { type: "string" },
  },
  required: [
    "title",
    "summary",
    "risks",
    "related_regulations",
    "questions",
    "consultation_level",
    "consultation_reason",
    "references",
    "disclaimer",
  ],
};

function getLatestUserMessage(messages: ChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === "user")?.content;
}

function unique(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function createFallbackClassification(idea: string): Classification {
  const ragContext = retrieveRagContext(idea);
  const categories =
    ragContext.matchedItems.length > 0
      ? ragContext.matchedItems.map((item) => item.name).slice(0, 4)
      : ["개인정보", "광고/표시", "플랫폼 책임"];

  const tavilyQueries =
    ragContext.tavilyQueries.length > 0
      ? ragContext.tavilyQueries.slice(0, 3)
      : [
          `${idea} 개인정보 법적 이슈`,
          `${idea} 표시광고법 리뷰 추천 법적 이슈`,
          `${idea} 플랫폼 책임 법적 이슈`,
        ];

  return {
    categories,
    reason:
      "분류 응답 파싱에 실패해 RAG 트리거와 기본 리스크 카테고리를 기준으로 분류했습니다.",
    tavily_queries: tavilyQueries,
  };
}

function extractOpenAIText(data: unknown) {
  if (
    data &&
    typeof data === "object" &&
    "output_text" in data &&
    typeof data.output_text === "string"
  ) {
    return data.output_text;
  }

  const output = data && typeof data === "object" && "output" in data ? data.output : [];
  if (!Array.isArray(output)) {
    return "";
  }

  return output
    .flatMap((item) => {
      if (!item || typeof item !== "object" || !("content" in item)) {
        return [];
      }
      const content = item.content;
      if (!Array.isArray(content)) {
        return [];
      }
      return content.map((part) => {
        if (
          part &&
          typeof part === "object" &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          return part.text;
        }
        return "";
      });
    })
    .join("\n")
    .trim();
}

async function callOpenAI({
  instructions,
  input,
  jsonSchema,
  schemaName = "legal_risk_response",
  maxOutputTokens = 1800,
}: {
  instructions: string;
  input: string;
  jsonSchema?: object;
  schemaName?: string;
  maxOutputTokens?: number;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY가 설정되어 있지 않습니다.");
  }

  const body: Record<string, unknown> = {
    model: OPENAI_MODEL,
    instructions,
    input,
    max_output_tokens: maxOutputTokens,
  };

  if (jsonSchema) {
    body.text = {
      format: {
        type: "json_schema",
        name: schemaName,
        strict: true,
        schema: jsonSchema,
      },
    };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`OpenAI API 요청 실패: ${response.status} ${message}`);
  }

  return extractOpenAIText(await response.json());
}

async function classifyIdea(idea: string) {
  const prompt = `사용자의 창업 아이디어를 읽고 관련 법적 리스크 카테고리를 분류하라.

사용 가능한 카테고리:
- 개인정보
- 전자상거래
- 광고/표시
- 위치정보
- 금융
- 의료
- 법률/세무
- 식품
- 플랫폼 책임
- 약관/환불
- 미성년자
- 지식재산권
- 모빌리티

반드시 JSON으로만 답하라.
응답은 반드시 유효한 JSON 객체 하나만 반환하라.
마크다운 코드블록, 설명문, 주석을 포함하지 마라.
확실하지 않은 경우에도 빈 배열을 반환하지 말고 가장 가능성 높은 카테고리 2~4개를 선택하라.
맛집, 식당, 음식점, 예약, 리뷰, 평점, 랭킹, 추천, 지도, 근처, 쿠폰 관련 서비스는 기본적으로 개인정보, 광고/표시, 플랫폼 책임을 검토 대상으로 포함하라.

출력 형식:
{
"categories": ["개인정보", "광고/표시"],
"reason": "선택한 카테고리에 대한 간단한 이유",
"tavily_queries": [
"검색어 1",
"검색어 2",
"검색어 3"
]
}

사용자 창업 아이디어:
${idea}`;

  const text = await callOpenAI({
    instructions: SYSTEM_PROMPT,
    input: prompt,
    jsonSchema: classificationSchema,
    schemaName: "legal_risk_classification",
    maxOutputTokens: 700,
  });

  try {
    if (!text.trim()) {
      return createFallbackClassification(idea);
    }
    return JSON.parse(text) as Classification;
  } catch {
    return createFallbackClassification(idea);
  }
}

async function searchTavily(query: string) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return {
      query,
      answer: "TAVILY_API_KEY가 설정되어 있지 않아 검색을 건너뜁니다.",
      results: [],
    } satisfies TavilySearchResponse;
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      include_answer: "basic",
      max_results: 3,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Tavily API 요청 실패: ${response.status} ${message}`);
  }

  return (await response.json()) as TavilySearchResponse;
}

function formatRagContext(items: LegalRiskRagItem[]) {
  return items
    .map((item) => {
      const matchedBy = item.matched_by?.join(", ") || "확인 필요";
      const matchedTriggers = item.matched_triggers?.join(", ") || "없음";
      const risks = item.risk_points.map((risk) => `  - ${risk}`).join("\n");
      const questions = item.check_questions.map((question) => `  - ${question}`).join("\n");
      const references =
        item.references
          ?.map((reference) => `  - ${reference.title}: ${reference.url}`)
          .join("\n") || "  - 없음";

      return `- [${item.name}]
  위험도: ${item.risk_level}
  매칭 방식: ${matchedBy}
  매칭 키워드: ${matchedTriggers}
  주요 리스크:
${risks}
  확인 질문:
${questions}
  참고 출처:
${references}`;
    })
    .join("\n");
}

function formatTavilyResults(searches: TavilySearchResponse[]) {
  return searches
    .map((search) => {
      const results = (search.results || [])
        .map(
          (result) =>
            `  - ${result.title}\n    URL: ${result.url}\n    요약: ${result.content}`,
        )
        .join("\n");
      return `검색어: ${search.query}\n검색 요약: ${search.answer || "없음"}\n결과:\n${results || "  - 검색 결과 없음"}`;
    })
    .join("\n\n");
}

async function analyzeIdea({
  idea,
  classification,
  ragItems,
  tavilySearches,
}: {
  idea: string;
  classification: Classification;
  ragItems: LegalRiskRagItem[];
  tavilySearches: TavilySearchResponse[];
}) {
  const prompt = `너는 창업 아이디어의 법적 리스크를 1차 검토하는 보조 도구다.

아래 정보를 바탕으로 법적 리스크를 분석하라.

사용자 창업 아이디어:
${idea}

Step 1 분류 결과:
${JSON.stringify(classification, null, 2)}

RAG 기준 문서:
${formatRagContext(ragItems)}

Tavily 검색 결과:
${formatTavilyResults(tavilySearches)}

작성 원칙:
- 법률 자문이 아니라 정보 제공용으로 작성한다.
- 관련 가능성이 있는 법령·규제만 제시한다.
- 확실하지 않은 내용은 "확인 필요"라고 표시한다.
- 법적 결론을 단정하지 않는다.
- 사용자가 다음에 무엇을 확인해야 하는지 알려준다.

출력 형식:

## 1. 요약

창업 아이디어에서 발견되는 주요 법적 리스크를 3~4문장으로 요약한다.

## 2. 주요 법적 리스크

| 리스크 항목 | 위험도         | 이유 | 확인 필요 사항 |
| ----------- | -------------- | ---- | -------------- |
|             | 낮음/중간/높음 |      |                |

## 3. 관련 가능 법령/규제

- 법령/규제명:
  - 관련 이유:
  - 참고 출처:

## 4. 추가 확인 질문

- 질문 1
- 질문 2
- 질문 3

## 5. 전문가 상담 필요도

낮음 / 중간 / 높음 중 하나로 판단하고 이유를 설명한다.

## 6. 면책 문구

본 결과는 법률 자문이 아닌 정보 제공용이며, 최종 판단은 변호사 등 전문가 검토가 필요합니다.`;

  return callOpenAI({
    instructions: SYSTEM_PROMPT,
    input: prompt,
    maxOutputTokens: 2400,
  });
}

function createFallbackStructuredResult(analysis: string): StructuredResult {
  return {
    title: "창업 아이디어 법적 리스크 1차 검토 결과",
    summary: analysis.slice(0, 500) || "분석 결과를 구조화하는 중 오류가 발생했습니다.",
    risks: [
      {
        risk_item: "기본 법적 리스크",
        risk_level: "중간",
        reason: "구조화 응답 생성에 실패해 원문 분석 결과의 추가 검토가 필요합니다.",
        check_required: "개인정보, 광고/표시, 플랫폼 책임, 약관/환불 여부를 확인하세요.",
      },
    ],
    related_regulations: ["확인 필요"],
    questions: [
      "개인정보를 수집하나요?",
      "유료 결제나 예약 기능이 있나요?",
      "추천, 리뷰, 랭킹을 제공하나요?",
    ],
    consultation_level: "중간",
    consultation_reason: "구체적 서비스 구조에 따라 리스크가 달라질 수 있습니다.",
    references: [],
    disclaimer:
      "본 결과는 법률 자문이 아닌 정보 제공용이며, 최종 판단은 변호사 등 전문가 검토가 필요합니다.",
  };
}

function structuredResultToMarkdown(result: StructuredResult) {
  const risks = result.risks
    .map(
      (risk) =>
        `- **${risk.risk_item}** (${risk.risk_level})\n  - 이유: ${risk.reason}\n  - 확인 필요 사항: ${risk.check_required}`,
    )
    .join("\n");
  const regulations = result.related_regulations.map((item) => `- ${item}`).join("\n");
  const questions = result.questions.map((question) => `- ${question}`).join("\n");
  const references =
    result.references.length > 0
      ? result.references
          .map((reference) => `- ${reference.title}: ${reference.url || "출처 URL 확인 필요"}`)
          .join("\n")
      : "- 확인 필요";

  return `# ${result.title}

## 요약

${result.summary}

## 리스크 카드

${risks}

## 관련 가능 법령/규제

${regulations}

## 추가 확인이 필요한 질문

${questions}

## 전문가 상담 필요도

${result.consultation_level}

${result.consultation_reason}

## 참고 출처

${references}

## 안내

${result.disclaimer}`;
}

async function formatStructuredResult(analysis: string) {
  const prompt = `아래 분석 결과를 사용자에게 보여주기 좋은 형태로 정리하라.

분석 결과:
${analysis}

출력 조건:
- 한국어로 작성한다.
- 리스크 표는 만들지 말고 risks 배열에 담아 카드 UI로 렌더링할 수 있게 정리한다.
- 위험도는 낮음/중간/높음으로 표시한다.
- 너무 긴 법률 설명은 피하고 핵심만 쓴다.
- 마지막에 면책 문구를 반드시 포함한다.
- 출처가 있는 경우 함께 표시한다.
- 반드시 유효한 JSON 객체 하나만 반환한다.
- 마크다운 코드블록, 설명문, 주석을 포함하지 않는다.

JSON 필드:
- title
- summary
- risks: risk_item, risk_level, reason, check_required
- related_regulations
- questions
- consultation_level
- consultation_reason
- references: title, url, reason
- disclaimer`;

  const text = await callOpenAI({
    instructions: SYSTEM_PROMPT,
    input: prompt,
    jsonSchema: structuredResultSchema,
    schemaName: "legal_risk_structured_result",
    maxOutputTokens: 2600,
  });

  try {
    if (!text.trim()) {
      return createFallbackStructuredResult(analysis);
    }
    return JSON.parse(text) as StructuredResult;
  } catch {
    return createFallbackStructuredResult(analysis);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { messages?: ChatMessage[] };
    const messages = body.messages || [];
    const idea = getLatestUserMessage(messages)?.trim();

    if (!idea) {
      return Response.json(
        { error: "분석할 창업 아이디어를 입력해 주세요." },
        { status: 400 },
      );
    }

    const classification = await classifyIdea(idea);
    const ragContext = retrieveRagContext(idea, classification.categories);
    const queries = unique([
      ...ragContext.tavilyQueries,
      ...classification.tavily_queries,
    ]).slice(0, 5);
    const tavilySearches = await Promise.all(queries.map((query) => searchTavily(query)));
    const analysis = await analyzeIdea({
      idea,
      classification,
      ragItems: ragContext.matchedItems,
      tavilySearches,
    });
    const structuredResult = await formatStructuredResult(analysis);
    const answer = structuredResultToMarkdown(structuredResult);

    return Response.json({
      answer,
      structuredResult,
      classification,
      ragItems: ragContext.matchedItems,
      ragCheckQuestions: ragContext.checkQuestions,
      tavilyQueries: queries,
      tavilySearches,
      model: OPENAI_MODEL,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
