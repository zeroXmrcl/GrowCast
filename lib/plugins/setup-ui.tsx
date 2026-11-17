"use client";

import type {FormEvent, ReactNode} from "react";
import type {PluginInstallerField, PluginSetupResult} from "@/lib/plugins/types";

type ControllerChoice = NonNullable<Extract<PluginSetupResult, {ok: false}>["choose"]>[number];

export function PluginSetupFields({
    stepId,
    fields = [],
    locked,
    saveClass,
    saveLabel,
    onSubmit,
    onSkip,
    children,
}: {
    stepId: string;
    fields?: PluginInstallerField[];
    locked: boolean;
    saveClass: string;
    saveLabel?: string;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onSkip: () => void;
    children?: ReactNode;
}) {
    return (
        <form className="mt-8 space-y-5" onSubmit={onSubmit}>
            <input type="hidden" name="stepId" value={stepId} />
            {fields.map((field) => (
                <InstallerField key={field.name} label={field.label} htmlFor={`installer-${stepId}-${field.name}`}>
                    <InstallerInput
                        id={`installer-${stepId}-${field.name}`}
                        name={field.name}
                        type={field.type === "password" ? "password" : field.type === "number" ? "number" : "text"}
                        autoComplete={field.autoComplete}
                        required={field.required !== false}
                        defaultValue={field.defaultValue}
                    />
                </InstallerField>
            ))}
            {children}
            <PrimaryButton className={saveClass} disabled={locked}>
                {saveLabel ?? "Continue"}
            </PrimaryButton>
            <SkipButton disabled={locked} onClick={onSkip}>
                Skip
            </SkipButton>
        </form>
    );
}

export function PluginChoicePicker({
    stepId,
    keepValues,
    valueName,
    choices,
    selected,
    onSelect,
    locked,
    saveClass,
    saveLabel,
    onSubmit,
}: {
    stepId: string;
    keepValues: Record<string, string>;
    valueName: string;
    choices: ControllerChoice[];
    selected: string;
    onSelect: (serial: string) => void;
    locked: boolean;
    saveClass: string;
    saveLabel?: string;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
    return (
        <form className="mt-8 space-y-5" onSubmit={onSubmit}>
            <input type="hidden" name="stepId" value={stepId} />
            {Object.entries(keepValues).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
            ))}
            <input type="hidden" name={valueName} value={selected} />
            <PluginChoiceList
                choices={choices}
                selected={selected}
                onSelect={onSelect}
            />
            <PrimaryButton className={saveClass} disabled={locked || !selected}>
                {saveLabel ?? "Continue"}
            </PrimaryButton>
        </form>
    );
}

function PluginChoiceList({
    choices,
    selected,
    onSelect,
}: {
    choices: ControllerChoice[];
    selected: string;
    onSelect: (serial: string) => void;
}) {
    return (
        <ul
            role="radiogroup"
            aria-label="Controllers"
            style={{listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8}}
        >
            {choices.map((choice) => {
                const isSelected = choice.serial === selected;
                const short = choice.serial.length > 4 ? choice.serial.slice(-4) : choice.serial;
                return (
                    <li key={choice.serial}>
                        <button
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            onClick={() => onSelect(choice.serial)}
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
                                <span style={{fontSize: 14, fontWeight: 500}}>{choice.name}</span>
                                <span style={{fontSize: 12, color: "#8a8a91"}}>
                                    {choice.prefix} {short}
                                </span>
                            </span>
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}

function InstallerField({
    label,
    htmlFor,
    children,
}: {
    label: string;
    htmlFor: string;
    children: ReactNode;
}) {
    return (
        <div className="installer-field" style={{position: "relative", paddingTop: 8}}>
            <label
                className="installer-label"
                htmlFor={htmlFor}
                style={{
                    position: "absolute",
                    left: 0,
                    top: 18,
                    fontSize: 14,
                    color: "#8a8a91",
                    pointerEvents: "none",
                    transformOrigin: "left top",
                }}
            >
                {label}
            </label>
            {children}
        </div>
    );
}

function InstallerInput({
    name,
    id,
    type = "text",
    autoComplete,
    required = true,
    defaultValue,
}: {
    name: string;
    id: string;
    type?: string;
    autoComplete?: string;
    required?: boolean;
    defaultValue?: string;
}) {
    return (
        <input
            id={id}
            name={name}
            type={type}
            autoComplete={autoComplete}
            required={required}
            defaultValue={defaultValue}
            style={{
                display: "block",
                width: "100%",
                height: 40,
                margin: 0,
                padding: "16px 0 0",
                border: "none",
                borderBottom: "1px solid #4a4a4a",
                borderRadius: 0,
                background: "transparent",
                color: "#f3f4f6",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
            }}
        />
    );
}

function PrimaryButton({
    children,
    className,
    disabled,
}: {
    children: ReactNode;
    className: string;
    disabled?: boolean;
}) {
    return (
        <button
            type="submit"
            className={className}
            disabled={disabled}
            style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                height: 40,
                marginTop: 8,
                border: "none",
                borderRadius: 8,
                background: "#e4e4e7",
                color: "#09090b",
                fontSize: 14,
                fontWeight: 600,
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.55 : 1,
            }}
        >
            {children}
        </button>
    );
}

function SkipButton({
    children,
    disabled,
    onClick,
}: {
    children: ReactNode;
    disabled?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            style={{
                display: "block",
                width: "100%",
                marginTop: 4,
                padding: "8px 0",
                border: "none",
                background: "transparent",
                color: "#8a8a91",
                fontSize: 14,
                cursor: disabled ? "not-allowed" : "pointer",
            }}
        >
            {children}
        </button>
    );
}
