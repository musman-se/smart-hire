\pset pager off
\echo '=== Q1 browse published jobs, newest first'
EXPLAIN (ANALYZE, COSTS OFF, TIMING ON, SUMMARY ON) SELECT id FROM jobs WHERE status = 'PUBLISHED' ORDER BY created_at DESC LIMIT 20;
\echo '=== Q2 job title search'
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON) SELECT count(*) FROM jobs WHERE title ILIKE '%platform%';
\echo '=== Q3 candidate name search'
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON) SELECT count(*) FROM candidates WHERE full_name ILIKE '%zainab%';
\echo '=== Q4 active applications for one candidate (runs on every apply)'
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON) SELECT count(*) FROM applications WHERE candidate_id = (SELECT busy_candidate FROM bench_ref) AND stage NOT IN ('HIRED','REJECTED');
\echo '=== Q5 newest 20 applications for the hot job'
EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON) SELECT id FROM applications WHERE job_id = (SELECT hot_job FROM bench_ref) ORDER BY created_at DESC LIMIT 20;
