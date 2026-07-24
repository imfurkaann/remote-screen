export type DeviceQueryOptions = {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
};

export function buildDeviceQuery(options: DeviceQueryOptions = {}): URLSearchParams {
  const page = Number.isFinite(options.page) ? Math.max(1, Math.trunc(options.page!)) : 1;
  const limit = Number.isFinite(options.limit) ? Math.min(200, Math.max(1, Math.trunc(options.limit!))) : 100;
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  const search = options.search?.trim().slice(0, 120);
  const status = options.status?.trim();
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  return params;
}