# Index benchmark

Reproduces the before/after measurements behind migration `e91a6c3f0b58`
("rework indexes around query patterns"). Results and reasoning are in
[docs/DATABASE.md](../../docs/DATABASE.md#4-indexes).

It runs against a **throwaway database** — never the dev database.

```bash
docker compose up -d db
docker exec smarthire-db psql -U smarthire -d postgres -c "CREATE DATABASE smarthire_bench"

cd backend
export DATABASE_URL=postgresql+asyncpg://smarthire:smarthire@localhost:5432/smarthire_bench

alembic upgrade b4f2d8e61a37                       # the old indexes
docker exec -i smarthire-db psql -U smarthire -d smarthire_bench < ../scripts/index-benchmark/load.sql
docker exec -i smarthire-db psql -U smarthire -d smarthire_bench < ../scripts/index-benchmark/explain.sql > before.txt

alembic upgrade e91a6c3f0b58                       # the new indexes
docker exec smarthire-db psql -U smarthire -d smarthire_bench -c "ANALYZE"
docker exec -i smarthire-db psql -U smarthire -d smarthire_bench < ../scripts/index-benchmark/explain.sql > after.txt

docker exec smarthire-db psql -U smarthire -d postgres -c "DROP DATABASE smarthire_bench WITH (FORCE)"
```

`load.sql` generates 20,000 jobs, 50,000 candidates and about 305,000 applications,
including one "hot" job with 5,000 applications — a hiring drive. `setseed()` makes the
data identical on every run.

Q4 and Q5 look the job and candidate up through a subquery, which hides the value from
the planner. The API sends a literal parameter instead, so for Q5 measure the way the
app runs it:

```sql
SELECT hot_job FROM bench_ref;   -- copy the id
EXPLAIN ANALYZE SELECT id FROM applications
WHERE job_id = '<id>' ORDER BY created_at DESC LIMIT 20;
```
