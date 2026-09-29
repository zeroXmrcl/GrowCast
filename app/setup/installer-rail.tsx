import Image from "next/image";
import {INSTALLER_COPY} from "./installer-copy";
import {INSTALLER_STEPS, type InstallerStepId} from "@/lib/installer-steps";

type InstallerRailProps = {
    current: InstallerStepId | "done";
    finished: ReadonlySet<InstallerStepId>;
};

export function InstallerRail({current, finished}: InstallerRailProps) {
    return (
        <nav
            className="installer-rail"
            aria-label="Setup steps"
            style={{
                width: 240,
                minHeight: "100vh",
                boxSizing: "border-box",
                borderRight: "1px solid #3a3a3a",
                padding: "32px 20px",
            }}
        >
            <div style={{display: "flex", alignItems: "center", gap: 12, paddingBottom: 28}}>
                <Image src="/growCastLogo_white.svg" alt="" width={28} height={28} />
                <span style={{fontSize: 14, fontWeight: 600}}>GrowCast</span>
            </div>
            <ol style={{listStyle: "none", margin: 0, padding: 0}}>
                {INSTALLER_STEPS.map((id, index) => {
                    const isCurrent = current !== "done" && id === current;
                    const isDone = !isCurrent && finished.has(id);
                    const stepClass = isCurrent
                        ? "installer-step-current"
                        : isDone
                          ? "installer-step-done"
                          : "installer-step-pending";
                    const circleStyle = isCurrent
                        ? {background: "#e4e4e7", color: "#09090b", border: "1px solid #e4e4e7"}
                        : isDone
                          ? {background: "#3a3a3a", color: "#f3f4f6", border: "1px solid #f3f4f6"}
                          : {background: "transparent", color: "#8a8a91", border: "1px solid #4a4a4a"};
                    const labelColor = isCurrent || isDone ? "#f3f4f6" : "#8a8a91";

                    return (
                        <li
                            key={id}
                            className={stepClass}
                            {...(isCurrent ? {"aria-current": "step" as const} : {})}
                        >
                            <div style={{display: "flex", alignItems: "center", gap: 12, padding: "10px 0"}}>
                                <span
                                    aria-hidden
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        width: 22,
                                        height: 22,
                                        borderRadius: 999,
                                        fontSize: 12,
                                        flexShrink: 0,
                                        ...circleStyle,
                                    }}
                                >
                                    {index + 1}
                                </span>
                                <span style={{fontSize: 14, fontWeight: isCurrent ? 600 : 400, color: labelColor}}>
                                    {INSTALLER_COPY[id].label}
                                </span>
                            </div>
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}
