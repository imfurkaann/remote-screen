/**
 * Structured logging module for consistent log formatting and context tracking.
 * All logs include: timestamp, level, service, message, context (optional), error trace (optional)
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = Record<string, unknown>;

export interface StructuredLog {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
}

export class Logger {
  private serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  /**
   * Create structured log entry
   */
  private formatLog(level: LogLevel, message: string, context?: LogContext, error?: Error): StructuredLog {
    const log: StructuredLog = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      message
    };

    if (context && Object.keys(context).length > 0) {
      log.context = context;
    }

    if (error) {
      const errorObj: any = {
        name: error.name,
        message: error.message
      };
      if (error.stack) {
        errorObj.stack = error.stack;
      }
      if ((error as any).code) {
        errorObj.code = (error as any).code;
      }
      log.error = errorObj;
    }

    return log;
  }

  /**
   * Log debug level
   */
  debug(message: string, context?: LogContext): void {
    const log = this.formatLog('debug', message, context);
    console.debug(JSON.stringify(log));
  }

  /**
   * Log info level
   */
  info(message: string, context?: LogContext): void {
    const log = this.formatLog('info', message, context);
    console.log(JSON.stringify(log));
  }

  /**
   * Log warning level
   */
  warn(message: string, context?: LogContext, error?: Error): void {
    const log = this.formatLog('warn', message, context, error);
    console.warn(JSON.stringify(log));
  }

  /**
   * Log error level with stack trace
   */
  error(message: string, error?: Error, context?: LogContext): void {
    const log = this.formatLog('error', message, context, error);
    console.error(JSON.stringify(log));
  }
}
