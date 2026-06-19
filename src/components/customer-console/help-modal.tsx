/**
 * Workspace help — a circled "?" button for the Workspace header that opens a
 * modal instruction manual covering every page of the Workspace. Self-contained
 * (owns its open/close state) so it can be dropped into the header without
 * threading state through the parent.
 */
import { useEffect, useState } from 'react'

const PRIMARY = '#2f3b4d'

type Section = {
  id: string
  title: string
  body: Array<string>
}

/** The instruction manual content, one entry per Workspace page + basics. */
const MANUAL: Array<Section> = [
  {
    id: 'overview',
    title: 'Welcome to your Workspace',
    body: [
      'Your Workspace is where you manage everything your AI does for your store: conversations, leads, agents, your website chat/storefront, marketing, and who gets notified when a customer reaches out.',
      'Use the left navigation to move between pages. Your changes save per page — look for a Save button on pages that hold settings.',
      'Every customer interaction — a phone call, a video chat, a website chat, a text, or a website form — is captured in Teambox and can trigger a notification to your team.',
    ],
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    body: [
      'Your at-a-glance view: lead volume, conversation activity, and performance over the last 7, 30, or 90 days.',
      'Use the range toggle at the top to change the time window. Cards summarize how your AI is performing and where leads are coming from.',
    ],
  },
  {
    id: 'chat',
    title: 'Chat',
    body: [
      'Talk directly to your AI assistants. Ask questions about your store, your leads, or how to do something here.',
      'Pick which assistant you are talking to from the selector. This is your private workspace chat — it is not what website visitors see.',
    ],
  },
  {
    id: 'teambox',
    title: 'Teambox',
    body: [
      'Every customer conversation lands here — calls, video chats, website chats, texts, and form submissions — as a single thread per customer.',
      'Open a thread to read the full history (including call transcripts and recording links). You can take over a conversation from the AI at any time; once you do, the AI stops auto-replying on that thread until you hand it back.',
      'Filter and sort to find what you need; use the agent selector to see which assistant handled a thread.',
    ],
  },
  {
    id: 'marketing',
    title: 'Marketing',
    body: [
      'Build and run outreach: campaigns, audiences/lists, and automations (for example, an instant text to every new lead, or a 24-hour follow-up).',
      'Overview shows performance. Campaigns and Lists let you create and manage sends. Automations let you set "when this happens, send this" rules that run on their own.',
    ],
  },
  {
    id: 'agents',
    title: 'Agents',
    body: [
      'Your AI team. See which assistants are enabled for your store and what each one does.',
      'Open an assistant to review its configuration and the tasks it can perform. Only the assistants meant for your store are shown.',
    ],
  },
  {
    id: 'storefront',
    title: 'Storefront',
    body: [
      'Your website chat and video widgets — what your customers see and click on your site.',
      'Preview how the widget looks, and copy the embed code to place it on your website. Each widget is tied to an assistant.',
    ],
  },
  {
    id: 'notifications',
    title: 'Notifications',
    body: [
      'Decide who gets alerted when a new lead comes in, and how. Each row is a rule: "when THIS happens, notify THIS person, using THIS template."',
      'Recipient is the email address that gets the alert. Template chooses the format: "Styled email" is the readable lead card a person opens; "ADF/XML" is the machine format your CRM/DMS ingests (used for a dealer intake address). "Store default" follows your store’s configured format.',
      'Use the Test button on a row to send that recipient a sample notification — it uses the exact same template a real lead would, so you can confirm it arrives and looks right.',
      'Click Add rule to add a recipient, edit any field inline, toggle On to enable/disable a rule, and Save when done. The same notification fires identically for calls (Vapi), video (Tavus), and website leads.',
    ],
  },
  {
    id: 'infostore',
    title: 'InfoStore',
    body: [
      'Your store’s knowledge: the facts, inventory context, and documents your AI uses to answer customers accurately.',
      'Keep this current — the better your InfoStore, the better your AI’s answers.',
    ],
  },
  {
    id: 'help',
    title: 'Getting more help',
    body: [
      'If something looks wrong — a lead that did not notify, a widget that will not load, or a setting that will not save — note the page and what you expected, and contact your Huminic representative.',
    ],
  },
]

function HelpModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Workspace help"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-4 text-white"
          style={{ background: PRIMARY }}
        >
          <h2 className="text-base font-semibold">Workspace help &amp; instructions</h2>
          <button
            type="button"
            className="rounded px-2 text-xl leading-none text-slate-200 hover:text-white"
            onClick={onClose}
            aria-label="Close help"
          >
            ×
          </button>
        </div>

        <nav className="flex flex-wrap gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs">
          {MANUAL.map((s) => (
            <a
              key={s.id}
              href={`#help-${s.id}`}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600 hover:border-slate-400 hover:text-slate-900"
            >
              {s.title}
            </a>
          ))}
        </nav>

        <div className="overflow-y-auto px-6 py-5">
          {MANUAL.map((s) => (
            <section key={s.id} id={`help-${s.id}`} className="mb-6 scroll-mt-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">{s.title}</h3>
              {s.body.map((p, i) => (
                <p key={i} className="mb-2 text-sm leading-6 text-slate-600">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

export function HelpButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open help and instructions"
        title="Help & instructions"
        className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 text-sm font-semibold text-white transition-colors hover:bg-white/10"
      >
        ?
      </button>
      {open && <HelpModal onClose={() => setOpen(false)} />}
    </>
  )
}
