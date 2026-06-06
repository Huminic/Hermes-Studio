/**
 * POST /api/public/widget-form
 *
 * AC.4.4 — Form-mode widgets post here. The submission lands in
 * messaging-hub as channel: form, domain: sales by default; the widget
 * frontmatter can override the domain (e.g. service).
 *
 * Body: { slug, profile?, name?, email?, phone?, message }
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { findPublicWidget } from '../../../server/public-widgets'
import {
  appendMessage,
  getOrCreateThread,
  upsertContact,
} from '../../../server/messaging-hub-store'
import { notifyNewLead } from '../../../server/lead-notifications'

export const Route = createFileRoute('/api/public/widget-form')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const slug = typeof body.slug === 'string' ? body.slug : ''
        if (!slug) {
          return json(
            { ok: false, error: 'slug required' },
            { status: 400 },
          )
        }
        const widget = findPublicWidget(slug)
        if (!widget) {
          return json(
            { ok: false, error: 'Widget not found' },
            { status: 404 },
          )
        }
        const profile =
          typeof body.profile === 'string' ? body.profile : widget.profile
        if (profile !== widget.profile) {
          return json(
            { ok: false, error: 'profile mismatch' },
            { status: 400 },
          )
        }
        const fm = widget.frontmatter
        const fmDomain =
          typeof fm.domain === 'string' ? fm.domain : 'sales'
        const domain = fmDomain === 'service' ? 'service' : 'sales'
        const name = typeof body.name === 'string' ? body.name : null
        const email = typeof body.email === 'string' ? body.email : null
        const phone = typeof body.phone === 'string' ? body.phone : null
        const message =
          typeof body.message === 'string' ? body.message : ''
        const handle =
          email ??
          phone ??
          (name ? `form-${name.replace(/\s+/g, '-')}` : `form-${Date.now()}`)

        const identifiers: Record<string, string> = {}
        if (email) identifiers.email = email
        if (phone) identifiers.sms = phone
        if (Object.keys(identifiers).length > 0) {
          upsertContact({
            profile: widget.profile,
            display_name: name,
            identifiers,
          })
        }

        const thread = getOrCreateThread({
          profile: widget.profile,
          domain,
          channel: 'form',
          subject: `form · ${slug}`,
          contact_handle: handle,
          assigned_agent_id:
            typeof fm.agent === 'string' ? fm.agent : null,
        })
        appendMessage({
          thread_id: thread.id,
          direction: 'inbound',
          role: 'user',
          channel: 'form',
          content:
            message ||
            `Form submission (no message) — ${name ?? 'anonymous'}`,
          author: name ?? handle,
          metadata: {
            slug,
            email,
            phone,
            name,
            via: 'widget-form',
          },
        })

        // A website form submission IS a new lead — trip the dealer notification
        // (ADF-XML for Serra, plain email for Columbia), same as the Vapi
        // end-of-call path. Best-effort: the lead is already saved, so a
        // notify failure (e.g. token unset in this env) must not fail the form.
        const notified = await notifyNewLead({
          profile: widget.profile,
          channel: 'website form',
          event: 'website_form',
          contact_handle: handle,
          name,
          email,
          phone,
          message,
          subjectPrefix: 'Website form',
          cooldownKey: email ?? phone ?? handle,
        })

        return json({ ok: true, thread_id: thread.id, notified: notified.ok, via: notified.via })
      },
    },
  },
})
