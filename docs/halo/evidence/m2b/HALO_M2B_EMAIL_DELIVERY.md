# Halo M2B - Email delivery (completed)

Governed evidence for the authorized M2B three-store TEST email delivery. Isolated dev; **no production
service, deployment, merge, CRM, customer/dealer contact, or live alert dispatch was involved or changed.**
Studio authored/generated the artifacts; Codex performed the three allowlisted sends. Exactly three emails
were delivered - one report card per governed Sales rooftop - to a single internal test recipient.

## Period + Sales-only boundary

- **Latest complete accepted weekly period:** 2026-08-17 through 2026-08-23.
- Newer daily files through 2026-08-28 remain **quarantined**: their saved VinSolutions filters positively
  select **Parts or Service** Lead-Intents, so the whole delivery is quarantined under the Sales-only contract.
- **Sales-only:** no Service or Parts data is included in any report; the three rooftops are Sales-only by design.

## Recipient + sender

- **Recipient (only):** `duanekwells@gmail.com`
- **Sender:** `Huminic Studio <notifications@huminic.ai>`

## Delivered messages (all three, provider-confirmed `delivered`)

| Dealership | Subject | Provider email ID | Attachment (filename / bytes / SHA-256) |
|------------|---------|-------------------|------------------------------------------|
| Serra Honda | `TEST \| Halo Data Report Card \| Serra Honda \| Week ending 2026-08-23` | `4b0f67be-5a08-4d47-91b4-8eeaf8715874` | `halo-serra-honda-2026-08-17_2026-08-23.pdf` / 124431 / `8e0b7dc715b8332b53da670f79b6e0cc1382de3fcafeed89d7ecd83bb44ddd62` |
| Serra Nissan | `TEST \| Halo Data Report Card \| Serra Nissan \| Week ending 2026-08-23` | `337c136a-794e-41a8-887c-af943c4397ad` | `halo-serra-nissan-2026-08-17_2026-08-23.pdf` / 118476 / `be7410a9a546aba2cde804241a84ec6cd920d6b9ac58ddd2c721761c4b9cca73` |
| Tony Serra Ford | `TEST \| Halo Data Report Card \| Tony Serra Ford \| Week ending 2026-08-23` | `615c5fc5-8852-4223-80f5-48d768d7a514` | `halo-tony-serra-ford-2026-08-17_2026-08-23.pdf` / 111738 / `b96bf6efc189329ef2a24d5a32496513bf3cf39b286c82b2857872965fc43235` |

Attachment filename/bytes/SHA-256 above are taken from `docs/halo/evidence/m2b/artifacts/manifest-index.json`
and match the local artifacts exactly.

## Attachment content-type caveat

The provider returned attachment content-type `application/octet-stream` (generic). Local verification passed:
PDF magic bytes, size, SHA-256, and filename all matched the manifest for each of the three attachments, so the
delivered bytes are the intended report PDFs despite the generic provider content-type.

## Execution + provenance

- **Final evidence:** `/tmp/halo-m2b-email-final-20260829.json`; execution completed
  **2026-08-29T23:27:23.354Z** with **errors empty (`[]`)**.
- **Immutable original source:** `/tmp/halo-m2b-email-actual-20260829.json`, SHA-256
  `2b9980a542665452bfa3a0a2ed3ee40de20eeb5e42d836b6ea1649a12ddf44ad`.
- **Honda history preserved:** the original run recorded an early Honda readback error (provider subject
  read back as "undefined" during verification). That error is **preserved as history** in the source. Honda
  was **recovered/verified, not resent**. The continuation made **exactly two new send calls** - one Serra
  Nissan and one Tony Serra Ford. **No other recipient, no retry.**
- **Idempotency keys:** `halo-m2b-serra-honda-2026-08-17_2026-08-23`,
  `halo-m2b-serra-nissan-2026-08-17_2026-08-23`, `halo-m2b-tony-serra-ford-2026-08-17_2026-08-23`.

## Transport / SDK

- Central-MCP Resend attachment path: branch `feat/halo-resend-attachments`, commit `c7360a7`, with an
  **SDK 1.25.0 compatibility pin**.

## Unchanged (explicit)

Production services, deployment, merge, CRM, customer/dealer contact, and live alert dispatch are **unchanged**
and were not exercised. This delivery is the TEST milestone's single external step, to one internal recipient.
