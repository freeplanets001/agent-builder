/**
 * UIコンポーネント: Button — プレミアムライトテーマ版
 */
"use client";

import React from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

const VARIANT_STYLES: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: "var(--gradient-primary)",
    color: "white",
    border: "none",
    boxShadow: "var(--shadow-primary)",
  },
  secondary: {
    background: "var(--color-surface)",
    color: "var(--color-text)",
    border: "1px solid var(--color-border)",
    boxShadow: "var(--shadow-xs)",
  },
  ghost: {
    background: "transparent",
    color: "var(--color-text-secondary)",
    border: "1px solid transparent",
  },
  danger: {
    background: "rgba(239, 68, 68, 0.06)",
    color: "var(--color-error)",
    border: "1px solid rgba(239, 68, 68, 0.2)",
  },
};

const SIZE_STYLES: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: "6px 12px", fontSize: "12px", borderRadius: "var(--radius-sm)" },
  md: { padding: "10px 18px", fontSize: "14px", borderRadius: "var(--radius-md)" },
  lg: { padding: "14px 24px", fontSize: "15px", borderRadius: "var(--radius-md)" },
};

export default function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  children,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      {...props}
      disabled={isDisabled}
      style={{
        ...VARIANT_STYLES[variant],
        ...SIZE_STYLES[size],
        fontFamily: "inherit",
        fontWeight: 550,
        cursor: isDisabled ? "not-allowed" : "pointer",
        opacity: isDisabled ? 0.55 : 1,
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        transition: "all 0.2s ease",
        lineHeight: 1,
        letterSpacing: "-0.01em",
        ...style,
      }}
    >
      {loading ? (
        <div
          style={{
            width: "14px",
            height: "14px",
            border: "2px solid rgba(255,255,255,0.3)",
            borderTopColor: variant === "primary" ? "white" : "var(--color-primary)",
            borderRadius: "50%",
            animation: "spin 0.7s linear infinite",
            flexShrink: 0,
          }}
        />
      ) : icon ? (
        <span style={{ flexShrink: 0 }}>{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
