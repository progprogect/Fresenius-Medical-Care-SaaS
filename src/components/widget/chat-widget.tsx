"use client";

import * as React from "react";
import { Mic, PhoneOff, Send, Stethoscope } from "lucide-react";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { cn } from "@/lib/utils";
import { normalizeLanguageTag } from "@/lib/languages";

type WidgetConfig = {
  title: string;
  greeting: string;
  primaryColor: string;
  allowVoice: boolean;
  voiceReady: boolean;
};

type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  kind?: "voice";
  /** The placeholder greeting shown before any real turn happened. */
  seeded?: boolean;
};

type SlotCard = { slotRef: string; when: string; doctor: string; clinic: string };

type ToolEvent = { name: string; args: unknown; result: unknown };

const QUICK_REPLIES = [
  "I'd like to book an appointment",
  "I need to move or cancel my appointment",
  "Which clinics do you have?",
];

let idCounter = 0;
const nextId = () => `m${Date.now()}-${idCounter++}`;

function ChatWidgetInner() {
  const [config, setConfig] = React.useState<WidgetConfig | null>(null);
  const [messages, setMessages] = React.useState<ChatMsg[]>([]);
  const [slots, setSlots] = React.useState<SlotCard[]>([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [conversationId, setConversationId] = React.useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem("clinic-widget-conversation");
    } catch {
      return null;
    }
  });
  // The id names a thread; this token proves we are the browser that started
  // it. Without it the server hands us a fresh conversation instead.
  const [clientToken, setClientToken] = React.useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem("clinic-widget-token");
    } catch {
      return null;
    }
  });
  const [voiceOpen, setVoiceOpen] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const voiceExternalId = React.useRef<string | null>(null);
  // Mirrors the state so the voice callbacks, which outlive a render, always
  // post transcripts into the conversation that is actually current.
  const conversationIdRef = React.useRef<string | null>(conversationId);
  const clientTokenRef = React.useRef<string | null>(clientToken);

  const rememberConversation = React.useCallback((id: string, token?: string | null) => {
    conversationIdRef.current = id;
    setConversationId(id);
    if (token) {
      clientTokenRef.current = token;
      setClientToken(token);
    }
    try {
      localStorage.setItem("clinic-widget-conversation", id);
      if (token) localStorage.setItem("clinic-widget-token", token);
    } catch {}
  }, []);

  const conversation = useConversation({
    onConnect: ({ conversationId: voiceId }: { conversationId: string }) => {
      voiceExternalId.current = voiceId;
    },
    onMessage: (msg: { message: string; source: "user" | "ai" }) => {
      const role = msg.source === "user" ? "user" : "assistant";
      setMessages((prev) => {
        const incoming: ChatMsg = { id: nextId(), role, text: msg.message, kind: "voice" };
        // The voice agent opens with its own greeting, in the caller's language.
        // Swap it for the placeholder instead of showing both.
        const onlySeeded = prev.length === 1 && prev[0].seeded;
        if (onlySeeded && role === "assistant") return [incoming];
        return [...prev, incoming];
      });
      const convId = conversationIdRef.current;
      if (convId) {
        fetch("/api/voice/transcript", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: convId,
            clientToken: clientTokenRef.current,
            role: msg.source === "user" ? "user" : "ai",
            text: msg.message,
          }),
        }).catch(() => {});
      }
    },
    onDisconnect: () => setVoiceOpen(false),
    onError: () => {
      setVoiceOpen(false);
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", text: "Voice call ended due to a connection problem." },
      ]);
    },
  });

  React.useEffect(() => {
    fetch("/api/agent/chat")
      .then((r) => r.json())
      .then((cfg: WidgetConfig) => {
        setConfig(cfg);
        setMessages([{ id: nextId(), role: "assistant", text: cfg.greeting, seeded: true }]);
      })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, slots]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    setSlots([]);
    setMessages((prev) => [...prev, { id: nextId(), role: "user", text: trimmed }]);

    // While a call is live the agent is listening, not polling our chat API.
    // Typed text is handed to the same session so both stay one conversation.
    if (voiceOpen) {
      try {
        conversation.sendUserMessage(trimmed);
      } catch {
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: "assistant", text: "That did not reach the call — please say it instead." },
        ]);
      }
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(conversationId && clientToken ? { conversationId, clientToken } : {}),
          message: trimmed,
        }),
      });
      const data = await res.json();
      if (data.conversationId) rememberConversation(data.conversationId, data.clientToken);
      setMessages((prev) => [
        ...prev.map((m) => (m.seeded ? { ...m, seeded: false } : m)),
        { id: nextId(), role: "assistant", text: data.reply },
      ]);
      const slotEvent = [...(data.toolEvents as ToolEvent[] ?? [])]
        .reverse()
        .find((e) => e.name === "find_slots" && Array.isArray(e.result) && (e.result as SlotCard[]).length > 0);
      if (slotEvent) setSlots((slotEvent.result as SlotCard[]).slice(0, 6));
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", text: "Connection problem — please try again." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function startVoice() {
    if (!config?.voiceReady) return;
    try {
      const query =
        conversationId && clientToken
          ? `?conversationId=${encodeURIComponent(conversationId)}&clientToken=${encodeURIComponent(clientToken)}`
          : "";
      const res = await fetch(`/api/voice/signed-url${query}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.conversationId) rememberConversation(data.conversationId, data.clientToken);
      // Open the call in the visitor's own language when we support it, so the
      // greeting already matches; the agent still switches if they speak another.
      const browserLanguage = normalizeLanguageTag(navigator.language);
      const supported: string[] = data.languages ?? [];
      const startLanguage =
        browserLanguage && supported.includes(browserLanguage) ? browserLanguage : undefined;

      setVoiceOpen(true);
      conversation.startSession({
        signedUrl: data.signedUrl,
        dynamicVariables: data.dynamicVariables,
        ...(startLanguage ? { overrides: { agent: { language: startLanguage } } } : {}),
      });
    } catch {
      setVoiceOpen(false);
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          text: "Voice is not available right now. Please continue in chat.",
        },
      ]);
    }
  }

  function stopVoice() {
    try {
      conversation.endSession();
    } catch {}
    setVoiceOpen(false);
  }

  const color = config?.primaryColor ?? "#0d9488";
  const showQuick = messages.filter((m) => m.role === "user").length === 0;

  return (
    <div className="flex h-dvh flex-col bg-white text-neutral-900">
      <header
        className="flex items-center justify-between px-4 py-3 text-white"
        style={{ background: color }}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-full bg-white/20">
            <Stethoscope className="size-4.5" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">{config?.title ?? "Fresenius Medical Care"}</div>
            <div className="text-[11px] opacity-85">
              {voiceOpen
                ? conversation.isSpeaking
                  ? "Speaking..."
                  : "Listening..."
                : "AI assistant · online"}
            </div>
          </div>
        </div>
        {config?.allowVoice && config?.voiceReady && (
          voiceOpen ? (
            <button
              onClick={stopVoice}
              className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-xs font-medium hover:bg-white/30"
            >
              <PhoneOff className="size-3.5" /> End call
            </button>
          ) : (
            <button
              onClick={startVoice}
              className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-xs font-medium hover:bg-white/30"
            >
              <Mic className="size-3.5" /> Voice call
            </button>
          )
        )}
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                m.role === "user" ? "rounded-br-sm text-white" : "rounded-bl-sm bg-neutral-100"
              )}
              style={m.role === "user" ? { background: color } : undefined}
            >
              {m.kind === "voice" && (
                <span className="mb-0.5 block text-[10px] uppercase tracking-wide opacity-60">voice</span>
              )}
              {m.text}
            </div>
          </div>
        ))}

        {slots.length > 0 && !busy && (
          <div className="space-y-1.5">
            {slots.map((s) => (
              <button
                key={s.slotRef}
                onClick={() => send(`I'll take the slot on ${s.when} with ${s.doctor}.`)}
                className="block w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors hover:bg-neutral-50"
                style={{ borderColor: `${color}55` }}
              >
                <span className="font-medium">{s.when}</span>
                <span className="block text-xs text-neutral-500">
                  {s.doctor} · {s.clinic}
                </span>
              </button>
            ))}
          </div>
        )}

        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-neutral-100 px-4 py-3">
              <span className="inline-flex gap-1">
                <span className="size-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:0ms]" />
                <span className="size-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:120ms]" />
                <span className="size-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:240ms]" />
              </span>
            </div>
          </div>
        )}

        {showQuick && !busy && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {QUICK_REPLIES.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                className="rounded-full border px-3 py-1.5 text-xs text-neutral-700 transition-colors hover:bg-neutral-50"
                style={{ borderColor: `${color}66` }}
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      <form
        className="flex items-center gap-2 border-t px-3 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          className="h-10 flex-1 rounded-full border border-neutral-200 bg-neutral-50 px-4 text-sm outline-none focus:border-neutral-400"
        />
        <button
          type="submit"
          disabled={!input.trim() || busy}
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40"
          style={{ background: color }}
          aria-label="Send"
        >
          <Send className="size-4" />
        </button>
      </form>
      <div className="pb-2 text-center text-[10px] text-neutral-400">
        AI assistant — no medical advice. Emergencies: call 112.
      </div>
    </div>
  );
}

export function ChatWidget() {
  return (
    <ConversationProvider>
      <ChatWidgetInner />
    </ConversationProvider>
  );
}
