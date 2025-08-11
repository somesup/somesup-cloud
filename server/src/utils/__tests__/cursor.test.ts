import { createCursor, decodeCursor } from '../cursor'

describe('createCursor', () => {
  it('should create a base64 encoded cursor from createdAt and id', () => {
    const idx = 123

    const cursor = createCursor(idx)

    const expectedCursor = Buffer.from(JSON.stringify({ idx })).toString('base64')
    expect(cursor).toBe(expectedCursor)
  })
})

describe('decodeCursor', () => {
  it('should decode a base64 encoded cursor to createdAt and id', () => {
    const idx = 123
    const cursor = Buffer.from(JSON.stringify({ idx })).toString('base64')

    const decoded = decodeCursor(cursor)

    expect(decoded.idx).toBe(idx)
  })

  it('should throw an error for invalid base64 strings', () => {
    expect(() => decodeCursor('invalid-base64')).toThrow(SyntaxError)
  })
})
