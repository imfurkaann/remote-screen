export function useSecureDashboardCookies(): boolean {
  return process.env.SERVER_SCHEME
    ? process.env.SERVER_SCHEME === "https"
    : process.env.DASHBOARD_COOKIE_SECURE === "true";
}
