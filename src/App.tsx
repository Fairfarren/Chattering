import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  Camera,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { characters, findCharacter } from "../characters";
import {
  answerHistoryQuestion,
  isBlockedTopic,
  maxMessageLength,
  recentMessages,
  topicRefusal,
} from "../conversation";
import type { ChatMessage } from "../conversation";
import { extractVisibleReply, incompleteReply } from "../reply";

type ChatEntry = {
  id: string;
  role: "user" | "assistant";
  text: string;
  photo?: string;
  time: string;
};
type Model = { name: string; remote: boolean };
type ChatResponse = {
  kind: "text" | "photo";
  text: string;
  photo?: string;
  error?: string;
};
const storageKey = "xuyu-session-conversations-v1";
const legacyStorageKey = "xuyu-conversations-v1";
const legacyMemoryKey = "xuyu-memories-v1";
const chatModel = "kimi-k2.7-code:cloud";

function makeEntry(
  entry: Pick<ChatEntry, "role" | "text" | "photo">,
): ChatEntry {
  return {
    ...entry,
    id: crypto.randomUUID(),
    time: new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date()),
  };
}

function readHistory(): Record<string, ChatEntry[]> {
  try {
    const saved: unknown = JSON.parse(
      sessionStorage.getItem(storageKey) || "{}",
    );
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
      return {};
    }
    const validEntries = Object.entries(saved).filter(
      (entry): entry is [string, ChatEntry[]] =>
        Boolean(findCharacter(entry[0])) &&
        Array.isArray(entry[1]) &&
        entry[1].every(
          (message: unknown) =>
            message !== null &&
            typeof message === "object" &&
            "id" in message &&
            "text" in message &&
            "role" in message,
        ),
    );
    return Object.fromEntries(validEntries);
  } catch {
    return {};
  }
}

