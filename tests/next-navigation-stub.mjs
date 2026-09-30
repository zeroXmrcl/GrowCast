/** Node test stand-in. Redirect is a Next.js response, not used by authenticator unit tests. */
export function redirect(url) {
    const error = new Error(`NEXT_REDIRECT:${url}`);
    error.digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw error;
}
