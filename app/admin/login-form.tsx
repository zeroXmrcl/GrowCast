import {
    AdminButton,
    AdminField,
    AdminInput,
    AdminNotice,
    AdminPanel,
} from "@/components/admin/ui";
import {LoginSecondFactorForm} from "@/app/admin/login-second-factor";

type LoginFormProps = {
    error?: string;
    mode?: "password" | "totp";
    canLogin: boolean;
    warnings: string[];
    loginAction: (formData: FormData) => Promise<void>;
    verifyAction: (formData: FormData) => Promise<void>;
    cancelAction: () => Promise<void>;
};

export function AdminLoginForm({
    error,
    mode = "password",
    canLogin,
    warnings,
    loginAction,
    verifyAction,
    cancelAction,
}: LoginFormProps) {
    return (
        <div className="admin-theme min-h-screen bg-(--admin-bg) text-(--admin-text)">
            <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-8">
                <div className="w-full space-y-4">
                    <AdminPanel title={mode === "totp" ? "Authenticator" : "Sign In"}>
                        <div className="space-y-4">
                            {error === "invalid_credentials" ? (
                                <AdminNotice tone="danger" title="Authentication failed">
                                    Invalid username or password.
                                </AdminNotice>
                            ) : null}

                            {error === "rate_limited" ? (
                                <AdminNotice tone="danger" title="Sign in temporarily blocked">
                                    Too many failed attempts. Try again later.
                                </AdminNotice>
                            ) : null}

                            {error === "login_disabled" ? (
                                <AdminNotice tone="warning" title="Login unavailable">
                                    Admin login is disabled because the required configuration is incomplete.
                                </AdminNotice>
                            ) : null}

                            {error === "unauthorized" ? (
                                <AdminNotice tone="danger" title="Authentication required">
                                    You must sign in before accessing the control panel.
                                </AdminNotice>
                            ) : null}

                            {error === "signin_expired" ? (
                                <AdminNotice tone="warning" title="Sign-in expired">
                                    Enter your password again.
                                </AdminNotice>
                            ) : null}

                            {error === "totp_unavailable" ? (
                                <AdminNotice tone="danger" title="Authenticator data unreadable">
                                    Delete data/setup/totp.json on the server, then sign in with your password.
                                </AdminNotice>
                            ) : null}

                            {!canLogin ? (
                                <AdminNotice tone="warning" title="Configuration issues">
                                    <ul className="space-y-1">
                                        {warnings.map((warning) => (
                                            <li key={warning}>{warning}</li>
                                        ))}
                                    </ul>
                                </AdminNotice>
                            ) : null}

                            {mode === "totp" ? (
                                <LoginSecondFactorForm
                                    error={error}
                                    verifyAction={verifyAction}
                                    cancelAction={cancelAction}
                                />
                            ) : (
                                <form action={loginAction} className="space-y-4">
                                    <AdminField label="Username">
                                        <AdminInput
                                            name="username"
                                            placeholder="Username"
                                            type="text"
                                            required
                                            disabled={!canLogin}
                                            autoComplete="username"
                                        />
                                    </AdminField>

                                    <AdminField label="Password">
                                        <AdminInput
                                            name="password"
                                            type="password"
                                            placeholder="Password"
                                            required
                                            disabled={!canLogin}
                                            autoComplete="current-password"
                                        />
                                    </AdminField>

                                    <AdminButton
                                        type="submit"
                                        tone="primary"
                                        disabled={!canLogin}
                                        className="w-full"
                                    >
                                        Sign In
                                    </AdminButton>
                                </form>
                            )}
                        </div>
                    </AdminPanel>
                </div>
            </main>
        </div>
    );
}
