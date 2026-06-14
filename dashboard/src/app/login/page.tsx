"use client";

import { useSearchParams } from "next/navigation";
import { useState, useTransition, Suspense } from "react";

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/screens";
  const urlError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(
    urlError
      ? urlError === "unauthorized_role"
        ? "Bu sayfaya erişim yetkiniz bulunmamaktadır."
        : decodeURIComponent(urlError)
      : ""
  );
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    startTransition(async () => {
      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ email, password, redirect: redirectTo })
        });

        const data = await response.json();
        if (response.ok) {
          window.location.href = data.redirect || redirectTo;
        } else {
          setError(data.error || "Giriş başarısız. Lütfen bilgilerinizi kontrol edin.");
        }
      } catch (err) {
        setError("Sunucuya bağlanılamadı. Lütfen ağ bağlantınızı kontrol edin.");
      }
    });
  };

  return (
    <div className="login-wrapper">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes loginSpin {
          to { transform: rotate(360deg); }
        }
      ` }} />

      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">Uzaktan Ekran Sistemi</div>
          <h1 className="login-title">Giriş Yapın</h1>
          <p className="login-subtitle">Panel yönetimi için oturum açın</p>
        </div>

        {error && (
          <div className="login-error-container">
            <svg style={{ width: 18, height: 18, flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid">
          <div className="login-form-group">
            <label className="login-label" htmlFor="email">E-POSTA ADRESİ</label>
            <input
              id="email"
              type="email"
              className="login-input"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              required
              placeholder="ornek@remotescreen.dev"
              disabled={isPending}
            />
          </div>

          <div className="login-form-group">
            <label className="login-label" htmlFor="password">ŞİFRE</label>
            <input
              id="password"
              type="password"
              className="login-input"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
              required
              placeholder="••••••••"
              disabled={isPending}
            />
          </div>

          <button type="submit" className="login-btn" disabled={isPending}>
            {isPending && (
              <span className="spinner" style={{
                width: 18,
                height: 18,
                border: "2px solid rgba(255, 255, 255, 0.3)",
                borderTopColor: "#ffffff",
                borderRadius: "50%",
                animation: "loginSpin 0.8s linear infinite",
                marginRight: 8
              }} />
            )}
            {isPending ? "Giriş yapılıyor..." : "Giriş Yap"}
          </button>
        </form>


      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="login-wrapper">
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes loginSpin {
            to { transform: rotate(360deg); }
          }
        ` }} />
        <div className="login-card" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 300 }}>
          <div className="spinner" style={{
            width: 32,
            height: 32,
            border: "3px solid rgba(255, 255, 255, 0.1)",
            borderTopColor: "#38bdf8",
            borderRadius: "50%",
            animation: "loginSpin 0.8s linear infinite"
          }} />
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}

