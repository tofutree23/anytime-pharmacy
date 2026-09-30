select cron.schedule(
  'sync-animal-pharmacies-daily',
  '30 18 * * *',
  $$
  select net.http_post(
    url := 'https://ynewdantnvvxguhrqpmj.supabase.co/functions/v1/sync-animal-pharmacies',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InluZXdkYW50bnZ2eGd1aHJxcG1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4Njk0NzIsImV4cCI6MjEwMjQ0NTQ3Mn0.fFaEnzyLwHuxGfVvfQGEaEhrxoffYSVEpF-CtMUx-j8',
      'Content-Type', 'application/json'
    )
  );
  $$
);
