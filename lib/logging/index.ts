export type {
  LogBindings,
  LogLevel,
  RequestLogContext,
  SanitizedError,
  SecurityEventName,
} from "./types";

export {
  generateRequestId,
  generateSpanId,
  generateTraceId,
  isValidRequestId,
  isValidSpanId,
  isValidTraceId,
} from "./ids";

export { REDACT_PATHS, sanitizeError } from "./redact";

export {
  childLogger,
  getLogger,
  getSecurityLogger,
  logSecurityEvent,
  resolveLogLevel,
  _resetLoggerForTests,
} from "./logger";

export { getContext, getContextOrEmpty, runWithContext } from "./context";

export {
  buildContextFromHeaders,
  extractClientIp,
  extractUserAgent,
  withRequestLog,
} from "./http";

export { withNextRequestLogContext } from "./next";

export {
  logAdminGrowUpdateFailed,
  logAdminGrowUpdated,
  logAppStart,
  logAuthLoginDisabled,
  logAuthLoginFailed,
  logAuthLoginRateLimited,
  logAuthLoginSuccess,
  logAuthLogout,
  logAuthSessionInvalid,
  logAuthzDenied,
  logHttpPathTraversalBlocked,
  logInit,
  logMeshAuthFailed,
  logMeshPluginUnknown,
  logValidationFailed,
} from "./security-events";
