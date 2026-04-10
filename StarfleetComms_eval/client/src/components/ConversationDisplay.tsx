import { useEffect, useRef } from "react";
import { ConversationMessage } from "@shared/schema";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ConversationDisplayProps {
  messages: ConversationMessage[];
}

export function ConversationDisplay({ messages }: ConversationDisplayProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (messages.length === 0) {
    return (
      <div className="h-full w-full rounded-md" style={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255, 153, 0, 0.15)' }}>
        <div className="flex items-center justify-center h-full">
          <div
            className="h-2 w-2 rounded-full lcars-scan"
            style={{ backgroundColor: 'var(--lcars-orange)', opacity: 0.3 }}
          />
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full rounded-md" style={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(255, 153, 0, 0.15)' }}>
      <div className="p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={message.id}
            data-testid={`message-${message.role}-${index}`}
            className={`flex ${
              message.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className="max-w-[85%] lg:max-w-[75%] p-4 rounded-md space-y-2"
              style={{
                backgroundColor: message.role === "user"
                  ? 'rgba(153, 153, 255, 0.15)'
                  : 'rgba(255, 153, 0, 0.15)',
                borderLeft: `4px solid ${message.role === "user" ? 'var(--lcars-blue)' : 'var(--lcars-orange)'}`,
              }}
            >
              <div className="flex items-center justify-between gap-4">
                <span
                  className="text-xs font-bold tracking-widest uppercase"
                  style={{ color: message.role === "user" ? 'var(--lcars-blue)' : 'var(--lcars-orange)' }}
                >
                  {message.role === "user" ? "OFFICER" : "COMPUTER"}
                </span>
                <span className="text-xs" style={{ color: 'var(--lcars-tan)', opacity: 0.7 }}>
                  {formatTime(message.timestamp)}
                </span>
              </div>
              <p
                className={`${
                  message.role === "computer" ? "font-mono text-sm" : "text-base"
                } leading-relaxed`}
                style={{ color: message.role === "computer" ? 'var(--lcars-orange)' : 'var(--lcars-light-blue)' }}
              >
                {message.text}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
