import { importanceOrder } from "../config/topics.mjs";

export function rankItems(items) {
  return [...items].sort((a, b) => {
    const importanceDelta = (importanceOrder[a.importance] ?? 99) - (importanceOrder[b.importance] ?? 99);
    if (importanceDelta !== 0) return importanceDelta;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}

export function groupByTopic(items) {
  return items.reduce((groups, item) => {
    const topic = item.topic || "tech";
    groups[topic] = groups[topic] || [];
    groups[topic].push(item);
    return groups;
  }, {});
}
