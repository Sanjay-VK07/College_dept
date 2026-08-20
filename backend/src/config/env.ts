import dotenv from 'dotenv';
dotenv.config();

export const ENV = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  JWT_SECRET: process.env.JWT_SECRET || 'gsmas_super_secret_jwt_key_2026_production',
  DATABASE_URL: process.env.DATABASE_URL || "postgresql://postgres.wvcfpelwwftkljxduhvw:welcometocitGanesh%402006@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true",
  DIRECT_URL: process.env.DIRECT_URL || "postgresql://postgres.wvcfpelwwftkljxduhvw:welcometocitGanesh%402006@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres",
  ALLOWED_DOMAINS: (process.env.ALLOWED_DOMAINS || 'cit.edu.in,college.edu.in').split(','),
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  CHUNK_SIZE: parseInt(process.env.CHUNK_SIZE || '500', 10),
  CHUNK_OVERLAP: parseInt(process.env.CHUNK_OVERLAP || '50', 10),
  EMBEDDING_PROVIDER: process.env.EMBEDDING_PROVIDER || 'local',
  EMBEDDING_MODEL: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
  EMBEDDING_API_KEY: process.env.EMBEDDING_API_KEY || '',
  EMBEDDING_DIMENSION: parseInt(process.env.EMBEDDING_DIMENSION || '384', 10),
};

