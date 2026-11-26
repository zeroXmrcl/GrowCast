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
    const {announceStartup} = await import("@/lib/setup-gate");
    await announceStartup();
    try {
      const {bootPluginHost} = await import("@/lib/plugins/lifecycle");
      await bootPluginHost();
    } catch (error) {
      const {childLogger, sanitizeError} = await import("@/lib/logging");
      childLogger().warn({
        event: "plugin.boot.failed",
        err: sanitizeError(error),
      });
    }
    void Promise.resolve().then(async () => {
      try {
        const { startAiSummaryScheduler } = await import(
          "@/lib/ai-summary/scheduler"
        );
        startAiSummaryScheduler();
      } catch (error) {
        const { childLogger, sanitizeError } = await import("@/lib/logging");
        childLogger().warn({
          event: "ai_summary.scheduler.failed",
          reason: "boot_failed",
          err: sanitizeError(error),
        });
      }
    });
  }
}
