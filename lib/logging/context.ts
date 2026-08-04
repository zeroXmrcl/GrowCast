import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestLogContext } from "./types";

const storage = new AsyncLocalStorage<RequestLogContext>();

export function runWithContext<T>(
  context: RequestLogContext,
  fn: () => T,
): T {
  return storage.run(context, fn);
}

export function getContext(): RequestLogContext | undefined {
  return storage.getStore();
}

export function getContextOrEmpty(): Partial<RequestLogContext> {
  return storage.getStore() ?? {};
}
