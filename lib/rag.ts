import ragData from "@/data/legal_risk_rag.json";

export type RiskLevel = "낮음" | "중간" | "높음";

export type LegalRiskRagItem = {
  id: string;
  name: string;
  triggers: string[];
  risk_level: RiskLevel;
  risk_points: string[];
  tavily_queries: string[];
  check_questions: string[];
  references?: {
    title: string;
    url: string;
  }[];
  matched_by?: ("category" | "trigger")[];
  matched_triggers?: string[];
};

type MatchedLegalRiskRagItem = LegalRiskRagItem & {
  matched_by: ("category" | "trigger")[];
  matched_triggers: string[];
};

export type RagRetrievalResult = {
  matchedItems: LegalRiskRagItem[];
  tavilyQueries: string[];
  checkQuestions: string[];
};

const riskLevelRank: Record<RiskLevel, number> = {
  높음: 3,
  중간: 2,
  낮음: 1,
};

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

export function retrieveRagContext(
  idea: string,
  categories: string[] = [],
): RagRetrievalResult {
  const normalizedIdea = idea.toLowerCase();
  const normalizedCategories = categories.map((category) => category.toLowerCase());

  const matchedItems = (ragData as LegalRiskRagItem[])
    .map((item) => {
      const matchedBy: ("category" | "trigger")[] = [];
      const matchedTriggers = item.triggers.filter((trigger) =>
        normalizedIdea.includes(trigger.toLowerCase()),
      );

      if (normalizedCategories.includes(item.name.toLowerCase())) {
        matchedBy.push("category");
      }

      if (matchedTriggers.length > 0) {
        matchedBy.push("trigger");
      }

      if (matchedBy.length === 0) {
        return null;
      }

      return {
        ...item,
        matched_by: unique(matchedBy),
        matched_triggers: matchedTriggers,
      };
    })
    .filter((item): item is MatchedLegalRiskRagItem => item !== null)
    .sort((a, b) => riskLevelRank[b.risk_level] - riskLevelRank[a.risk_level]);

  return {
    matchedItems,
    tavilyQueries: unique(matchedItems.flatMap((item) => item.tavily_queries)),
    checkQuestions: unique(matchedItems.flatMap((item) => item.check_questions)),
  };
}
