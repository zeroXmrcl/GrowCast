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
        strokeWidth: 1.8,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
        "aria-hidden": true as const,
        focusable: false as const,
    };
}

function SunIcon({className}: IconProps) {
    return (
        <svg {...iconProps(className)}>
            <circle cx="12" cy="12" r="3.6"/>
            <path d="M12 2.8v2.4M12 18.8v2.4M4.2 12H6.6M17.4 12h2.4M6.1 6.1l1.7 1.7M16.2 16.2l1.7 1.7M6.1 17.9l1.7-1.7M16.2 7.8l1.7-1.7"/>
        </svg>
    );
}

function FanIcon({className}: IconProps) {
    return (
        <svg {...iconProps(className)}>
            <circle cx="12" cy="12" r="9"/>
            <circle cx="12" cy="12" r="1.6"/>
            <path d="M12 12c2.4-3.8 6-4.8 8.2-2.4-2.6.6-5.4 1.4-8.2 2.4Z"/>
            <path d="M12 12c3.8 2.4 4.8 6 2.4 8.2-.6-2.6-1.4-5.4-2.4-8.2Z"/>
            <path d="M12 12c-2.4 3.8-6 4.8-8.2 2.4 2.6-.6 5.4-1.4 8.2-2.4Z"/>
            <path d="M12 12c-3.8-2.4-4.8-6-2.4-8.2.6 2.6 1.4 5.4 2.4 8.2Z"/>
        </svg>
    );
}

function BlowerIcon({className}: IconProps) {
    return (
        <svg {...iconProps(className)}>
            <rect x="3.5" y="6" width="12" height="12" rx="2.5"/>
            <circle cx="9.5" cy="12" r="3"/>
            <path d="M9.5 10.4v3.2M7.9 12h3.2"/>
            <path d="M15.5 9.2H19l2 2.8-2 2.8h-3.5"/>
        </svg>
    );
}

function DropletIcon({className}: IconProps) {
    return (
        <svg {...iconProps(className)}>
            <path d="M12 3.5c0 0-6 7-6 11.2a6 6 0 0 0 12 0C18 10.5 12 3.5 12 3.5Z"/>
        </svg>
    );
}

function DropletOffIcon({className}: IconProps) {
    return (
        <svg {...iconProps(className)}>
            <path d="M12 3.5c0 0-6 7-6 11.2a6 6 0 0 0 12 0C18 10.5 12 3.5 12 3.5Z"/>
            <path d="M5 19.5 19 4.5"/>
        </svg>
    );
}

function FlameIcon({className}: IconProps) {
    return (
        <svg {...iconProps(className)}>
            <path d="M12 20.5c3.6 0 5.5-2.4 5.5-5.6 0-3.2-2.4-5.4-4.1-7.4-.4-.5-1.2.1-1 .8.3 1.4-.5 2.3-1.6 3.2-1.4-2.4-1.4-4.8 0-7.2.3-.5-.3-1.1-.8-.8C7.6 5.2 5.5 8.4 5.5 13c0 3.8 2.6 7.5 6.5 7.5Z"/>
        </svg>
    );
}

function PlugIcon({className}: IconProps) {
    return (
        <svg {...iconProps(className)}>
            <path d="M9 8.5V3.5M15 8.5V3.5"/>
            <rect x="6.5" y="8.5" width="11" height="8" rx="2"/>
            <path d="M12 16.5v4M9.5 20.5h5"/>
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
