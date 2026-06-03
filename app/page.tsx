"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

type Role = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  structuredResult?: StructuredResult;
};

type RiskLevel = "낮음" | "중간" | "높음";

type StructuredRisk = {
  risk_item: string;
  risk_level: RiskLevel;
  reason: string;
  check_required: string;
};

type StructuredResult = {
  title: string;
  summary: string;
  risks: StructuredRisk[];
  related_regulations: string[];
  questions: string[];
  consultation_level: RiskLevel;
  consultation_reason: string;
  references: {
    title: string;
    url: string;
    reason: string;
  }[];
  disclaimer: string;
};

type RiskMeta = {
  classification?: {
    categories: string[];
    reason: string;
    tavily_queries: string[];
  };
  ragItems?: {
    id: string;
    name: string;
    triggers: string[];
    risk_level: "낮음" | "중간" | "높음";
    risk_points: string[];
    tavily_queries: string[];
    check_questions: string[];
    matched_by?: ("category" | "trigger")[];
    matched_triggers?: string[];
  }[];
  ragCheckQuestions?: string[];
  tavilyQueries?: string[];
  tavilySearches?: {
    query: string;
    answer?: string;
    results?: {
      title: string;
      url: string;
      content: string;
    }[];
  }[];
  model?: string;
};

const exampleIdeas = [
  "AI가 계약서를 분석해주는 SaaS",
  "동네 병원 예약과 증상 상담 챗봇",
  "프리랜서 세금 신고 자동화 서비스",
  "중고 명품 진품 검수 마켓플레이스",
];

const starterAnswer = `창업 아이디어를 입력하면 RAG 기준 문서, Tavily 검색 결과, OpenAI 분석을 순서대로 참고해 법적 리스크 1차 검토 결과를 작성합니다.

예시 칩을 선택하거나 직접 서비스 아이디어를 입력해 주세요.`;

const riskLevelClass: Record<RiskLevel, string> = {
  낮음: "border-emerald-200 bg-emerald-50 text-emerald-700",
  중간: "border-amber-200 bg-amber-50 text-amber-700",
  높음: "border-red-200 bg-red-50 text-red-700",
};

function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="분석 중">
      <span className="h-2 w-2 animate-bounce rounded-full bg-blue-600 [animation-delay:-0.2s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-blue-600 [animation-delay:-0.1s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-blue-600" />
    </span>
  );
}

