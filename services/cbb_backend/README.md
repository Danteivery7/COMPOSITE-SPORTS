# Composite CBB Backend

This service is the dedicated college-basketball ingestion backend referenced by the app plan.

Intended responsibilities:

- scrape and normalize AP Poll, NET, Torvik, KenPom, Haslametrics, and EvanMiya
- ingest ESPN scoreboard, schedule, roster, player, and news data
- store hot snapshots in MongoDB
- expose a stable read API for the Next frontend

Suggested local run flow:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The Next app can read from this service through `COMPOSITE_CBB_SERVICE_URL`.
