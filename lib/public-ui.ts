/** Shared public-site chrome. Garden ink, not a Vercel restyle. */

export const PUBLIC_FOCUS =
    "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:focus-visible:outline-emerald-400";

export const PUBLIC_FOCUS_INSET =
    "outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-700 dark:focus-visible:outline-emerald-400";

export const PUBLIC_HIT = "inline-flex min-h-11 min-w-11 items-center justify-center";

export const PUBLIC_NAV_LINK = `${PUBLIC_HIT} shrink-0 rounded-md px-3 text-sm ${PUBLIC_FOCUS}`;

export const PUBLIC_NAV_LINK_ACTIVE =
    `${PUBLIC_NAV_LINK} bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100`;

export const PUBLIC_NAV_LINK_IDLE =
    `${PUBLIC_NAV_LINK} text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100`;

export const PUBLIC_CHIP = `${PUBLIC_HIT} rounded-full px-4 text-sm font-medium ${PUBLIC_FOCUS}`;

export const PUBLIC_CHIP_ON =
    `${PUBLIC_CHIP} bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900`;

export const PUBLIC_CHIP_OFF =
    `${PUBLIC_CHIP} border border-zinc-300 text-zinc-700 dark:border-zinc-600 dark:text-zinc-300`;

export const PUBLIC_MEDIA_LINK = `relative block ${PUBLIC_FOCUS_INSET}`;

export const PUBLIC_TEXT_LINK =
    `${PUBLIC_HIT} rounded-md px-1 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 ${PUBLIC_FOCUS}`;

export const PUBLIC_EMPTY_TITLE =
    "text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100";

export const PUBLIC_EMPTY_BODY =
    "mt-2 max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-400";

export const PUBLIC_PAGE_TITLE =
    "text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100";

export const PUBLIC_PAGE_LEAD = "mt-3 max-w-xl text-sm leading-6 text-zinc-600 dark:text-zinc-400";

export const PUBLIC_AXIS_LABEL = "text-xs leading-none text-zinc-500 dark:text-zinc-400";
