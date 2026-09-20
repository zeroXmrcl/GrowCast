import {listMediaUrls} from "@/lib/media-library";
import {WORKSPACE_AREA, WORKSPACE_HAIRLINE, WORKSPACE_VT} from "@/lib/workspace";

export default async function DashPictures() {
    const images = await listMediaUrls("dashboard");

    if (images.length === 0) {
        return null;
    }

    return (
        <section className={`${WORKSPACE_AREA.pics} ${WORKSPACE_VT.water}`}>
            <div className="grid grid-cols-2 lg:grid-cols-4">
                {images.map((snapshot, index) => {
                    const fileName = decodeURIComponent(snapshot.split("/").pop() ?? snapshot);
                    const last = index === images.length - 1;

                    return (
                        <a
                            key={snapshot}
                            href={snapshot}
                            target="_blank"
                            rel="noreferrer"
                            className={`group overflow-hidden ${last ? "" : `border-r ${WORKSPACE_HAIRLINE}`}`}
                        >
                            <div className="aspect-video w-full overflow-hidden bg-zinc-100 dark:bg-zinc-900">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={snapshot}
                                    alt={fileName}
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                />
                            </div>
                        </a>
                    );
                })}
            </div>
        </section>
    );
}
