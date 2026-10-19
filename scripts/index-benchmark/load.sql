SELECT setseed(0.42);
INSERT INTO jobs (id, title, description, employment_type, status, min_experience_years, created_at, updated_at)
SELECT gen_random_uuid(),
       (ARRAY['Senior','Junior','Staff','Lead','Principal'])[1 + (i % 5)] || ' ' ||
       (ARRAY['Backend','Frontend','Platform','Data','Mobile','Security','QA','DevOps'])[1 + (i % 8)] || ' ' ||
       (ARRAY['Engineer','Developer','Analyst','Architect'])[1 + (i % 4)] || ' #' || i,
       'Bulk generated job description number ' || i,
       'FULL_TIME',
       (CASE WHEN i % 10 < 7 THEN 'PUBLISHED' WHEN i % 10 < 9 THEN 'CLOSED' ELSE 'DRAFT' END)::job_status,
       i % 8,
       now() - (random() * interval '730 days'), now()
FROM generate_series(1, 20000) AS i;
INSERT INTO candidates (id, email, full_name, years_experience, created_at, updated_at)
SELECT gen_random_uuid(), 'c' || i || '@example.com',
       (ARRAY['Ayesha','Bilal','Sara','Omar','Hina','Usman','Zainab','Ali','Fatima','Hamza'])[1 + (i % 10)] || ' ' ||
       (ARRAY['Khan','Ahmed','Iqbal','Farooq','Malik','Sheikh','Butt','Raza'])[1 + ((i / 10) % 8)] || ' ' || i,
       i % 15, now() - (random() * interval '730 days'), now()
FROM generate_series(1, 50000) AS i;
CREATE TEMP TABLE j AS SELECT id, row_number() OVER () AS n FROM jobs;
CREATE TEMP TABLE c AS SELECT id, row_number() OVER () AS n FROM candidates;
INSERT INTO applications (id, job_id, candidate_id, stage, created_at, updated_at)
SELECT gen_random_uuid(), j.id, c.id,
       (ARRAY['APPLIED','SCREENING','INTERVIEW','OFFER','HIRED','REJECTED'])[1 + floor(random()*6)::int]::application_stage,
       now() - (random() * interval '365 days'), now()
FROM (SELECT 1 + floor(random() * 20000)::int AS jn, 1 + floor(random() * 50000)::int AS cn
      FROM generate_series(1, 300000)) AS r
JOIN j ON j.n = r.jn
JOIN c ON c.n = r.cn
ON CONFLICT DO NOTHING;
-- one hot job, as in a hiring drive
INSERT INTO applications (id, job_id, candidate_id, stage, created_at, updated_at)
SELECT gen_random_uuid(), (SELECT id FROM j WHERE n = 1), c.id, 'APPLIED', now() - (random() * interval '30 days'), now()
FROM c WHERE c.n <= 5000 ON CONFLICT DO NOTHING;
CREATE TABLE bench_ref AS SELECT (SELECT id FROM j WHERE n = 1) AS hot_job, (SELECT candidate_id FROM applications GROUP BY candidate_id ORDER BY count(*) DESC LIMIT 1) AS busy_candidate;
ANALYZE;
SELECT (SELECT count(*) FROM jobs) jobs, (SELECT count(*) FROM candidates) candidates, (SELECT count(*) FROM applications) applications;
