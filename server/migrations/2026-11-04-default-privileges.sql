-- 選用的加固，程式不依賴它，跑不跑都能正常運作。站長在 Supabase SQL Editor 手動執行一次即可，可重跑。
-- 為什麼：schema.sql 只對「現有的」資料表收回 anon、authenticated 的權限並開 RLS。
-- Supabase 預設會把 public 裡「之後新建」的資料表自動授權給這兩個角色，
-- 哪天新增資料表卻忘了加進 schema.sql 的 RLS 清單，那張表就能被任何人透過 Data API 用 anon key 讀寫。
-- 這裡把預設授權收回，新表一開始就不對外，要開放得明確授權。
DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
    END IF;
  END LOOP;
END $$;
