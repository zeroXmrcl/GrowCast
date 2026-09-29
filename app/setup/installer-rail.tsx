import {INSTALLER_COPY, INSTALLER_STEPS, type InstallerStepId} from "./installer-copy";

type InstallerRailProps = {
    current: InstallerStepId | "done";
    finished: ReadonlySet<InstallerStepId>;
};

export function InstallerRail({current, finished}: InstallerRailProps) {
    return (
        <nav className="installer-rail" style={{width: 240}} aria-label="Setup steps">
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
                        ? {background: "#fafafa", color: "#09090b", border: "1px solid #09090b"}
                        : isDone
                          ? {background: "#3a3a3a", color: "#f3f4f6", border: "1px solid #f3f4f6"}
                          : {background: "transparent", color: "#b4b4b8", border: "1px solid #4a4a4a"};

                    const labelColor = isCurrent ? "#09090b" : isDone ? "#f3f4f6" : "#8a8a91";

                    return (
                        <li
                            key={id}
                            className={stepClass}
                            style={{marginBottom: 8}}
                            {...(isCurrent ? {"aria-current": "step"} : {})}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 12,
                                    padding: "8px 12px",
                                    ...(isCurrent
                                        ? {background: "#e4e4e7", borderRadius: 9999}
                                        : undefined),
                                }}
                            >
                                <span
                                    aria-hidden
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        width: 28,
                                        height: 28,
                                        borderRadius: "50%",
                                        fontSize: 13,
                                        fontWeight: 600,
                                        flexShrink: 0,
                                        ...circleStyle,
                                    }}
                                >
                                    {index + 1}
                                </span>
                                <span style={{fontSize: 14, fontWeight: isCurrent ? 600 : 500, color: labelColor}}>
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
