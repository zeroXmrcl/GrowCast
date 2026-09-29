"use client";

import {useRef} from "react";
import {SETUP_CODE_ALPHABET, SETUP_CODE_GROUP, SETUP_CODE_LENGTH, parseSetupCodePaste, setupCodeSlots} from "@/lib/setup-code";

type SetupCodeInputProps = {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    invalid?: boolean;
};

export function SetupCodeInput({value, onChange, disabled, invalid}: SetupCodeInputProps) {
    const slots = setupCodeSlots(value);
    const refs = useRef<Array<HTMLInputElement | null>>([]);

    function commit(next: string[]) {
        onChange(next.join(""));
    }

    function focusAt(index: number) {
        const clamped = Math.max(0, Math.min(SETUP_CODE_LENGTH - 1, index));
        const input = refs.current[clamped];
        input?.focus();
        input?.select();
    }

    function writeChars(index: number, chars: string[]) {
        const accepted = chars.filter((char) => SETUP_CODE_ALPHABET.includes(char));
        if (accepted.length === 0) {
            return;
        }
        const next = [...slots];
        let cursor = index;
        for (const char of accepted) {
            if (cursor >= SETUP_CODE_LENGTH) {
                break;
            }
            next[cursor] = char;
            cursor += 1;
        }
        commit(next);
        focusAt(Math.min(cursor, SETUP_CODE_LENGTH - 1));
    }

    function onPaste(event: React.ClipboardEvent<HTMLInputElement>) {
        event.preventDefault();
        const parsed = parseSetupCodePaste(event.clipboardData.getData("text"));
        if (!parsed) {
            return;
        }
        commit(setupCodeSlots(parsed));
        focusAt(Math.min(parsed.length, SETUP_CODE_LENGTH) - 1);
    }

    return (
        <div
            role="group"
            aria-label="Setup code"
            aria-invalid={invalid || undefined}
            style={{display: "flex", alignItems: "center", gap: 10}}
        >
            {[0, 1].map((group) => (
                <div key={group} style={{display: "contents"}}>
                    {group === 1 ? (
                        <span aria-hidden style={{color: "#8a8a91", fontSize: 22, lineHeight: 1}}>
                            -
                        </span>
                    ) : null}
                    <div style={{display: "flex", flex: 1, gap: 8, minWidth: 0}}>
                        {Array.from({length: SETUP_CODE_GROUP}, (_, offset) => {
                            const index = group * SETUP_CODE_GROUP + offset;
                            return (
                                <input
                                    key={index}
                                    ref={(node) => {
                                        refs.current[index] = node;
                                    }}
                                    className={invalid ? "installer-code-cell invalid" : "installer-code-cell"}
                                    inputMode="text"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    autoComplete={index === 0 ? "one-time-code" : "off"}
                                    aria-label={`Setup code character ${index + 1} of ${SETUP_CODE_LENGTH}`}
                                    maxLength={SETUP_CODE_LENGTH}
                                    disabled={disabled}
                                    value={slots[index] ?? ""}
                                    onPaste={onPaste}
                                    onFocus={(event) => event.currentTarget.select()}
                                    onChange={(event) => writeChars(index, [...event.target.value.toLowerCase()])}
                                    onKeyDown={(event) => {
                                        if (event.key === "Backspace") {
                                            event.preventDefault();
                                            if (slots[index]) {
                                                const next = [...slots];
                                                next[index] = "";
                                                commit(next);
                                                return;
                                            }
                                            if (index > 0) {
                                                const next = [...slots];
                                                next[index - 1] = "";
                                                commit(next);
                                                focusAt(index - 1);
                                            }
                                            return;
                                        }
                                        if (event.key === "ArrowLeft") {
                                            event.preventDefault();
                                            focusAt(index - 1);
                                        }
                                        if (event.key === "ArrowRight") {
                                            event.preventDefault();
                                            focusAt(index + 1);
                                        }
                                    }}
                                />
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
