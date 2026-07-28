import {
    AdminButton,
    AdminField,
    AdminInput,
    AdminNotice,
    AdminPanel,
} from "@/components/admin/ui";

type LoginFormProps = {
    error?: string;
    canLogin: boolean;
    warnings: string[];
    loginAction: (formData: FormData) => Promise<void>;
};

export function AdminLoginForm({error, canLogin, warnings, loginAction}: LoginFormProps) {
    return (
        <div className="admin-theme min-h-screen bg-(--admin-bg) text-(--admin-text)">
            <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-8">
                <div className="w-full space-y-4">
                    <AdminPanel title="Sign In">
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

                            {!canLogin ? (
                                <AdminNotice tone="warning" title="Configuration issues">
                                    <ul className="space-y-1">
                                        {warnings.map((warning) => (
                                            <li key={warning}>{warning}</li>
                                        ))}
                                    </ul>
                                </AdminNotice>
                            ) : null}

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
                        </div>
                    </AdminPanel>
                </div>
            </main>
        </div>
    );
}
