/** Restream is driven by files under the plugin data directory; no ingest loop. */
export async function onIngest(): Promise<void> {
    return;
}
