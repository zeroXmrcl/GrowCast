"use client";

import {useState} from "react";
import {AdminButton, AdminInput} from "@/components/admin/ui";

export function AdminOptionalTimeInput({
    name,
    defaultValue,
}: {
    name: string;
    defaultValue: string;
}) {
    const [value, setValue] = useState(defaultValue);

    return (
        <div className="flex gap-2">
            <AdminInput
                name={name}
                type="time"
                lang="en-GB"
                step={60}
                value={value}
                onChange={(event) => setValue(event.target.value)}
            />
            <AdminButton
                type="button"
                tone="secondary"
                disabled={!value}
                onClick={() => setValue("")}
            >
                Clear
            </AdminButton>
        </div>
    );
}
