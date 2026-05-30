# Legacy psycopg2 Scripts

These scripts are retired historical utilities. They were moved out of the
supported script path because the backend now standardizes on `asyncpg` through
SQLAlchemy async engines.

Do not run these directly in production or add `psycopg2-binary` back to
`backend/requirements.txt` for them. Convert the specific script to asyncpg if a
real operational need returns.
