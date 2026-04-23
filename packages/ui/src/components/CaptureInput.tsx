import React, { useState, useRef, useEffect } from "react";

interface CaptureInputProps {
  onSubmit: (text: string) => void;
  onCancel?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function CaptureInput({
  onSubmit,
  onCancel,
  placeholder = "what's on your mind?",
  autoFocus = true,
}: CaptureInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && value.trim()) {
      onSubmit(value.trim());
      setValue("");
    }
    if (e.key === "Escape") {
      onCancel?.();
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      style={{
        width: "100%",
        padding: "var(--sp-sm) var(--sp-md)",
        background: "var(--surface)",
        border: "1px solid var(--divider)",
        borderRadius: "var(--radius)",
        color: "var(--ink)",
        fontFamily: "var(--font-serif)",
        fontSize: "var(--font-base)",
        lineHeight: "var(--line-height)",
        outline: "none",
      }}
    />
  );
}
