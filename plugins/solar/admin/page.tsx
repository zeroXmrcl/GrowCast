"use client";

import {useState} from "react";
import {
    AdminBand,
    AdminBandGroup,
    AdminButton,
    AdminCheckboxRow,
    AdminField,
    AdminInput,
    usePluginAdminState,
} from "@/lib/plugins/admin-kit";

type SolarAdminState = {
    config: Record<string, string | number | boolean>;
    passwordSet: boolean;
};

const ALLOCATION = [
    {id: "proportional", label: "Proportional"},
    {id: "tent-first", label: "Tent first"},
    {id: "tent-last", label: "Tent last"},
];

const ORIGIN = [
    {id: "always-solar", label: "Always solar"},
    {id: "mix", label: "Mixed"},
    {id: "always-grid", label: "Always grid"},
];

const VALUE = [
    {id: "zero", label: "0.00 € (free)"},
    {id: "feed-in", label: "Feed-in tariff"},
];

const PREVIEW_STATE: SolarAdminState = {
    config: {
        publicPv: true,
        publicBattery: true,
        publicGrid: true,
        publicTentShare: true,
        host: "192.168.1.40",
        transport: "rest",
        intervalS: 10,
        pvPeakW: 11000,
        batteryWh: 14000,
        timezone: "Europe/Berlin",
        allocationMode: "proportional",
        batteryDischargeOrigin: "always-solar",
        solarKwhValueMode: "zero",
        feedInTariffEurPerKwh: 0.08,
        gridTariffEurPerKwh: 0.32,
    },
    passwordSet: true,
};

