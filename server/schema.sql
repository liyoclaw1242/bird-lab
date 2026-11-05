CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  rarity TEXT NOT NULL,
  type TEXT NOT NULL,
  atk INTEGER NOT NULL,
  def INTEGER NOT NULL,
  data JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS cards_rarity ON cards (rarity);

CREATE TABLE IF NOT EXISTS players (
  id BIGSERIAL PRIMARY KEY,
  team TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS owned (
  player_id BIGINT NOT NULL REFERENCES players (id),
  card_id TEXT NOT NULL REFERENCES cards (id),
  seq BIGSERIAL,
  PRIMARY KEY (player_id, card_id)
);
CREATE INDEX IF NOT EXISTS owned_order ON owned (player_id, seq DESC);

CREATE TABLE IF NOT EXISTS draws (
  player_id BIGINT NOT NULL REFERENCES players (id),
  day DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('free', 'bonus', 'bonus2', 'bonus3', 'bonus4')),
  card_id TEXT NOT NULL REFERENCES cards (id),
  PRIMARY KEY (player_id, day, kind)
);

CREATE TABLE IF NOT EXISTS fights (
  player_id BIGINT NOT NULL REFERENCES players (id),
  day DATE NOT NULL,
  stars INTEGER NOT NULL,
  score DOUBLE PRECISION NOT NULL,
  best DOUBLE PRECISION NOT NULL,
  team TEXT[] NOT NULL,
  moves JSONB NOT NULL,
  PRIMARY KEY (player_id, day)
);

-- 分享連結：一次抽卡一條，領取人數依稀有度限制
CREATE TABLE IF NOT EXISTS shares (
  code TEXT PRIMARY KEY,
  player_id BIGINT NOT NULL REFERENCES players (id),
  day DATE NOT NULL,
  kind TEXT NOT NULL,
  card_id TEXT NOT NULL REFERENCES cards (id),
  cap INTEGER NOT NULL,
  claimed INTEGER NOT NULL DEFAULT 0,
  UNIQUE (player_id, day, kind)
);

CREATE TABLE IF NOT EXISTS claims (
  player_id BIGINT NOT NULL REFERENCES players (id),
  code TEXT NOT NULL REFERENCES shares (code),
  card_id TEXT NOT NULL REFERENCES cards (id),
  day DATE NOT NULL,
  PRIMARY KEY (player_id, code)
);
CREATE INDEX IF NOT EXISTS claims_by_day ON claims (player_id, day);

-- 建立玩家的流量限制。只存當小時的 IP 雜湊，過期就清掉
CREATE TABLE IF NOT EXISTS signup_limits (
  ip_hash TEXT NOT NULL,
  hour TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (ip_hash, hour)
);

-- 同一個帳號可以在多台裝置登入，所以憑證和玩家分開存
ALTER TABLE players ADD COLUMN IF NOT EXISTS google_sub TEXT UNIQUE;
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  player_id BIGINT NOT NULL REFERENCES players (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_by_player ON sessions (player_id);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'players' AND column_name = 'token_hash') THEN
    INSERT INTO sessions (token_hash, player_id) SELECT token_hash, id FROM players ON CONFLICT DO NOTHING;
    ALTER TABLE players DROP COLUMN token_hash;
  END IF;
END $$;

-- 遊戲只透過伺服器的資料庫連線存取。Supabase 會用 Data API 開放 public schema，
-- 所以全部開 RLS 且不設任何政策，再收回 anon、authenticated 的權限。資料表擁有者不受 RLS 影響。
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE owned ENABLE ROW LEVEL SECURITY;
ALTER TABLE draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE fights ENABLE ROW LEVEL SECURITY;
ALTER TABLE shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE signup_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
    END IF;
  END LOOP;
END $$;

-- 2026-11-05 獎勵樹改成有打就有、每顆星多一棵：舊資料庫的 kind 限制要放寬。可重跑
ALTER TABLE draws DROP CONSTRAINT IF EXISTS draws_kind_check;
ALTER TABLE draws ADD CONSTRAINT draws_kind_check CHECK (kind IN ('free', 'bonus', 'bonus2', 'bonus3', 'bonus4'));
