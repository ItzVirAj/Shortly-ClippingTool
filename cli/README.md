# Shortly CLI

Clip long videos into vertical 9:16 shorts from the terminal. Zero
dependencies; talks to the same API the dashboard, the MCP server and the
webhooks use.

```bash
pip install shortly        # or: uvx shortly / pipx run shortly

export SHORTLY_API_KEY=osk_...

shortly process "https://youtube.com/watch?v=..." --wait
shortly clips <job_id>
shortly publish <job_id> 0 --platforms tiktok,youtube
shortly quota
```

Self-hosted instance? Point it at your own machine and skip the key:

```bash
export SHORTLY_API_URL=http://localhost:8000
shortly process "https://youtube.com/watch?v=..." --wait
```

For pipelines, prefer the webhook to `--wait`: pass `--webhook` and
`--webhook-secret` and Shortly POSTs once (HMAC-signed,
`X-Shortly-Signature: sha256=<hex>`) when the job ends, with clip titles
and durable download links.