export default function AdminSolarPage({preview = false}: {preview?: boolean} = {}) {
    const remote = usePluginAdminState<SolarAdminState>("admin-state");
    const data = preview ? PREVIEW_STATE : remote.data;
    const reload = preview ? () => undefined : remote.reload;
    const [values, setValues] = useState<Record<string, string | number | boolean> | null>(
        preview ? PREVIEW_STATE.config : null,
    );
    const [password, setPassword] = useState("");
    const [pending, setPending] = useState(false);

    if (!data) {
        return <p className="text-sm text-(--admin-muted)">Loading Solar…</p>;
    }
    const loaded = data;
    const cfg = {...loaded.config, ...(values ?? {})};

    function setField(name: string, value: string | number | boolean) {
        setValues((current) => ({...(current ?? loaded.config), [name]: value}));
    }

    async function save() {
        if (preview) {
            return;
        }
        setPending(true);
        try {
            const body: Record<string, string | number | boolean> = {...cfg};
            if (password) {
                body.password = password;
            }
            await fetch("/api/plugins/v1/growcast.solar/x/config", {
                method: "POST",
                credentials: "include",
                headers: {"content-type": "application/json"},
                body: JSON.stringify(body),
            });
            setPassword("");
            reload();
        } finally {
            setPending(false);
        }
    }

    return (
        <AdminBandGroup>
            <AdminBand id="public" title="Public data">
                <p className="mb-3 text-sm text-(--admin-muted)">Shown on the public dashboard and stream overlay.</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <AdminCheckboxRow
                        label="PV power"
                        description="Live watts and daily production."
                        checked={cfg.publicPv !== false}
                        onChange={(event) => setField("publicPv", event.currentTarget.checked)}
                    />
                    <AdminCheckboxRow
                        label="Battery"
                        description="SoC and charge / discharge."
                        checked={cfg.publicBattery !== false}
                        onChange={(event) => setField("publicBattery", event.currentTarget.checked)}
                    />
                    <AdminCheckboxRow
                        label="Grid"
                        description="Import and export."
                        checked={cfg.publicGrid !== false}
                        onChange={(event) => setField("publicGrid", event.currentTarget.checked)}
                    />
                    <AdminCheckboxRow
                        label="Tent solar share"
                        description="Solar vs grid split of the tent."
                        checked={cfg.publicTentShare !== false}
                        onChange={(event) => setField("publicTentShare", event.currentTarget.checked)}
                    />
                </div>
            </AdminBand>
            <AdminBand id="adapter" title="Adapter and system">
                <p className="mb-3 text-sm text-(--admin-muted)">FENECON FEMS / OpenEMS over LAN REST. Modbus TCP is the fallback.</p>
                <div className="grid gap-4 sm:grid-cols-2">
                    <AdminField label="FEMS IP or hostname">
                        <AdminInput value={String(cfg.host ?? "")} onChange={(event) => setField("host", event.currentTarget.value)} />
                    </AdminField>
                    <AdminField label="FEMS password" hint={loaded.passwordSet ? "Leave blank to keep the stored password." : undefined}>
                        <AdminInput type="password" value={password} placeholder={loaded.passwordSet ? "••••" : ""} onChange={(event) => setPassword(event.currentTarget.value)} />
                    </AdminField>
                    <AdminField label="Transport">
                        <div className="gc-seg">
                            {["rest", "modbus"].map((id) => (
                                <button key={id} type="button" className={cfg.transport === id ? "on" : ""} onClick={() => setField("transport", id)}>
                                    {id === "rest" ? "REST" : "Modbus TCP"}
                                </button>
                            ))}
                        </div>
                    </AdminField>
                    <AdminField label="Poll interval (s)">
                        <AdminInput type="number" value={String(cfg.intervalS ?? 10)} onChange={(event) => setField("intervalS", Number(event.currentTarget.value))} />
                    </AdminField>
                    <AdminField label="PV peak (Wp)">
                        <AdminInput type="number" value={String(cfg.pvPeakW ?? "")} onChange={(event) => setField("pvPeakW", Number(event.currentTarget.value))} />
                    </AdminField>
                    <AdminField label="Battery capacity (Wh)">
                        <AdminInput type="number" value={String(cfg.batteryWh ?? "")} onChange={(event) => setField("batteryWh", Number(event.currentTarget.value))} />
                    </AdminField>
                    <AdminField label="Timezone for daily windows">
                        <AdminInput value={String(cfg.timezone ?? "Europe/Berlin")} onChange={(event) => setField("timezone", event.currentTarget.value)} />
                    </AdminField>
                </div>
            </AdminBand>
            <AdminBand id="allocation" title="Allocation">
                <p className="mb-3 text-sm text-(--admin-muted)">Who is counted as using solar when supply cannot cover the whole house.</p>
                <AdminField label="Mode">
                    <div className="gc-seg">
                        {ALLOCATION.map((item) => (
                            <button key={item.id} type="button" className={cfg.allocationMode === item.id ? "on" : ""} onClick={() => setField("allocationMode", item.id)}>
                                {item.label}
                            </button>
                        ))}
                    </div>
                </AdminField>
                <AdminField label="Battery discharge">
                    <div className="gc-seg">
                        {ORIGIN.map((item) => (
                            <button key={item.id} type="button" className={cfg.batteryDischargeOrigin === item.id ? "on" : ""} onClick={() => setField("batteryDischargeOrigin", item.id)}>
                                {item.label}
                            </button>
                        ))}
                    </div>
                </AdminField>
            </AdminBand>
            <AdminBand id="valuation" title="Valuation">
                <p className="mb-3 text-sm text-(--admin-muted)">Prices the tent’s solar share only. It does not change what the meter bills.</p>
                <AdminField label="Solar kWh value">
                    <div className="gc-seg">
                        {VALUE.map((item) => (
                            <button key={item.id} type="button" className={cfg.solarKwhValueMode === item.id ? "on" : ""} onClick={() => setField("solarKwhValueMode", item.id)}>
                                {item.label}
                            </button>
                        ))}
                    </div>
                </AdminField>
                <div className="grid gap-4 sm:grid-cols-2">
                    <AdminField label="Feed-in tariff (€/kWh)">
                        <AdminInput type="number" step="0.01" value={String(cfg.feedInTariffEurPerKwh ?? "")} onChange={(event) => setField("feedInTariffEurPerKwh", Number(event.currentTarget.value))} />
                    </AdminField>
                    <AdminField label="Grid tariff (€/kWh)">
                        <AdminInput type="number" step="0.01" value={String(cfg.gridTariffEurPerKwh ?? "")} onChange={(event) => setField("gridTariffEurPerKwh", Number(event.currentTarget.value))} />
                    </AdminField>
                </div>
            </AdminBand>
            <div className="flex gap-3">
                <AdminButton tone="secondary" onClick={() => { setValues(preview ? PREVIEW_STATE.config : null); setPassword(""); }}>Discard</AdminButton>
                <AdminButton tone="primary" disabled={pending || preview} onClick={() => void save()}>
                    {preview ? "Preview" : pending ? "Saving…" : "Save settings"}
                </AdminButton>
            </div>
        </AdminBandGroup>
    );
}
