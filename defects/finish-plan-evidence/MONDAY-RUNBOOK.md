# MONDAY RUNBOOK — Serra follow-up catch-up (Duane authorizes every step)

State at handoff (2026-09-28 ~03:30Z): main = e840aa5eb (N1,N2,N2.6,N3,N4 approved). LIVE container =
6c5be56ec (does NOT have N4 yet). Ford + Nissan automations = draft, wait_hours 24. Honda = active, 24.
Nothing customer-facing sent. Test emails sent to Duane + Durran. Reports/alerts start TUESDAY after Durran
approves; their design changes are HELD (list in Duane chat: white bg, "huminic | CAGE" header, headline
"Your Lead Intelligence Report Is Ready!", delta on tiles, source table with arrows, "Low Performing
Sources", sent/queued/not-textable, agent signature, manager-reply ack+forward, grammar fixes).

Shell helpers (run on andromeda):
  N=$(sudo docker ps --format "{{.Names}}" | grep hermes-studio)
  V=/var/lib/docker/volumes/nh5vnz9kz226cj9ib3nodg1j_hermes-state/_data/profiles

## 0. Deploy N4 (Duane presses Redeploy in Coolify, app "huminic-studio", branch main)
Verify: sudo docker inspect $N --format "{{.Config.Image}}"  → ends e840aa5eb...; curl https://studio.huminic.app/api/health → 200.

## 1. Backup (before any DB write)
  mkdir -p ~/serra-artifacts/backup-$(date -u +%F) && for p in serra-honda tony-serra-ford serra-nissan; do sudo sqlite3 $V/$p/messaging-hub.db ".backup /home/ubuntu/serra-artifacts/backup-$(date -u +%F)/$p-messaging-hub.db"; done

## 2. Activate — needs Duane to say "activate". ONLY lead_followup. NEVER recreate the automation
(the dedup ledger is keyed to its id). Prefer the Studio UI (store → Marketing → Automations → Follow-up:
set wait 72h, Activate). SQL fallback:
  for p in tony-serra-ford serra-nissan; do sudo sqlite3 $V/$p/messaging-hub.db "UPDATE marketing_automations SET status=\"active\", wait_hours=72, updated_at=strftime(\"%s\",\"now\")*1000 WHERE trigger=\"lead_followup\" AND channel=\"sms\";"; done
  sudo sqlite3 $V/serra-honda/messaging-hub.db "UPDATE marketing_automations SET wait_hours=72, updated_at=strftime(\"%s\",\"now\")*1000 WHERE trigger=\"lead_followup\" AND channel=\"sms\";"
Verify: SELECT trigger,status,wait_hours FROM marketing_automations;  new_lead stays draft on Ford/Nissan.
Activation alone sends nothing (COMMS tick off; crons are Honda-only).

## 3. Dry run (no send) — per store
  sudo docker exec $N sh -c "cd /app && npx tsx scripts/catchup-followup.ts --profile tony-serra-ford --since 2026-08-15 --exclude-source \"Service Dept\" --skip-texted-since 2026-08-15 --csv /tmp/ford-audience.csv"
  (same with --profile serra-nissan --csv /tmp/nissan-audience.csv)
Check the header: scope SALES only, due cutoff 72h, prelaunch lock OFF, window OPEN (08:00–21:00 CT, Mon–Sat).
Expect FEWER than the 171 / 254 seen on 09-25 (72h cutoff). Copy CSVs out: sudo docker cp $N:/tmp/ford-audience.csv ~/serra-artifacts/ ; Duane signs the counts.

## 4. Catch-up in tranches — Ford first. Same command + --send --limit N. The ledger prevents repeats.
  ... --send --limit 10   → verify → --send --limit 50 → verify → --send (rest)
Verify after each: TextMagic outbound list; sudo sqlite3 -readonly $V/tony-serra-ford/messaging-hub.db "SELECT COUNT(*), datetime(MAX(created_at)/1000,\"unixepoch\") FROM messages WHERE channel=\"sms\" AND direction=\"outbound\" AND created_at > (strftime(\"%s\",\"now\")-3600)*1000;"
Watch replies/opt-outs in Teambox. STOP if any service lead, duplicate, or wrong copy appears.
Message copy: "Hi <first>, this is Tony Serra Ford. We wanted to check in — are you being taken care of? Is there anything we can help with regarding your <vehicle>? Reply STOP to opt out."
Then Nissan, same pattern. Then Honda regression: its 13:00Z+ cron still fires.

## 5. Durran test texts at 08:00 CT (cell +17313946907)
  sudo docker exec $N sh -c "cd /app && mkdir -p /tmp/battery && npx tsx scripts/comms-preview.ts --profile serra-honda --out /tmp/battery --window wrapup && npx tsx scripts/send-intro-text.ts --profile serra-honda --store-name \"Serra Honda\" --to +17313946907 --send && npx tsx scripts/send-text-report.ts --profile serra-honda --from /tmp/battery --window wrapup --to +17313946907 --send"

## Rollback
Texting: UPDATE ... SET status="draft" for the store. Code: redeploy 6c5be56ec (or c3e4c5332). DB: restore the .backup file with the container stopped.

## After Monday
Ongoing 72h follow-ups for Ford/Nissan need the cron generalized: scripts/cron-catchup-followup.sh hard-codes
serra-honda (make it iterate FOLLOWUP_PROFILES). New-lead texts resume per store only after Duane confirms.
Reports Tuesday: set management_audience (4 emails + 4 cells) on each store notifications page, set
comms.reports.enabled / comms.alerts.enabled, install docs/serra-reports-cron.txt with REPORT_PROFILES and the
text job on days 2-6,0. Missing inputs: Don + Shelby emails and cells. Rotate the central-mcp admin token.
