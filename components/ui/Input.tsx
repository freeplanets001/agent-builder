/**
 * UIコンポーネント: Input
 */
"use client";

import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export default function Input({
  label,
  error,
  hint,
  id,
  style,
  ...props
}: InputProps) {
  const inputId = id ?? `input-${Math.random().toString(36).slice(2)}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {label && (
        <label
          htmlFor={inputId}
          style={{
            fontSize: "13px",
            fontWeight: 500,
            color: "var(--color-text-muted)",
          }}
        >
          {label}
          {props.required && (
            <span style={{ color: "var(--color-error)", marginLeft: "4px" }}>*</span>
          )}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        style={{
          width: "100%",
          padding: "10px 14px",
          borderRadius: "10px",
          background: "var(--color-surface-2)",
          border: `1px solid ${error ? "var(--color-error)" : "var(--color-border)"}`,
          color: "var(--color-text)",
          fontSize: "14px",
          fontFamily: "inherit",
          outline: "none",
          transition: "border-color 0.15s ease",
          ...style,
        }}
        onFocus={(e) => {
          if (!error) {
            e.currentTarget.style.borderColor = "var(--color-primary)";
          }
        }}
        onBlur={(e) => {
          if (!error) {
            e.currentTarget.style.borderColor = "var(--color-border)";
          }
        }}
        {...props}
      />
      {error && (
        <p
          id={`${inputId}-error`}
          role="alert"
          style={{ fontSize: "12px", color: "var(--color-error)", marginTop: "2px" }}
        >
          {error}
        </p>
      )}
      {hint && !error && (
        <p
          id={`${inputId}-hint`}
          style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "2px" }}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
