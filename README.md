# 絮语

一个精简的 Web 角色聊天应用：从八位角色中选择聊天伙伴，用本机 Ollama 服务连接 `kimi-k2.7-code:cloud`，在聊天中向角色索要照片。本次聊天记录只保存在当前浏览器标签页。希拉娜、艾米莉、坎特蕾拉点选时会先弹出二次确认，标出年龄、成人向和限制。

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

页面在当前标签页的 `sessionStorage` 中保存本次聊天记录，刷新后可以继续；关闭标签页后，本次记录会结束。每次生成回复时，只向模型发送本次聊天最近最多 12 条、内容总长最多 8000 个字符的消息，不生成长期记忆，也不在不同聊天之间传递用户信息。角色设定始终保留。

询问“聊了多少条”或明确的“第几句话”时，页面会从本次聊天记录中查原文并回答。菜单中的“清空记录并开始新聊天”只清除当前角色；“结束会话并清空所有聊天”会清除本标签页所有角色的记录，适合共用设备交接时使用。直接新开标签页访问时不会继承原标签页的记录。旧版本保存在 `localStorage` 的聊天记录和角色记忆会在打开页面时删除。

## 角色和照片

莉香和柚子的图片取自 [RisuAI](https://github.com/kwaroran/Risuai) 仓库：[`rika.png`](https://github.com/kwaroran/Risuai/blob/main/public/sample/rika.png)、[`yuzu.png`](https://github.com/kwaroran/Risuai/blob/main/public/sample/yuzu.png)，对应上游提交 `25001174e0452e3b9d16aee459ce9d2444c197d7`。两人的角色设定由本项目编写，项目随附上游 GPL-3.0 许可文本。

陆照霜、林见星与伊芙琳·维尔是本项目创作的架空人物，肖像由 imagegen 生成。三人的细节分别参考[大都会艺术博物馆的中国剑器研究](https://resources.metmuseum.org/resources/metpublications/pdf/Notable_Sabers_of_the_Qing_Dynasty_at_MMA_The_Metropolitan_Museum_Journal_v_36_2001.pdf)、[NASA 航天器导航资料](https://www.nasa.gov/reference/avionics-and-software/)与[美国国会图书馆的藏书保护指南](https://guides.loc.gov/preserving-your-books/handling)；这些资料只用于背景考据，人物、地点和故事均为原创虚构。全部角色的数据字段参考 [Character Card V3 规范](https://github.com/kwaroran/character-card-spec-v3/blob/main/SPEC_V3.md)。每位角色目前只有一张图片，索要照片时发送对应的本地资产。

希拉娜·亮风、艾米莉、坎特蕾拉·翡萨烈整理自 Chub 公开角色卡，分别来自 [Queen Cyrana](https://chub.ai/characters/SecretApe/queen-cyrana-bound-by-duty-72fbc76db7c6)、[Emily](https://chub.ai/characters/SecretApe/emily-s-rank-adventurer-chose-you-6de464e3bcca) 和 [坎特蕾拉·翡萨烈](https://chub.ai/characters/luoyicongniubi/kan-te-lei-la-fei-sa-lie-ab89c11763b9)。点选这三人时必须先阅读标注并确认；肖像由 imagegen 生成，不是原卡封面。

## 话题限制

服务端会拒绝常见的新闻、时事和政治提问，并在模型提示词中要求回避这些话题；回复也会经过同样的关键词检查。关键词拦截不能覆盖所有隐晦表达，不能视为绝对保证。
