import { useEffect, useRef } from "react";
import { ConversationMessage } from "@shared/schema";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ConversationDisplayProps {
  messages: ConversationMessage[];
}

export function ConversationDisplay({ messages }: ConversationDisplayProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="max-w-md space-y-4">
          <div className="text-4xl font-bold text-primary">USS ENTERPRISE</div>
          <div className="text-xl text-muted-foreground">COMPUTER INTERFACE</div>
          <div className="h-px w-32 mx-auto bg-primary/50" />
          <p className="text-sm text-muted-foreground">
            Voice communication system ready. Activate the communicator to begin
            your dialogue with the Enterprise Computer.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div ref={scrollRef} className="p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={message.id}
            data-testid={`message-${message.role}-${index}`}
            className={`flex ${
              message.role === "user" ? "justify-end" : "justify-start"
            } animate-${message.role === "user" ? "slide-in-right" : "slide-in-left"}`}
          >
            <div
              className={`max-w-[85%] lg:max-w-[75%] ${
                message.role === "user"
                  ? "bg-chart-2/20 border-l-4 border-chart-2"
                  : "bg-primary/20 border-l-4 border-primary"
              } p-4 rounded-md space-y-2`}
            >
              <div className="flex items-center justify-between gap-4">
                <span
                  className={`text-xs font-medium tracking-wider uppercase ${
                    message.role === "user" ? "text-chart-2" : "text-primary"
                  }`}
                >
                  {message.role === "user" ? "OFFICER" : "COMPUTER"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatTime(message.timestamp)}
                </span>
              </div>
              <p
                className={`${
                  message.role === "computer" ? "font-mono text-sm" : "text-base"
                } text-foreground leading-relaxed`}
              >
                {message.text}
              </p>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
