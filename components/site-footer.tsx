export default function SiteFooter() {
  return (
    <footer className="border-t border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <span className="text-sm text-zinc-500 dark:text-zinc-400" title="Discord: 0xmrcl, GitHub: zeroXmrcl">
          &copy; 2026 GrowCast. Made by 0xmrcl
        </span>
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/zeroXmrcl/growcast"
            className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <a
            href="https://growcast.0xmarcel.com"
            className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            target="_blank"
            rel="noreferrer"
          >
            Website
          </a>
        </div>
      </div>
    </footer>
  );
}
