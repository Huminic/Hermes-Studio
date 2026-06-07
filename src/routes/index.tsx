import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
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
    <div className="flex min-h-dvh flex-col bg-slate-50 font-sans text-slate-900">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-5">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Huminic
          </h1>
          <span className="text-xs uppercase tracking-wide text-slate-400">
            Store sign-in
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-10">
        <section className="flex flex-col gap-4">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
            Choose your store to sign in
          </h2>
          <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-slate-600">
            <p>
              Welcome to your upgraded platform. Each store now has its own
              dedicated workspace — your agents, your inbox, your widgets, your
              dashboards, and your campaigns, all in one place. To get started,
              select your store from the cards below and sign in with the
              credentials provided to you. Everything you used before is here,
              organized by store so the right people see the right work.
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
          </div>
        </section>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STORES.map((store) => (
            <li key={store.profile}>
              <Link
                to="/p/$profile"
                params={{ profile: store.profile }}
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
      </main>

      <footer className="flex items-center justify-between border-t border-slate-200 bg-white px-6 py-4 text-[11px] text-slate-400">
        <span>Powered by Huminic</span>
        <span>
          Need access? Call or text {ADMIN_CONTACT}
        </span>
      </footer>
    </div>
  )
}
