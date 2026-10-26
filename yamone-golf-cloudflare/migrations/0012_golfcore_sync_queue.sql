-- Initialize missing supported-country queues without replacing existing sync state.
INSERT INTO golfcore_sync_state(country_code,priority)
SELECT 'KR',COALESCE(MAX(priority),-1)+1 FROM golfcore_sync_state
HAVING NOT EXISTS(SELECT 1 FROM golfcore_sync_state WHERE country_code='KR');
INSERT INTO golfcore_sync_state(country_code,priority)
SELECT 'PH',COALESCE(MAX(priority),-1)+1 FROM golfcore_sync_state
HAVING NOT EXISTS(SELECT 1 FROM golfcore_sync_state WHERE country_code='PH');
INSERT INTO golfcore_sync_state(country_code,priority)
SELECT 'JP',COALESCE(MAX(priority),-1)+1 FROM golfcore_sync_state
HAVING NOT EXISTS(SELECT 1 FROM golfcore_sync_state WHERE country_code='JP');
INSERT INTO golfcore_sync_state(country_code,priority)
SELECT 'CN',COALESCE(MAX(priority),-1)+1 FROM golfcore_sync_state
HAVING NOT EXISTS(SELECT 1 FROM golfcore_sync_state WHERE country_code='CN');
INSERT INTO golfcore_sync_state(country_code,priority)
SELECT 'TW',COALESCE(MAX(priority),-1)+1 FROM golfcore_sync_state
HAVING NOT EXISTS(SELECT 1 FROM golfcore_sync_state WHERE country_code='TW');
INSERT INTO golfcore_sync_state(country_code,priority)
SELECT 'VN',COALESCE(MAX(priority),-1)+1 FROM golfcore_sync_state
HAVING NOT EXISTS(SELECT 1 FROM golfcore_sync_state WHERE country_code='VN');
INSERT INTO golfcore_sync_state(country_code,priority)
SELECT 'TH',COALESCE(MAX(priority),-1)+1 FROM golfcore_sync_state
HAVING NOT EXISTS(SELECT 1 FROM golfcore_sync_state WHERE country_code='TH');
INSERT INTO golfcore_sync_state(country_code,priority)
SELECT 'MY',COALESCE(MAX(priority),-1)+1 FROM golfcore_sync_state
HAVING NOT EXISTS(SELECT 1 FROM golfcore_sync_state WHERE country_code='MY');
INSERT INTO golfcore_sync_state(country_code,priority)
SELECT 'ID',COALESCE(MAX(priority),-1)+1 FROM golfcore_sync_state
HAVING NOT EXISTS(SELECT 1 FROM golfcore_sync_state WHERE country_code='ID');
