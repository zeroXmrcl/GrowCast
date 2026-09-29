export const INSTALLER_COPY = {
    admin: {
        label: "Admin",
        eyebrow: "Setup",
        title: "Create the admin account",
        line: "The password needs 12 characters.",
    },
    climate: {
        label: "Climate",
        eyebrow: "Climate",
        title: "Connect Spider Farmer",
        line: "Email and password only. Google or Apple sign-in will not work.",
        listTitle: "Choose the controller",
    },
    camera: {
        label: "Camera",
        eyebrow: "Camera",
        title: "Link your camera",
        line: "Paste the MediaMTX HLS source, like http://stream.example.com/growcam/.",
    },
    twitch: {
        label: "Twitch",
        eyebrow: "Twitch",
        title: "Save the stream key",
        line: "Creator Dashboard -> Settings -> Stream.",
    },
    timelapse: {
        label: "Timelapse",
        eyebrow: "Timelapse",
        title: "Point it at the camera",
        line: "Use the camera’s local rtsp:// address.",
    },
    done: {
        eyebrow: "Ready",
        title: "The stack is set up",
        line: "You can change any of this later in admin settings.",
        button: "Open the dashboard",
    },
} as const;

export function installerDoneRows(input: {
    username: string;
    climate: string | null;
    streamUrl: string | null;
    twitchSaved: boolean;
    timelapse: string | null;
    skipped: readonly string[];
}): Array<{label: string; value: string}> {
    const skipped = new Set(input.skipped);
    return [
        {label: "Admin", value: input.username},
        {label: "Climate", value: skipped.has("climate") ? "Skipped" : (input.climate ?? "Skipped")},
        {label: "Camera", value: skipped.has("camera") ? "Skipped" : (input.streamUrl ?? "Skipped")},
        {label: "Twitch", value: skipped.has("twitch") || !input.twitchSaved ? "Skipped" : "Key saved. Start is on Broadcast."},
        {label: "Timelapse", value: skipped.has("timelapse") ? "Skipped" : (input.timelapse ?? "Skipped")},
    ];
}
