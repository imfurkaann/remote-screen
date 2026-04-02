import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

type ErrorBody = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  error?: unknown;
  [key: string]: unknown;
};

const DEFAULT_ERROR_CODE = "INTERNAL_SERVER_ERROR";

function getCorrelationId(req: Request): string {
  const headerValue = req.header("x-correlation-id");
  if (headerValue && headerValue.trim().length > 0) {
    return headerValue.trim();
  }
  return randomUUID();
}

function logJson(payload: Record<string, unknown>): void {
  console.log(JSON.stringify(payload));
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeErrorCode(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || DEFAULT_ERROR_CODE;
}

function normalizeErrorPayload(statusCode: number, body: unknown, correlationId?: string): ErrorBody {
  const source = typeof body === "object" && body !== null ? (body as ErrorBody) : {};

  const inferredCode = toStringOrNull(source.code)
    ?? toStringOrNull(source.error)
    ?? (statusCode === 404 ? "NOT_FOUND" : statusCode >= 500 ? DEFAULT_ERROR_CODE : "REQUEST_FAILED");

  const code = normalizeErrorCode(inferredCode);
  const message =
    toStringOrNull(source.message)
    ?? toStringOrNull(source.error)
    ?? (statusCode === 404 ? "Resource not found" : statusCode >= 500 ? "Internal server error" : "Request failed");

  const details = source.details ?? null;

  return {
    code,
    error: code,
    message,
    details,
    correlation_id: correlationId ?? null
  };
}

export function attachCorrelationId(req: Request, res: Response, next: NextFunction): void {
  const correlationId = getCorrelationId(req);
  req.correlationId = correlationId;
  res.setHeader("x-correlation-id", correlationId);
  next();
}

export function requestLogging(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    logJson({
      ts: new Date().toISOString(),
      level: "info",
      type: "http_request",
      correlation_id: req.correlationId,
      method: req.method,
      path: req.originalUrl,
      status_code: res.statusCode,
      duration_ms: durationMs,
      tenant_id: req.auth?.tenantId ?? null,
      actor_id: req.auth?.userId ?? null,
      actor_role: req.auth?.role ?? null,
      user_agent: req.header("user-agent") ?? null,
      ip: req.ip
    });
  });

  next();
}

export function normalizeErrorResponses(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);

  res.json = ((body: unknown) => {
    if (res.statusCode >= 400) {
      const normalized = normalizeErrorPayload(res.statusCode, body, req.correlationId);
      return originalJson(normalized);
    }

    return originalJson(body);
  }) as Response["json"];

  next();
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    code: "NOT_FOUND",
    message: "Route not found"
  });
}

export function globalErrorHandler(error: unknown, req: Request, res: Response, _next: NextFunction): void {
  const statusCode =
    typeof error === "object"
      && error !== null
      && "statusCode" in error
      && typeof (error as { statusCode?: unknown }).statusCode === "number"
      ? Number((error as { statusCode: number }).statusCode)
      : 500;

  const code =
    typeof error === "object"
      && error !== null
      && "code" in error
      && typeof (error as { code?: unknown }).code === "string"
      ? String((error as { code: string }).code)
      : DEFAULT_ERROR_CODE;

  const message =
    error instanceof Error
      ? error.message
      : "Unhandled application error";

  logJson({
    ts: new Date().toISOString(),
    level: "error",
    type: "unhandled_error",
    correlation_id: req.correlationId,
    method: req.method,
    path: req.originalUrl,
    tenant_id: req.auth?.tenantId ?? null,
    actor_id: req.auth?.userId ?? null,
    status_code: statusCode,
    error_code: normalizeErrorCode(code),
    message,
    stack: error instanceof Error ? error.stack ?? null : null
  });

  if (res.headersSent) {
    return;
  }

  res.status(statusCode).json({
    code: normalizeErrorCode(code),
    message
  });
}
