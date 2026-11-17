/** Create the first account, sign back into it, or refuse a different username. */
export function adminSetupDecision(
    existingUsername: string | null,
    submittedUsername: string,
): "create" | "sign-in" | "reject" {
    if (!existingUsername) {
        return "create";
    }
    if (existingUsername === submittedUsername) {
        return "sign-in";
    }
    return "reject";
}
