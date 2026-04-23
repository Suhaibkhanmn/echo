import React, { useState, useRef, useEffect } from "react";

interface FreeTextInputProps {
  onSubmit: (text: string) => void;
  placeholder?: string;
}

export function FreeTextInput({
  onSubmit,
  placeholder = "or type here...",
}: FreeTextInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && value.trim()) {
      onSubmit(value.trim());
      setValue("");
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
        padding: "var(--sp-xs) 0",
        background: "transparent",
        border: "none",
        borderBottom: "1px solid var(--divider)",
        color: "var(--ink)",
        fontFamily: "var(--font-serif)",
        fontSize: "var(--font-base)",
        outline: "none",
        marginTop: "var(--sp-sm)",
      }}
    />
  );
}
