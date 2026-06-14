"use client";

import { useEffect, useState } from "react";

type User = {
  id: string;
  email: string;
  role: "tenant_owner" | "tenant_admin" | "operator" | "viewer";
  displayName: string;
  isActive: boolean;
  createdAt: string | null;
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState<string>("");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Form State
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<User["role"]>("operator");
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Helper to decode JWT token on client
  function decodeToken(token: string) {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const base64Url = parts[1];
      if (!base64Url) return null;
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(atob(base64));
    } catch {
      return null;
    }
  }

  useEffect(() => {
    // Get current user role from cookie (via client side fallback or document.cookie)
    const cookies = typeof document !== "undefined" ? document.cookie.split("; ") : [];
    const tokenCookie = cookies.find((c) => c.startsWith("dashboard_access_token="));
    if (tokenCookie) {
      const token = tokenCookie.split("=")[1];
      if (token) {
        const decoded = decodeToken(token);
        if (decoded && decoded.role) {
          setCurrentUserRole(decoded.role);
        }
      }
    }
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/users");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Kullanıcılar yüklenirken hata oluştu.");
      }
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err: any) {
      setError(err.message || "Beklenmeyen bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  const openCreateModal = () => {
    setModalMode("create");
    setSelectedUser(null);
    setDisplayName("");
    setEmail("");
    setPassword("");
    setRole("operator");
    setIsActive(true);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (user: User) => {
    setModalMode("edit");
    setSelectedUser(user);
    setDisplayName(user.displayName);
    setEmail(user.email);
    setPassword("");
    setRole(user.role);
    setIsActive(user.isActive);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSubmitting(true);

    if (!displayName.trim() || !email.trim()) {
      setFormError("İsim ve e-posta alanları zorunludur.");
      setFormSubmitting(false);
      return;
    }

    if (modalMode === "create" && !password) {
      setFormError("Yeni kullanıcılar için şifre zorunludur.");
      setFormSubmitting(false);
      return;
    }

    try {
      const url = modalMode === "create" ? "/api/users" : `/api/users/${selectedUser?.id}`;
      const method = modalMode === "create" ? "POST" : "PUT";
      
      const payload: Record<string, any> = {
        displayName,
        email,
        role,
        isActive
      };

      if (password) {
        payload.password = password;
      }

      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.message || "Kullanıcı kaydedilirken hata oluştu.");
      }

      setIsModalOpen(false);
      fetchUsers();
    } catch (err: any) {
      setFormError(err.message || "İşlem başarısız oldu.");
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const confirmation = confirm(
      "Bu kullanıcıyı silmek istediğinize emin misiniz?\n\nÖNEMLİ: Bu kullanıcıya zimmetlenmiş tüm ekranlar otomatik olarak sistem sahibine (Tenant Owner) devredilecektir."
    );
    if (!confirmation) return;

    try {
      const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Kullanıcı silinemedi.");
      }
      fetchUsers();
    } catch (err: any) {
      alert(err.message || "Silme işlemi başarısız oldu.");
    }
  };

  const getRoleBadgeStyle = (role: string) => {
    switch (role) {
      case "tenant_owner":
        return { bg: "rgba(245, 158, 11, 0.1)", color: "#f59e0b", label: "Owner" };
      case "tenant_admin":
        return { bg: "rgba(14, 165, 233, 0.1)", color: "#0ea5e9", label: "Admin" };
      case "operator":
        return { bg: "rgba(16, 185, 129, 0.1)", color: "#10b981", label: "Operator" };
      case "viewer":
        return { bg: "rgba(148, 163, 184, 0.1)", color: "#94a3b8", label: "Viewer" };
      default:
        return { bg: "rgba(148, 163, 184, 0.1)", color: "#94a3b8", label: role };
    }
  };

  const filteredUsers = users.filter((u) => {
    const term = search.toLowerCase();
    return (
      u.displayName.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      u.role.toLowerCase().includes(term)
    );
  });

  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.isActive).length;
  const inactiveUsers = totalUsers - activeUsers;

  return (
    <div style={{ padding: "32px", maxWidth: "1200px", margin: "0 auto", width: "100%", color: "#f3f4f6" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 800, margin: 0, color: "#ffffff", letterSpacing: "-0.5px" }}>
            Kullanıcı Yönetimi
          </h1>
          <p style={{ color: "#9ca3af", fontSize: "14px", marginTop: "6px", marginBottom: 0 }}>
            Organizasyonunuzdaki ekip üyelerini, yetkilerini ve erişim izinlerini yönetin.
          </p>
        </div>
        {(currentUserRole === "tenant_owner" || currentUserRole === "tenant_admin") && (
          <button
            onClick={openCreateModal}
            style={{
              background: "#10b981",
              color: "#ffffff",
              fontWeight: 600,
              fontSize: "14px",
              padding: "10px 20px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              boxShadow: "0 4px 12px rgba(16, 185, 129, 0.2)",
              transition: "all 0.2s ease"
            }}
          >
            <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Yeni Kullanıcı
          </button>
        )}
      </div>

      {/* Stats Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px", marginBottom: "32px" }}>
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "12px", padding: "20px 24px" }}>
          <div style={{ fontSize: "12px", color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Toplam Kullanıcı</div>
          <div style={{ fontSize: "28px", fontWeight: 800, color: "#ffffff", marginTop: "4px" }}>{totalUsers}</div>
        </div>
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "12px", padding: "20px 24px" }}>
          <div style={{ fontSize: "12px", color: "#10b981", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Aktif Kullanıcı</div>
          <div style={{ fontSize: "28px", fontWeight: 800, color: "#10b981", marginTop: "4px" }}>{activeUsers}</div>
        </div>
        <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "12px", padding: "20px 24px" }}>
          <div style={{ fontSize: "12px", color: "#ef4444", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Pasif Kullanıcı</div>
          <div style={{ fontSize: "28px", fontWeight: 800, color: "#ef4444", marginTop: "4px" }}>{inactiveUsers}</div>
        </div>
      </div>

      {/* Search & Table Wrapper */}
      <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "16px", padding: "24px", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.3)" }}>
        {/* Search Input */}
        <div style={{ position: "relative", marginBottom: "20px" }}>
          <svg style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#9ca3af", width: "18px", height: "18px" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="İsim, e-posta veya role göre ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 16px 12px 44px",
              background: "#1f2937",
              border: "1px solid #374151",
              color: "#ffffff",
              borderRadius: "10px",
              fontSize: "14px"
            }}
          />
        </div>

        {/* Content Section */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "48px 0", color: "#9ca3af" }}>
            Yükleniyor...
          </div>
        ) : error ? (
          <div style={{ padding: "20px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "8px", color: "#fca5a5" }}>
            {error}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 24px", color: "#9ca3af" }}>
            Kullanıcı bulunamadı.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #1f2937" }}>
                  <th style={{ padding: "14px 12px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>Kullanıcı</th>
                  <th style={{ padding: "14px 12px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>Rol</th>
                  <th style={{ padding: "14px 12px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>Durum</th>
                  <th style={{ padding: "14px 12px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>Kayıt Tarihi</th>
                  <th style={{ padding: "14px 12px", textAlign: "right", fontSize: "11px", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>Eylemler</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const roleBadge = getRoleBadgeStyle(user.role);
                  return (
                    <tr key={user.id} style={{ borderBottom: "1px solid #1f2937" }}>
                      <td style={{ padding: "16px 12px" }}>
                        <div style={{ fontWeight: 700, color: "#ffffff" }}>{user.displayName}</div>
                        <div style={{ fontSize: "12px", color: "#9ca3af", marginTop: "2px" }}>{user.email}</div>
                      </td>
                      <td style={{ padding: "16px 12px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            background: roleBadge.bg,
                            color: roleBadge.color,
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "4px 10px",
                            borderRadius: "999px",
                            textTransform: "uppercase"
                          }}
                        >
                          {roleBadge.label}
                        </span>
                      </td>
                      <td style={{ padding: "16px 12px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            fontSize: "13px",
                            color: user.isActive ? "#10b981" : "#ef4444"
                          }}
                        >
                          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: user.isActive ? "#10b981" : "#ef4444" }} />
                          {user.isActive ? "Aktif" : "Pasif"}
                        </span>
                      </td>
                      <td style={{ padding: "16px 12px", color: "#9ca3af", fontSize: "13px" }}>
                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString("tr-TR") : "-"}
                      </td>
                      <td style={{ padding: "16px 12px", textAlign: "right" }}>
                        {/* Only permit editing/deleting if actor has admin or owner roles, and doesn't target own owner account */}
                        {(currentUserRole === "tenant_owner" || currentUserRole === "tenant_admin") && (
                          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                            <button
                              onClick={() => openEditModal(user)}
                              style={{ background: "#374151", color: "#ffffff", padding: "6px 12px", fontSize: "12px", borderRadius: "6px", border: "none", cursor: "pointer" }}
                            >
                              Düzenle
                            </button>
                            {user.role !== "tenant_owner" && (
                              <button
                                onClick={() => handleDeleteUser(user.id)}
                                style={{ background: "rgba(239, 68, 68, 0.1)", color: "#ef4444", padding: "6px 12px", fontSize: "12px", borderRadius: "6px", border: "1px solid rgba(239, 68, 68, 0.2)", cursor: "pointer" }}
                              >
                                Sil
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Dialog */}
      {isModalOpen && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
          <div style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "16px", width: "100%", maxWidth: "480px", padding: "32px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.4)" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#ffffff", margin: "0 0 20px 0" }}>
              {modalMode === "create" ? "Yeni Kullanıcı Oluştur" : "Kullanıcı Bilgilerini Düzenle"}
            </h2>

            {formError && (
              <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "8px", padding: "12px", color: "#fca5a5", fontSize: "13px", marginBottom: "20px" }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleFormSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>İsim Soyisim</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  style={{ width: "100%", background: "#1f2937", border: "1px solid #374151", color: "#ffffff", borderRadius: "8px", padding: "10px 12px", fontSize: "14px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>E-posta Adresi</label>
                <input
                  type="email"
                  required
                  disabled={modalMode === "edit"}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ width: "100%", background: modalMode === "edit" ? "#111827" : "#1f2937", border: "1px solid #374151", color: modalMode === "edit" ? "#9ca3af" : "#ffffff", borderRadius: "8px", padding: "10px 12px", fontSize: "14px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
                  {modalMode === "create" ? "Şifre" : "Şifreyi Değiştir (İsteğe Bağlı)"}
                </label>
                <input
                  type="password"
                  required={modalMode === "create"}
                  placeholder={modalMode === "edit" ? "Değiştirmek istemiyorsanız boş bırakın" : ""}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ width: "100%", background: "#1f2937", border: "1px solid #374151", color: "#ffffff", borderRadius: "8px", padding: "10px 12px", fontSize: "14px" }}
                />
              </div>

              {selectedUser?.role !== "tenant_owner" && (
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Kullanıcı Rolü</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as User["role"])}
                    style={{ width: "100%", background: "#1f2937", border: "1px solid #374151", color: "#ffffff", borderRadius: "8px", padding: "10px 12px", fontSize: "14px" }}
                  >
                    {currentUserRole === "tenant_owner" && <option value="tenant_admin">Tenant Admin</option>}
                    <option value="operator">Operator</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
              )}

              {selectedUser?.role !== "tenant_owner" && modalMode === "edit" && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px" }}>
                  <input
                    type="checkbox"
                    id="isActiveCheck"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    style={{ cursor: "pointer", width: "16px", height: "16px" }}
                  />
                  <label htmlFor="isActiveCheck" style={{ fontSize: "14px", color: "#ffffff", cursor: "pointer" }}>
                    Hesap Aktif
                  </label>
                </div>
              )}

              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{ background: "#374151", color: "#ffffff", padding: "10px 18px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: 600 }}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  style={{ background: "#10b981", color: "#ffffff", padding: "10px 24px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: 600 }}
                >
                  {formSubmitting ? "Kaydediliyor..." : "Kaydet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
