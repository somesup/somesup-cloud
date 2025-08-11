/**
 * 커서에 대한 인터페이스입니다.
 */
export interface CursorData {
  idx: number
}

/**
 * 커서를 생성하는 함수입니다.
 * 이 함수는 주어진 createdAt 날짜와 id를 사용하여 커서를 생성합니다.
 * 커서는 base64로 인코딩된 JSON 문자열로 반환됩니다.
 * @param {number} idx - 커서에 포함될 인덱스 값
 * @return {string} base64로 인코딩된 커서 문자열
 */
export const createCursor = (idx: number): string => {
  const cursorData = {
    idx: idx,
  }
  return Buffer.from(JSON.stringify(cursorData)).toString('base64')
}

/**
 * base64로 인코딩된 커서를 디코딩하는 함수입니다.
 * 이 함수는 base64 문자열을 디코딩하여 CursorData 객체를 반환합니다.
 * @param {string} cursor - base64로 인코딩된 커서 문자열
 * @return {CursorData} 디코딩된 커서 데이터 객체
 */
export const decodeCursor = (cursor: string): CursorData => {
  const decoded = Buffer.from(cursor, 'base64').toString('utf-8')
  const parsed = JSON.parse(decoded)
  return {
    idx: parsed.idx,
  }
}
