import React, { useState, useEffect } from "react";

interface AgentBubbleProps {
  content: string;
  animate?: boolean;
  charDelayMs?: number;
}

export function AgentBubble({
  content,
  animate = true,
  charDelayMs = 40,
}: AgentBubbleProps) {
  const [displayed, setDisplayed] = useState(animate ? "" : content);

  useEffect(() => {
    if (!animate) {
      setDisplayed(content);
      return;
    }

    setDisplayed("");
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setDisplayed(content.slice(0, i));
      if (i >= content.length) clearInterval(timer);
    }, charDelayMs);

    return () => clearInterval(timer);
  }, [content, animate, charDelayMs]);

  return (
    <div
      style={{
        fontFamily: "var(--font-serif)",
        fontSize: "var(--font-lg)",
        color: "var(--ink)",
        padding: "var(--sp-md) 0",
        lineHeight: "var(--line-height)",
        minHeight: "2em",
      }}
    >
      {displayed}
      {animate && displayed.length < content.length && (
        <span
          style={{
            display: "inline-block",
            width: "2px",
            height: "1em",
            background: "var(--ink)",
            marginLeft: "1px",
            animation: "blink 0.8s infinite",
          }}
        />
      )}
    </div>
  );
}
