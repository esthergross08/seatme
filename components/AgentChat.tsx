"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Check, Loader2, AlertTriangle } from "lucide-react";
import { describeOperation, type AgentOperation, type AgentApplyResult } from "@/lib/agentOperations";

const C = {
  ink: "#221F2B",
  paper: "#F7F3EA",
  card: "#FFFFFF",
  gold: "#A8823C",
  wine: "#8C3B3B",
  sage: "#54704F",
  line: "#E4DCC9",
  muted: "#8A8272",
};

const genId = () => Math.random().toString(36).slice(2, 9);

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  operations?: AgentOperation[];
  applied?: boolean;
  results?: AgentApplyResult[];
}

export interface AgentChatProps {
  eventId: string;
  role: "owner" | "editor" | "viewer";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getState: () => any;
  onApply: (operations: AgentOperation[]) => AgentApplyResult[] | Promise<AgentApplyResult[]>;
}

export default function AgentChat({ eventId, role, getState, onApply }: AgentChatProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open, loading]);

  if (role === "viewer") return null;

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const outgoing = messages.slice(-12).map((m) => ({ role: m.role, content: m.text }));
    setMessages((m) => [...m, { id: genId(), role: "user", text }]);
    setInput("");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eventId, message: text, history: outgoing, state: getState() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setMessages((m) => [
        ...m,
        {
          id: genId(),
          role: "assistant",
          text: data.reply,
          operations: data.operations && data.operations.length ? data.operations : undefined,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleApply(messageId: string, operations: AgentOperation[]) {
    setApplyingId(messageId);
    try {
      const results = await onApply(operations);
      setMessages((m) => m.map((msg) => (msg.id === messageId ? { ...msg, applied: true, results } : msg)));
    } finally {
      setApplyingId(null);
    }
  }

  function handleDismiss(messageId: string) {
    setMessages((m) => m.map((msg) => (msg.id === messageId ? { ...msg, applied: true, results: [] } : msg)));
  }

  return (
    <>
      {open && (
        <div
          className="fixed right-6 z-50 flex flex-col shadow-2xl rounded-2xl overflow-hidden bottom-40 sm:bottom-24"
          style={{ width: 360, maxWidth: "calc(100vw - 32px)", height: 480, background: C.card, border: `1px solid ${C.line}` }}
        >
          <div
            className="px-4 py-3 flex items-center justify-between shrink-0"
            style={{ borderBottom: `1px solid ${C.line}`, background: C.paper }}
          >
            <div>
              <div className="text-[10px] tracking-[0.18em] uppercase font-semibold" style={{ color: C.gold }}>
                Assistant
              </div>
              <div className="text-sm" style={{ fontFamily: "Fraunces, serif", color: C.ink }}>
                Seating helper
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-black/5" aria-label="Close">
              <X size={16} color={C.muted} />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">
            {messages.length === 0 && (
              <div className="text-xs" style={{ color: C.muted }}>
                Ask me to move guests, add or remove people, set constraints, adjust tables, or regenerate the plan —
                I&apos;ll show you the changes before anything is applied.
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className="flex flex-col gap-1.5">
                <div
                  className="text-sm px-3 py-2 rounded-xl max-w-[85%]"
                  style={
                    m.role === "user"
                      ? { alignSelf: "flex-end", background: C.gold, color: "#fff" }
                      : { alignSelf: "flex-start", background: C.paper, color: C.ink, border: `1px solid ${C.line}` }
                  }
                >
                  {m.text}
                </div>
                {m.operations && (
                  <div
                    className="self-start w-full rounded-xl px-3 py-2 flex flex-col gap-1.5"
                    style={{ background: "#fff", border: `1px solid ${C.line}` }}
                  >
                    {m.operations.map((op, i) => {
                      const result = m.results?.find((r) => r.index === i);
                      return (
                        <div key={i} className="flex items-start gap-1.5 text-xs" style={{ color: C.ink }}>
                          {m.applied ? (
                            result?.ok === false ? (
                              <AlertTriangle size={13} color={C.wine} className="mt-0.5 shrink-0" />
                            ) : (
                              <Check size={13} color={C.sage} className="mt-0.5 shrink-0" />
                            )
                          ) : (
                            <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: C.gold }} />
                          )}
                          <span>
                            {describeOperation(op)}
                            {result?.ok === false && result.message && <span style={{ color: C.wine }}> — {result.message}</span>}
                          </span>
                        </div>
                      );
                    })}
                    {!m.applied && (
                      <div className="flex gap-2 mt-1">
                        <button
                          onClick={() => handleApply(m.id, m.operations!)}
                          disabled={applyingId === m.id}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                          style={{ background: C.sage, color: "#fff", opacity: applyingId === m.id ? 0.7 : 1 }}
                        >
                          {applyingId === m.id && <Loader2 size={12} className="animate-spin" />}
                          Apply
                        </button>
                        <button
                          onClick={() => handleDismiss(m.id)}
                          disabled={applyingId === m.id}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                          style={{ background: "transparent", color: C.muted, border: `1px solid ${C.line}` }}
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-xs" style={{ color: C.muted }}>
                <Loader2 size={13} className="animate-spin" />
                Thinking…
              </div>
            )}
            {error && (
              <div className="text-xs" style={{ color: C.wine }}>
                {error}
              </div>
            )}
          </div>

          <div className="p-2.5 flex gap-2 shrink-0" style={{ borderTop: `1px solid ${C.line}` }}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="e.g. move Sara to Family Round 1"
              className="flex-1 text-sm px-3 py-2 rounded-lg outline-none"
              style={{ border: `1px solid ${C.line}` }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="p-2 rounded-lg shrink-0"
              style={{ background: C.gold, color: "#fff", opacity: loading || !input.trim() ? 0.6 : 1 }}
              aria-label="Send"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed right-6 z-50 rounded-full shadow-xl flex items-center justify-center bottom-20 sm:bottom-6"
        style={{ width: 52, height: 52, background: C.gold, color: "#fff" }}
        aria-label="Open assistant"
      >
        {open ? <X size={20} /> : <MessageCircle size={20} />}
      </button>
    </>
  );
}
