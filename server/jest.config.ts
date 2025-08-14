module.exports = {
  clearMocks: true,
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['./prisma/mock.ts'],
  setupFiles: ['./jest.env.ts'],
  roots: ['<rootDir>/src'],
}
