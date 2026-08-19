-- Standardise state name: "Aj Jazirah" / "Al Jazirah" → "Al Gezira"
-- profiles.state_id already uses the canonical id 'gezira' — no change needed
-- mmp_site_entries.state stores the display name — updated below

UPDATE mmp_site_entries
SET state = 'Al Gezira'
WHERE lower(trim(state)) IN ('aj jazirah', 'al jazirah', 'al-jazirah');
