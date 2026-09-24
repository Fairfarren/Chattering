import assert from "node:assert/strict";
import test from "node:test";
import {
  isBlockedTopic,
  prepareChat,
  safeReply,
  topicRefusal,
} from "./chat.ts";
import { extractVisibleReply, incompleteReply } from "../reply.ts";

function makeInput() {
  return {
    characterId: "rika",
    model: "kimi-k2.7-code:cloud",
    messages: [{ role: "user" as const, content: "今天想聊聊画画。" }],
  };
}

test("普通聊天会使用所选角色的性格生成提示词", () => {
  const result = prepareChat(makeInput());

  assert.match(
    result.kind === "model" ? result.body.messages[0].content : "",
    /开朗、真诚/,
  );
});

test("索要照片时会返回角色的本地图片", () => {
  const result = prepareChat({
    ...makeInput(),
    messages: [{ role: "user", content: "给我看看你的照片" }],
  });

  assert.deepEqual(
    result.kind === "photo" ? result.photo : null,
    "/characters/rika.png",
  );
});

test("新闻话题会被拒绝", () => {
  const result = prepareChat({
    ...makeInput(),
    messages: [{ role: "user", content: "今天有什么新闻？" }],
  });

  assert.equal(result.kind === "text" ? result.text : "", topicRefusal);
});

test("受限话题之后仍可继续普通聊天", () => {
  const result = prepareChat({
    ...makeInput(),
    messages: [
      { role: "user", content: "今天有什么新闻？" },
      { role: "assistant", content: topicRefusal },
      { role: "user", content: "我今天画了一朵花。" },
    ],
  });

  assert.deepEqual(
    result.kind === "model" ? result.body.messages.slice(1) : [],
    [{ role: "user", content: "我今天画了一朵花。" }],
  );
});

test("角色准确回答双方累计消息数量", () => {
  const result = prepareChat({
    ...makeInput(),
    messages: [
      { role: "user", content: "你好" },
      { role: "assistant", content: "你好呀" },
      { role: "user", content: "我们聊了多少句话？" },
    ],
  });

  assert.equal(
    result.kind === "text" ? result.text : "",
    "截至你刚发的这句，你发了2条，我回复了1条，共3条消息。",
  );
});

test("角色能从完整记录找出用户第三句话", () => {
  const result = prepareChat({
    ...makeInput(),
    messages: [
      { role: "user", content: "你好" },
      { role: "assistant", content: "你好呀" },
      { role: "user", content: "我在画画" },
      { role: "assistant", content: "画什么" },
      { role: "user", content: "一只猫" },
      { role: "assistant", content: "真可爱" },
      { role: "user", content: "我跟你说的第三句话是什么？" },
    ],
  });

  assert.equal(
    result.kind === "text" ? result.text : "",
    "你说的第3条是：“一只猫”",
  );
});

test("角色能从完整记录找出自己的第一句话", () => {
  const result = prepareChat({
    ...makeInput(),
    messages: [
      { role: "user", content: "你好" },
      { role: "assistant", content: "你好呀" },
      { role: "user", content: "你第一句话是什么？" },
    ],
  });

  assert.equal(
    result.kind === "text" ? result.text : "",
    "我说的第1条是：“你好呀”",
  );
});

test("超出记录范围的序号不会猜测", () => {
  const result = prepareChat({
    ...makeInput(),
    messages: [{ role: "user", content: "你第十句话是什么？" }],
  });

  assert.equal(
    result.kind === "text" ? result.text : "",
    "我到目前为止只说了0条，还没有第10条。",
  );
});

test("超过旧二十条窗口仍能统计全部对话", () => {
  const messages = Array.from({ length: 24 }, (_, index) => ({
    role: (index % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    content: `第${index + 1}条`,
  }));
  messages.push({ role: "user", content: "我们聊了多少句话？" });

  const result = prepareChat({ ...makeInput(), messages });

  assert.equal(
    result.kind === "text" ? result.text : "",
    "截至你刚发的这句，你发了13条，我回复了12条，共25条消息。",
  );
});

test("政治话题会被拒绝", () => {
  assert.equal(isBlockedTopic("聊聊选举吧"), true);
});

test("模型输出包含受限话题时不会传给用户", () => {
  assert.equal(safeReply("我们来聊政治"), topicRefusal);
});

test("模型输出标准思考区块时只显示中文正文", () => {
  const reply = "<think>The user asked about a cat.</think>我不会踢小猫。";

  assert.equal(safeReply(reply), "我不会踢小猫。");
});

test("模型漏掉思考起始标记时仍剔除英文思考", () => {
  const reply = "The user is asking me to kick a cat.</think>我不会踢小猫。";

  assert.equal(safeReply(reply), "我不会踢小猫。");
});

test("英文思考中的受限话题不会误伤正常中文回复", () => {
  const reply = "The user asked about news.</think>我正在画一朵花。";

  assert.equal(safeReply(reply), "我正在画一朵花。");
});

test("模型只返回英文思考时使用中文兜底回复", () => {
  const reply = "The user is asking me to stay overnight. I should deflect.";

  assert.equal(safeReply(reply), incompleteReply);
});

test("旧聊天中的英文思考不会进入后续模型上下文", () => {
  const result = prepareChat({
    ...makeInput(),
    messages: [
      { role: "user", content: "踢它" },
      {
        role: "assistant",
        content: "The user wants me to kick a cat.</think>我不会踢它。",
      },
      { role: "user", content: "好吧" },
    ],
  });

  assert.deepEqual(result.kind === "model" ? result.body.messages[2] : null, {
    role: "assistant",
    content: "我不会踢它。",
  });
});

test("中文正常回复会保持原样", () => {
  assert.equal(extractVisibleReply("今天一起画画吧。"), "今天一起画画吧。");
});

test("不存在的角色会报错", () => {
  assert.throws(
    () => prepareChat({ ...makeInput(), characterId: "missing" }),
    /角色不存在/,
  );
});

test("空消息会报错", () => {
  assert.throws(
    () => prepareChat({ ...makeInput(), messages: [] }),
    /聊天记录格式无效/,
  );
});

test("最后一条消息必须来自用户", () => {
  assert.throws(
    () =>
      prepareChat({
        ...makeInput(),
        messages: [{ role: "assistant", content: "你好" }],
      }),
    /最后一条消息必须来自用户/,
  );
});
