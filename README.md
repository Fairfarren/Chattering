# 絮语

一个精简的 Web 角色聊天应用：选择莉香或柚子，用本机 Ollama 服务连接 `kimi-k2.7-code:cloud`，在聊天中向角色索要照片。聊天记录仅保存在当前浏览器。

## 启动

需要 Node.js 24、pnpm，以及运行在 `127.0.0.1:11434` 的 Ollama。先在 Ollama 中添加 `kimi-k2.7-code:cloud`，再执行：

```bash
pnpm install
cp .env.example .env
pnpm dev
```

打开 `http://127.0.0.1:3000`。生产构建使用 `pnpm build`，随后运行 `pnpm start`。检查使用 `pnpm check`。

`OLLAMA_API_KEY` 已在 `.env.example` 预留。本机 Ollama 默认不需要密钥，保持为空即可；若以后接入要求认证的 Ollama 代理，再写入 `.env`。服务只监听本机回环地址，密钥不会发送到浏览器。

`kimi-k2.7-code:cloud` 通过本机 Ollama 接口调用，但实际推理使用 Ollama 云端，并非离线模型。

## 聊天记忆

完整聊天记录只保存在当前浏览器。每次生成回复时，模型会收到最近 12 条左右的原话，以及一份最多 500 字的角色记忆；每多出 8 条较早消息，就分批整理一次。记忆只保留稳定偏好、重要经历、关系变化、明确约定和正在聊的事，旧消息不会随每次聊天重复上传。整理失败时会保留原消息和输入内容，重试后继续。

角色询问“聊了多少条”或明确的“第几句话”时，页面会从完整浏览器记录中查原文并回答，不依赖模型猜测。清空角色聊天也会清空该角色的记忆。清理浏览器站点数据则会删除本地聊天记录和记忆。

## 角色和照片

两个角色的图片取自 [RisuAI](https://github.com/kwaroran/Risuai) 仓库：[`rika.png`](https://github.com/kwaroran/Risuai/blob/main/public/sample/rika.png)、[`yuzu.png`](https://github.com/kwaroran/Risuai/blob/main/public/sample/yuzu.png)，对应上游提交 `25001174e0452e3b9d16aee459ce9d2444c197d7`。角色性格和开场白由本项目编写，数据字段参考 [Character Card V3 规范](https://github.com/kwaroran/character-card-spec-v3/blob/main/SPEC_V3.md)。每位角色目前只有一张来源图片，索要照片时发送这张现有资产。项目随附上游 GPL-3.0 许可文本。

## 话题限制

服务端会拒绝常见的新闻、时事和政治提问，并在模型提示词中要求回避这些话题；回复也会经过同样的关键词检查。关键词拦截不能覆盖所有隐晦表达，不能视为绝对保证。
