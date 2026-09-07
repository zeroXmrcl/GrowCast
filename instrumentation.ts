export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logAppStart } = await import("@/lib/logging");
    logAppStart({
      runtime: "nodejs",
      node_version: process.version,
    });
    // next build may load instrumentation; Helix subscribe is a runtime concern.
    if (process.env.NEXT_PHASE === "phase-production-build") {
      return;
    }
    // Helix waits for Twitch to POST the webhook challenge; awaiting that
    // here deadlocks because Next does not serve until register() returns.
    void Promise.resolve().then(async () => {
      try {
        const { ensureEventsubSubscriptionsOnBoot } = await import(
          "@/lib/restream/eventsub"
        );
        await ensureEventsubSubscriptionsOnBoot();
      } catch (error) {
        const { childLogger, sanitizeError } = await import("@/lib/logging");
        childLogger().warn({
          event: "twitch.eventsub.failed",
          reason: "boot_failed",
          err: sanitizeError(error),
        });
      }
    });
  }
}
