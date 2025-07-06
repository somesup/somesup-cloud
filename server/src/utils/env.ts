/**
 * 환경변수를 가져오는 함수입니다.
 * @param {string} name - 환경변수의 이름
 * @returns {string} 환경변수의 값
 * @throws {Error} 환경변수가 설정되어 있지 않은 경우 에러 발생
 */
export const getEnv = (name: string): string => {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Environment variable ${name} is not set`)
  }
  return value
}
