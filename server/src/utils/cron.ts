import dayjs from 'dayjs'
import cron from 'node-cron'
import { articleService } from '../services/articleService'

export const registerCronJobs = () => {
  // 하이라이트 뉴스 업데이트 작업을 매일 자정에 실행
  cron.schedule('0 0 * * *', async () => {
    const yesterday = dayjs().subtract(1, 'day').startOf('day').toDate()
    articleService.updateHighlightArticles(yesterday)
  })
}
