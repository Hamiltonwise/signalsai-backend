#!/bin/bash
# Database audit script - reads connection from .env
set -e

cd /Users/coreys.air/Desktop/alloro
source .env

export PGPASSWORD="$DB_PASSWORD"
PSQL="psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -A"

echo "===== 1. TABLES WITH ZERO ROWS CHECK ====="
$PSQL -c "
SELECT 'morning_briefings' as tbl, count(*) FROM morning_briefings
UNION ALL SELECT 'review_response_drafts', count(*) FROM review_response_drafts
UNION ALL SELECT 'referral_thank_you_drafts', count(*) FROM referral_thank_you_drafts
UNION ALL SELECT 'published_content', count(*) FROM published_content
UNION ALL SELECT 'cro_experiments', count(*) FROM cro_experiments
UNION ALL SELECT 'prediction_outcomes', count(*) FROM prediction_outcomes
UNION ALL SELECT 'milestone_notifications', count(*) FROM milestone_notifications
UNION ALL SELECT 'review_notifications', count(*) FROM review_notifications
UNION ALL SELECT 'review_requests', count(*) FROM review_requests
UNION ALL SELECT 'programmatic_pages', count(*) FROM programmatic_pages
ORDER BY 2 DESC;
"

echo ""
echo "===== 2. BEHAVIORAL EVENTS BY TYPE ====="
$PSQL -c "
SELECT event_type, count(*) as cnt FROM behavioral_events GROUP BY event_type ORDER BY cnt DESC;
"

echo ""
echo "===== 3. AGENT RESULTS FRESHNESS ====="
$PSQL -c "
SELECT ar.org_id, o.name as org_name, ar.result_type, MAX(ar.created_at)::text as last_run,
  (NOW() - MAX(ar.created_at))::text as age
FROM agent_results ar
JOIN organizations o ON o.id = ar.org_id
GROUP BY ar.org_id, o.name, ar.result_type
ORDER BY ar.org_id, last_run DESC;
"

echo ""
echo "===== 4. ORPHAN USERS (no org membership) ====="
$PSQL -c "
SELECT u.id, u.email, u.first_name, u.last_name, u.created_at::text
FROM users u
LEFT JOIN organization_users ou ON ou.user_id = u.id
WHERE ou.id IS NULL;
"

echo ""
echo "===== 5. GOOGLE CONNECTIONS HEALTH ====="
$PSQL -c "
SELECT gc.id, gc.org_id, o.name as org_name, gc.status, gc.google_property_id,
  gc.token_expires_at::text,
  CASE WHEN gc.token_expires_at < NOW() THEN 'EXPIRED' ELSE 'VALID' END as token_status,
  gc.created_at::text, gc.updated_at::text
FROM google_connections gc
JOIN organizations o ON o.id = gc.org_id
ORDER BY gc.token_expires_at;
"

echo ""
echo "===== 6a. PMS DATA RICHNESS ====="
$PSQL -c "
SELECT pp.org_id, o.name as org_name,
  COUNT(DISTINCT DATE_TRUNC('month', pp.service_date)) as months_of_data,
  COUNT(*) as total_records,
  COUNT(DISTINCT pp.referring_provider_name) as unique_referral_sources,
  MIN(pp.service_date)::text as earliest_date,
  MAX(pp.service_date)::text as latest_date
FROM pms_production pp
JOIN organizations o ON o.id = pp.org_id
GROUP BY pp.org_id, o.name
ORDER BY total_records DESC;
"

echo ""
echo "===== 6b. TOP REFERRAL SOURCES PER ORG ====="
$PSQL -c "
SELECT pp.org_id, o.name, pp.referring_provider_name, COUNT(*) as cnt
FROM pms_production pp
JOIN organizations o ON o.id = pp.org_id
WHERE pp.referring_provider_name IS NOT NULL AND pp.referring_provider_name != ''
GROUP BY pp.org_id, o.name, pp.referring_provider_name
ORDER BY pp.org_id, cnt DESC
LIMIT 50;
"

echo ""
echo "===== 7. CHECKUP FUNNEL ====="
$PSQL -c "
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE '%checkup%'
ORDER BY table_name;
"
echo "--- checkup_invitations count ---"
$PSQL -c "SELECT count(*) FROM checkup_invitations;" 2>/dev/null || echo "TABLE NOT FOUND"
echo "--- checkup_invitations by status ---"
$PSQL -c "SELECT status, count(*) FROM checkup_invitations GROUP BY status ORDER BY count DESC;" 2>/dev/null || echo "N/A"
echo "--- checkup_shares count ---"
$PSQL -c "SELECT count(*) FROM checkup_shares;" 2>/dev/null || echo "TABLE NOT FOUND"
echo "--- batch_checkup_results count ---"
$PSQL -c "SELECT count(*) FROM batch_checkup_results;" 2>/dev/null || echo "TABLE NOT FOUND"
echo "--- batch_checkup_results by status ---"
$PSQL -c "SELECT status, count(*) FROM batch_checkup_results GROUP BY status ORDER BY count DESC;" 2>/dev/null || echo "N/A"

echo ""
echo "===== 8. SCHEDULE/CRON/JOB TABLES ====="
$PSQL -c "
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND (table_name LIKE '%schedule%' OR table_name LIKE '%cron%' OR table_name LIKE '%job%' OR table_name LIKE '%queue%')
ORDER BY table_name;
"
echo "--- scheduled_jobs ---"
$PSQL -c "SELECT * FROM scheduled_jobs ORDER BY created_at DESC LIMIT 20;" 2>/dev/null || echo "TABLE NOT FOUND"
echo "--- agent_schedules ---"
$PSQL -c "SELECT * FROM agent_schedules ORDER BY created_at DESC LIMIT 20;" 2>/dev/null || echo "TABLE NOT FOUND"

echo ""
echo "===== 9. DREAM TEAM TASKS ====="
echo "--- by status ---"
$PSQL -c "SELECT status, count(*) FROM dream_team_tasks GROUP BY status ORDER BY count DESC;"
echo "--- by assigned_to + status ---"
$PSQL -c "SELECT assigned_to, status, count(*) FROM dream_team_tasks GROUP BY assigned_to, status ORDER BY count DESC;"
echo "--- recent 20 ---"
$PSQL -c "SELECT id, assigned_to, task_type, status, LEFT(title, 60) as title, created_at::text FROM dream_team_tasks ORDER BY created_at DESC LIMIT 20;"

echo ""
echo "===== 10. TAILOR OVERRIDES ====="
$PSQL -c "
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE '%tailor%'
ORDER BY table_name;
"
$PSQL -c "SELECT count(*) as tailor_override_count FROM tailor_overrides;" 2>/dev/null || echo "TABLE NOT FOUND"
$PSQL -c "SELECT org_id, override_key, override_value, created_at::text FROM tailor_overrides LIMIT 20;" 2>/dev/null || echo "N/A"

echo ""
echo "===== BONUS: ALL TABLES WITH ROW COUNTS ====="
$PSQL -c "
SELECT schemaname, relname as table_name, n_live_tup as row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC;
"

echo ""
echo "===== BONUS: ORGANIZATIONS LIST ====="
$PSQL -c "SELECT id, name, slug, vertical, onboarding_step, created_at::text FROM organizations ORDER BY created_at;"

echo ""
echo "===== BONUS: TOTAL USERS ====="
$PSQL -c "SELECT count(*) FROM users;"

unset PGPASSWORD