function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => (
          <h1 className="mb-3 text-xl font-bold leading-8 text-slate-950">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-2 mt-5 text-base font-bold leading-7 text-slate-900">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-2 mt-4 text-sm font-bold leading-6 text-slate-900">
            {children}
          </h3>
        ),
        p: ({ children }) => <p className="mb-3 leading-7 text-slate-700">{children}</p>,
        ul: ({ children }) => (
          <ul className="mb-3 list-disc space-y-1 pl-5 leading-7 text-slate-700">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-3 list-decimal space-y-1 pl-5 leading-7 text-slate-700">
            {children}
          </ol>
        ),
        li: ({ children }) => <li>{children}</li>,
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-blue-700 underline decoration-blue-200 underline-offset-2 hover:text-blue-800"
          >
            {children}
          </a>
        ),
        table: ({ children }) => (
          <div className="mb-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-[720px] w-full border-collapse text-left text-sm">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-slate-50 text-slate-800">{children}</thead>,
        th: ({ children }) => (
          <th className="border-b border-slate-200 px-3 py-2 font-semibold">{children}</th>
        ),
        td: ({ children }) => (
          <td className="border-b border-slate-100 px-3 py-2 align-top leading-6 text-slate-700">
            {children}
          </td>
        ),
        code: ({ children }) => (
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800">
            {children}
          </code>
        ),
        strong: ({ children }) => <strong className="font-bold text-slate-950">{children}</strong>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function StructuredResultMessage({ result }: { result: StructuredResult }) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold leading-8 text-slate-950">{result.title}</h1>
        <p className="mt-3 leading-7 text-slate-700">{result.summary}</p>
      </div>

      <section>
        <h2 className="mb-3 text-base font-bold text-slate-900">리스크 카드</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {result.risks.map((risk) => (
            <article
              key={`${risk.risk_item}-${risk.risk_level}`}
              className="rounded-lg border border-slate-200 bg-slate-50 p-4"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <h3 className="text-sm font-bold leading-6 text-slate-950">
                  {risk.risk_item}
                </h3>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${riskLevelClass[risk.risk_level]}`}
                >
                  {risk.risk_level}
                </span>
              </div>
              <div className="space-y-3 text-sm leading-6">
                <div>
                  <p className="font-semibold text-slate-800">이유</p>
                  <p className="mt-1 text-slate-600">{risk.reason}</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-800">확인 필요 사항</p>
                  <p className="mt-1 text-slate-600">{risk.check_required}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {result.related_regulations.length > 0 ? (
        <section>
          <h2 className="mb-2 text-base font-bold text-slate-900">관련 가능 법령/규제</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-7 text-slate-700">
            {result.related_regulations.map((regulation) => (
              <li key={regulation}>{regulation}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-base font-bold text-slate-900">추가 확인이 필요한 질문</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-7 text-slate-700">
          {result.questions.map((question) => (
            <li key={question}>{question}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-blue-100 bg-blue-50 p-4">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-base font-bold text-blue-950">전문가 상담 필요도</h2>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-bold ${riskLevelClass[result.consultation_level]}`}
          >
            {result.consultation_level}
          </span>
        </div>
        <p className="text-sm leading-6 text-blue-950">{result.consultation_reason}</p>
      </section>

      {result.references.length > 0 ? (
        <section>
          <h2 className="mb-2 text-base font-bold text-slate-900">참고 출처</h2>
          <div className="space-y-2">
            {result.references.map((reference) => (
              <a
                key={`${reference.title}-${reference.url}`}
                href={reference.url || undefined}
                target="_blank"
                rel="noreferrer"
                className="block rounded-md border border-slate-200 bg-white p-3 text-sm transition hover:border-blue-200"
              >
                <span className="font-semibold text-slate-900">{reference.title}</span>
                <span className="mt-1 block text-slate-600">{reference.reason}</span>
                {reference.url ? (
                  <span className="mt-1 block truncate text-xs text-blue-700">
                    {reference.url}
                  </span>
                ) : null}
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <h2 className="mb-1 text-base font-bold text-amber-950">안내</h2>
        <p className="text-sm leading-6 text-amber-950">{result.disclaimer}</p>
      </section>
    </div>
  );
}

function MetaPanel({ meta, isLoading }: { meta: RiskMeta; isLoading: boolean }) {
  return (
    <aside className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-6 lg:h-fit">
      <div>
        <p className="text-sm font-semibold text-blue-700">분석 파이프라인</p>
        <h2 className="mt-1 text-lg font-bold text-slate-950">RAG + Tavily + OpenAI</h2>
      </div>

      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
            1
          </span>
          <h3 className="font-semibold text-slate-900">RAG 분석</h3>
        </div>
        {isLoading && !meta.classification ? (
          <div className="space-y-2">
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
            <div className="h-16 animate-pulse rounded bg-slate-200" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(meta.classification?.categories || ["대기 중"]).map((category) => (
                <span
                  key={category}
                  className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
                >
                  {category}
                </span>
              ))}
            </div>
            <p className="text-sm leading-6 text-slate-600">
              {meta.classification?.reason || "아직 분석 결과가 없습니다."}
            </p>
            <div className="space-y-2">
              {(meta.ragItems || []).slice(0, 4).map((item) => (
                <div key={item.id} className="rounded-md bg-white p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-slate-800">{item.name}</p>
                    <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
                      {item.risk_level}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    매칭: {item.matched_triggers?.join(", ") || item.matched_by?.join(", ") || "분류"}
                  </p>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-xs leading-5 text-slate-600">
                    {item.risk_points.slice(0, 3).map((risk) => (
                      <li key={risk}>{risk}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {meta.ragCheckQuestions?.length ? (
              <div className="rounded-md border border-blue-100 bg-blue-50 p-3">
                <p className="mb-2 text-sm font-semibold text-blue-900">확인 질문</p>
                <ul className="list-inside list-disc space-y-1 text-xs leading-5 text-blue-950">
                  {meta.ragCheckQuestions.slice(0, 4).map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
            2
          </span>
          <h3 className="font-semibold text-slate-900">Tavily 검색</h3>
        </div>
        {isLoading && !meta.tavilySearches ? (
          <div className="space-y-2">
            <div className="h-4 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200" />
          </div>
        ) : (
          <div className="space-y-3">
            {(meta.tavilyQueries || meta.classification?.tavily_queries || []).map((query) => (
              <div
                key={query}
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              >
                {query}
              </div>
            ))}
            {(meta.tavilySearches || []).flatMap((search) =>
              (search.results || []).slice(0, 2).map((result) => (
                <a
                  key={`${search.query}-${result.url}`}
                  href={result.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-md border border-slate-200 bg-white p-3 text-sm transition hover:border-blue-200 hover:text-blue-700"
                >
                  <span className="font-semibold">{result.title}</span>
                  <span className="mt-1 block truncate text-xs text-slate-500">
                    {result.url}
                  </span>
                </a>
              )),
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
            3
          </span>
          <h3 className="font-semibold text-slate-900">OpenAI 분석</h3>
        </div>
        <p className="text-sm leading-6 text-slate-600">
          {meta.model
            ? `${meta.model} 모델로 prompt.md의 분류, 리스크 분석, 최종 포맷팅 프롬프트를 순차 적용했습니다.`
            : "분석 요청을 보내면 OpenAI 프롬프트가 실행됩니다."}
        </p>
      </section>
    </aside>
  );
}

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "starter", role: "assistant", content: starterAnswer },
  ]);
  const [meta, setMeta] = useState<RiskMeta>({});
  const [isLoading, setIsLoading] = useState(false);
  const [copyStatus, setCopyStatus] = useState("결과 복사");
  const formRef = useRef<HTMLFormElement>(null);

  const lastAssistantMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant"),
    [messages],
  );

  async function submitIdea(idea: string) {
    const trimmed = idea.trim();
    if (!trimmed || isLoading) {
      return;
    }

    const nextMessages: ChatMessage[] = [
      ...messages,
      { id: crypto.randomUUID(), role: "user", content: trimmed },
    ];

    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);
    setMeta({});

    try {
      const response = await fetch("/api/legal-risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "분석 요청에 실패했습니다.");
      }

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.answer,
          structuredResult: data.structuredResult,
        },
      ]);
      setMeta({
        classification: data.classification,
        ragItems: data.ragItems,
        ragCheckQuestions: data.ragCheckQuestions,
        tavilyQueries: data.tavilyQueries,
        tavilySearches: data.tavilySearches,
        model: data.model,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류입니다.";
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `분석 중 오류가 발생했습니다.\n\n${message}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitIdea(input);
  }

  async function copyLatestResult() {
    if (!lastAssistantMessage) {
      return;
    }
    await navigator.clipboard.writeText(lastAssistantMessage.content);
    setCopyStatus("복사됨");
    window.setTimeout(() => setCopyStatus("결과 복사"), 1500);
  }

  function downloadLatestResult() {
    if (!lastAssistantMessage) {
      return;
    }
    const blob = new Blob([lastAssistantMessage.content], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "legal-risk-chat-result.md";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-5 py-6 sm:px-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 font-bold text-white">
                LR
              </div>
              <h1 className="text-2xl font-bold tracking-normal text-slate-950 sm:text-3xl">
                Startup Legal Risk Checker
              </h1>
            </div>
            <p className="mt-2 text-sm font-medium text-slate-600 sm:text-base">
              창업 아이디어의 법적 리스크를 AI 챗봇이 사전 분석합니다
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copyLatestResult}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100"
            >
              {copyStatus}
            </button>
            <button
              type="button"
              onClick={downloadLatestResult}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100"
            >
              Markdown 저장
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-5 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_390px]">
        <section className="flex min-h-[calc(100vh-160px)] flex-col rounded-lg border border-slate-200 bg-slate-50 shadow-sm">
          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[92%] rounded-lg px-4 py-3 text-sm leading-7 shadow-sm sm:max-w-[82%] ${
                    message.role === "user"
                      ? "bg-blue-600 text-white"
                      : "border border-slate-200 bg-white text-slate-800"
                  }`}
                >
                  {message.structuredResult ? (
                    <StructuredResultMessage result={message.structuredResult} />
                  ) : message.role === "assistant" ? (
                    <MarkdownMessage content={message.content} />
                  ) : (
                    <div className="whitespace-pre-wrap">{message.content}</div>
                  )}
                </div>
              </article>
            ))}
            {isLoading ? (
              <article className="flex justify-start">
                <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div className="mb-2 text-sm font-semibold text-slate-700">
                    법적 리스크 분석 중
                  </div>
                  <LoadingDots />
                </div>
              </article>
            ) : null}
          </div>

          <div className="border-t border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {exampleIdeas.map((idea) => (
                <button
                  key={idea}
                  type="button"
                  onClick={() => submitIdea(idea)}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100"
                >
                  {idea}
                </button>
              ))}
            </div>
            <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
              <label className="sr-only" htmlFor="idea">
                창업 아이디어
              </label>
              <textarea
                id="idea"
                value={input}
                maxLength={800}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    formRef.current?.requestSubmit();
                  }
                }}
                placeholder="예: AI가 계약서를 분석해주는 SaaS"
                className="min-h-24 flex-1 resize-none rounded-lg border border-slate-300 bg-white p-3 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
              <button
                type="submit"
                disabled={isLoading || input.trim().length === 0}
                className="h-12 rounded-lg bg-blue-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-300 sm:self-end"
              >
                {isLoading ? "분석 중" : "전송"}
              </button>
            </form>
            <div className="mt-2 flex justify-between text-xs text-slate-500">
              <span>Enter 전송, Shift+Enter 줄바꿈</span>
              <span>{input.length}/800</span>
            </div>
          </div>
        </section>

        <MetaPanel meta={meta} isLoading={isLoading} />
      </div>
    </main>
  );
}
