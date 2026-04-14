import { OBJECT_CATEGORY_BY_ID } from "./categories";
import type { SimulatorObjectDefinition } from "./types";

export interface SearchableObjectResult {
  object: SimulatorObjectDefinition;
  score: number;
  matchedBy: string[];
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function fieldScore(fieldValue: string, token: string): number {
  const value = (fieldValue || "").toLowerCase();
  if (!value) return 0;
  if (value === token) return 120;
  if (value.startsWith(token)) return 80;
  if (value.includes(token)) return 40;
  return 0;
}

export function scoreObjectSearch(
  object: SimulatorObjectDefinition,
  tokens: string[],
): SearchableObjectResult | null {
  if (tokens.length === 0) return { object, score: 0, matchedBy: [] };

  const category = OBJECT_CATEGORY_BY_ID.get(object.categoryId);
  let score = 0;
  const matchedBy = new Set<string>();

  for (const token of tokens) {
    let tokenScore = 0;
    tokenScore = Math.max(tokenScore, fieldScore(object.displayName, token));
    if (tokenScore > 0) matchedBy.add("name");

    const aliasScore = Math.max(0, ...(object.aliases || []).map((alias) => fieldScore(alias, token)));
    if (aliasScore > 0) {
      tokenScore = Math.max(tokenScore, aliasScore + 20);
      matchedBy.add("alias");
    }

    const tagScore = Math.max(0, ...object.tags.map((tag) => fieldScore(tag, token)));
    if (tagScore > 0) {
      tokenScore = Math.max(tokenScore, tagScore + 15);
      matchedBy.add("tag");
    }

    const descriptionScore = fieldScore(object.description, token);
    if (descriptionScore > 0) {
      tokenScore = Math.max(tokenScore, descriptionScore + 5);
      matchedBy.add("description");
    }

    const categoryValues = [category?.displayName || "", ...(category?.keywords || [])];
    const categoryScore = Math.max(0, ...categoryValues.map((value) => fieldScore(value, token)));
    if (categoryScore > 0) {
      tokenScore = Math.max(tokenScore, categoryScore + 10);
      matchedBy.add("category");
    }

    if (tokenScore === 0) return null;
    score += tokenScore;
  }

  return {
    object,
    score,
    matchedBy: Array.from(matchedBy),
  };
}

export function searchObjectLibrary(
  objects: SimulatorObjectDefinition[],
  query: string,
): SearchableObjectResult[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return objects.map((object) => ({ object, score: 0, matchedBy: [] }));
  }
  return objects
    .map((object) => scoreObjectSearch(object, tokens))
    .filter(Boolean)
    .sort((a, b) => (b?.score || 0) - (a?.score || 0)) as SearchableObjectResult[];
}

