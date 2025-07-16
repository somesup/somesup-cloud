export const mockReq = (body = {}) => ({ body }) as any
export const mockRes = () => {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.send = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}
