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
  await createSections()
  await createProviders()
}

const createSections = async () => {
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

const createProviders = async () => {
  const providers = [
    { id: 1, name: '오마이뉴스', friendlyName: '오마이뉴스' },
    { id: 2, name: 'The Guardian', friendlyName: 'The Guardian' },
    { id: 3, name: '중앙일보', friendlyName: '중앙일보' },
    { id: 4, name: 'Chosun.com', friendlyName: '조선일보' },
    { id: 5, name: 'YTN', friendlyName: 'YTN' },
    { id: 6, name: 'www.donga.com', friendlyName: '동아일보' },
    { id: 7, name: '국민일보', friendlyName: '국민일보' },
    { id: 8, name: '경향신문', friendlyName: '경향신문' },
    { id: 9, name: 'The Wall Street Journal', friendlyName: 'The Wall Street Journal' },
    { id: 10, name: 'Daily Mail Online', friendlyName: 'Daily Mail' },
    { id: 11, name: 'BBC', friendlyName: 'BBC' },
    { id: 12, name: 'Reuters', friendlyName: 'Reuters' },
    { id: 13, name: 'AP NEWS', friendlyName: 'AP NEWS' },
    { id: 14, name: '조선일보', friendlyName: '조선일보' },
    { id: 15, name: 'Breitbart', friendlyName: 'Breitbart' },
    { id: 16, name: 'Fox News', friendlyName: 'Fox News' },
  ]

  for (const provider of providers) {
    await prisma.articleProvider.upsert({
      where: { id: provider.id },
      update: {},
      create: {
        id: provider.id,
        name: provider.name,
        friendly_name: provider.friendlyName,
      },
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
