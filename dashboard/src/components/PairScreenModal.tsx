"use client";

import React, { useState } from "react";

interface PairScreenModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (newDeviceId: string) => void;
}

export default function PairScreenModal({ open, onClose, onSuccess }: PairScreenModalProps) {
  const [pairingCode, setPairingCode] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [deviceLocation, setDeviceLocation] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = pairingCode.trim();
    if (!/^[0-9]{6}$/.test(code)) {
      setStatus("error");
      setMessage("Pairing code must be a 6-digit number.");
      return;
    }

    setStatus("loading");
    setMessage(null);

    try {
      // 1. Confirm Pairing
      const confirmRes = await fetch("/api/pairing/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pairingCode: code })
      });

      const confirmPayload = (await confirmRes.json().catch(() => ({}))) as {
        linked?: boolean;
        device_id?: string;
        code?: string;
        message?: string;
      };

      if (!confirmRes.ok) {
        setStatus("error");
        setMessage(confirmPayload.message ?? "Pairing failed. Please check the code.");
        return;
      }

      const deviceId = confirmPayload.device_id;

      // 2. Update Device Details if provided
      if (deviceId && (deviceName.trim() || deviceLocation.trim())) {
        const updatePayload: Record<string, string> = {};
        if (deviceName.trim()) updatePayload.name = deviceName.trim();
        if (deviceLocation.trim()) updatePayload.location = deviceLocation.trim();

        await fetch(`/api/content/devices/${deviceId}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(updatePayload)
        });
      }

      setStatus("success");
      setMessage("Screen successfully paired!");
      setPairingCode("");
      setDeviceName("");
      setDeviceLocation("");

      if (deviceId) {
        onSuccess(deviceId);
      }

      setTimeout(() => {
        onClose();
        setStatus("idle");
        setMessage(null);
      }, 1000);

    } catch (err) {
      setStatus("error");
      setMessage("An unexpected error occurred. Is the backend server running?");
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1100,
      background: "rgba(15, 23, 42, 0.45)",
      display: "flex", alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(4px)",
    }}>
      <div style={{
        background: "#ffffff",
        borderRadius: 12,
        width: "100%",
        maxWidth: 480,
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        border: "1px solid #e2e8f0",
        animation: "fadeIn 0.2s ease-out"
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 24px",
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
            Pair New Screen
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              padding: 4,
              cursor: "pointer",
              color: "#94a3b8",
              display: "flex"
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20, padding: 24 }}>
          {status === "success" && (
            <div style={{
              backgroundColor: "rgba(16, 185, 129, 0.1)",
              border: "1px solid rgba(16, 185, 129, 0.2)",
              borderRadius: 8,
              padding: "12px 16px",
              color: "#10b981",
              fontSize: 14,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 8
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{message}</span>
            </div>
          )}

          {status === "error" && (
            <div style={{
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              borderRadius: 8,
              padding: "12px 16px",
              color: "#ef4444",
              fontSize: 14,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: 8
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{message}</span>
            </div>
          )}

          {/* Pairing Code */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 14, fontWeight: 600, color: "#334155" }}>
              Pairing Code <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              placeholder="123456"
              maxLength={6}
              required
              pattern="[0-9]{6}"
              inputMode="numeric"
              value={pairingCode}
              onChange={(e) => setPairingCode(e.target.value)}
              disabled={status === "loading" || status === "success"}
              style={{
                width: "100%",
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: 4,
                textAlign: "center",
                padding: 12,
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                outline: "none"
              }}
            />
            <span style={{ fontSize: 12, color: "#64748b" }}>
              Enter the 6-digit code shown on your signage screen.
            </span>
          </div>

          {/* Screen Name */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 14, fontWeight: 600, color: "#334155" }}>
              Screen Name
            </label>
            <input
              type="text"
              placeholder="e.g. Conference Room A"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              disabled={status === "loading" || status === "success"}
              style={{
                width: "100%",
                fontSize: 14,
                padding: "10px 12px",
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                backgroundColor: "#ffffff",
                color: "#0f172a",
                outline: "none"
              }}
            />
          </div>

          {/* Location */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 14, fontWeight: 600, color: "#334155" }}>
              Location
            </label>
            <input
              type="text"
              placeholder="e.g. 2nd Floor, West Wing"
              value={deviceLocation}
              onChange={(e) => setDeviceLocation(e.target.value)}
              disabled={status === "loading" || status === "success"}
              style={{
                width: "100%",
                fontSize: 14,
                padding: "10px 12px",
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                backgroundColor: "#ffffff",
                color: "#0f172a",
                outline: "none"
              }}
            />
          </div>

          {/* Actions */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 12,
            marginTop: 12,
            borderTop: "1px solid #e2e8f0",
            paddingTop: 16
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={status === "loading" || status === "success"}
              style={{
                backgroundColor: "#ffffff",
                color: "#334155",
                border: "1px solid #cbd5e1",
                borderRadius: 6,
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={status === "loading" || status === "success"}
              style={{
                backgroundColor: "var(--primary)",
                color: "#ffffff",
                border: "none",
                borderRadius: 6,
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              {status === "loading" ? "Connecting..." : "Pair Screen"}
            </button>
          </div>
        </form>
      </div>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
