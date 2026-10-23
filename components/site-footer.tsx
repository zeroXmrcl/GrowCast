import {PUBLIC_TEXT_LINK} from "@/lib/public-ui";

export default function SiteFooter() {
  return (
    <footer className="vt-footer border-t border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="flex flex-col gap-3 py-6 md:flex-row md:items-center md:justify-between">
        <span className="text-sm text-zinc-500 dark:text-zinc-400" title="Discord: 0xmrcl, GitHub: zeroXmrcl">
          &copy; 2026 GrowCast. Made by 0xmrcl
        </span>
        <div className="-mx-1 flex items-center gap-2">
          <a
            href="https://github.com/zeroXmrcl/growcast"
            className={PUBLIC_TEXT_LINK}
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          <a
            href="https://growcast.0xmarcel.com"
            className={PUBLIC_TEXT_LINK}
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
