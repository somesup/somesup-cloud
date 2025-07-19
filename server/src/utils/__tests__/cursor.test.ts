import { createCursor, decodeCursor } from '../cursor'

describe('createCursor', () => {
  it('should create a base64 encoded cursor from createdAt and id', () => {
    const createdAt = new Date('2025-07-19T12:00:00Z')
    const id = 123

    const cursor = createCursor(createdAt, id)

    const expectedCursor = Buffer.from(JSON.stringify({ createdAt, id })).toString('base64')
    expect(cursor).toBe(expectedCursor)
  })
})

describe('decodeCursor', () => {
  it('should decode a base64 encoded cursor to createdAt and id', () => {
    const createdAt = new Date('2025-07-19T12:00:00Z')
    const id = 123
    const cursor = Buffer.from(JSON.stringify({ createdAt, id })).toString('base64')

    const decoded = decodeCursor(cursor)

    expect(decoded.createdAt).toEqual(createdAt)
    expect(decoded.id).toBe(id)
  })

  it('should throw an error for invalid base64 strings', () => {
    expect(() => decodeCursor('invalid-base64')).toThrow(SyntaxError)
  })
})
