# Local Publishing setup (Windows)

This first version implements review-first publishing of existing generated clips.
Source-channel watching and automatic generation are not connected yet. No extra
Upload-Post account or paid n8n service is needed.

1. Pull main and restart Shortly's backend/frontend as usual.
2. In Shortly Settings, use the existing Connect YouTube setup. Enable YouTube
   Data API v3 in your Google Cloud project, configure the OAuth consent screen
   and add your Google account as a test user if the app is in testing. Use the
   redirect URI shown by Shortly's setup modal exactly. Keep client secrets local.
   Google project restrictions may limit API uploads to private visibility; verify
   a private upload first. A testing-mode OAuth grant may require reconnection.
3. Add a long random token to your backend .env:
   SHORTLY_PUBLISHING_TOKEN=<your-random-secret>
   Restart the backend. Do not commit the secret.
4. Run n8n locally (for example `npx n8n`) and open http://localhost:5678.
   Import examples/n8n/shortly-local-publishing.json.
5. Create a Header Auth credential with Name `Authorization` and Value
   `Bearer <your-random-secret>`. Select it in Run Shortly queue.
6. For native local n8n, keep http://127.0.0.1:8000/api/publishing/tick.
   Docker n8n normally needs http://host.docker.internal:8000/api/publishing/tick,
   and the backend must bind to an interface reachable from Docker. Restrict the
   Windows firewall to your local environment; do not expose this app publicly.
7. Test the HTTP node, then activate/publish the workflow for recurring runs.
8. Open Publishing in Shortly. Prepare a draft from Generated clips, preview it,
   edit metadata, choose private initially, and click Save & approve upload.
   Resume the queue. Click Run queue now or wait for n8n.
9. Verify the video in YouTube Studio. For future public releases, choose public
   visibility and an optional future date. YouTube receives scheduled uploads
   ahead of time; its own publication can proceed after your PC turns off.

Keep Shortly and n8n running while uploading. Queue records and frozen video
snapshots live in output/.publishing; back up this directory. They are deliberately
retained separately from generated job cleanup. This version has no snapshot
cleanup UI. Pause stops new uploads, not active transfers or YouTube schedules.

If a transfer fails, Retry queries the existing resumable upload session. If the
session expires, check YouTube Studio before preparing another upload to avoid
posting duplicates. Channel changes require reconnecting the approved channel.
An edited clip needs a newly prepared draft to capture its latest render.

The queue is local-only and hidden in cloud mode. n8n only triggers work and never
receives Google OAuth credentials. The Publishing page shows last queue contact;
this indicates a tick, not proof that n8n will keep running.
