import { PrismaClient, SectionType } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await createSections()
  await createProviders()
}

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
const createSections = async () => {
  const sections = [
    { name: SectionType.politics, friendlyName: '정치' },
    { name: SectionType.economy, friendlyName: '경제' },
    { name: SectionType.society, friendlyName: '사회' },
    { name: SectionType.culture, friendlyName: '문화' },
    { name: SectionType.tech, friendlyName: '기술' },
    { name: SectionType.world, friendlyName: '세계' },
  ]

  for (const section of sections) {
    await prisma.articleSection.upsert({
      where: { name: section.name },
      update: {},
      create: {
        name: section.name,
        friendly_name: section.friendlyName,
      },
    })
  }
}

/**
 * 기본 뉴스 제공자를 데이터베이스에 추가하는 스크립트입니다.
 * 이 스크립트는 뉴스 제공자를 데이터베이스에 삽입하거나 이미 존재하는 경우 업데이트합니다.
 * 각 제공자는 고유한 ID, 이름, 친숙한 이름 및 로고 URL을 가지고 있습니다.
 */
const createProviders = async () => {
  const providers = [
    {
      id: 1,
      name: '오마이뉴스',
      friendlyName: '오마이뉴스',
      logoUrl: 'https://storage.googleapis.com/somesup-462506-provider-logo/1.png',
    },
    {
      id: 2,
      name: 'The Guardian',
      friendlyName: 'The Guardian',
      logoUrl: 'https://storage.googleapis.com/somesup-462506-provider-logo/2.png',
    },
    {
      id: 3,
      name: '중앙일보',
      friendlyName: '중앙일보',
      logoUrl: 'https://storage.googleapis.com/somesup-462506-provider-logo/3.png',
    },
    {
      id: 4,
      name: 'Chosun.com',
      friendlyName: '조선일보',
      logoUrl: 'https://storage.googleapis.com/somesup-462506-provider-logo/4.png',
    },
    {
      id: 5,
      name: 'YTN',
      friendlyName: 'YTN',
      logoUrl: 'https://storage.googleapis.com/somesup-462506-provider-logo/5.png',
    },
    {
      id: 6,
      name: 'www.donga.com',
      friendlyName: '동아일보',
      logoUrl: 'https://storage.googleapis.com/somesup-462506-provider-logo/6.png',
    },
    {
      id: 7,
      name: '국민일보',
      friendlyName: '국민일보',
      logoUrl: 'https://storage.googleapis.com/somesup-462506-provider-logo/7.png',
    },
    {
      id: 8,
      name: '경향신문',
      friendlyName: '경향신문',
      logoUrl: 'https://storage.googleapis.com/somesup-462506-provider-logo/8.png',
    },
    {
      id: 9,
      name: 'The Wall Street Journal',
      friendlyName: 'The Wall Street Journal',
      logoUrl: 'https://storage.googleapis.com/somesup-462506-provider-logo/9.png',
    },
    {
      id: 10,
      name: 'Daily Mail Online',
      friendlyName: 'Daily Mail',
      logoUrl: 'https://storage.googleapis.com/somesup-462506-provider-logo/10.png',
    },
    {
      id: 11,
      name: 'BBC',
      friendlyName: 'BBC',
      logoUrl: 'https://storage.googleapis.com/somesup-462506-provider-logo/11.png',
    },
    {
      id: 12,
      name: 'Reuters',
      friendlyName: 'Reuters',
      logoUrl: 'https://storage.googleapis.com/somesup-462506-provider-logo/12.png',
    },
    {
      id: 13,
      name: 'AP NEWS',
      friendlyName: 'AP NEWS',
      logoUrl: 'https://storage.googleapis.com/somesup-462506-provider-logo/13.png',
    },
    {
      id: 14,
      name: 'Breitbart',
      friendlyName: 'Breitbart',
      logoUrl: 'https://storage.googleapis.com/somesup-462506-provider-logo/14.png',
    },
    {
      id: 15,
      name: 'Fox News',
      friendlyName: 'Fox News',
      logoUrl: 'https://storage.googleapis.com/somesup-462506-provider-logo/15.png',
    },
  ]

  for (const provider of providers) {
    await prisma.articleProvider.upsert({
      where: { id: provider.id },
      update: {},
      create: {
        id: provider.id,
        name: provider.name,
        friendly_name: provider.friendlyName,
        logo_url: provider.logoUrl,
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
