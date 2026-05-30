# EduNexus Backend Scripts

Supported scripts in this directory should use the same async PostgreSQL stack as
the application (`sqlalchemy.ext.asyncio` with `asyncpg`). Do not add new
`psycopg2` scripts here.

## Supported operational scripts

- `generate_frontend_constants.py` - used by CI to refresh frontend constants.
- `force_sync_db.py` - production/local schema reconciliation helper.
- `ensure_demo_student.py` - idempotent demo student credential reset.
- `seed_curriculum.py` - canonical curriculum seeding path.
- `seed_exam_curriculum.py`, `seed_mock_exams.py`, `seed_mock_exams_raw.py`,
  `seed_extended_mock_exams.py` - active exam/mock-exam seeding helpers.
- `cron_generate_reports.py` - scheduled report generation helper.

## Retired scripts

Old one-off debugging and synchronous seed scripts that still depended on
`psycopg2` have been moved to `archive/legacy_psycopg2/`. Treat them as
historical references only. If one is needed again, convert it to asyncpg first
instead of restoring `psycopg2-binary` to runtime requirements.
