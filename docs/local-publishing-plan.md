# Local publishing plan and implementation status

Implemented milestone: review-first publishing of generated clips.

1. SQLite records persist draft, approved, transferring, processing, scheduled,
   uploaded/private, published/public, attention and cancelled states.
2. Draft creation snapshots the latest metadata-selected export. Identical source,
   channel and content hash deduplicate repeated clicks. Approval freezes settings.
3. Publishing UI provides Review, Queue, Published and Needs attention, with preview,
   metadata, audience/visibility, schedule, pause, retry, cancel and connection setup.
4. n8n calls the local tick endpoint every 30 seconds. It never holds Google tokens.
5. YouTube uploads use persisted resumable sessions, chunked transfers and status
   reconciliation. Concurrent claims are serialized and active workers renew leases.
6. Local setup guide explains credentials, native/Docker networking and smoke tests.

Next milestone (not implemented): source watching, deduplicated generation jobs,
posting-slot rules, batch approval, snapshot retention UI, and richer upload events.
Never automatically approve AI clips as part of source watching. Optional source
watching must exclude already generated Shorts and older back-catalogue videos.

Validation: SQLite persistence/concurrency/revision tests, API contract tests,
YouTube protocol fixture tests, frontend build and changed-component lint. A real
private upload must be verified locally with the user's channel and OAuth project.
