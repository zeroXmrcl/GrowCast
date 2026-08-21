export type LogLevel =
  | "fatal"
  | "error"
  | "warn"
  | "info"
  | "debug"
  | "trace"
  | "silent";

export type SecurityEventName =
  | "auth.login.success"
  | "auth.login.failed"
  | "auth.login.rate_limited"
  | "auth.login.disabled"
  | "auth.logout"
  | "auth.session.invalid"
  | "authz.denied"
  | "mesh.auth.failed"
  | "mesh.plugin.unknown"
  | "validation.failed"
  | "http.path_traversal_blocked"
  | "admin.grow.updated"
  | "admin.grow.update_failed"
  | "admin.grow.archived"
  | "admin.grow.archive_failed"
  | "app.start"
  | "log.init";

export type RequestLogContext = {
  request_id: string;
  trace_id: string;
  span_id: string;
  method?: string;
  path?: string;
  route?: string;
  client_ip?: string;
  user_agent?: string;
};

export type LogBindings = {
  service?: string;
  version?: string;
  environment?: string;
  channel?: string;
  request_id?: string;
  trace_id?: string;
  span_id?: string;
  event?: string;
  [key: string]: unknown;
};

export type SanitizedError = {
  type: string;
  message: string;
  stack?: string;
};
