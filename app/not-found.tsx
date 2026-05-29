import Link from "next/link";

export default function NotFound() {
    return (
        <div className="flex justify-center px-6 mt-20">
            <div className="flex flex-col items-center gap-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src="/growCastLogo_green.svg"
                    alt="GrowCast"
                    className="w-40 h-40 object-contain"
                />
                <div className="text-left">
                    <h1 className="text-4xl text-center font-semibold">Page Not Found</h1>
                    <p className="text-center text-gray-500">
                        The page you are looking for does not exist.
                    </p>
                </div>
                <Link
                    href="/"
                    className="group relative inline-flex items-center justify-center overflow-hidden rounded-2xl border border-zinc-200 bg-white px-6 py-3 text-sm font-medium text-zinc-900 transition-all duration-300 hover:border-emerald-400/70 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:border-emerald-500/70"
                >
                    <span className="relative z-10 flex items-center gap-3">
                        <span>Return to Home</span>
                    </span>
                </Link>
            </div>
        </div>
    )
}