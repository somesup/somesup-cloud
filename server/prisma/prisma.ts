import { PrismaClient } from '@prisma/client'

/**
 * Prisma 클라이언트를 초기화합니다.
 * 전역 변수로 설정하여 불필요한 Connection을 생성하는 것을 방지합니다.
 */
const globalForPrisma = global as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()
