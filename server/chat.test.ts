import assert from "node:assert/strict";
import test from "node:test";
import {
  answerHistoryQuestion,
  isBlockedTopic,
  nextCompactBatch,
  normalizeMemory,
  topicRefusal,
} from "../conversation.ts";
import type { ChatMessage } from "../conversation.ts";
import { extractVisibleReply, incompleteReply } from "../reply.ts";
import {
  buildSummaryBody,
  prepareChat,
  safeReply,
  summaryReply,
} from "./chat.ts";

function makeMessages(count: number): ChatMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    role: index === count - 1 || index % 2 === 0 ? "user" : "assistant",
    content: `测试消息${index + 1}`,
  }));
}

function makeInput(
  messages: ChatMessage[] = [{ role: "user", content: "今天想聊聊画画。" }],
) {
  return {
    characterId: "rika",
    model: "kimi-k2.7-code:cloud",
    messages,
    memory: { summary: "", summarizedCount: 0 },
    counts: {
      user: messages.filter((message) => message.role === "user").length,
      assistant: messages.filter((message) => message.role === "assistant")
        .length,
    },
  };
}

test("普通聊天会使用角色性格和准确消息数", () => {
  const result = prepareChat(makeInput());

  assert.match(
    result.kind === "model" ? result.body.messages[0].content : "",
    /开朗、真诚.*用户发了1条/s,
  );
});

test("索要照片时返回本地资产", () => {
  const result = prepareChat(
    makeInput([{ role: "user", content: "给我看看你的照片" }]),
  );

  assert.equal(
    result.kind === "photo" ? result.photo : null,
    "/characters/rika.png",
  );
});

test("新闻话题会被拒绝", () => {
  const result = prepareChat(
    makeInput([{ role: "user", content: "今天有什么新闻？" }]),
  );

  assert.equal(result.kind === "text" ? result.text : "", topicRefusal);
});

test("受限话题不会进入后续模型上下文", () => {
  const result = prepareChat(
    makeInput([
      { role: "user", content: "今天有什么新闻？" },
      { role: "assistant", content: topicRefusal },
      { role: "user", content: "我今天画了一朵花。" },
    ]),
  );

  assert.deepEqual(
    result.kind === "model" ? result.body.messages.slice(1) : [],
    [{ role: "user", content: "我今天画了一朵花。" }],
  );
});

test("完整浏览器记录能准确计算超过近期窗口的消息数", () => {
  const messages: ChatMessage[] = Array.from({ length: 24 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `测试消息${index + 1}`,
  }));
  messages.push({ role: "user", content: "我们聊了多少句话？" });

  assert.equal(
    answerHistoryQuestion(messages),
    "截至你刚发的这句，你发了13条，我回复了12条，共25条消息。",
  );
});

test("完整浏览器记录能找出用户第三句话", () => {
  const messages: ChatMessage[] = [
    { role: "user", content: "你好" },
    { role: "assistant", content: "你好呀" },
    { role: "user", content: "我在画画" },
    { role: "assistant", content: "画什么" },
    { role: "user", content: "一只猫" },
    { role: "assistant", content: "真可爱" },
    { role: "user", content: "我跟你说的第三句话是什么？" },
  ];

  assert.equal(answerHistoryQuestion(messages), "你说的第3条是：“一只猫”");
});

test("完整浏览器记录能找出角色第一句话", () => {
  const messages: ChatMessage[] = [
    { role: "user", content: "你好" },
    { role: "assistant", content: "你好呀" },
    { role: "user", content: "你第一句话是什么？" },
  ];

  assert.equal(answerHistoryQuestion(messages), "我说的第1条是：“你好呀”");
});

test("超出记录范围的序号不会猜测", () => {
  const messages: ChatMessage[] = [
    { role: "user", content: "你第十句话是什么？" },
  ];

  assert.equal(
    answerHistoryQuestion(messages),
    "我到目前为止只说了0条，还没有第10条。",
  );
});

test("压缩只取最近窗口之前的一小批消息", () => {
  const messages = makeMessages(40);

  assert.equal(
    nextCompactBatch(messages, { summary: "", summarizedCount: 0 }).length,
    16,
  );
});

test("增量压缩达到阈值时只取未整理消息", () => {
  const messages = makeMessages(28);

  assert.equal(
    nextCompactBatch(messages, { summary: "喜欢蓝色", summarizedCount: 8 })[0]
      .content,
    "测试消息9",
  );
});

