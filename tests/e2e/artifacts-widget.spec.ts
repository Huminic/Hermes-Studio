import { test, expect } from '@playwright/test'

test.describe('public artifact and widget MVP', () => {
  test('publishes an artifact and exposes its public link', async ({ request }) => {
    const created = await request.post('/api/artifacts', {
      data: {
        profile: 'e2e',
        title: 'E2E Shareable Report',
        description: 'Created by Playwright smoke coverage.',
        type: 'report',
      },
    })
    expect(created.status()).toBe(201)
    const createdBody = await created.json()
    expect(createdBody.ok).toBe(true)

    const artifactId = createdBody.artifact.id
    const publicId = createdBody.artifact.publicId

    const publish = await request.patch(`/api/artifacts/${artifactId}`, {
      data: { status: 'published', actor: 'playwright' },
    })
    expect(publish.status()).toBe(200)

    const publicRes = await request.get(`/api/public/artifacts/${publicId}`)
    expect(publicRes.status()).toBe(200)
    expect(publicRes.headers()['content-type']).toContain('text/html')
    await expect(publicRes.text()).resolves.toContain('E2E Shareable Report')
  })

  test('serves widget config and hosted JavaScript', async ({ request }) => {
    const update = await request.patch('/api/widgets/e2e', {
      data: {
        enabled: true,
        launcherLabel: 'Ask E2E',
        allowedDomains: [],
        agents: [
          {
            agentId: 'e2e-agent',
            label: 'E2E Agent',
            description: 'Customer-facing test agent',
            customerFacing: true,
            channels: ['chat'],
          },
        ],
      },
    })
    expect(update.status()).toBe(200)
    const updateBody = await update.json()
    const widgetKey = updateBody.widget.widgetKey

    const config = await request.get(`/api/public/widgets/${widgetKey}`)
    expect(config.status()).toBe(200)
    const configBody = await config.json()
    expect(configBody.widget.agents[0].label).toBe('E2E Agent')

    const script = await request.get('/hermes-widget.js')
    expect(script.status()).toBe(200)
    expect(script.headers()['content-type']).toContain('application/javascript')
    await expect(script.text()).resolves.toContain('HermesWidgetLoaded')
  })
})
