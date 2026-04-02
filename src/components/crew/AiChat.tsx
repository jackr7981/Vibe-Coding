import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, Bot, Sparkles } from "lucide-react";
import { useCrewStore } from "../../stores/crewStore";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const OPENROUTER_KEY = import.meta.env.VITE_OPENROUTER_KEY as string | undefined;

function buildCrewContext(crew: ReturnType<typeof useCrewStore.getState>["filteredCrew"]) {
  return crew
    .slice(0, 60)
    .map((c) =>
      [
        c.full_name,
        c.rank ? `(${c.rank})` : "",
        `status: ${c.current_status.replace(/_/g, " ")}`,
        c.vessel_name ? `vessel: ${c.vessel_name}` : "",
        c.nationality ? `nat: ${c.nationality}` : "",
        c.current_location_label ? `loc: ${c.current_location_label}` : "",
      ]
        .filter(Boolean)
        .join(" | ")
    )
    .join("\n");
}

const SUGGESTIONS = [
  "Who is currently in transit?",
  "List crew on board vessels",
  "Any contracts expiring soon?",
  "How many crew are at home?",
];

export function AiChat() {
  const { filteredCrew } = useCrewStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = useCallback(
    async (text?: string) => {
      const userText = (text ?? input).trim();
      if (!userText || loading) return;
      setInput("");

      const newMessages: Message[] = [
        ...messages,
        { role: "user", content: userText },
      ];
      setMessages(newMessages);
      setLoading(true);

      if (!OPENROUTER_KEY) {
        setMessages([
          ...newMessages,
          {
            role: "assistant",
            content:
              "AI assistant requires VITE_OPENROUTER_KEY environment variable. Add it to your .env file.",
          },
        ]);
        setLoading(false);
        return;
      }

      try {
        const crewContext = buildCrewContext(filteredCrew);
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENROUTER_KEY}`,
            "HTTP-Referer": window.location.origin,
            "X-Title": "CrewTracker AI",
          },
          body: JSON.stringify({
            model: "openai/gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `You are a concise maritime crew management assistant for a shipping company. Answer questions using the crew roster below. Be brief and factual. If information isn't available, say so clearly.\n\nCurrent crew roster (${filteredCrew.length} crew):\n${crewContext}`,
              },
              ...newMessages,
            ],
            max_tokens: 300,
          }),
        });

        if (!res.ok) {
          throw new Error(`API error: ${res.status}`);
        }
        const data = await res.json();
        const reply =
          data.choices?.[0]?.message?.content ||
          "No response received. Please try again.";
        setMessages([...newMessages, { role: "assistant", content: reply }]);
      } catch (err) {
        setMessages([
          ...newMessages,
          {
            role: "assistant",
            content: `Connection error: ${err instanceof Error ? err.message : "Unknown error"}`,
          },
        ]);
      }
      setLoading(false);
    },
    [input, loading, messages, filteredCrew]
  );

  const isEmpty = messages.length === 0;

  return (
    <div
      className="flex flex-col flex-1 rounded-xl border border-border-divider overflow-hidden min-h-0"
      style={{ background: "#070d1a" }}
    >
      {/* Header */}
      <div
        className="px-3 py-2 border-b border-border-divider shrink-0 flex items-center gap-2"
        style={{ background: "#0b1425" }}
      >
        <div className="w-5 h-5 rounded-md bg-accent-blue/20 flex items-center justify-center">
          <Bot className="w-3 h-3 text-accent-blue" />
        </div>
        <span
          className="text-[11px] font-mono font-semibold uppercase tracking-wider flex-1"
          style={{ color: "#c8d8f0" }}
        >
          AI Crew Assistant
        </span>
        <Sparkles className="w-3 h-3" style={{ color: "#2b6cff" }} />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-2">
        {isEmpty && (
          <>
            <p
              className="text-[10px] font-mono mt-1 mb-2"
              style={{ color: "#3e4f6a" }}
            >
              Ask about crew status, locations, contracts…
            </p>
            <div className="flex flex-col gap-1">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="text-left text-[10px] font-mono px-2 py-1 rounded-md transition-colors"
                  style={{
                    background: "#0f1a2e",
                    border: "1px solid #162240",
                    color: "#5a7ab0",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.borderColor = "#2b6cff60")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.borderColor = "#162240")
                  }
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <span
              className="inline-block text-[10px] leading-relaxed px-2.5 py-1.5 rounded-lg max-w-[85%]"
              style={
                m.role === "user"
                  ? {
                      background: "#1a3055",
                      color: "#c8d8f0",
                      border: "1px solid #1e4080",
                    }
                  : {
                      background: "#0f1a2e",
                      color: "#8fb3d8",
                      border: "1px solid #162240",
                    }
              }
            >
              {m.content}
            </span>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-1.5">
            <Loader2
              className="w-3 h-3 animate-spin"
              style={{ color: "#2b6cff" }}
            />
            <span className="text-[9px] font-mono" style={{ color: "#3e4f6a" }}>
              Thinking...
            </span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="px-2 py-2 border-t border-border-divider shrink-0 flex gap-1.5"
        style={{ background: "#0b1425" }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Ask about crew..."
          className="flex-1 text-[11px] rounded-md px-2.5 py-1.5 border border-border-divider focus:outline-none focus:border-accent-blue transition-colors"
          style={{
            background: "#050810",
            color: "#c8d8f0",
            caretColor: "#2b6cff",
          }}
        />
        <button
          onClick={() => sendMessage()}
          disabled={loading || !input.trim()}
          className="px-2.5 py-1.5 rounded-md flex items-center justify-center transition-all disabled:opacity-30"
          style={{
            background: "#2b6cff25",
            border: "1px solid #2b6cff50",
          }}
        >
          <Send className="w-3 h-3" style={{ color: "#60a5fa" }} />
        </button>
      </div>
    </div>
  );
}
