// Carregado antes de cada arquivo de teste (node --import): o env.ts lê as variáveis na importação.
// Os testes de integração apagam e recriam o banco: só rodam num banco cujo nome termina em "_test".
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://lp:lptest@127.0.0.1:54399/lp_test';
process.env.DATABASE_SSL = 'false';
process.env.APP_URL = 'http://localhost:5173';
process.env.APP_HOSTS = 'localhost,127.0.0.1';
process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres-0123456789';
process.env.STORAGE_DRIVER = 'database';
process.env.AI_PROVIDER = 'gemini';
delete process.env.GEMINI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.RAPIDAPI_KEY;
delete process.env.VERCEL;
delete process.env.ADMIN_EMAIL;
delete process.env.ADMIN_PASSWORD;
