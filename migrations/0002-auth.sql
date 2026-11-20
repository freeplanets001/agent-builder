CREATE TABLE IF NOT EXISTS auth_user (id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,emailVerified INTEGER NOT NULL DEFAULT 0,image TEXT,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS auth_session (id TEXT PRIMARY KEY,token TEXT NOT NULL UNIQUE,userId TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,expiresAt INTEGER NOT NULL,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL,ipAddress TEXT,userAgent TEXT);
CREATE INDEX IF NOT EXISTS idx_auth_session_user ON auth_session(userId);
CREATE TABLE IF NOT EXISTS auth_account (id TEXT PRIMARY KEY,accountId TEXT NOT NULL,providerId TEXT NOT NULL,userId TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,accessToken TEXT,refreshToken TEXT,idToken TEXT,scope TEXT,password TEXT,accessTokenExpiresAt INTEGER,refreshTokenExpiresAt INTEGER,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL,UNIQUE(providerId,accountId));
CREATE INDEX IF NOT EXISTS idx_auth_account_user ON auth_account(userId);
CREATE TABLE IF NOT EXISTS auth_verification (id TEXT PRIMARY KEY,identifier TEXT NOT NULL,value TEXT NOT NULL,expiresAt INTEGER NOT NULL,createdAt INTEGER,updatedAt INTEGER);
CREATE INDEX IF NOT EXISTS idx_auth_verification_identifier ON auth_verification(identifier);
CREATE TABLE IF NOT EXISTS rateLimit (id TEXT PRIMARY KEY,key TEXT UNIQUE,count INTEGER,lastRequest INTEGER);
