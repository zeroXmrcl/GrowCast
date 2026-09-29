import {passwordLineMet, passwordLineScale} from "@/app/setup/password-line";

export function PasswordLine({value}: {value: string}) {
    const met = passwordLineMet(value);
    const scale = passwordLineScale(value);

    return (
        <div
            aria-hidden
            style={{
                width: "100%",
                height: 2,
                background: "#3a3a3a",
                overflow: "hidden",
            }}
        >
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    background: met ? "#3d9a33" : "#e4e4e7",
                    transform: `scaleX(${scale})`,
                    transformOrigin: "left center",
                }}
            />
        </div>
    );
}
