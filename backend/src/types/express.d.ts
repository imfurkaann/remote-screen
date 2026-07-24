export {};

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        tenantId: string;
        role: string;
        hardwareId?: string;
      };
      correlationId?: string;
    }
  }
}
