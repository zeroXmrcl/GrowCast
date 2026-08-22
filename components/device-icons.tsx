// Lucide icons, https://lucide.dev, ISC
import type {GgsActuatorKind} from "@/lib/ggs-live";

type IconProps = {
    className?: string;
};

function iconProps(className?: string) {
    return {
        className,
        width: 26,
        height: 26,
        viewBox: "0 0 24 24",
        fill: "none" as const,
        stroke: "currentColor",
        strokeWidth: 2,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
        "aria-hidden": true as const,
        focusable: false as const,
    };
}

function SunIcon({className}: IconProps) {
    return (
        <svg {...iconProps(className)}>
            <circle cx="12" cy="12" r="4"/>
            <path d="M12 2v2"/>
            <path d="M12 20v2"/>
            <path d="m4.93 4.93 1.41 1.41"/>
            <path d="m17.66 17.66 1.41 1.41"/>
            <path d="M2 12h2"/>
            <path d="M20 12h2"/>
            <path d="m6.34 17.66-1.41 1.41"/>
            <path d="m19.07 4.93-1.41 1.41"/>
        </svg>
    );
}

function FanIcon({className}: IconProps) {
    return (
        <svg {...iconProps(className)}>
            <path d="M10.827 16.379a6.082 6.082 0 0 1-8.618-7.002l5.412 1.45a6.082 6.082 0 0 1 7.002-8.618l-1.45 5.412a6.082 6.082 0 0 1 8.618 7.002l-5.412-1.45a6.082 6.082 0 0 1-7.002 8.618l1.45-5.412Z"/>
            <path d="M12 12v.01"/>
        </svg>
    );
}

function BlowerIcon({className}: IconProps) {
    return (
        <svg {...iconProps(className)}>
            <path d="M12.8 19.6A2 2 0 1 0 14 16H2"/>
            <path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/>
            <path d="M9.8 4.4A2 2 0 1 1 11 8H2"/>
        </svg>
    );
}

function DropletIcon({className}: IconProps) {
    return (
        <svg {...iconProps(className)}>
            <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>
        </svg>
    );
}

function DropletOffIcon({className}: IconProps) {
    return (
        <svg {...iconProps(className)}>
            <path d="M18.715 13.186C18.29 11.858 17.384 10.607 16 9.5c-2-1.6-3.5-4-4-6.5a10.7 10.7 0 0 1-.884 2.586"/>
            <path d="m2 2 20 20"/>
            <path d="M8.795 8.797A11 11 0 0 1 8 9.5C6 11.1 5 13 5 15a7 7 0 0 0 13.222 3.208"/>
        </svg>
    );
}

function FlameIcon({className}: IconProps) {
    return (
        <svg {...iconProps(className)}>
            <path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/>
        </svg>
    );
}

function PlugIcon({className}: IconProps) {
    return (
        <svg {...iconProps(className)}>
            <path d="M12 22v-5"/>
            <path d="M15 8V2"/>
            <path d="M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z"/>
            <path d="M9 8V2"/>
        </svg>
    );
}

export function DeviceIcon({kind, className}: {kind: GgsActuatorKind; className?: string}) {
    switch (kind) {
        case "light":
            return <SunIcon className={className}/>;
        case "fan":
            return <FanIcon className={className}/>;
        case "blower":
            return <BlowerIcon className={className}/>;
        case "humidifier":
            return <DropletIcon className={className}/>;
        case "dehumidifier":
            return <DropletOffIcon className={className}/>;
        case "heater":
            return <FlameIcon className={className}/>;
        case "outlet":
            return <PlugIcon className={className}/>;
        default:
            return <PlugIcon className={className}/>;
    }
}
