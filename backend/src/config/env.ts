import dotenv from 'dotenv';
dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. Set it in backend/.env`);
  }
  return value;
}

export const ENV = {
  PORT: parseInt(process.env.PORT || '5000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  JWT_SECRET: requireEnv('JWT_SECRET'),
  DATABASE_URL: requireEnv('DATABASE_URL'),
  DIRECT_URL: requireEnv('DIRECT_URL'),
  ALLOWED_DOMAINS: (process.env.ALLOWED_DOMAINS || 'cit.edu.in,college.edu.in').split(',').map((d) => d.trim()),
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  CHUNK_SIZE: parseInt(process.env.CHUNK_SIZE || '500', 10),
  CHUNK_OVERLAP: parseInt(process.env.CHUNK_OVERLAP || '50', 10),

  // Embedding Provider Config
  EMBEDDING_PROVIDER: (process.env.EMBEDDING_PROVIDER || 'local').toLowerCase(),
  EMBEDDING_MODEL: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
  EMBEDDING_API_KEY: process.env.EMBEDDING_API_KEY || process.env.AI_API_KEY || '',
  EMBEDDING_DIMENSION: parseInt(process.env.EMBEDDING_DIMENSION || '384', 10),

  // RAG Thresholds
  RAG_HIGH_CONFIDENCE_THRESHOLD: parseFloat(process.env.RAG_HIGH_CONFIDENCE_THRESHOLD || '0.75'),
  RAG_MEDIUM_CONFIDENCE_THRESHOLD: parseFloat(process.env.RAG_MEDIUM_CONFIDENCE_THRESHOLD || '0.50'),
  RAG_MIN_SIMILARITY: parseFloat(process.env.RAG_MIN_SIMILARITY || '0.35'),
  RAG_MIN_RELEVANT_CHUNKS: parseInt(process.env.RAG_MIN_RELEVANT_CHUNKS || '1', 10),

  // Phase 8 Reliability & Resilience Settings
  AI_PROVIDER_TIMEOUT_MS: parseInt(process.env.AI_PROVIDER_TIMEOUT_MS || '30000', 10),
  AI_MAX_RETRIES: parseInt(process.env.AI_MAX_RETRIES || '3', 10),
  AI_INITIAL_RETRY_DELAY_MS: parseInt(process.env.AI_INITIAL_RETRY_DELAY_MS || '500', 10),
  AI_MAX_RETRY_DELAY_MS: parseInt(process.env.AI_MAX_RETRY_DELAY_MS || '3000', 10),

  // Environment-driven Rate Limiting
  AI_CHAT_RATE_LIMIT: parseInt(process.env.AI_CHAT_RATE_LIMIT || '30', 10),
  AI_RAG_RATE_LIMIT: parseInt(process.env.AI_RAG_RATE_LIMIT || '20', 10),
  AI_GENERATION_RATE_LIMIT: parseInt(process.env.AI_GENERATION_RATE_LIMIT || '10', 10),
  AI_ADMIN_RATE_LIMIT: parseInt(process.env.AI_ADMIN_RATE_LIMIT || '60', 10),

  // Document Processing Safety Limits
  MAX_EXTRACTED_TEXT: parseInt(process.env.MAX_EXTRACTED_TEXT || '500000', 10),
  MAX_CHUNKS_PER_DOCUMENT: parseInt(process.env.MAX_CHUNKS_PER_DOCUMENT || '1000', 10),
  MAX_EMBEDDING_BATCH_SIZE: parseInt(process.env.MAX_EMBEDDING_BATCH_SIZE || '50', 10),
  MAX_PROCESSING_RETRIES: parseInt(process.env.MAX_PROCESSING_RETRIES || '3', 10),
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

export function validateProductionEnvironment() {
  if (ENV.NODE_ENV === 'production') {
    if (!ENV.DATABASE_URL) {
      throw new Error('PRODUCTION FATAL: DATABASE_URL is missing.');
    }
    if (!ENV.JWT_SECRET || ENV.JWT_SECRET.includes('gsmas_super_secret_jwt_key_2026_production')) {
      throw new Error('PRODUCTION FATAL: Default JWT_SECRET is not allowed in production mode.');
    }
    if (isNaN(ENV.PORT) || ENV.PORT <= 0) {
      throw new Error('PRODUCTION FATAL: PORT environment variable is invalid.');
    }
  }
}

// Validate configuration on application module load
validateRAGThresholds();
validateProductionEnvironment();
