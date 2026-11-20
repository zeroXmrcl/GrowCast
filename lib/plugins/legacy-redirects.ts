export type LegacyRedirect = {
    source: string;
    destination: string;
    permanent: true;
};

/** Old site, admin, and API paths. Listed in docs/plugins/MIGRATION.md. */
export const LEGACY_PERMANENT_REDIRECTS: LegacyRedirect[] = [
    {source: "/energy", destination: "/p/ggs/energy", permanent: true},
    {source: "/gallery", destination: "/p/timelapse/gallery", permanent: true},
    {source: "/admin/ggs", destination: "/admin/plugins/growcast.ggs", permanent: true},
    {source: "/admin/ggs/:path*", destination: "/admin/plugins/growcast.ggs/:path*", permanent: true},
    {source: "/admin/timelapse", destination: "/admin/plugins/growcast.timelapse", permanent: true},
    {source: "/admin/timelapse/:path*", destination: "/admin/plugins/growcast.timelapse/:path*", permanent: true},
    {source: "/admin/stream", destination: "/admin/plugins/growcast.restream", permanent: true},
    {source: "/admin/broadcast", destination: "/admin/plugins/growcast.restream", permanent: true},
    {source: "/program", destination: "/p/restream/program", permanent: true},
    {source: "/overlay/capture", destination: "/p/restream/capture", permanent: true},
    {source: "/api/data/energy", destination: "/api/data/plugins/ggs/energy", permanent: true},
    {source: "/api/data/live-climate", destination: "/api/data/plugins/ggs/live-climate", permanent: true},
    {source: "/api/data/live-climate/stream", destination: "/api/data/plugins/ggs/live-climate/stream", permanent: true},
    {source: "/api/data/climate-history", destination: "/api/data/plugins/ggs/climate-history", permanent: true},
    {source: "/api/data/broadcast", destination: "/api/data/plugins/restream/broadcast", permanent: true},
    {source: "/api/snapshots/:filename", destination: "/api/data/plugins/timelapse/snapshots/:filename", permanent: true},
    {source: "/api/timelapse", destination: "/api/data/plugins/timelapse/latest", permanent: true},
    {source: "/api/overlay/music/:filename", destination: "/api/data/plugins/restream/music/:filename", permanent: true},
    {source: "/api/overlay/program-audio", destination: "/api/data/plugins/restream/program-audio", permanent: true},
    {source: "/api/overlay/program-camera", destination: "/api/data/plugins/restream/program-camera", permanent: true},
    {source: "/api/overlay/program-alerts", destination: "/api/data/plugins/restream/program-alerts", permanent: true},
    {source: "/api/admin/camera-look", destination: "/api/plugins/v1/growcast.restream/x/camera-look", permanent: true},
    {source: "/api/admin/music", destination: "/api/plugins/v1/growcast.restream/x/music", permanent: true},
    {source: "/api/admin/program-alert", destination: "/api/plugins/v1/growcast.restream/x/program-alert", permanent: true},
];

export const ADMIN_HASH_REDIRECTS: Record<string, string> = {
    "#stream": "/admin/plugins/growcast.restream",
    "#overlay": "/admin",
    "#twitch": "/admin/plugins/growcast.restream",
    "#timelapse": "/admin/plugins/growcast.timelapse",
    "#energy": "/admin/plugins/growcast.ggs",
    "#archive": "/admin/archives",
};

export const LEGACY_PUBLIC_DISPATCH: Record<string, {pluginId: string; remainder: string}> = {
    "/api/twitch/eventsub": {pluginId: "growcast.restream", remainder: "eventsub"},
    "/admin/stream/twitch-callback": {pluginId: "growcast.restream", remainder: "twitch-callback"},
    "/admin/stream/twitch-connect": {pluginId: "growcast.restream", remainder: "twitch-connect"},
};
