-- Bereits laufende oder vergangene Wettbewerbe nicht nachträglich als „neu“ melden
UPDATE "CommunityChallenge" SET "notified" = array_append("notified", 'start') WHERE "startsAt" <= now() AND NOT ('start' = ANY("notified"));
