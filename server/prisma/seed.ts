import { PrismaClient, SectionType } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * 기본 뉴스 섹션을 데이터베이스에 추가하는 스크립트입니다.
 * 이 스크립트는 뉴스 섹션을 데이터베이스에 삽입하거나 이미 존재하는 경우 업데이트합니다.
 * 각 섹션은 고유한 이름을 가지고 있으며, 다음과 같은 섹션이 포함됩니다:
 * - 정치 (politics)
 *   경제 (economy)
 *   사회 (society)
 *   문화 (culture)
 *   기술 (tech)
 *   세계 (world)
 */
async function main() {
  const sections = [
    SectionType.politics,
    SectionType.economy,
    SectionType.society,
    SectionType.culture,
    SectionType.tech,
    SectionType.world,
  ]

  for (const name of sections) {
    await prisma.articleSection.upsert({
      where: { name },
      update: {}, // 이미 있으면 변경하지 않음
      create: { name },
    })
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
