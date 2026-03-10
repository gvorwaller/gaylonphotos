# Shared-Album-Safe Photo Ingestion (Codex Plan)

## Summary
Replace the current mixed export logic with a deterministic pipeline that treats Photos.app UI export as the primary extraction method, then performs manifest-driven upload with resume/retry guarantees.
Design target is operational robustness for large shared-album batches, not quickest MVP.

## Implementation Changes
- Build a new orchestrator command in the existing CLI package that runs four strict stages: discover -> export -> verify -> upload.
- Make export source explicit and singular for v1:
  - Use Photos selection IDs from AppleScript.
  - Export via Photos.app UI automation (Accessibility scripting), writing files into a per-run workspace directory.
  - Do not use PhotoKit for shared exports in the critical path.
- Add a run workspace contract:
  - run.json metadata (run id, collection, started/finished timestamps, mode, counts).
  - manifest.jsonl with one record per selected asset: asset_id, expected filename hint, export status, file path, checksum, upload status, attempts, error code.
  - failures.jsonl for terminal failures only.
- Add resilient upload engine:
  - Idempotent upload attempts keyed by checksum + asset_id.
  - Exponential backoff retry policy with capped attempts.
  - Resume semantics: rerun uses existing manifest and only processes incomplete/failed retriable items.
- Add explicit error taxonomy and exit codes:
  - EXPORT_TIMEOUT, EXPORT_NOT_FOUND, UPLOAD_HTTP_4XX, UPLOAD_HTTP_5XX, NETWORK_RETRY_EXHAUSTED, CHECKSUM_MISMATCH, USER_ABORT.
  - Non-zero exit when terminal failures remain; zero only when all required assets are uploaded or intentionally skipped by policy.
- Improve observability:
  - Structured progress lines with stage/item counters.
  - End-of-run summary from manifest state (not in-memory counters).
- Keep existing API session/upload client but wrap with retry + idempotency metadata.
- Remove legacy dual-path assumptions from pipeline code after replacement is validated.

## Public Interfaces / Types
- CLI surface (new/updated):
  - photo-uploader run --collection <slug> [--prod] [--workspace <path>] [--resume <run-id>] [--max-retries N] [--export-timeout-sec N]
  - photo-uploader status --workspace <path> --run-id <id>
  - photo-uploader retry --workspace <path> --run-id <id>
- Data contracts:
  - Stable manifest record schema for each asset lifecycle state.
  - Stable run metadata schema for resumability and auditability.
- Operational prerequisite:
  - Accessibility permission for controlling Photos.app (documented and preflight-validated before run starts).

## Test Plan
- Unit tests:
  - Manifest state transitions (discovered -> exported -> uploaded, retry/terminal failure paths).
  - Retry/backoff policy and exit-code mapping.
  - Resume logic (skip completed, retry retriable, preserve terminal failures).
- Integration tests (with fakes/mocks for export and network):
  - Mid-run crash and resume completes without duplicate uploads.
  - Partial export success with mixed failures produces correct manifest and summary.
  - Upload transient failures recover within retry budget.
- Live validation checklist (small then large):
  - 5 shared assets end-to-end.
  - 100+ mixed shared/local assets with one forced interruption and successful resume.
  - Duplicate rerun of same run id confirms idempotent behavior.

## Assumptions and Defaults
- Chosen strategy: UI automation first for export (no further PhotoKit experiments for shared assets in v1).
- Chosen reliability level: operationally robust (manifest, resume, retries are mandatory, not optional).
- Videos remain out of scope for this rewrite unless explicitly added later.
- Existing backend upload endpoint remains unchanged; idempotency is enforced client-side via manifest/checksum behavior.
