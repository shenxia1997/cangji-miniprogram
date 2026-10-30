/** @jest-environment node */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['domain/**/*.ts'],
  coveragePathIgnorePatterns: ['/node_modules/', 'domain/types.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'CommonJS', esModuleInterop: true, strict: true } }],
  },
  verbose: true,
};
