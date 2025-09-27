import 'dotenv/config';
const cfg = {
  PORT: Number(process.env.PORT || 4000),

  CHROMA_URL: process.env.CHROMA_URL || 'http://localhost:8001',
  CHROMA_TENANT: process.env.CHROMA_TENANT || 'default_tenant',
  CHROMA_DATABASE: process.env.CHROMA_DATABASE || 'default_database',
  CHROMA_COLLECTION: process.env.CHROMA_COLLECTION || 'agentic_docs',
  CHROMA_FORCE_MODE: (process.env.CHROMA_FORCE_MODE || 'v2mt').toLowerCase(),

  RAG_BACKEND: (process.env.RAG_BACKEND || 'off').toLowerCase(),

  EMBEDDINGS_PROVIDER: (process.env.EMBEDDINGS_PROVIDER || 'openai').toLowerCase(),
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_EMBED_MODEL: process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small',
  EMBEDDINGS_TIMEOUT_MS: Number(process.env.EMBEDDINGS_TIMEOUT_MS || 15000),

  ADMIN_API_KEY: process.env.ADMIN_API_KEY,
  USER_API_KEY: process.env.USER_API_KEY,
};
export default cfg;