export function App() {
  const [activeId, setActiveId] = useState(characters[0].id);
  const [history, setHistory] = useState(readHistory);
  const [modelReady, setModelReady] = useState(false);
  const [modelError, setModelError] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [chatError, setChatError] = useState("");
  const [showSidebar, setShowSidebar] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const active = findCharacter(activeId)!;
  const messages = history[activeId] || [];
  const portrait = active.card.data.assets[0].uri;

  useEffect(() => {
    sessionStorage.setItem(storageKey, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.removeItem(legacyStorageKey);
    localStorage.removeItem(legacyMemoryKey);
  }, []);

  useEffect(() => {
    if (messages.length || busy) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages.length, busy]);

  useEffect(() => {
    void refreshModels();
  }, []);

  async function refreshModels() {
    try {
      const response = await fetch("/api/models");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error);
      }
      const available = data.models as Model[];
      const ready = available.some((model) => model.name === chatModel);
      setModelReady(ready);
      setModelError(
        ready ? "" : `Ollama 中没有 ${chatModel}，请先添加该模型。`,
      );
    } catch (error) {
      setModelReady(false);
      setModelError(error instanceof Error ? error.message : "无法连接 Ollama");
    }
  }

  function addEntry(characterId: string, entry: ChatEntry) {
    setHistory((current) => ({
      ...current,
      [characterId]: [...(current[characterId] || []), entry],
    }));
  }

  async function submitMessage(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || busy) {
      return;
    }
    const characterId = activeId;
    const outgoing = makeEntry({ role: "user", text });
    const conversation = [...messages, outgoing];
    const chatMessages: ChatMessage[] = conversation.map((entry) => ({
      role: entry.role,
      content: entry.text,
    }));
    const localAnswer = isBlockedTopic(text)
      ? topicRefusal
      : answerHistoryQuestion(chatMessages);
    if (!modelReady && !localAnswer) {
      setChatError("请先连接 Ollama 并确认聊天模型可用。");
      return;
    }
    addEntry(characterId, outgoing);
    setDraft("");
    setChatError("");
    setBusy(true);

    try {
      if (localAnswer) {
        addEntry(
          characterId,
          makeEntry({ role: "assistant", text: localAnswer }),
        );
        return;
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId,
          model: chatModel,
          messages: recentMessages(chatMessages),
        }),
      });
      const data = (await response.json()) as ChatResponse;
      if (!response.ok) {
        throw new Error(data.error || "发送失败");
      }
      addEntry(
        characterId,
        makeEntry({ role: "assistant", text: data.text, photo: data.photo }),
      );
    } catch (error) {
      setHistory((current) => ({
        ...current,
        [characterId]: (current[characterId] || []).filter(
          (entry) => entry.id !== outgoing.id,
        ),
      }));
      setDraft(text);
      setChatError(error instanceof Error ? error.message : "发送失败，请重试");
    } finally {
      setBusy(false);
      textareaRef.current?.focus();
    }
  }

  function selectCharacter(id: string) {
    setActiveId(id);
    setDraft("");
    setChatError("");
    setShowSidebar(false);
  }

  function clearChat() {
    if (busy) {
      return;
    }
    setHistory((current) => ({ ...current, [activeId]: [] }));
    setShowMenu(false);
    setChatError("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  }

  return (
    <div className="app-shell">
      {showSidebar && (
        <button
          className="mobile-scrim"
          aria-label="关闭角色列表"
          onClick={() => setShowSidebar(false)}
        />
      )}
      <aside className={`sidebar ${showSidebar ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark">
            <Sparkles size={18} strokeWidth={1.8} />
          </div>
          <div>
            <div className="brand-name">絮语</div>
            <div className="brand-subtitle">每段对话，都有温度</div>
          </div>
        </div>

        <div className="sidebar-section-title">
          <span>你的角色</span>
          <span className="sidebar-count">
            {characters.length.toString().padStart(2, "0")}
          </span>
        </div>
        <div className="character-list">
          {characters.map((character) => {
            const image = character.card.data.assets[0].uri;
            const selected = character.id === activeId;
            const last = history[character.id]?.at(-1);
            const preview =
              last?.role === "assistant"
                ? (extractVisibleReply(last.text) ?? incompleteReply)
                : last?.text;
            return (
              <button
                key={character.id}
                className={`character-item ${selected ? "selected" : ""}`}
                onClick={() => selectCharacter(character.id)}
              >
                <span className="avatar-wrap">
                  <img src={image} alt="" />
                  <span className="online-dot" />
                </span>
                <span className="character-item-copy">
                  <strong>{character.card.data.name}</strong>
                  <small>{preview || character.subtitle}</small>
                </span>
                {last && <span className="last-time">{last.time}</span>}
              </button>
            );
          })}
        </div>

        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="note-icon">
              <MessageCircle size={16} />
            </span>
            <span>
              聊一会儿就好<small>记录仅保存在当前标签页</small>
            </span>
          </div>
          <div className="sidebar-footer">
            <span className="status-dot" /> 本地连接{" "}
            <span className="footer-version">v0.1</span>
          </div>
        </div>
      </aside>

      <main className="chat-area">
        <header className="chat-header">
          <div className="header-person">
            <button
              className="icon-button mobile-menu"
              aria-label="打开角色列表"
              onClick={() => setShowSidebar(true)}
            >
              <Menu size={20} />
            </button>
            <img src={portrait} alt="" />
            <div>
              <strong>{active.card.data.name}</strong>
              <span>
                <i className="status-dot" /> 在这里聊一会儿
              </span>
            </div>
          </div>
          <div className="header-actions">
            <div className="model-control">
              <span className="model-dot" /> {chatModel}
            </div>
            <div className="menu-wrap">
              <button
                className="icon-button more-button"
                aria-label="更多操作"
                onClick={() => setShowMenu(!showMenu)}
              >
                <MoreHorizontal size={20} />
              </button>
              {showMenu && (
                <div className="dropdown-menu">
                  <button onClick={clearChat} disabled={busy}>
                    <Trash2 size={16} /> 清空记录并开始新聊天
                  </button>
                  <button
                    onClick={() => {
                      void refreshModels();
                      setShowMenu(false);
                    }}
                  >
                    <ArrowDown size={16} /> 刷新模型列表
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="conversation" key={activeId}>
          <div className="conversation-inner">
            {messages.length === 0 && (
              <div className="welcome">
                <div className="welcome-eyebrow">
                  <span /> 一段新的对话
                </div>
                <div className="welcome-portrait">
                  <img src={portrait} alt={`${active.card.data.name}的照片`} />
                  <div className="portrait-orbit orbit-one" />
                  <div className="portrait-orbit orbit-two" />
                </div>
                <div className="welcome-overline">初次见面</div>
                <h1>
                  和{active.card.data.name}，<br />
                  <em>聊聊今天。</em>
                </h1>
                <p className="welcome-quote">“{active.quote}”</p>
                <p className="welcome-description">
                  {active.card.data.description}
                </p>
                <div className="suggestion-row">
                  <button
                    onClick={() => {
                      setDraft("你好，今天过得怎么样？");
                      textareaRef.current?.focus();
                    }}
                  >
                    打个招呼 <ArrowUp size={14} />
                  </button>
                  <button
                    onClick={() => {
                      setDraft("给我看看你的照片吧");
                      textareaRef.current?.focus();
                    }}
                  >
                    看看照片 <Camera size={14} />
                  </button>
                </div>
              </div>
            )}

            {messages.length > 0 && (
              <div className="conversation-date">本次 · 一段轻松的对话</div>
            )}
            {messages.map((message) => (
              <div key={message.id} className={`message-row ${message.role}`}>
                {message.role === "assistant" && (
                  <img className="message-avatar" src={portrait} alt="" />
                )}
                <div className="message-content">
                  <div className="message-meta">
                    {message.role === "assistant"
                      ? active.card.data.name
                      : "我"}{" "}
                    <span>{message.time}</span>
                  </div>
                  <div className="bubble">
                    {message.photo && (
                      <button
                        className="photo-message"
                        onClick={() => setPreviewPhoto(message.photo!)}
                        aria-label="查看照片"
                      >
                        <img
                          src={message.photo}
                          alt={`${active.card.data.name}发送的照片`}
                        />
                        <span>
                          <Camera size={14} /> 点击查看照片
                        </span>
                      </button>
                    )}
                    {message.role === "assistant"
                      ? (extractVisibleReply(message.text) ?? incompleteReply)
                      : message.text}
                  </div>
                </div>
              </div>
            ))}
            {busy && (
              <div className="message-row assistant">
                <img className="message-avatar" src={portrait} alt="" />
                <div className="message-content">
                  <div className="message-meta">{active.card.data.name}</div>
                  <div className="bubble typing">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="composer-zone">
          {(modelError || chatError) && (
            <div className="error-banner">
              {chatError || modelError}
              <button
                onClick={() => {
                  setChatError("");
                  if (modelError) {
                    void refreshModels();
                  }
                }}
              >
                {modelError ? "重试连接" : "关闭"}
              </button>
            </div>
          )}
          <form
            className="composer"
            onSubmit={(event) => {
              void submitMessage(event);
            }}
          >
            <textarea
              ref={textareaRef}
              aria-label="输入消息"
              placeholder={`给${active.card.data.name}发消息...`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              maxLength={maxMessageLength}
            />
            <div className="composer-bottom">
              <span>
                <span className="key-hint">Enter</span> 发送 ·{" "}
                <span className="key-hint">Shift + Enter</span> 换行
              </span>
              <button
                type="submit"
                className="send-button"
                disabled={!draft.trim() || busy}
                aria-label="发送消息"
              >
                <Send size={17} />
              </button>
            </div>
          </form>
          <div className="composer-footnote">
            只参考本次聊天的近期消息。暂不聊新闻或政治。
          </div>
        </div>
      </main>

      <aside className="profile-panel">
        <div className="profile-heading">
          <span>角色档案</span>
          <span>角色设定</span>
        </div>
        <div className="profile-photo">
          <img src={portrait} alt={`${active.card.data.name}的照片`} />
          <div className="profile-photo-caption">
            <span>01 / 01</span>
            <span>角色影像</span>
          </div>
        </div>
        <div className="profile-name-row">
          <div>
            <span className="profile-overline">你的聊天伙伴</span>
            <h2>{active.card.data.name}</h2>
          </div>
          <div className="profile-sparkle">
            <Sparkles size={19} />
          </div>
        </div>
        <p className="profile-subtitle">{active.subtitle}</p>
        <div className="profile-tags">
          {active.card.data.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <div className="profile-divider" />
        <div className="profile-label">关于我</div>
        <p className="profile-text">{active.card.data.description}</p>
        <div className="profile-label">性格小记</div>
        <p className="profile-text">{active.card.data.personality}</p>
        <button
          className="profile-photo-button"
          onClick={() => {
            setDraft("给我看看你的照片吧");
            textareaRef.current?.focus();
          }}
        >
          <Camera size={17} /> 请她发张照片 <ArrowUp size={15} />
        </button>
        <div className="profile-end">
          <span>✦</span> 好的对话，从一句你好开始
        </div>
      </aside>

      {previewPhoto && (
        <div
          className="photo-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="查看角色照片"
          onClick={() => setPreviewPhoto("")}
        >
          <button aria-label="关闭照片">
            <X size={24} />
          </button>
          <img
            src={previewPhoto}
            alt="角色照片大图"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
