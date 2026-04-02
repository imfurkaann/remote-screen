import type { NextFunction, Request, Response } from "express";

type JsonBodyValidationOptions = {
  skipPaths?: string[];
};

const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

export function requireObjectJsonBody(options: JsonBodyValidationOptions = {}) {
  const skipPaths = new Set(options.skipPaths ?? []);

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!BODY_METHODS.has(req.method)) {
      next();
      return;
    }

    if (skipPaths.has(req.path) || skipPaths.has(req.originalUrl)) {
      next();
      return;
    }

    if (!req.is("application/json")) {
      res.status(415).json({
        code: "UNSUPPORTED_MEDIA_TYPE",
        message: "Content-Type must be application/json"
      });
      return;
    }

    if (req.body === null || req.body === undefined || typeof req.body !== "object" || Array.isArray(req.body)) {
      res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Request body must be a JSON object"
      });
      return;
    }

    next();
  };
}
