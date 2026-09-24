import { extractVisibleReply } from "./reply.ts";

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ConversationMemory = { summary: string; summarizedCount: number };

export const recentMessageCount = 12;
export const minCompactMessages = 8;
export const summaryBatchSize = 16;
export const maxSummaryLength = 500;
export const maxMessageLength = 2000;

const blockedTopic =
  /新闻|时事|热点事件|头条|快讯|选举|投票|政党|政治|政客|政府|总统|议会|国会|首相|外交|战争|国际局势|news\b|current events|breaking story|headline|election|politic|government|president|parliament|congress|prime minister|geopolitic/i;

export const topicRefusal =
  "这个话题我们先不聊吧。可以和我说说你的心情、日常，或者想听一个小故事。";

export function isBlockedTopic(content: string) {
  return blockedTopic.test(content);
}

export function visibleMessage(message: ChatMessage) {
  const content =
    message.role === "assistant"
      ? extractVisibleReply(message.content)
      : message.content;
  return content && !isBlockedTopic(content) && content !== topicRefusal
    ? { role: message.role, content }
    : null;
}

function ordinalNumber(value: string) {
  if (/^\d+$/.test(value)) {
    return Number(value);
  }
  const digits: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  let number = 0;
  let digit = 0;
  for (const character of value) {
    if (character === "百" || character === "十") {
      number += (digit || 1) * (character === "百" ? 100 : 10);
      digit = 0;
    } else {
      digit = digits[character] || 0;
    }
  }
  return number + digit;
}

export function answerHistoryQuestion(messages: ChatMessage[]) {
  const latest = messages.at(-1);
  if (!latest || latest.role !== "user") {
    return null;
  }
  if (/(?:聊|说|发|回复).{0,8}(?:多少|几)(?:句|条|轮)/.test(latest.content)) {
    const userCount = messages.filter(
      (message) => message.role === "user",
    ).length;
    const assistantCount = messages.length - userCount;
    return `截至你刚发的这句，你发了${userCount}条，我回复了${assistantCount}条，共${messages.length}条消息。`;
  }

  const match = latest.content.match(
    /([我你])[^。！？\n]{0,12}?第([一二两三四五六七八九十百\d]+)(?:句|条)(?:话|消息)?/,
  );
  if (!match) {
    return null;
  }
  const speaker = match[1] === "我" ? "user" : "assistant";
  const number = ordinalNumber(match[2]);
  const previous = messages
    .slice(0, -1)
    .filter((message) => message.role === speaker);
  const label = speaker === "user" ? "你" : "我";
  if (number < 1 || number > previous.length) {
    return `${label}到目前为止只说了${previous.length}条，还没有第${number}条。`;
  }
  const answer = visibleMessage(previous[number - 1]);
  return answer
    ? `${label}说的第${number}条是：“${answer.content}”`
    : topicRefusal;
}

export function normalizeMemory(
  memory: unknown,
  messageCount: number,
): ConversationMemory {
  const recentStart = Math.max(0, messageCount - recentMessageCount);
  if (
    !memory ||
    typeof memory !== "object" ||
    !("summary" in memory) ||
    typeof memory.summary !== "string" ||
    memory.summary.length > maxSummaryLength ||
    !("summarizedCount" in memory) ||
    !Number.isInteger(memory.summarizedCount) ||
    Number(memory.summarizedCount) < 0 ||
    Number(memory.summarizedCount) > recentStart
  ) {
    return { summary: "", summarizedCount: 0 };
  }
  return memory as ConversationMemory;
}

export function nextCompactBatch(
  messages: ChatMessage[],
  memory: ConversationMemory,
) {
  const compactUntil = Math.max(0, messages.length - recentMessageCount);
  if (compactUntil - memory.summarizedCount < minCompactMessages) {
    return [];
  }
  return messages.slice(
    memory.summarizedCount,
    Math.min(compactUntil, memory.summarizedCount + summaryBatchSize),
  );
}
