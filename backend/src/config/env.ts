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
  RAG_HIGH_CONFIDENCE_THRESHOLD: parseFloat(process.env.RAG_HIGH_CONFIDENCE_THRESHOLD || '0.75'),
  RAG_MEDIUM_CONFIDENCE_THRESHOLD: parseFloat(process.env.RAG_MEDIUM_CONFIDENCE_THRESHOLD || '0.50'),
  RAG_MIN_SIMILARITY: parseFloat(process.env.RAG_MIN_SIMILARITY || '0.35'),
  RAG_MIN_RELEVANT_CHUNKS: parseInt(process.env.RAG_MIN_RELEVANT_CHUNKS || '1', 10),
};

export function validateRAGThresholds() {
  const {
    RAG_HIGH_CONFIDENCE_THRESHOLD: high,
    RAG_MEDIUM_CONFIDENCE_THRESHOLD: med,
    RAG_MIN_SIMILARITY: minSim,
    RAG_MIN_RELEVANT_CHUNKS: minChunks,
  } = ENV;

  if (isNaN(high) || isNaN(med) || isNaN(minSim) || isNaN(minChunks)) {
    throw new Error('Invalid RAG configuration: threshold values must be valid numbers.');
  }

  if (minSim < 0 || minSim > med || med > high || high > 1) {
    throw new Error(
      `Invalid RAG Threshold Configuration: Must satisfy 0 <= RAG_MIN_SIMILARITY (${minSim}) <= RAG_MEDIUM_CONFIDENCE_THRESHOLD (${med}) <= RAG_HIGH_CONFIDENCE_THRESHOLD (${high}) <= 1`
    );
  }

  if (minChunks < 1) {
    throw new Error(`Invalid RAG Configuration: RAG_MIN_RELEVANT_CHUNKS must be >= 1, received ${minChunks}`);
  }
}

// Validate configuration on application module load
validateRAGThresholds();


