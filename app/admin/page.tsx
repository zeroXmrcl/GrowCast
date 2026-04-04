import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  getAdminAuthStatus,
  isAdminAuthenticated,
  loginAdmin,
  requireAdmin,
} from "@/lib/admin-auth";
import { getCurrentGrow, updateCurrentGrow } from "@/lib/db";

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

function toNumber(value: FormDataEntryValue | null, fallback = 0): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = await searchParams;
  const isLoggedIn = await isAdminAuthenticated();
  const adminStatus = getAdminAuthStatus();

  async function loginAction(formData: FormData) {
    "use server";

    const ip = await getRequestIp();
    const clientKey = `admin-login:${ip}`;

    const username = String(formData.get("username") ?? "");
    const password = String(formData.get("password") ?? "");

    const result = await loginAdmin(username, password, clientKey);

    if (!result.ok) {
      if (result.code === "rate_limited") {
        redirect(`/admin?error=rate_limited&retry=${result.retryAfterSeconds ?? 900}`);
      }

      if (result.code === "login_disabled") {
        redirect("/admin?error=login_disabled");
      }

      redirect("/admin?error=invalid_credentials");
    }

    redirect("/admin");
  }

  async function saveGrowAction(formData: FormData) {
    "use server";

    await requireAdmin();

    const seededAt = String(formData.get("seededAt") ?? "");

    await updateCurrentGrow({
      name: String(formData.get("name") ?? ""),
      showGrowName: formData.get("showGrowName") === "on",
      plant: String(formData.get("plant") ?? ""),
      plantAmount: toNumber(formData.get("plantAmount"), 0),
      streamUrl: String(formData.get("streamUrl") ?? ""),
      details: {
        strain: String(formData.get("strain") ?? ""),
        stage: String(formData.get("stage") ?? ""),
        seededAt,
        lightSchedule: String(formData.get("lightSchedule") ?? ""),
        notes: String(formData.get("notes") ?? ""),
      },
      growSetup: {
        setupText: String(formData.get("setupText") ?? ""),
        growingMedium: String(formData.get("growingMedium") ?? ""),
        potSizeLiters: toNumber(formData.get("potSizeLiters"), 0),
      },
      status: {
        health: String(formData.get("health") ?? "Healthy"),
        estimatedHarvestDate: String(formData.get("estimatedHarvestDate") ?? ""),
        notes: String(formData.get("statusNotes") ?? ""),
      },
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
              Only authenticated users can access settings.
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

            {params.error === "login_disabled" ? (
                <p className="mt-4 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                  Admin login is disabled because the admin configuration is incomplete.
                </p>
            ) : null}

            {params.error === "unauthorized" ? (
                <p className="mt-4 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                  You must be signed in to do that.
                </p>
            ) : null}

            {!adminStatus.canLogin ? (
                <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  <p className="font-medium">Admin login is disabled.</p>
                  <div className="mt-2 space-y-1">
                    {adminStatus.warnings.map((warning) => (
                        <div key={warning}>{warning}</div>
                    ))}
                  </div>
                </div>
            ) : null}

            <form action={loginAction} className="mt-5 space-y-3">
              <label className="block">
                <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">Username</span>
                <input
                    name="username"
                    type="text"
                    required
                    disabled={!adminStatus.canLogin}
                    autoComplete="username"
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#068200] focus:ring-1 focus:ring-[#068200] disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">Password</span>
                <input
                    name="password"
                    type="password"
                    required
                    disabled={!adminStatus.canLogin}
                    autoComplete="current-password"
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#068200] focus:ring-1 focus:ring-[#068200] disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </label>
              <button
                  type="submit"
                  disabled={!adminStatus.canLogin}
                  className="w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
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
        <div className="bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mb-6">
            <h1 className="text-3xl font-semibold text-zinc-900 dark:text-zinc-100">Admin Dashboard</h1>
          </div>

          <form action={saveGrowAction} className="space-y-4">
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">Plant</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">Grow Title</span>
                  <input
                      name="name"
                      defaultValue={grow.name}
                      required
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#068200] focus:ring-1 focus:ring-[#068200] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">Plant</span>
                  <input
                      name="plant"
                      defaultValue={grow.plant}
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#068200] focus:ring-1 focus:ring-[#068200] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">Plant Amount</span>
                  <input
                      name="plantAmount"
                      type="number"
                      min={0}
                      defaultValue={grow.plantAmount}
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#068200] focus:ring-1 focus:ring-[#068200] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">Strain</span>
                  <input
                      name="strain"
                      defaultValue={grow.details.strain}
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#068200] focus:ring-1 focus:ring-[#068200] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">Stage</span>
                  <select
                      name="stage"
                      defaultValue={grow.details.stage}
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#068200] focus:ring-1 focus:ring-[#068200] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    <option value="seed">Seed</option>
                    <option value="seedling">Seedling</option>
                    <option value="vegetative">Vegetative</option>
                    <option value="flowering">Flowering</option>
                    <option value="harvest">Harvest</option>
                    <option value="drying">Drying</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">Date of Seeding</span>
                  <input
                      name="seededAt"
                      type="date"
                      defaultValue={grow.details.seededAt}
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#068200] focus:ring-1 focus:ring-[#068200] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">Light Schedule</span>
                  <input
                      name="lightSchedule"
                      defaultValue={grow.details.lightSchedule}
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#068200] focus:ring-1 focus:ring-[#068200] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </label>
              </div>
              <label className="mt-4 block">
                <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">General Notes</span>
                <textarea
                    name="notes"
                    defaultValue={grow.details.notes}
                    rows={5}
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#068200] focus:ring-1 focus:ring-[#068200] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </label>
            </div>

            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">Stream</h2>
              <label className="mb-4 flex items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-zinc-100 dark:hover:bg-zinc-900">
                <input
                    name="showGrowName"
                    type="checkbox"
                    defaultChecked={grow.showGrowName}
                    className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 dark:border-zinc-700"
                />
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
    Show grow title above stream
  </span>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">Stream URL</span>
                <input
                    name="streamUrl"
                    defaultValue={grow.streamUrl}
                    placeholder="https://..."
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#068200] focus:ring-1 focus:ring-[#068200] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </label>
            </div>

            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">Grow Status</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">Health</span>
                  <select
                      name="health"
                      defaultValue={grow.status.health}
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#068200] focus:ring-1 focus:ring-[#068200] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    <option value="Healthy">Healthy</option>
                    <option value="Warning">Warning</option>
                    <option value="Critical">Critical</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">Estimated Harvest Date</span>
                  <input
                      name="estimatedHarvestDate"
                      type="date"
                      defaultValue={grow.status.estimatedHarvestDate}
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#068200] focus:ring-1 focus:ring-[#068200] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </label>
              </div>
              <label className="mt-4 block">
                <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">Health Notes</span>
                <textarea
                    name="statusNotes"
                    defaultValue={grow.status.notes}
                    rows={3}
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#068200] focus:ring-1 focus:ring-[#068200] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </label>
            </div>

            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">Grow Setup</h2>
              <div className="mb-4 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">Growing Medium</span>
                  <input
                      name="growingMedium"
                      defaultValue={grow.growSetup.growingMedium}
                      placeholder="Soil, Coco, Hydro..."
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#068200] focus:ring-1 focus:ring-[#068200] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">Pot Size (L)</span>
                  <input
                      name="potSizeLiters"
                      type="number"
                      min={0}
                      defaultValue={grow.growSetup.potSizeLiters}
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#068200] focus:ring-1 focus:ring-[#068200] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300">Setup List</span>
                <textarea
                    name="setupText"
                    defaultValue={grow.growSetup.setupText}
                    rows={7}
                    placeholder={"Tent: ...\nLight: ...\nFan: ..."}
                    className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#068200] focus:ring-1 focus:ring-[#068200] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </label>
            </div>

            <div className="mt-4">
              <div className="relative inline-block">
                <button
                    type="submit"
                    className="rounded-md bg-[#068200] px-4 py-2 text-sm font-medium text-white hover:bg-[#057000]"                >
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