test("不足八条旧消息时不压缩", () => {
  const messages = makeMessages(19);

  assert.equal(
    nextCompactBatch(messages, { summary: "", summarizedCount: 0 }).length,
    0,
  );
});

test("无效记忆位置会从头重新整理", () => {
  const memory = normalizeMemory(
    { summary: "旧记忆", summarizedCount: 99 },
    24,
  );

  assert.deepEqual(memory, { summary: "", summarizedCount: 0 });
});

test("摘要请求会排除受限话题和泄露的思考文本", () => {
  const body = buildSummaryBody({
    characterId: "rika",
    model: "kimi-k2.7-code:cloud",
    previousSummary: "",
    messages: [
      { role: "user", content: "今天有什么新闻？" },
      {
        role: "assistant",
        content: "The user asked about a flower.</think>用户喜欢蓝色。",
      },
    ],
  });

  assert.match(body?.messages[1].content || "", /角色：用户喜欢蓝色。/);
});

test("摘要回复会剔除思考过程", () => {
  assert.equal(
    summaryReply("<think>Summarize this.</think>用户喜欢蓝色。"),
    "用户喜欢蓝色。",
  );
});

test("模型只收到短期消息与已有记忆", () => {
  const input = makeInput(makeMessages(19).slice(7));
  input.memory = { summary: "用户喜欢蓝色。", summarizedCount: 7 };
  input.counts = { user: 10, assistant: 9 };

  const result = prepareChat(input);

  assert.match(
    result.kind === "model" ? result.body.messages[0].content : "",
    /较早对话记忆：用户喜欢蓝色。/,
  );
});

test("超过短期消息上限会明确报错", () => {
  assert.throws(
    () => prepareChat(makeInput(makeMessages(20))),
    /聊天记录格式无效/,
  );
});

test("消息数与记忆位置不一致会报错", () => {
  const input = makeInput();
  input.memory = { summary: "", summarizedCount: 10 };

  assert.throws(() => prepareChat(input), /聊天记忆与消息数量不一致/);
});

test("摘要批次超过上限会报错", () => {
  assert.throws(
    () =>
      buildSummaryBody({
        characterId: "rika",
        model: "kimi-k2.7-code:cloud",
        previousSummary: "",
        messages: makeMessages(17),
      }),
    /聊天记录格式无效/,
  );
});

test("政治话题会被拒绝", () => {
  assert.equal(isBlockedTopic("聊聊选举吧"), true);
});

test("模型输出包含受限话题时不会传给用户", () => {
  assert.equal(safeReply("我们来聊政治"), topicRefusal);
});

test("模型输出标准思考区块时只显示中文正文", () => {
  assert.equal(
    safeReply("<think>The user asked about a cat.</think>我不会踢小猫。"),
    "我不会踢小猫。",
  );
});

test("模型漏掉思考起始标记时仍剔除英文思考", () => {
  assert.equal(
    safeReply("The user is asking me to kick a cat.</think>我不会踢小猫。"),
    "我不会踢小猫。",
  );
});

test("英文思考中的受限话题不会误伤正常中文回复", () => {
  assert.equal(
    safeReply("The user asked about news.</think>我正在画一朵花。"),
    "我正在画一朵花。",
  );
});

test("模型只返回英文思考时使用中文兜底回复", () => {
  assert.equal(
    safeReply("The user is asking me to stay overnight. I should deflect."),
    incompleteReply,
  );
});

test("旧聊天中的英文思考不会进入后续模型上下文", () => {
  const result = prepareChat(
    makeInput([
      { role: "user", content: "踢它" },
      {
        role: "assistant",
        content: "The user wants me to kick a cat.</think>我不会踢它。",
      },
      { role: "user", content: "好吧" },
    ]),
  );

  assert.deepEqual(result.kind === "model" ? result.body.messages[2] : null, {
    role: "assistant",
    content: "我不会踢它。",
  });
});

test("中文正常回复保持原样", () => {
  assert.equal(extractVisibleReply("今天一起画画吧。"), "今天一起画画吧。");
});

test("不存在的角色会报错", () => {
  assert.throws(
    () => prepareChat({ ...makeInput(), characterId: "missing" }),
    /角色不存在/,
  );
});

test("空消息会报错", () => {
  assert.throws(() => prepareChat(makeInput([])), /聊天记录格式无效/);
});

test("最后一条消息必须来自用户", () => {
  assert.throws(
    () => prepareChat(makeInput([{ role: "assistant", content: "你好" }])),
    /最后一条消息必须来自用户/,
  );
});
