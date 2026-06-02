"use client";

import { type FormEvent, useState } from "react";

export default function PairScreenPage() {
  const [pairingCode, setPairingCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [linkedDeviceId, setLinkedDeviceId] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = pairingCode.trim();
    if (!/^[0-9]{6}$/.test(code)) {
      setStatus("error");
      setResultMessage("Pairing kodu 6 haneli bir sayı olmalıdır.");
      return;
    }

    setStatus("loading");
    setResultMessage(null);
    setLinkedDeviceId(null);

    try {
      const response = await fetch("/api/pairing/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pairingCode: code })
      });

      const payload = (await response.json().catch(() => ({}))) as {
        linked?: boolean;
        device_id?: string;
        code?: string;
        message?: string;
      };

      if (!response.ok) {
        setStatus("error");
        const reason = payload.code ?? payload.message ?? "Pairing başarısız oldu.";
        setResultMessage(`Hata: ${reason}`);
        return;
      }

      setStatus("ok");
      setLinkedDeviceId(payload.device_id ?? null);
      setResultMessage("Cihaz başarıyla bağlandı.");
      setPairingCode("");
    } catch {
      setStatus("error");
      setResultMessage("Beklenmeyen bir hata oluştu. Backend çalışıyor mu?");
    }
  };

  return (
    <section className="card">
      <h3 style={{ marginTop: 0 }}>Cihaz Eşleştir</h3>
      <p className="muted">
        Android player ekranında görünen 6 haneli kodu girerek cihazı hesabınıza bağlayın.
      </p>

      {status === "ok" ? (
        <div style={{ color: "#16a34a", marginTop: 8, marginBottom: 8 }}>
          <strong>✅ Cihaz başarıyla bağlandı.</strong>
          {linkedDeviceId ? (
            <div style={{ marginTop: 4, fontSize: "0.85em" }}>
              Device ID: <code>{linkedDeviceId}</code>
            </div>
          ) : null}
        </div>
      ) : null}

      {status === "error" ? (
        <p style={{ color: "#dc2626", marginTop: 8 }}>{resultMessage}</p>
      ) : null}

      <form className="grid" onSubmit={handleSubmit} style={{ maxWidth: 420 }}>
        <label className="grid">
          Pairing Kodu
          <input
            autoComplete="off"
            inputMode="numeric"
            maxLength={6}
            name="pairingCode"
            pattern="[0-9]{6}"
            placeholder="123456"
            required
            value={pairingCode}
            onChange={(e) => setPairingCode(e.target.value)}
          />
        </label>
        <button type="submit" disabled={status === "loading"}>
          {status === "loading" ? "Bağlanıyor..." : "Cihazı Bağla"}
        </button>
      </form>

      <small style={{ marginTop: 12, display: "block" }}>
        Kod Android cihazda 5 dakika geçerlilidir. Süresi dolarsa cihaz otomatik yeni kod üretir.
      </small>
    </section>
  );
}
