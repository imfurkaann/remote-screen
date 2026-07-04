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

type Device = {
  id: string;
  status: string;
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
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

  useEffect(() => {
    async function fetchMe() {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          if (data && data.role) {
            setCurrentUserRole(data.role);
          }
        }
      } catch (err) {
        console.error("Failed to fetch user role", err);
      }
    }
    fetchMe();
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchUsers(), fetchDevices()]);
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchUsers() {
    const res = await fetch("/api/users");
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Failed to fetch users list.");
    }
    const data = await res.json();
    setUsers(data.users || []);
  }

  async function fetchDevices() {
    const res = await fetch("/api/content/devices");
    if (res.ok) {
      const data = await res.json();
      setDevices(data.devices || []);
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
      setFormError("Name and email are required fields.");
      setFormSubmitting(false);
      return;
    }

    if (modalMode === "create" && !password) {
      setFormError("Password is required for new accounts.");
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
        throw new Error(data.message || "Failed to save user details.");
      }

      setIsModalOpen(false);
      loadData();
    } catch (err: any) {
      setFormError(err.message || "An error occurred.");
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const confirmation = confirm(
      "Are you sure you want to delete this user?\n\nAll screens assigned to this user will be returned to the Tenant Owner."
    );
    if (!confirmation) return;

    try {
      const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to delete user.");
      }
      loadData();
    } catch (err: any) {
      alert(err.message || "Deletion failed.");
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "tenant_owner":
        return "Tenant Owner";
      case "tenant_admin":
        return "Admin";
      case "operator":
        return "Operator";
      case "viewer":
        return "Viewer";
      default:
        return role;
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

  // Calculate top statistics
  const activeScreensCount = devices.filter((d) => d.status === "online").length;
  const passiveScreensCount = devices.length - activeScreensCount;
  const registeredUsersCount = users.length;

  return (
    <div style={{ padding: "32px 40px", maxWidth: "1200px", margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
      {/* Header Section */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, margin: 0, color: "#0f172a", letterSpacing: "-0.5px" }}>
            Users
          </h1>
          <p style={{ color: "#64748b", fontSize: "14px", marginTop: "4px", margin: 0 }}>
            Manage your organization's team members and system permissions.
          </p>
        </div>
        {(currentUserRole === "tenant_owner" || currentUserRole === "tenant_admin") && (
          <button
            onClick={openCreateModal}
            style={{
              background: "var(--primary, #10b981)",
              color: "#ffffff",
              fontWeight: 600,
              fontSize: "13px",
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s ease"
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#059669"}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "var(--primary, #10b981)"}
          >
            Add User
          </button>
        )}
      </div>

      {/* Counters / Stats Section */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "20px", marginBottom: "24px" }}>
        <div style={{
          backgroundColor: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          padding: "16px 20px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          transition: "transform 0.15s ease"
        }} className="stat-card">
          <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Active Screens</span>
          <span style={{ fontSize: "24px", fontWeight: 800, color: "#10b981" }}>{activeScreensCount}</span>
        </div>
        <div style={{
          backgroundColor: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          padding: "16px 20px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          transition: "transform 0.15s ease"
        }} className="stat-card">
          <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Inactive Screens</span>
          <span style={{ fontSize: "24px", fontWeight: 800, color: "#64748b" }}>{passiveScreensCount}</span>
        </div>
        <div style={{
          backgroundColor: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          padding: "16px 20px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          transition: "transform 0.15s ease"
        }} className="stat-card">
          <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Registered Users</span>
          <span style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a" }}>{registeredUsersCount}</span>
        </div>
      </div>

      {/* Main Container */}
      <div style={{
        backgroundColor: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "12px",
        padding: "20px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
      }}>
        {/* Search */}
        <div style={{ position: "relative", marginBottom: "16px" }}>
          <svg style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8", width: "16px", height: "16px", pointerEvents: "none" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px 8px 36px",
              background: "#f8fafc",
              border: "1px solid #cbd5e1",
              color: "#0f172a",
              borderRadius: "8px",
              fontSize: "13px",
              boxSizing: "border-box",
              outline: "none"
            }}
            className="search-input"
          />
        </div>

        {error && (
          <div style={{ padding: "12px", background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.15)", borderRadius: "8px", color: "#dc2626", fontSize: "13px", marginBottom: "16px" }}>
            {error}
          </div>
        )}

        {/* Users Table */}
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "40px 0", gap: "8px", color: "#64748b", fontSize: "13px" }}>
            <div className="spinner" style={{
              width: "18px",
              height: "18px",
              border: "2px solid rgba(16, 185, 129, 0.1)",
              borderTopColor: "var(--primary, #10b981)",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite"
            }} />
            Loading...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#64748b", fontSize: "13px" }}>
            No users found.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <th style={{ padding: "12px 8px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", fontSize: "11px", letterSpacing: "0.5px", width: "40%" }}>USER</th>
                  <th style={{ padding: "12px 8px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", fontSize: "11px", letterSpacing: "0.5px", width: "30%" }}>EMAIL</th>
                  <th style={{ padding: "12px 8px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", fontSize: "11px", letterSpacing: "0.5px", width: "15%" }}>ROLE</th>
                  <th style={{ padding: "12px 8px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", fontSize: "11px", letterSpacing: "0.5px", textAlign: "right", width: "15%" }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="table-row" style={{ borderBottom: "1px solid #f1f5f9", transition: "all 0.15s" }}>
                    {/* User display name and active dot */}
                    <td style={{ padding: "14px 8px", fontWeight: 600, color: "#0f172a" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span
                          style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            backgroundColor: user.isActive ? "var(--primary, #10b981)" : "#cbd5e1",
                            display: "inline-block"
                          }}
                          title={user.isActive ? "Active" : "Inactive"}
                        />
                        {user.displayName}
                      </div>
                    </td>
                    
                    {/* Email */}
                    <td style={{ padding: "14px 8px", color: "#475569" }}>
                      {user.email}
                    </td>

                    {/* Role */}
                    <td style={{ padding: "14px 8px", color: "#64748b", fontWeight: 500 }}>
                      {getRoleLabel(user.role)}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: "14px 8px", textAlign: "right" }}>
                      {(currentUserRole === "tenant_owner" || currentUserRole === "tenant_admin") && (
                        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                          <button
                            onClick={() => openEditModal(user)}
                            style={{
                              backgroundColor: "#f1f5f9",
                              color: "#475569",
                              fontWeight: 600,
                              fontSize: "12px",
                              padding: "5px 12px",
                              border: "none",
                              borderRadius: "6px",
                              cursor: "pointer",
                              transition: "all 0.15s"
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#e2e8f0"}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#f1f5f9"}
                          >
                            Edit
                          </button>
                          {user.role !== "tenant_owner" && (
                            <button
                              onClick={() => handleDeleteUser(user.id)}
                              style={{
                                backgroundColor: "rgba(239, 68, 68, 0.08)",
                                color: "#ef4444",
                                fontWeight: 600,
                                fontSize: "12px",
                                padding: "5px 12px",
                                border: "none",
                                borderRadius: "6px",
                                cursor: "pointer",
                                transition: "all 0.15s"
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.15)"}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.08)"}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Dialog */}
      {isModalOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.3)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: "20px",
          animation: "modalFadeIn 0.15s ease-out"
        }}>
          <div style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            width: "100%",
            maxWidth: "440px",
            padding: "24px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 10px 10px -5px rgba(0, 0, 0, 0.02)"
          }}>
            <h2 style={{ fontSize: "17px", fontWeight: 700, color: "#0f172a", margin: "0 0 16px 0" }}>
              {modalMode === "create" ? "Add New User" : "Edit User Details"}
            </h2>

            {formError && (
              <div style={{ background: "rgba(239, 68, 68, 0.05)", border: "1px solid rgba(239, 68, 68, 0.15)", borderRadius: "6px", padding: "10px", color: "#dc2626", fontSize: "12px", marginBottom: "16px" }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleFormSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>Display Name</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. John Doe"
                  style={{
                    width: "100%",
                    background: "#ffffff",
                    border: "1px solid #cbd5e1",
                    color: "#0f172a",
                    borderRadius: "6px",
                    padding: "8px 10px",
                    fontSize: "13px",
                    boxSizing: "border-box",
                    outline: "none"
                  }}
                  className="modal-input"
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>Email Address</label>
                <input
                  type="email"
                  required
                  disabled={modalMode === "edit"}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  style={{
                    width: "100%",
                    background: modalMode === "edit" ? "#f8fafc" : "#ffffff",
                    border: "1px solid #cbd5e1",
                    color: modalMode === "edit" ? "#64748b" : "#0f172a",
                    borderRadius: "6px",
                    padding: "8px 10px",
                    fontSize: "13px",
                    boxSizing: "border-box",
                    outline: "none"
                  }}
                  className={modalMode === "edit" ? "" : "modal-input"}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                  {modalMode === "create" ? "Password" : "Change Password (Optional)"}
                </label>
                <input
                  type="password"
                  required={modalMode === "create"}
                  placeholder={modalMode === "edit" ? "Leave blank to keep current password" : "••••••••"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    width: "100%",
                    background: "#ffffff",
                    border: "1px solid #cbd5e1",
                    color: "#0f172a",
                    borderRadius: "6px",
                    padding: "8px 10px",
                    fontSize: "13px",
                    boxSizing: "border-box",
                    outline: "none"
                  }}
                  className="modal-input"
                />
              </div>

              {selectedUser?.role !== "tenant_owner" && (
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>User Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as User["role"])}
                    style={{
                      width: "100%",
                      background: "#ffffff",
                      border: "1px solid #cbd5e1",
                      color: "#0f172a",
                      borderRadius: "6px",
                      padding: "8px 10px",
                      fontSize: "13px",
                      boxSizing: "border-box",
                      outline: "none"
                    }}
                  >
                    {currentUserRole === "tenant_owner" && <option value="tenant_admin">Admin</option>}
                    <option value="operator">Operator</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </div>
              )}

              {selectedUser?.role !== "tenant_owner" && modalMode === "edit" && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                  <input
                    type="checkbox"
                    id="isActiveCheck"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    style={{ cursor: "pointer", width: "15px", height: "15px", accentColor: "var(--primary, #10b981)" }}
                  />
                  <label htmlFor="isActiveCheck" style={{ fontSize: "13px", color: "#334155", cursor: "pointer", fontWeight: 600 }}>
                    Account Active
                  </label>
                </div>
              )}

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    background: "#ffffff",
                    border: "1px solid #cbd5e1",
                    color: "#475569",
                    padding: "8px 16px",
                    borderRadius: "6px",
                    fontWeight: 600,
                    fontSize: "13px",
                    cursor: "pointer"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f8fafc"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#ffffff"}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  style={{
                    background: "var(--primary, #10b981)",
                    color: "#ffffff",
                    padding: "8px 20px",
                    borderRadius: "6px",
                    border: "none",
                    cursor: "pointer",
                    fontWeight: 600,
                    fontSize: "13px"
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#059669"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "var(--primary, #10b981)"}
                >
                  {formSubmitting ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Embedded Animations and CSS overrides */}
      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes modalFadeIn {
          from { opacity: 0; transform: scale(0.97); }
          to { opacity: 1; transform: scale(1); }
        }
        .table-row:hover {
          background-color: #f8fafc !important;
        }
        .stat-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.04) !important;
          border-color: #cbd5e1 !important;
        }
        .search-input:focus, .modal-input:focus {
          border-color: var(--primary, #10b981) !important;
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15) !important;
        }
      `}</style>
    </div>
  );
}
