import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  isAdminAuthenticated,
  isUsingDefaultAdminCredentials,
  loginAdmin,
  requireAdmin,
} from "@/lib/admin-auth";
import { getCurrentGrow, updateCurrentGrow } from "@/lib/db";
import {
  clearAdminLoginFailures,
  getAdminLoginBlockStatus,
  recordFailedAdminLogin,
} from "@/lib/rate-limit";

type AdminPageProps = {
  searchParams: Promise<{
    error?: string;
    saved?: string;
    retry?: string;
  }>;
};

async function getRequestIp(): Promise<string> {
  const h = await headers();

  const cfIp = h.get("cf-connecting-ip");
  if (cfIp) {
    return cfIp;
  }

  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = h.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  return "unknown";
}

function getRateLimitedRedirect(retryAfterSeconds: number): string {
  return `/admin?error=rate_limited&retry=${retryAfterSeconds}`;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = await searchParams;
  const isLoggedIn = await isAdminAuthenticated();
  const showDefaultCredentialsWarning = isUsingDefaultAdminCredentials();

  async function loginAction(formData: FormData) {
    "use server";

    const ip = await getRequestIp();
    const limitKey = `admin-login:${ip}`;

    const blockStatus = getAdminLoginBlockStatus(limitKey);
    if (blockStatus.blocked) {
      redirect(getRateLimitedRedirect(blockStatus.retryAfterSeconds));
    }

    const username = String(formData.get("username") ?? "");
    const password = String(formData.get("password") ?? "");
    const loggedIn = await loginAdmin(username, password);

    if (!loggedIn) {
      const failureStatus = recordFailedAdminLogin(limitKey);
      if (failureStatus.blocked) {
        redirect(getRateLimitedRedirect(failureStatus.retryAfterSeconds));
      }
      redirect("/admin?error=invalid_credentials");
    }

    clearAdminLoginFailures(limitKey);
    redirect("/admin");
  }
  async function saveGrowAction(formData: FormData) {
    "use server";

    await requireAdmin();

    const seededAt = String(formData.get("seededAt") ?? "");

    await updateCurrentGrow({
      name: String(formData.get("name") ?? ""),
      plant: String(formData.get("plant") ?? ""),
      streamUrl: String(formData.get("streamUrl") ?? ""),
      strain: String(formData.get("strain") ?? ""),
      stage: String(formData.get("stage") ?? ""),
      seededAt,
      lightSchedule: String(formData.get("lightSchedule") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    });

    revalidatePath("/");
    revalidatePath("/admin");
    redirect("/admin?saved=1");
  }

  if (!isLoggedIn) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center p-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Admin Login</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Only authenticated users can edit grow data.
          </p>

          {params.error === "invalid_credentials" ? (
            <p className="mt-4 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              Invalid username or password.
            </p>
          ) : null}

          {params.error === "rate_limited" ? (
            <p className="mt-4 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              Too many failed logins. Try again in {params.retry ?? "a few minutes"} seconds.
            </p>
          ) : null}

          {showDefaultCredentialsWarning ? (
            <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              You are using default admin credentials. Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET in .env.local.
            </p>
          ) : null}

          <form action={loginAction} className="mt-5 space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">Username</span>
              <input
                name="username"
                type="text"
                required
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-emerald-500 focus:ring dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">Password</span>
              <input
                name="password"
                type="password"
                required
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-emerald-500 focus:ring dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            >
              Sign In
            </button>
          </form>
        </div>
      </main>
    );
  }

  const grow = await getCurrentGrow();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-4 md:p-8">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Admin Panel</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Edit the live stream and grow information.</p>
        </div>

{/*        {params.saved ? (
            <p className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
              Saved successfully.
            </p>
        ) : null}*/}

        <form action={saveGrowAction} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">Grow Name</span>
            <input
              name="name"
              defaultValue={grow.name}
              required
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-emerald-500 focus:ring dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">Plant</span>
            <input
              name="plant"
              defaultValue={grow.plant}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-emerald-500 focus:ring dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">Stream URL</span>
            <input
              name="streamUrl"
              defaultValue={grow.streamUrl}
              placeholder="https://..."
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-emerald-500 focus:ring dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">Strain</span>
              <input
                name="strain"
                defaultValue={grow.strain}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-emerald-500 focus:ring dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">Stage</span>
              <input
                name="stage"
                defaultValue={grow.stage}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-emerald-500 focus:ring dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">Date of seeding</span>
              <input
                name="seededAt"
                type="date"
                defaultValue={grow.seededAt}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-emerald-500 focus:ring dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">Light Schedule</span>
              <input
                name="lightSchedule"
                defaultValue={grow.lightSchedule}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-emerald-500 focus:ring dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">Notes</span>
            <textarea
              name="notes"
              defaultValue={grow.notes}
              rows={5}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-emerald-500 focus:ring dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </label>

          <div className="mt-4">
            <div className="relative inline-block">
              <button
                  type="submit"
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              >
                Save Changes
              </button>

              {params.saved ? (
                  <p className="absolute left-full top-1/2 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                    Saved successfully.
                  </p>
              ) : null}
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
