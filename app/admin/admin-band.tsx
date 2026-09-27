import type {ReactNode} from "react";

type AdminBandProps = {
    id?: string;
    title: string;
    children: ReactNode;
    plain?: boolean;
};

export function AdminBandGroup({children}: {children: ReactNode}) {
    return <div className="admin-band-group">{children}</div>;
}

export function AdminBand({id, title, children, plain = false}: AdminBandProps) {
    return (
        <section id={id} className={plain ? "admin-band admin-band-plain" : "admin-band"}>
            <h2 className="text-base font-semibold text-(--admin-text)">{title}</h2>
            <div className="min-w-0">{children}</div>
        </section>
    );
}
