module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/modules/ai/tests/**/*.test.ts', '**/src/tests/**/*.test.ts'],
  testTimeout: 30000,
};
