/**
 * 303 with a relative Location. Absolute Locations reconstructed from
 * request.url follow the listen address (http://0.0.0.0:3000) and drop
 * the session cookie after media upload / logout.
 */
export function seeOther(path: string): Response {
    const location = path.startsWith("/") ? path : `/${path}`;
    return new Response(null, {
        status: 303,
        headers: {Location: location},
    });
}
