export function useSecureDashboardCookies(): boolean {
  return process.env.DASHBOARD_COOKIE_SECURE === "true";
}
