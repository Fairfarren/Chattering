import assert from "node:assert/strict";
import test from "node:test";
import {
  answerHistoryQuestion,
  isBlockedTopic,
  recentMessages,
  topicRefusal,
} from "../conversation.ts";
import type { ChatMessage } from "../conversation.ts";
import { extractVisibleReply, incompleteReply } from "../reply.ts";
import { characters, selectionConfirmation } from "../characters.ts";
import { prepareChat, safeReply } from "./chat.ts";

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
  };
}

test("普通聊天会使用角色性格并限制记忆范围", () => {
  const result = prepareChat(makeInput());

  assert.match(
    result.kind === "model" ? result.body.messages[0].content : "",
    /开朗、真诚.*不要声称记得未提供的早期对话/s,
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

test("只说看看你时继续交给模型", () => {
  const result = prepareChat(
    makeInput([{ role: "user", content: "给我看看你" }]),
  );

  assert.equal(result.kind, "model");
});

test("闲聊自拍时不会直接发送角色照片", () => {
  const result = prepareChat(
    makeInput([{ role: "user", content: "你喜欢自拍吗？" }]),
  );

  assert.equal(result.kind, "model");
});

for (const [characterId, name, expectedSetting] of [
  ["luzhaoshuang", "陆照霜", "架空江湖的秋夜"],
  ["linjianxing", "林见星", "远汐号"],
  ["evelyn", "伊芙琳", "钟楼古书馆"],
] as const) {
  test(`${name}聊天会带入专属场景`, () => {
    const result = prepareChat({ ...makeInput(), characterId });

    assert.match(
      result.kind === "model" ? result.body.messages[0].content : "",
      new RegExp(expectedSetting),
    );
  });
}

for (const [characterId, name] of [
  ["luzhaoshuang", "陆照霜"],
  ["linjianxing", "林见星"],
  ["evelyn", "伊芙琳"],
] as const) {
  test(`${name}索要照片时返回对应资产`, () => {
    const result = prepareChat({
      ...makeInput([{ role: "user", content: "给我看看你的照片" }]),
      characterId,
    });

    assert.equal(
      result.kind === "photo" ? result.photo : null,
      `/characters/${characterId}.jpg`,
    );
  });
}

for (const [characterId, name, age] of [
  ["cyrana", "希拉娜", "二十六岁"],
  ["emily", "艾米莉", "二十二岁"],
  ["cantarella", "坎特蕾拉", "三十五岁"],
] as const) {
  test(`${name}的聊天带有成年确认边界`, () => {
    const result = prepareChat({ ...makeInput(), characterId });
    const system =
      result.kind === "model" ? result.body.messages[0].content : "";

    assert.match(system, new RegExp(age));
    assert.match(system, /成年人之间的虚构角色扮演/);
    assert.doesNotMatch(system, /只聊日常/);
  });

  test(`${name}索要照片时返回对应资产`, () => {
    const result = prepareChat({
      ...makeInput([{ role: "user", content: "给我看看你的照片" }]),
      characterId,
    });

    assert.equal(
      result.kind === "photo" ? result.photo : null,
      `/characters/${characterId}.jpg`,
    );
  });
}

test("需要确认的角色都标出了年龄和成人向", () => {
  const confirmed = characters.filter(
    (character) => "confirmation" in character,
  );

  assert.deepEqual(
    confirmed.map((character) => character.id),
    ["cyrana", "emily", "cantarella"],
  );
  for (const character of confirmed) {
    const confirmation = selectionConfirmation(character);
    if (!confirmation) {
      continue;
    }
    const labels = confirmation.notes.map((note) => note.label);
    assert.ok(labels.includes("年龄"));
    assert.ok(labels.includes("成人向"));
    assert.ok(labels.includes("使用条件"));
    assert.ok(labels.includes("场景标注"));
  }
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

test("本次聊天记录能准确计算超过近期窗口的消息数", () => {
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

for (const content of [
  "站着说几句就走。",
  "我说几句真话。",
  "我说几句体己话。",
  "我随便说几句。",
  "聊几句就走。",
  "我跟你说几句话。",
  "我回复几句就下线。",
  "他发了几条消息你看见没。",
  "我发几句话。",
  "你聊几句就知道。",
  "你上次说的第几句话来着。",
  "这几句话我攒了两年。",
]) {
  test(`正常叙述「${content}」不会触发消息计数`, () => {
    const messages: ChatMessage[] = [{ role: "user", content }];

    const answer = answerHistoryQuestion(messages);

    assert.equal(answer, null);
  });
}

test("询问聊了几句时仍返回准确消息数", () => {
  const messages: ChatMessage[] = [
    { role: "user", content: "你好" },
    { role: "assistant", content: "你好呀" },
    { role: "user", content: "我们聊了几句？" },
  ];

  const answer = answerHistoryQuestion(messages);

  assert.equal(answer, "截至你刚发的这句，你发了2条，我回复了1条，共3条消息。");
});

test("本次聊天记录能找出用户第三句话", () => {
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

test("本次聊天记录能找出角色第一句话", () => {
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

test("引用第三句内容不会触发历史问答", () => {
  const messages: ChatMessage[] = [
    { role: "assistant", content: "第一句" },
    { role: "assistant", content: "第二句" },
    { role: "assistant", content: "第三句" },
    { role: "user", content: "你三句里的第三句'不靠近超过一臂'，我记着。" },
  ];

  assert.equal(answerHistoryQuestion(messages), null);
});

test("列举第一条和第二条的修改不会触发历史问答", () => {
  const messages: ChatMessage[] = [
    { role: "assistant", content: "第一条" },
    { role: "assistant", content: "第二条" },
    { role: "user", content: "你把第一、第二条都改了。" },
  ];

  assert.equal(answerHistoryQuestion(messages), null);
});

test("近期上下文最多保留十二条消息", () => {
  const messages = makeMessages(20);

  assert.deepEqual(recentMessages(messages), messages.slice(-12));
});

test("近期上下文按总长度截断旧消息", () => {
  const messages = makeMessages(5).map((message) => ({
    ...message,
    content: "聊".repeat(2000),
  }));

  assert.deepEqual(recentMessages(messages), messages.slice(-4));
});

test("模型上下文不会加入旧摘要", () => {
  const input = {
    ...makeInput([{ role: "user" as const, content: "今天画画" }]),
    memory: { summary: "旧用户喜欢蓝色", summarizedCount: 10 },
  };

  const result = prepareChat(input);

  assert.doesNotMatch(
    result.kind === "model" ? JSON.stringify(result.body) : "",
    /旧用户喜欢蓝色/,
  );
});

test("超过近期消息上限会明确报错", () => {
  assert.throws(
    () => prepareChat(makeInput(makeMessages(13))),
    /聊天记录格式无效/,
  );
});

test("超过上下文长度上限会明确报错", () => {
  const messages = makeMessages(5).map((message) => ({
    ...message,
    content: "聊".repeat(2000),
  }));

  assert.throws(() => prepareChat(makeInput(messages)), /聊天上下文过长/);
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

test("先前回复中的英文思考不会进入后续模型上下文", () => {
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
