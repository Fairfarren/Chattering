# 絮语

一个精简的 Web 角色聊天应用：选择莉香或柚子，用本机 Ollama 服务连接 `kimi-k2.7-code:cloud`，在聊天中向角色索要照片。本次聊天记录只保存在当前浏览器标签页。

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

## 本次聊天

页面在当前标签页的 `sessionStorage` 中保存本次聊天记录，刷新后可以继续；关闭标签页后，本次记录会结束。每次生成回复时，只向模型发送本次聊天最近最多 12 条、总计最多 8000 字的消息，不生成长期记忆，也不在不同聊天之间传递用户信息。角色设定始终保留。

询问“聊了多少条”或明确的“第几句话”时，页面会从本次聊天记录中查原文并回答。菜单中的“清空记录并开始新聊天”会清除当前角色的记录。直接新开标签页访问时不会继承原标签页的记录；共用同一个未关闭的标签页时，下一位使用者需要先开始新聊天。旧版本保存在 `localStorage` 的聊天记录和角色记忆会在打开页面时删除。

## 角色和照片

两个角色的图片取自 [RisuAI](https://github.com/kwaroran/Risuai) 仓库：[`rika.png`](https://github.com/kwaroran/Risuai/blob/main/public/sample/rika.png)、[`yuzu.png`](https://github.com/kwaroran/Risuai/blob/main/public/sample/yuzu.png)，对应上游提交 `25001174e0452e3b9d16aee459ce9d2444c197d7`。角色性格和开场白由本项目编写，数据字段参考 [Character Card V3 规范](https://github.com/kwaroran/character-card-spec-v3/blob/main/SPEC_V3.md)。每位角色目前只有一张来源图片，索要照片时发送这张现有资产。项目随附上游 GPL-3.0 许可文本。

## 话题限制

服务端会拒绝常见的新闻、时事和政治提问，并在模型提示词中要求回避这些话题；回复也会经过同样的关键词检查。关键词拦截不能覆盖所有隐晦表达，不能视为绝对保证。
