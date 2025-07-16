import { PrismaClient } from '@prisma/client'
import { mockDeep, DeepMockProxy, mockReset } from 'jest-mock-extended'
import { beforeEach } from 'node:test'

import { prisma } from './prisma'

jest.mock('./prisma.ts', () => ({
  __esModule: true,
  prisma: mockDeep<PrismaClient>(),
}))

beforeEach(() => {
  mockReset(prismaMock)
})

export const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>
