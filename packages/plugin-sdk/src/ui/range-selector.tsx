"use client";

import {useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent} from "react";

export type RangeSelectorOption = {
    id: string;
    label: string;
    disabled?: boolean;
};

type Bar = {x: number; y: number; width: number};

const EASE = "var(--growcast-workspace-ease, cubic-bezier(0.16, 1, 0.3, 1))";

export function RangeSelector({
    options,
    value,
    onChange,
    label = "Time range",
    className = "",
}: {
    options: RangeSelectorOption[];
    value: string;
    onChange: (id: string) => void;
    label?: string;
    className?: string;
}) {
    const rowRef = useRef<HTMLDivElement | null>(null);
    const pressedRef = useRef<string | null>(null);
    const committedRef = useRef(false);
    const [pressed, setPressed] = useState<string | null>(null);
    const [reduceMotion, setReduceMotion] = useState(false);
    const [bar, setBar] = useState<Bar>({x: 0, y: 0, width: 0});
    const shown = pressed && options.some((item) => item.id === pressed) ? pressed : value;

    useEffect(() => {
        const media = window.matchMedia("(prefers-reduced-motion: reduce)");
        const apply = () => setReduceMotion(media.matches);
        apply();
        media.addEventListener("change", apply);
        return () => media.removeEventListener("change", apply);
    }, []);

    useLayoutEffect(() => {
        const row = rowRef.current;
        if (!row) {
            return;
        }
        function place() {
            const current = rowRef.current;
            const button = current?.querySelector<HTMLButtonElement>(`[data-range="${CSS.escape(shown)}"]`);
            if (!current || !button) {
                return;
            }
            const rowBox = current.getBoundingClientRect();
            const buttonBox = button.getBoundingClientRect();
            setBar({
                x: buttonBox.left - rowBox.left,
                y: buttonBox.bottom - rowBox.top - 2,
                width: buttonBox.width,
            });
        }
        place();
        const observer = new ResizeObserver(place);
        observer.observe(row);
        return () => observer.disconnect();
    }, [shown, options]);

    function optionFromPoint(clientX: number, clientY: number): RangeSelectorOption | null {
        const row = rowRef.current;
        if (!row) {
            return null;
        }
        const hit = document.elementFromPoint(clientX, clientY);
        const button = hit instanceof Element ? hit.closest("button[data-range]") : null;
        if (!(button instanceof HTMLButtonElement) || !row.contains(button)) {
            return null;
        }
        return options.find((item) => item.id === button.dataset.range) ?? null;
    }

    function select(id: string | null) {
        const option = options.find((item) => item.id === id);
        if (!option || option.disabled || option.id === value) {
            return;
        }
        onChange(option.id);
    }

    function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
        if (event.button !== 0) {
            return;
        }
        const option = optionFromPoint(event.clientX, event.clientY);
        if (!option) {
            return;
        }
        pressedRef.current = option.id;
        setPressed(option.id);
        event.currentTarget.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
        if (pressedRef.current === null) {
            return;
        }
        const option = optionFromPoint(event.clientX, event.clientY);
        if (!option) {
            return;
        }
        pressedRef.current = option.id;
        setPressed(option.id);
    }

    function finish(event: ReactPointerEvent<HTMLDivElement>) {
        const option = optionFromPoint(event.clientX, event.clientY);
        const id = option?.id ?? pressedRef.current;
        pressedRef.current = null;
        setPressed(null);
        committedRef.current = true;
        select(id);
    }

    function cancel() {
        pressedRef.current = null;
        setPressed(null);
    }

    return (
        <div
            ref={rowRef}
            role="group"
            aria-label={label}
            className={`gc-range relative flex flex-wrap gap-x-[22px] gap-y-1 ${className}`.trim()}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finish}
            onPointerCancel={cancel}
        >
            <span
                aria-hidden="true"
                className="pointer-events-none absolute top-0 left-0 h-0.5 bg-zinc-900 dark:bg-zinc-100"
                style={{
                    width: bar.width,
                    transform: `translate(${bar.x}px, ${bar.y}px)`,
                    transition: reduceMotion ? "none" : `transform 220ms ${EASE}, width 220ms ${EASE}`,
                }}
            />
            {options.map((option) => {
                const active = option.id === shown;
                const pressing = pressed === option.id && !reduceMotion;
                return (
                    <button
                        key={option.id}
                        type="button"
                        data-range={option.id}
                        data-press={pressed === option.id ? "1" : "0"}
                        aria-pressed={option.id === value}
                        disabled={option.disabled}
                        onClick={() => {
                            if (committedRef.current) {
                                committedRef.current = false;
                                return;
                            }
                            select(option.id);
                        }}
                        className={`relative z-[1] pb-2 text-sm disabled:cursor-default disabled:opacity-40 ${
                            active
                                ? "font-semibold text-zinc-900 dark:text-zinc-100"
                                : "font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                        }`}
                        style={pressing ? {transform: "translateY(1px)"} : undefined}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}
