const normalizeSearchText = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const buildSearchableText = (...values) =>
  normalizeSearchText(
    values
      .flat(Infinity)
      .filter(Boolean)
      .join(" ")
  );

const matchesAllTokens = (searchText, tokens) =>
  tokens.every((token) => searchText.includes(token));

const scoreResult = (item, normalizedQuery, tokens) => {
  const title = item.normalizedTitle ?? normalizeSearchText(item.title);
  const subtitle = item.normalizedSubtitle ?? normalizeSearchText(item.subtitle);
  const searchText = item.normalizedSearchText ?? normalizeSearchText(item.searchText);
  let score = 0;

  if (String(item.group || "").toLowerCase() === "module") {
    score += 5000;
  }

  if (title === normalizedQuery) score += 1200;
  else if (title.startsWith(normalizedQuery)) score += 900;
  else if (title.includes(normalizedQuery)) score += 600;

  if (subtitle.startsWith(normalizedQuery)) score += 280;
  else if (subtitle.includes(normalizedQuery)) score += 180;

  tokens.forEach((token) => {
    if (title.startsWith(token)) score += 160;
    else if (title.includes(token)) score += 110;

    if (subtitle.includes(token)) score += 55;
    if (searchText.includes(token)) score += 35;
  });

  return score;
};

export const filterAndRankUniversalResults = (items, query, { limit = 8 } = {}) => {
  const normalizedQuery = normalizeSearchText(query);
  const tokens = normalizedQuery.split(" ").filter(Boolean);

  if (!tokens.length) return [];

  const rankedResults = [];

  items.forEach((item) => {
    const normalizedSearchText = normalizeSearchText(item.searchText);

    if (!matchesAllTokens(normalizedSearchText, tokens)) return;

    const normalizedItem = {
      ...item,
      normalizedTitle: normalizeSearchText(item.title),
      normalizedSubtitle: normalizeSearchText(item.subtitle),
      normalizedSearchText,
    };

    rankedResults.push({
      ...item,
      score: scoreResult(normalizedItem, normalizedQuery, tokens),
    });
  });

  return rankedResults
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return String(left.title).localeCompare(String(right.title));
    })
    .slice(0, limit);
};

export { buildSearchableText, normalizeSearchText };
