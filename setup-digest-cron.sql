-- Run this in your Supabase SQL Editor (one-time setup)
-- Dashboard → SQL Editor → New query → paste → Run

-- Step 1: Enable required extensions
create extension if not exists pg_net   schema extensions;
create extension if not exists pg_cron;

-- Step 2: Schedule the daily digest at 07:00 UTC every day
select cron.schedule(
  'daily-digest-7am',
  '0 7 * * *',
  $$
    select net.http_post(
      url     := 'https://abznugnirnlrqnnfkein.supabase.co/functions/v1/daily-digest-cron',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiem51Z25pcm5scnFubmZrZWluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxMzU2OTEsImV4cCI6MjA3NDcxMTY5MX0.eAX9yrtgr05OVjAn_Wr2Koi92rMaV32EFj70DFfIgdM'
      ),
      body    := '{}'::jsonb
    ) as request_id;
  $$
);

-- Verify it was created
select jobid, schedule, command from cron.job where jobname = 'daily-digest-7am';
