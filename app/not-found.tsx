export default function NotFound() {
    return (
        <div className="flex justify-center px-6 mt-20">
            <div className="flex items-center gap-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src="/growCastLogo_green.svg"
                    alt="GrowCast"
                    className="w-40 h-40 object-contain"
                />
                <div className="text-left">
                    <h1 className="text-4xl font-semibold">Page Not Found</h1>
                    <p className="text-gray-500">
                        The page you are looking for does not exist.
                    </p>
                </div>
            </div>
        </div>
    )
}