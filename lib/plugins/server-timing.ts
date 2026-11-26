export function withServerTiming(response: Response, name: string, startedMs: number): Response {
    const headers = new Headers(response.headers);
    const metric = `${name};dur=${(performance.now() - startedMs).toFixed(1)}`;
    const previous = headers.get("Server-Timing");
    headers.set("Server-Timing", previous ? `${previous}, ${metric}` : metric);
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}
