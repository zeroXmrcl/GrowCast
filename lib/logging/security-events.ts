import { logSecurityEvent } from "./logger";

export function logAuthLoginSuccess(
  fields: Record<string, unknown> = {},
): void {
  logSecurityEvent("auth.login.success", fields, "info");
}

export function logAuthLoginFailed(
  fields: Record<string, unknown> = {},
): void {
  logSecurityEvent("auth.login.failed", fields, "warn");
}

export function logAuthLoginRateLimited(
  fields: Record<string, unknown> = {},
): void {
  logSecurityEvent("auth.login.rate_limited", fields, "warn");
}

export function logAuthLoginDisabled(
  fields: Record<string, unknown> = {},
): void {
  logSecurityEvent("auth.login.disabled", fields, "warn");
}

export function logAuthLogout(fields: Record<string, unknown> = {}): void {
  logSecurityEvent("auth.logout", fields, "info");
}

export function logAuthSessionInvalid(
  fields: Record<string, unknown> = {},
): void {
  logSecurityEvent("auth.session.invalid", fields, "warn");
}

export function logAuthzDenied(fields: Record<string, unknown> = {}): void {
  logSecurityEvent("authz.denied", fields, "warn");
}

export function logMeshAuthFailed(
  fields: Record<string, unknown> = {},
): void {
  logSecurityEvent("mesh.auth.failed", fields, "warn");
}

export function logMeshPluginUnknown(
  fields: Record<string, unknown> = {},
): void {
  logSecurityEvent("mesh.plugin.unknown", fields, "warn");
}

export function logValidationFailed(
  fields: Record<string, unknown> = {},
): void {
  logSecurityEvent("validation.failed", fields, "warn");
}

export function logHttpPathTraversalBlocked(
  fields: Record<string, unknown> = {},
): void {
  logSecurityEvent("http.path_traversal_blocked", fields, "warn");
}

export function logAdminGrowUpdated(
  fields: Record<string, unknown> = {},
): void {
  logSecurityEvent("admin.grow.updated", fields, "info");
}

export function logAdminGrowUpdateFailed(
  fields: Record<string, unknown> = {},
): void {
  logSecurityEvent("admin.grow.update_failed", fields, "error");
}

export function logAdminGrowArchived(
  fields: Record<string, unknown> = {},
): void {
  logSecurityEvent("admin.grow.archived", fields, "info");
}

export function logAdminGrowArchiveFailed(
  fields: Record<string, unknown> = {},
): void {
  logSecurityEvent("admin.grow.archive_failed", fields, "error");
}

export function logAdminMediaUploaded(
  fields: Record<string, unknown> = {},
): void {
  logSecurityEvent("admin.media.uploaded", fields, "info");
}

export function logAdminMediaUploadFailed(
  fields: Record<string, unknown> = {},
): void {
  logSecurityEvent("admin.media.upload_failed", fields, "warn");
}

export function logAdminMediaDeleted(
  fields: Record<string, unknown> = {},
): void {
  logSecurityEvent("admin.media.deleted", fields, "info");
}

export function logAdminMediaDeleteFailed(
  fields: Record<string, unknown> = {},
): void {
  logSecurityEvent("admin.media.delete_failed", fields, "warn");
}

export function logAppStart(fields: Record<string, unknown> = {}): void {
  logSecurityEvent("app.start", fields, "info");
}

export function logInit(fields: Record<string, unknown> = {}): void {
  logSecurityEvent("log.init", fields, "info");
}
