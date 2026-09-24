const THINK_BLOCK = /<(think|analysis)>[\s\S]*?<\/\1>/gi;
const THINK_START = /<(think|analysis)>/i;
const THINK_END = /<\/(think|analysis)>/i;
const ENGLISH_REASONING_START =
  /^(?:the user|i (?:need|should|will)|we (?:need|should|will)|as (?:the|a) character|let me|need to)\b/i;

export const incompleteReply = "刚才那句没说清楚。我们接着聊，你想说什么？";

export function extractVisibleReply(content: string): string | null {
  let visible = content.replace(THINK_BLOCK, "").trim();
  const closingTag = THINK_END.exec(visible);
  if (closingTag) {
    visible = visible.slice(closingTag.index + closingTag[0].length).trim();
  }
  if (
    !visible ||
    THINK_START.test(visible) ||
    ENGLISH_REASONING_START.test(visible)
  ) {
    return null;
  }
  return /\p{Script=Han}/u.test(visible) ? visible : null;
}
