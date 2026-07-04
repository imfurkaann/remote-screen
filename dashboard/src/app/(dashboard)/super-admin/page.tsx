"use client";

import React, { useEffect, useState } from "react";

type TenantItem = {
  _id: string;
  name: string;
  isActive: boolean;
  createdAt?: string;
};

type UserItem = {
  id: string;
  tenantId: string;
  email: string;
  role: string;
  displayName: string;
  isActive: boolean;
  createdAt?: string;
};

type DeviceItem = {
  _id: string;
  tenantId: string;
  hardwareId: string;
  name?: string | null;
  location?: string | null;
  status: string;
};

type StatsData = {
  totalTenants: number;
  totalUsers: number;
  totalDevices: number;
  onlineDevices: number;
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <button
      onClick={handleCopy}
      title="ID Kopyala"
      style={{
        marginLeft: "6px",
        verticalAlign: "middle",
        background: "none",
        border: "none",
        padding: "4px",
        cursor: "pointer",
        color: "#94a3b8",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "4px",
        transition: "all 0.15s ease",
        height: "22px",
        width: "22px"
      }}
      type="button"
    >
      {copied ? (
        <svg style={{ width: 13, height: 13, color: "#10b981" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg style={{ width: 13, height: 13 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
        </svg>
      )}
    </button>
  );
}

export default function SuperAdminPage() {
  const [activeTab, setActiveTab] = useState<"stats" | "tenants" | "users" | "devices">("stats");
  const [stats, setStats] = useState<StatsData | null>(null);
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tenant Modal State
  const [isTenantModalOpen, setIsTenantModalOpen] = useState(false);
  const [tenantName, setTenantName] = useState("");
  const [tenantSaving, setTenantSaving] = useState(false);

  // User Modal State
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userRole, setUserRole] = useState("tenant_owner");
  const [userDisplayName, setUserDisplayName] = useState("");
  const [userTenantId, setUserTenantId] = useState("");
  const [userSaving, setUserSaving] = useState(false);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/super/stats");
      if (!res.ok) throw new Error("İstatistikler alınamadı");
      const data = await res.json();
      setStats(data.stats);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchTenants = async () => {
    try {
      const res = await fetch("/api/super/tenants");
      if (!res.ok) throw new Error("Kiracılar listesi alınamadı");
      const data = await res.json();
      setTenants(data.tenants || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/super/users");
      if (!res.ok) throw new Error("Kullanıcılar listesi alınamadı");
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchDevices = async () => {
    try {
      const res = await fetch("/api/super/devices");
      if (!res.ok) throw new Error("Ekranlar listesi alınamadı");
      const data = await res.json();
      setDevices(data.devices || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    await Promise.all([fetchStats(), fetchTenants(), fetchUsers(), fetchDevices()]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantName.trim()) return;

    setTenantSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/super/tenants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: tenantName.trim() })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Kiracı oluşturulamadı");
      }
      setTenantName("");
      setIsTenantModalOpen(false);
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTenantSaving(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userEmail.trim() || !userPassword || !userRole || !userDisplayName.trim() || !userTenantId) {
      setError("Lütfen tüm zorunlu alanları doldurun.");
      return;
    }

    setUserSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/super/tenants/${userTenantId}/users`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: userEmail.trim(),
          password: userPassword,
          role: userRole,
          displayName: userDisplayName.trim()
        })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Kullanıcı oluşturulamadı");
      }
      setUserEmail("");
      setUserPassword("");
      setUserDisplayName("");
      setIsUserModalOpen(false);
      await loadAll();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUserSaving(false);
    }
  };

  return (
    <div style={{ padding: "40px", maxWidth: "1200px", margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={{ fontSize: "32px", fontWeight: 800, letterSpacing: "-0.75px", margin: 0, color: "#0f172a" }}>
            Sistem Yönetim Paneli
          </h1>
          <p style={{ color: "#64748b", fontSize: "15px", marginTop: "6px", margin: 0 }}>
            Tüm kiracıları, kullanıcıları, ekranları ve küresel istatistikleri izleyin ve yönetin.
          </p>
        </div>
        <button
          onClick={loadAll}
          style={{
            backgroundColor: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "10px",
            color: "#334155",
            padding: "10px 20px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            transition: "all 0.2s"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "#f8fafc";
            e.currentTarget.style.borderColor = "#cbd5e1";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "#ffffff";
            e.currentTarget.style.borderColor = "#e2e8f0";
            e.currentTarget.style.transform = "none";
          }}
        >
          <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89H18v3" />
          </svg>
          Yenile
        </button>
      </div>

      {error && (
        <div style={{
          backgroundColor: "rgba(239, 68, 68, 0.05)",
          border: "1px solid rgba(239, 68, 68, 0.2)",
          borderRadius: "10px",
          color: "#dc2626",
          padding: "14px 20px",
          marginBottom: "28px",
          fontSize: "14px",
          display: "flex",
          alignItems: "center",
          gap: "8px"
        }}>
          <svg style={{ width: 18, height: 18, flexShrink: 0 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {error}
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{
        display: "flex",
        gap: "4px",
        borderBottom: "1px solid #e2e8f0",
        marginBottom: "32px",
        paddingBottom: "1px",
        overflowX: "auto"
      }}>
        {(["stats", "tenants", "users", "devices"] as const).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: "none",
                border: "none",
                borderBottom: isActive ? "3px solid #10b981" : "3px solid transparent",
                color: isActive ? "#0f172a" : "#64748b",
                padding: "12px 20px",
                fontSize: "15px",
                fontWeight: isActive ? 700 : 500,
                cursor: "pointer",
                transition: "all 0.15s ease",
                marginBottom: "-2px",
                whiteSpace: "nowrap"
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.color = "#0f172a";
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.color = "#64748b";
              }}
            >
              {tab === "stats" ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                  <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
                  </svg>
                  Genel Bakış
                </span>
              ) : tab === "tenants" ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                  <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  Kiracılar (Tenants)
                </span>
              ) : tab === "users" ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                  <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  Kullanıcılar
                </span>
              ) : (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                  <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Tüm Ekranlar
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: "16px" }}>
          <div className="spinner" style={{
            width: "40px",
            height: "40px",
            border: "3px solid rgba(16, 185, 129, 0.1)",
            borderTopColor: "#10b981",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite"
          }} />
          <span style={{ fontSize: "14px", color: "#64748b", fontWeight: 500 }}>Veriler yükleniyor...</span>
        </div>
      ) : (
        <div style={{ animation: "fadeIn 0.3s ease-out" }}>
          {/* Tab 1: Stats */}
          {activeTab === "stats" && stats && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "24px" }}>
              {/* Stat Card 1 */}
              <div
                style={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "16px",
                  padding: "24px",
                  boxShadow: "0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.01)",
                  display: "flex",
                  alignItems: "center",
                  gap: "20px",
                  transition: "all 0.2s"
                }}
                className="stat-card"
              >
                <div style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "12px",
                  backgroundColor: "rgba(99, 102, 241, 0.1)",
                  color: "#6366f1",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}>
                  <svg style={{ width: 24, height: 24 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: "13px", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Toplam Kiracı</div>
                  <div style={{ fontSize: "32px", fontWeight: 800, color: "#0f172a", marginTop: "4px" }}>{stats.totalTenants}</div>
                </div>
              </div>

              {/* Stat Card 2 */}
              <div
                style={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "16px",
                  padding: "24px",
                  boxShadow: "0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.01)",
                  display: "flex",
                  alignItems: "center",
                  gap: "20px",
                  transition: "all 0.2s"
                }}
                className="stat-card"
              >
                <div style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "12px",
                  backgroundColor: "rgba(59, 130, 246, 0.1)",
                  color: "#3b82f6",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}>
                  <svg style={{ width: 24, height: 24 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: "13px", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Toplam Kullanıcı</div>
                  <div style={{ fontSize: "32px", fontWeight: 800, color: "#0f172a", marginTop: "4px" }}>{stats.totalUsers}</div>
                </div>
              </div>

              {/* Stat Card 3 */}
              <div
                style={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "16px",
                  padding: "24px",
                  boxShadow: "0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.01)",
                  display: "flex",
                  alignItems: "center",
                  gap: "20px",
                  transition: "all 0.2s"
                }}
                className="stat-card"
              >
                <div style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "12px",
                  backgroundColor: "rgba(107, 114, 128, 0.1)",
                  color: "#4b5563",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}>
                  <svg style={{ width: 24, height: 24 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: "13px", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Toplam Ekran</div>
                  <div style={{ fontSize: "32px", fontWeight: 800, color: "#0f172a", marginTop: "4px" }}>{stats.totalDevices}</div>
                </div>
              </div>

              {/* Stat Card 4 */}
              <div
                style={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "16px",
                  padding: "24px",
                  boxShadow: "0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.01)",
                  display: "flex",
                  alignItems: "center",
                  gap: "20px",
                  transition: "all 0.2s"
                }}
                className="stat-card"
              >
                <div style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "12px",
                  backgroundColor: "rgba(16, 185, 129, 0.1)",
                  color: "#10b981",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}>
                  <svg style={{ width: 24, height: 24 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: "13px", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Aktif Ekran</div>
                  <div style={{ fontSize: "32px", fontWeight: 800, color: "#10b981", marginTop: "4px" }}>{stats.onlineDevices}</div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Tenants */}
          {activeTab === "tenants" && (
            <div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "20px" }}>
                <button
                  onClick={() => setIsTenantModalOpen(true)}
                  style={{
                    backgroundColor: "#10b981",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 18px",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: "pointer",
                    boxShadow: "0 2px 4px rgba(16, 185, 129, 0.2)",
                    transition: "all 0.15s"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#059669"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#10b981"}
                >
                  Yeni Kiracı Ekle
                </button>
              </div>

              <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.02)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e2e8f0", backgroundColor: "#f8fafc" }}>
                      <th style={{ padding: "16px", color: "#475569", fontSize: "13px", fontWeight: 700 }}>KİRACI ADI</th>
                      <th style={{ padding: "16px", color: "#475569", fontSize: "13px", fontWeight: 700 }}>ID / UUID</th>
                      <th style={{ padding: "16px", color: "#475569", fontSize: "13px", fontWeight: 700 }}>DURUM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.length === 0 ? (
                      <tr>
                        <td colSpan={3} style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>
                          Kayıtlı kiracı bulunmamaktadır.
                        </td>
                      </tr>
                    ) : (
                      tenants.map((t) => (
                        <tr key={t._id} className="table-row" style={{ borderBottom: "1px solid #e2e8f0", transition: "background-color 0.15s" }}>
                          <td style={{ padding: "16px", fontWeight: 600, color: "#0f172a" }}>{t.name}</td>
                          <td style={{ padding: "16px", fontFamily: "monospace", color: "#64748b", fontSize: "13px" }}>
                            {t._id}
                            <CopyButton text={t._id} />
                          </td>
                          <td style={{ padding: "16px" }}>
                            <span style={{
                              backgroundColor: t.isActive ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                              color: t.isActive ? "#10b981" : "#ef4444",
                              padding: "4px 10px",
                              borderRadius: "20px",
                              fontSize: "12px",
                              fontWeight: 600,
                              border: t.isActive ? "1px solid rgba(16, 185, 129, 0.15)" : "1px solid rgba(239, 68, 68, 0.15)"
                            }}>
                              {t.isActive ? "Aktif" : "Pasif"}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 3: Users */}
          {activeTab === "users" && (
            <div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "20px" }}>
                <button
                  onClick={() => {
                    if (tenants.length === 0) {
                      setError("Önce bir kiracı oluşturmanız gerekmektedir.");
                      return;
                    }
                    setUserTenantId(tenants[0]?._id || "");
                    setIsUserModalOpen(true);
                  }}
                  style={{
                    backgroundColor: "#10b981",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 18px",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor: "pointer",
                    boxShadow: "0 2px 4px rgba(16, 185, 129, 0.2)",
                    transition: "all 0.15s"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#059669"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#10b981"}
                >
                  Yeni Kullanıcı Ekle
                </button>
              </div>

              <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.02)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e2e8f0", backgroundColor: "#f8fafc" }}>
                      <th style={{ padding: "16px", color: "#475569", fontSize: "13px", fontWeight: 700 }}>KULLANICI</th>
                      <th style={{ padding: "16px", color: "#475569", fontSize: "13px", fontWeight: 700 }}>KİRACI ID</th>
                      <th style={{ padding: "16px", color: "#475569", fontSize: "13px", fontWeight: 700 }}>ROL</th>
                      <th style={{ padding: "16px", color: "#475569", fontSize: "13px", fontWeight: 700 }}>DURUM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>
                          Kayıtlı kullanıcı bulunmamaktadır.
                        </td>
                      </tr>
                    ) : (
                      users.map((u) => {
                        let roleBg = "rgba(100, 116, 139, 0.1)";
                        let roleColor = "#64748b";
                        if (u.role === "super_admin") { roleBg = "rgba(16, 185, 129, 0.1)"; roleColor = "#10b981"; }
                        else if (u.role === "tenant_owner") { roleBg = "rgba(245, 158, 11, 0.1)"; roleColor = "#d97706"; }
                        else if (u.role === "tenant_admin") { roleBg = "rgba(59, 130, 246, 0.1)"; roleColor = "#2563eb"; }
                        
                        return (
                          <tr key={u.id} className="table-row" style={{ borderBottom: "1px solid #e2e8f0", transition: "background-color 0.15s" }}>
                            <td style={{ padding: "16px" }}>
                              <div style={{ fontWeight: 600, color: "#0f172a" }}>{u.displayName}</div>
                              <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>{u.email}</div>
                            </td>
                            <td style={{ padding: "16px", fontFamily: "monospace", color: "#64748b", fontSize: "13px" }}>
                              {u.tenantId}
                              <CopyButton text={u.tenantId} />
                            </td>
                            <td style={{ padding: "16px" }}>
                              <span style={{
                                backgroundColor: roleBg,
                                color: roleColor,
                                padding: "4px 8px",
                                borderRadius: "6px",
                                fontSize: "12px",
                                fontWeight: 600,
                                textTransform: "capitalize"
                              }}>
                                {u.role.replace("_", " ")}
                              </span>
                            </td>
                            <td style={{ padding: "16px" }}>
                              <span style={{
                                backgroundColor: u.isActive ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                                color: u.isActive ? "#10b981" : "#ef4444",
                                padding: "4px 10px",
                                borderRadius: "20px",
                                fontSize: "12px",
                                fontWeight: 600,
                                border: u.isActive ? "1px solid rgba(16, 185, 129, 0.15)" : "1px solid rgba(239, 68, 68, 0.15)"
                              }}>
                                {u.isActive ? "Aktif" : "Pasif"}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 4: Devices */}
          {activeTab === "devices" && (
            <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.02)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e2e8f0", backgroundColor: "#f8fafc" }}>
                    <th style={{ padding: "16px", color: "#475569", fontSize: "13px", fontWeight: 700 }}>CİHAZ ADI</th>
                    <th style={{ padding: "16px", color: "#475569", fontSize: "13px", fontWeight: 700 }}>DONANIM ID</th>
                    <th style={{ padding: "16px", color: "#475569", fontSize: "13px", fontWeight: 700 }}>KİRACI ID</th>
                    <th style={{ padding: "16px", color: "#475569", fontSize: "13px", fontWeight: 700 }}>DURUM</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ padding: "32px", textAlign: "center", color: "#64748b" }}>
                        Kayıtlı ekran bulunmamaktadır.
                      </td>
                    </tr>
                  ) : (
                    devices.map((d) => (
                      <tr key={d._id} className="table-row" style={{ borderBottom: "1px solid #e2e8f0", transition: "background-color 0.15s" }}>
                        <td style={{ padding: "16px", fontWeight: 600, color: "#0f172a" }}>
                          {d.name || "İsimsiz Ekran"}
                          {d.location && (
                            <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 400, marginTop: "2px" }}>
                              Konum: {d.location}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "16px", fontFamily: "monospace", color: "#64748b", fontSize: "13px" }}>
                          {d.hardwareId}
                          <CopyButton text={d.hardwareId} />
                        </td>
                        <td style={{ padding: "16px", fontFamily: "monospace", color: "#64748b", fontSize: "13px" }}>
                          {d.tenantId}
                          <CopyButton text={d.tenantId} />
                        </td>
                        <td style={{ padding: "16px" }}>
                          <span style={{
                            backgroundColor: d.status === "online" ? "rgba(16, 185, 129, 0.1)" : "rgba(100, 116, 139, 0.1)",
                            color: d.status === "online" ? "#10b981" : "#64748b",
                            padding: "4px 10px",
                            borderRadius: "20px",
                            fontSize: "12px",
                            fontWeight: 600,
                            border: d.status === "online" ? "1px solid rgba(16, 185, 129, 0.15)" : "1px solid rgba(100, 116, 139, 0.15)"
                          }}>
                            {d.status === "online" ? "Online" : "Offline"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tenant Modal */}
      {isTenantModalOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(15, 23, 42, 0.4)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
          padding: "20px",
          animation: "modalFadeIn 0.2s ease-out"
        }}>
          <div style={{
            backgroundColor: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "16px",
            width: "100%",
            maxWidth: "480px",
            padding: "28px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
          }}>
            <h2 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "8px", color: "#0f172a", marginTop: 0 }}>
              Yeni Kiracı (Tenant) Oluştur
            </h2>
            <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "20px", marginTop: 0 }}>
              Sistemde izole çalışacak yeni bir organizasyon veya kiracı hesabı açın.
            </p>
            <form onSubmit={handleCreateTenant}>
              <div style={{ marginBottom: "24px" }}>
                <label style={{ display: "block", fontSize: "12px", color: "#475569", fontWeight: 700, marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  KİRACI ADI
                </label>
                <input
                  type="text"
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  placeholder="Örn: ScreenCloud A.Ş."
                  required
                  style={{
                    width: "100%",
                    backgroundColor: "#ffffff",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    color: "#0f172a",
                    padding: "12px 14px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                    outline: "none"
                  }}
                  className="modal-input"
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                <button
                  type="button"
                  onClick={() => setIsTenantModalOpen(false)}
                  style={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #cbd5e1",
                    color: "#475569",
                    borderRadius: "8px",
                    padding: "10px 18px",
                    fontWeight: 600,
                    fontSize: "14px",
                    cursor: "pointer"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f8fafc"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#ffffff"}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={tenantSaving}
                  style={{
                    backgroundColor: "#10b981",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 18px",
                    fontWeight: 600,
                    fontSize: "14px",
                    cursor: "pointer",
                    boxShadow: "0 2px 4px rgba(16, 185, 129, 0.2)"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#059669"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#10b981"}
                >
                  {tenantSaving ? "Kaydediliyor..." : "Kiracı Oluştur"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Modal */}
      {isUserModalOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(15, 23, 42, 0.4)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
          padding: "20px",
          animation: "modalFadeIn 0.2s ease-out"
        }}>
          <div style={{
            backgroundColor: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "16px",
            width: "100%",
            maxWidth: "480px",
            padding: "28px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
          }}>
            <h2 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "8px", color: "#0f172a", marginTop: 0 }}>
              Yeni Kiracı Kullanıcısı Ekle
            </h2>
            <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "20px", marginTop: 0 }}>
              Seçilen kiracı organizasyonuna atanmış yeni bir çalışan hesabı tanımlayın.
            </p>
            <form onSubmit={handleCreateUser}>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", color: "#475569", fontWeight: 700, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  KİRACI SEÇİN
                </label>
                <select
                  value={userTenantId}
                  onChange={(e) => setUserTenantId(e.target.value)}
                  style={{
                    width: "100%",
                    backgroundColor: "#ffffff",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    color: "#0f172a",
                    padding: "12px 14px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                    outline: "none"
                  }}
                >
                  {tenants.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name} ({t._id.substring(0, 8)})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", color: "#475569", fontWeight: 700, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  KULLANICI GÖRÜNEN ADI
                </label>
                <input
                  type="text"
                  value={userDisplayName}
                  onChange={(e) => setUserDisplayName(e.target.value)}
                  placeholder="Örn: Ahmet Yılmaz"
                  required
                  style={{
                    width: "100%",
                    backgroundColor: "#ffffff",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    color: "#0f172a",
                    padding: "12px 14px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                    outline: "none"
                  }}
                  className="modal-input"
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", color: "#475569", fontWeight: 700, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  E-POSTA ADRESİ
                </label>
                <input
                  type="email"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="ahmet@sirket.com"
                  required
                  style={{
                    width: "100%",
                    backgroundColor: "#ffffff",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    color: "#0f172a",
                    padding: "12px 14px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                    outline: "none"
                  }}
                  className="modal-input"
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", color: "#475569", fontWeight: 700, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  ŞİFRE
                </label>
                <input
                  type="password"
                  value={userPassword}
                  onChange={(e) => setUserPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{
                    width: "100%",
                    backgroundColor: "#ffffff",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    color: "#0f172a",
                    padding: "12px 14px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                    outline: "none"
                  }}
                  className="modal-input"
                />
              </div>

              <div style={{ marginBottom: "24px" }}>
                <label style={{ display: "block", fontSize: "12px", color: "#475569", fontWeight: 700, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  ROL
                </label>
                <select
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value)}
                  style={{
                    width: "100%",
                    backgroundColor: "#ffffff",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    color: "#0f172a",
                    padding: "12px 14px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                    outline: "none"
                  }}
                >
                  <option value="tenant_owner">Tenant Owner (Kiracı Sahibi - Tam Yetkili)</option>
                  <option value="tenant_admin">Tenant Admin (Kiracı Yöneticisi)</option>
                  <option value="operator">Operator (Operatör)</option>
                  <option value="viewer">Viewer (Sadece İzleyici)</option>
                </select>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  style={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #cbd5e1",
                    color: "#475569",
                    borderRadius: "8px",
                    padding: "10px 18px",
                    fontWeight: 600,
                    fontSize: "14px",
                    cursor: "pointer"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f8fafc"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#ffffff"}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={userSaving}
                  style={{
                    backgroundColor: "#10b981",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 18px",
                    fontWeight: 600,
                    fontSize: "14px",
                    cursor: "pointer",
                    boxShadow: "0 2px 4px rgba(16, 185, 129, 0.2)"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#059669"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#10b981"}
                >
                  {userSaving ? "Kaydediliyor..." : "Kullanıcı Ekle"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Embedded Animations and CSS resets */}
      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes modalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.02) !important;
          border-color: #cbd5e1 !important;
        }
        .table-row:hover {
          background-color: rgba(16, 185, 129, 0.015) !important;
        }
        .modal-input:focus {
          border-color: #10b981 !important;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15) !important;
        }
      `}</style>
    </div>
  );
}
