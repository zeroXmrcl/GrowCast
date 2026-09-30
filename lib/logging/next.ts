import { headers } from "next/headers";
import { getContext, runWithContext } from "./context";
import { buildContextFromHeaders } from "./http";

export async function withNextRequestLogContext<T>(
  routePattern: string,
  fn: () => Promise<T>,
  method = "POST",
): Promise<T> {
  if (getContext()) {
    return fn();
  }

  let h: Headers;
  try {
    h = await headers();
  } catch {
    h = new Headers();
  }
  const context = buildContextFromHeaders(h, routePattern, method, routePattern);
  return runWithContext(context, fn);
}
