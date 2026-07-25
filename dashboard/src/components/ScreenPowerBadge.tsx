import type { ScreenPowerState } from "@/lib/screen-power";

const STYLE: Record<
  ScreenPowerState,
  { label: string; color: string; dot: string; background: string; border: string }
> = {
  on: {
    label: "SCREEN ON",
    color: "#2563eb",
    dot: "#3b82f6",
    background: "rgba(59, 130, 246, 0.08)",
    border: "1px solid rgba(59, 130, 246, 0.2)"
  },
  off: {
    label: "SCREEN OFF",
    color: "#64748b",
    dot: "#94a3b8",
    background: "#f1f5f9",
    border: "1px solid #cbd5e1"
  },
  unknown: {
    label: "SCREEN UNKNOWN",
    color: "#a16207",
    dot: "#eab308",
    background: "rgba(234, 179, 8, 0.08)",
    border: "1px solid rgba(234, 179, 8, 0.22)"
  }
};

export default function ScreenPowerBadge({
  state,
  compact = false,
  dark = false,
  wide = false
}: {
  state: ScreenPowerState;
  compact?: boolean;
  dark?: boolean;
  wide?: boolean;
}) {
  const style = STYLE[state];

  return (
    <span
      aria-label={style.label}
      title={state === "unknown" ? "Waiting for fresh screen power telemetry" : style.label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: compact ? "6px" : "8px",
        padding: wide ? "12px" : compact ? "4px 10px" : "6px 12px",
        borderRadius: wide ? "8px" : "999px",
        fontSize: wide ? "15px" : compact ? "11px" : "12px",
        lineHeight: 1.2,
        fontWeight: 700,
        whiteSpace: "nowrap",
        width: wide ? "100%" : undefined,
        boxSizing: "border-box",
        color: style.color,
        backgroundColor: dark ? "rgba(15, 23, 42, 0.8)" : style.background,
        border: dark ? "1px solid rgba(148, 163, 184, 0.18)" : style.border
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: compact ? 6 : 8,
          height: compact ? 6 : 8,
          display: "inline-block",
          flexShrink: 0,
          borderRadius: "50%",
          backgroundColor: style.dot
        }}
      />
      {style.label}
    </span>
  );
}
