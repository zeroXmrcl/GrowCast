export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logAppStart } = await import("@/lib/logging");
    logAppStart({
      runtime: "nodejs",
      node_version: process.version,
    });
  }
}
