export const INSTALLER_COPY = {
    authenticate: {
        label: "Authenticate",
        eyebrow: "Authenticate",
        title: "Enter the setup code",
        line: "It is printed in the GrowCast log when the container starts.",
    },
    admin: {
        label: "Admin",
        eyebrow: "Admin",
        title: "Create the admin account",
        line: "The password needs 12 characters.",
    },
    camera: {
        label: "Camera",
        eyebrow: "Camera",
        title: "Link your camera",
        line: "Paste the MediaMTX HLS source, like http://stream.example.com/growcam/.",
    },
    done: {
        eyebrow: "Ready",
        title: "The stack is set up",
        line: "You can change any of this later in admin settings.",
        button: "Open the dashboard",
    },
} as const;
