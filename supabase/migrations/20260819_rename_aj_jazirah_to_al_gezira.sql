-- Standardise state name: "Aj Jazirah" / "Al Jazirah" → "Al Gezira"
-- Covers profiles, sites, and mmp_site_entries tables

UPDATE profiles
SET state = 'Al Gezira'
WHERE lower(trim(state)) IN ('aj jazirah', 'al jazirah', 'al-jazirah');

UPDATE sites
SET state = 'Al Gezira'
WHERE lower(trim(state)) IN ('aj jazirah', 'al jazirah', 'al-jazirah');

UPDATE mmp_site_entries
SET state = 'Al Gezira'
WHERE lower(trim(state)) IN ('aj jazirah', 'al jazirah', 'al-jazirah');
