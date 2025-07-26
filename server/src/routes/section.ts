import { Router } from 'express'
import { getSectionById, getSections } from '../controllers/sectionController'

const router = Router()

/**
 * 섹션 목록 조회
 */
router.get('/', getSections)

/**
 * 특정 섹션 조회
 */
router.get('/:id', getSectionById)
