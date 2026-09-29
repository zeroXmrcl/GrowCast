"use client";

import {useState} from "react";
import type {SpiderFarmerController} from "@/lib/spider-farmer-login";

type ControllerListProps = {
    controllers: SpiderFarmerController[];
    selected: string;
    onSelect: (serial: string) => void;
};

function shortSerial(serial: string): string {
    return serial.length > 4 ? serial.slice(-4) : serial;
}

export function ControllerList({controllers, selected, onSelect}: ControllerListProps) {
    return (
        <ul style={{listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8}}>
            {controllers.map((controller) => {
                const isSelected = controller.serial === selected;
                return (
                    <li key={controller.serial}>
                        <button
                            type="button"
                            onClick={() => onSelect(controller.serial)}
                            style={{
                                display: "flex",
                                width: "100%",
                                alignItems: "center",
                                gap: 12,
                                padding: "12px 14px",
                                textAlign: "left",
                                background: "transparent",
                                border: `1px solid ${isSelected ? "#e4e4e7" : "#4a4a4a"}`,
                                borderRadius: 8,
                                color: "#f3f4f6",
                                cursor: "pointer",
                            }}
                        >
                            <span
                                aria-hidden
                                style={{
                                    width: 16,
                                    height: 16,
                                    borderRadius: "50%",
                                    flexShrink: 0,
                                    boxSizing: "border-box",
                                    border: isSelected ? "5px solid #e4e4e7" : "1px solid #4a4a4a",
                                }}
                            />
                            <span style={{display: "flex", flexDirection: "column", gap: 2, minWidth: 0}}>
                                <span style={{fontSize: 14, fontWeight: 500}}>{controller.name}</span>
                                <span style={{fontSize: 12, color: "#8a8a91"}}>
                                    {controller.prefix} {shortSerial(controller.serial)}
                                </span>
                            </span>
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}

export function ControllerSerialField({
    controllers,
    defaultSerial,
}: {
    controllers: SpiderFarmerController[];
    defaultSerial?: string;
}) {
    const [selected, setSelected] = useState(defaultSerial ?? controllers[0]?.serial ?? "");
    return (
        <>
            <ControllerList controllers={controllers} selected={selected} onSelect={setSelected}/>
            <input type="hidden" name="sfSerial" value={selected}/>
        </>
    );
}
