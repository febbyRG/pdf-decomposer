import { ENV_CONFIG } from '../config/constants.js'

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

/**
 * Structured logging utility for PDF processing
 */
export class Logger {
  private static instance: Logger
  private logLevel: LogLevel

  private constructor() {
    this.logLevel = this.parseLogLevel(ENV_CONFIG.logLevel)
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  private parseLogLevel(level: string): LogLevel {
    switch (level.toLowerCase()) {
      case 'error': return LogLevel.ERROR
      case 'warn': return LogLevel.WARN
      case 'info': return LogLevel.INFO
      case 'debug': return LogLevel.DEBUG
      default: return LogLevel.INFO
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.logLevel
  }

  // Accepts anything a call site has on hand (an Error from a catch, a plain
  // object, a scalar) and normalizes it to a loggable context, so callers never
  // need boilerplate around `unknown` catch variables.
  private normalizeContext(context: unknown): Record<string, any> | undefined {
    if (context === undefined || context === null) return undefined
    if (context instanceof Error) {
      return { error: { name: context.name, message: context.message, stack: context.stack } }
    }
    if (typeof context === 'object') return context as Record<string, any>
    return { value: String(context) }
  }

  private formatMessage(level: string, message: string, context?: unknown): string {
    const timestamp = new Date().toISOString()
    const normalized = this.normalizeContext(context)
    const contextStr = normalized ? ` | ${JSON.stringify(normalized)}` : ''
    return `[${timestamp}] ${level}: ${message}${contextStr}`
  }

  error(message: string, error?: unknown, context?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.ERROR)) return

    const normalizedError = this.normalizeContext(error)
    const errorContext = normalizedError ? { ...context, ...normalizedError } : context

    console.error(this.formatMessage('ERROR', message, errorContext))
  }

  warn(message: string, context?: unknown): void {
    if (!this.shouldLog(LogLevel.WARN)) return
    console.warn(this.formatMessage('WARN', message, context))
  }

  info(message: string, context?: unknown): void {
    if (!this.shouldLog(LogLevel.INFO)) return
    console.info(this.formatMessage('INFO', message, context))
  }

  debug(message: string, context?: unknown): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return
    console.debug(this.formatMessage('DEBUG', message, context))
  }

  /**
   * Log progress updates
   */
  progress(percentage: number, message: string, context?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.INFO)) return

    const progressMessage = `[${Math.round(percentage)}%] ${message}`
    this.info(progressMessage, context)
  }

  /**
   * Log performance metrics
   */
  performance(operation: string, duration: number, context?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return

    const perfContext = { ...context, operation, duration }
    this.debug(`Performance: ${operation} took ${duration}ms`, perfContext)
  }
}

// Export singleton instance
export const logger = Logger.getInstance()
