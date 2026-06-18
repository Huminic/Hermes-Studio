import { Link, createFileRoute } from '@tanstack/react-router'

/**
 * Optional store-chooser landing at `/stores` (preserved from the old `/`).
 *
 * Per Duane's entrypoint correction (2026-06-09): `studio.huminic.app/` is the
 * Global Huminic Studio backend root and must NOT show the store chooser. The
 * chooser is kept here so it isn't lost; stores still have direct
 * `/p/<profile>/chat` Workspace URLs.
 */
export const Route = createFileRoute('/stores')({
  component: StorePickerLanding,
})

// Static roster of the live customer entities. Kept as an explicit manifest
// (rather than reading the full profile list) so the public landing never
// leaks non-customer/internal profiles. Names + accents mirror each profile's
// studio.yaml branding.
type StoreCard = {
  profile: string
  name: string
  accent: string
  blurb: string
}

const STORES: Array<StoreCard> = [
  { profile: 'serra-honda', name: 'Serra Honda', accent: '#dc2626', blurb: 'Sales' },
  { profile: 'serra-service', name: 'Serra Service', accent: '#0e7490', blurb: 'Service' },
  { profile: 'serra-nissan', name: 'Serra Nissan', accent: '#c3002f', blurb: 'Sales' },
  { profile: 'tony-serra-ford', name: 'Tony Serra Ford', accent: '#1c3f94', blurb: 'Sales' },
  { profile: 'hyundai-of-columbia', name: 'Hyundai of Columbia', accent: '#002c5f', blurb: 'Sales' },
  { profile: 'ford-of-columbia', name: 'Ford of Columbia', accent: '#1c3f94', blurb: 'Sales' },
]

const ADMIN_CONTACT = '412.654.6500'

function StorePickerLanding() {
  return (
    <div className="flex min-h-dvh bg-slate-950 font-sans text-slate-900 md:bg-slate-50">
      <section className="flex w-full flex-col md:min-h-dvh md:flex-row">
        <div className="flex min-h-64 flex-col justify-between bg-[#2f3b4d] px-6 py-7 text-white md:w-[46%] md:px-10 md:py-10 lg:px-14">
          <div className="flex items-center gap-3">
            <div
              aria-hidden
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-3xl font-semibold leading-none text-white ring-1 ring-white/15"
              style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
            >
              h
            </div>
          </div>

          <div className="mt-12 max-w-md md:mt-0">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
              Workspace access
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white md:text-5xl">
              Choose your store
            </h1>
            <p className="mt-4 text-base leading-7 text-slate-300">
              Each store has its own dedicated Workspace. Select your store to sign in and access agents, inbox, widgets, dashboards, and campaigns.
            </p>
          </div>

          <div className="mt-10 text-xs text-slate-500">
            Powered by Huminic
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center bg-white px-6 py-10 md:px-10">
          <div className="w-full max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950 mb-6">
              Sign in
            </h2>

        <div className="grid flex-1 grid-cols-1 items-start gap-6">
          <section className="space-y-3 text-sm leading-relaxed text-slate-600">
            <p>
              Welcome to your upgraded platform. Each store now has its own
              dedicated Workspace — your agents, your inbox, your widgets, your
              dashboards, and your campaigns, all in one place. To get started,
              select your store and sign in with the credentials provided to
              you. Everything you used before is here, organized by store so the
              right people see the right work.
            </p>
            <p>
              If you don't have a login yet, or you're not sure which store is
              yours, please contact your administrator at{' '}
              <a
                href={`tel:+1${ADMIN_CONTACT.replace(/\D/g, '')}`}
                className="font-semibold text-slate-900 underline"
              >
                {ADMIN_CONTACT}
              </a>{' '}
              by voice or text and we'll get you set up. Please don't share your
              login — each account is tied to a single store, and access to
              additional stores can be arranged through your administrator.
            </p>
          </section>

          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {STORES.map((store) => (
            <li key={store.profile}>
              <Link
                to="/p/$profile/$tab"
                params={{ profile: store.profile, tab: 'dashboard' }}
                className="group flex h-full flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div
                  className="h-1.5 w-full"
                  style={{ background: store.accent }}
                  aria-hidden
                />
                <div className="flex flex-1 flex-col gap-1 p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-semibold text-slate-900">
                      {store.name}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white"
                      style={{ background: store.accent }}
                    >
                      {store.blurb}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">
                    Sign in to the {store.name} workspace
                  </span>
                  <span
                    className="mt-4 text-sm font-medium"
                    style={{ color: store.accent }}
                  >
                    Sign in →
                  </span>
                </div>
              </Link>
            </li>
          ))}
          </ul>
        </div>
          </div>
        </div>
      </section>
    </div>
  )
}
