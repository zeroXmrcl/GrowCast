/** Node test stand-in. Redirect is a Next.js response, not used by authenticator unit tests. */
export function usePathname() {
    const value = globalThis.__GROWCAST_TEST_PATHNAME;
    return typeof value === "string" ? value : "/";
}

export function useRouter() {
    return {
        push() {},
        replace() {},
        back() {},
        forward() {},
        refresh() {},
        prefetch() {},
    };
}

export function redirect(url) {
    const error = new Error(`NEXT_REDIRECT:${url}`);
    error.digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw error;
}
