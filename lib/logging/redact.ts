import type { SanitizedError } from "./types";

export const REDACT_PATHS: string[] = [
  "password",
  "passwd",
  "pass",
  "secret",
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "api_key",
  "apiKey",
  "authorization",
  "Authorization",
  "cookie",
  "Cookie",
  "set-cookie",
  "Set-Cookie",
  "session",
  "session_id",
  "sessionId",
  "csrf",
  "csrf_token",
  "username",
  "user_name",
  "email",
  "mqttPwd",
  "mqttName",
  "mqtt_password",
  "client_secret",
  "TWITCH_CLIENT_SECRET",
  "*.mqttPwd",
  "*.mqttName",
  "*.client_secret",
  "headers.authorization",
  "headers.Authorization",
  "headers.cookie",
  "headers.Cookie",
  "headers['authorization']",
  "headers['Authorization']",
  "headers['cookie']",
  "headers['Cookie']",
  "req.headers.authorization",
  "req.headers.cookie",
  "body.password",
  "body.token",
  "body.username",
  "*.password",
  "*.token",
  "*.authorization",
  "*.cookie",
  "*.secret",
];

export function sanitizeError(error: unknown): SanitizedError {
  if (error instanceof Error) {
    const result: SanitizedError = {
      type: error.name || "Error",
      message: error.message || "Unknown error",
    };
    if (typeof error.stack === "string" && error.stack.length > 0) {
      result.stack = error.stack;
    }
    return result;
  }

  if (typeof error === "string") {
    return { type: "Error", message: error };
  }

  return { type: "Error", message: "Unknown error" };
}
