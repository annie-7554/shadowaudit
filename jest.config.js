/** @type {import('jest').Config} */
module.exports = {
  projects: [
    '<rootDir>/packages/bff',
    '<rootDir>/packages/scanner',
    '<rootDir>/packages/notifier',
  ],
  collectCoverage: true,
  coverageDirectory: '<rootDir>/coverage',
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  coverageReporters: ['text', 'lcov', 'html'],
};
