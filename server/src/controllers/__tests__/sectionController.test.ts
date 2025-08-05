import { sectionService, SectionNotFoundError } from '../../services/sectionService'
import { success, errors } from '../../utils/response'
import { getSections, getSectionById } from '../sectionController'

jest.mock('../../utils/response')
jest.mock('../../services/sectionService')

describe('sectionController', () => {
  let req: any
  let res: any
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    req = { query: {}, params: {} }
    res = {}
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  describe('getSections', () => {
    it('should return all sections', async () => {
      const expectedSections = [
        { id: 1, name: 'politics' },
        { id: 2, name: 'economy' },
      ]
      ;(sectionService.getSections as jest.Mock).mockResolvedValue(expectedSections)

      const sections = await getSections(req, res)

      expect(success).toHaveBeenCalledWith(res, expectedSections, {
        message: 'Sections retrieved successfully',
      })
    })

    it('should return not found error if no sections exist', async () => {
      ;(sectionService.getSections as jest.Mock).mockRejectedValue(new SectionNotFoundError('Sections not found'))

      await getSections(req, res)

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching sections:', expect.any(SectionNotFoundError))
      expect(errors.notFound).toHaveBeenCalledWith(res, 'Sections not found')
    })

    it('should return internal error on unexpected error', async () => {
      const error = new Error('Unexpected error')
      ;(sectionService.getSections as jest.Mock).mockRejectedValue(error)

      await getSections(req, res)

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching sections:', error)
      expect(errors.internal).toHaveBeenCalledWith(res)
    })
  })

  describe('getSectionById', () => {
    it('should return section by id', async () => {
      req.params.id = '1'
      const expectedSection = { id: 1, name: 'politics' }
      ;(sectionService.getSectionById as jest.Mock).mockResolvedValue(expectedSection)

      const section = await getSectionById(req, res)

      expect(success).toHaveBeenCalledWith(res, expectedSection, {
        message: 'Section retrieved successfully',
      })
    })

    it('should return not found error if section does not exist', async () => {
      req.params.id = '999'
      ;(sectionService.getSectionById as jest.Mock).mockRejectedValue(new SectionNotFoundError('Section not found'))

      await getSectionById(req, res)

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error retrieving section:', expect.any(SectionNotFoundError))
      expect(errors.notFound).toHaveBeenCalledWith(res, 'Section not found')
    })

    it('should return internal error on unexpected error', async () => {
      req.params.id = '1'
      const error = new Error('Unexpected error')
      ;(sectionService.getSectionById as jest.Mock).mockRejectedValue(error)

      await getSectionById(req, res)

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error retrieving section:', error)
      expect(errors.internal).toHaveBeenCalledWith(res)
    })
  })
})
