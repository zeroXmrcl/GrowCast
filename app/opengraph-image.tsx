import {ImageResponse} from "next/og";
import {rasterizeShareCardAssets} from "@/lib/share-card-image";
import {
    loadShareCardCopy,
    resolveShareCardStill,
    shareCardOgImageId,
    shareCardStillMtimeMs,
    shareCardStillPath,
} from "@/lib/share-card";

export const alt = "GrowCast";
export const size = {width: 1200, height: 630};
export const contentType = "image/png";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateImageMetadata(): Promise<
    Array<{
        id: string;
        alt: string;
        size: {width: number; height: number};
        contentType: string;
    }>
> {
    const still = await resolveShareCardStill();
    const mtimeMs = await shareCardStillMtimeMs(still ? shareCardStillPath(still) : null);
    return [
        {
            id: shareCardOgImageId(still, mtimeMs),
            alt,
            size,
            contentType,
        },
    ];
}

export default async function Image({id}: {id: Promise<string | number>}) {
    await id;
    const copy = await loadShareCardCopy("");
    const {stillSrc, logoSrc} = await rasterizeShareCardAssets(await resolveShareCardStill());

    return new ImageResponse(
        (
            <div
                style={{
                    display: "flex",
                    width: 1200,
                    height: 630,
                    background: "#09090b",
                    position: "relative",
                }}
            >
                {stillSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={stillSrc}
                        alt=""
                        width={1200}
                        height={630}
                        style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            objectFit: "cover",
                        }}
                    />
                ) : null}
                <div
                    style={{
                        display: "flex",
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: 290,
                        backgroundImage:
                            "linear-gradient(to top, rgba(9,9,11,0.92) 0%, rgba(9,9,11,0.55) 45%, rgba(9,9,11,0) 100%)",
                    }}
                />
                <div
                    style={{
                        display: "flex",
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: 0,
                        padding: "28px 40px 32px",
                        justifyContent: "space-between",
                        alignItems: "flex-end",
                    }}
                >
                    <div style={{display: "flex", alignItems: "center", gap: 12}}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={logoSrc} alt="" width={40} height={40} />
                        <div
                            style={{
                                display: "flex",
                                fontSize: 28,
                                fontWeight: 650,
                                color: "#fafafa",
                                letterSpacing: "-0.03em",
                            }}
                        >
                            GrowCast
                        </div>
                    </div>
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-end",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                fontSize: 34,
                                fontWeight: 650,
                                color: "#fafafa",
                                letterSpacing: "-0.03em",
                            }}
                        >
                            {copy.plant}
                        </div>
                        {copy.stats ? (
                            <div
                                style={{
                                    display: "flex",
                                    marginTop: 8,
                                    fontSize: 22,
                                    color: "#d4d4d8",
                                }}
                            >
                                {copy.stats}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        ),
        {width: 1200, height: 630},
    );
}
