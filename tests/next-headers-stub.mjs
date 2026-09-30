/** Node test stand-in. Next resolves this package; unit tests do not run inside a request. */
export function headers() {
    throw new Error("headers unavailable outside a request");
}

export function cookies() {
    throw new Error("cookies unavailable outside a request");
}
