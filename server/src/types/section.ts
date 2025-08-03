/**
 * 사용자의 섹션 선호도를 나타내는 타입입니다.
 */
export type UserSectionPreference = {
  userId: number
  sectionId: number
  sectionName: string
  preference: number
}
