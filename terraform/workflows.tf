locals {
  NUM_ARTICLES_PER_SOURCE = 10
}

resource "google_cloud_tasks_queue" "summary_queue" {
  project  = var.project
  location = var.region
  name     = "summary-queue"

  rate_limits {
    # TODO: Adjust these limits based on vertex AI quota and limits
    max_dispatches_per_second = 20
    max_concurrent_dispatches = 10
  }

  retry_config {
    max_attempts  = 5
    min_backoff   = "10s"
    max_backoff   = "300s"
    max_doublings = 3
  }

  stackdriver_logging_config {
    sampling_ratio = 1.0
  }
}

resource "google_service_account" "workflow_service_account" {
  project      = var.project
  account_id   = "workflow-service-account"
  display_name = "Workflow Service Account"
}

resource "google_project_iam_member" "workflow_service_account_role" {
  for_each = toset([
    "roles/cloudfunctions.invoker",
    "roles/run.invoker",
    "roles/cloudtasks.enqueuer",
    "roles/logging.logWriter",
    "roles/iam.serviceAccountUser",
  ])
  project = var.project
  role    = each.value
  member  = google_service_account.workflow_service_account.member
}

resource "google_workflows_workflow" "article_processing" {
  project         = var.project
  region          = var.region
  name            = "article-processing-workflow"
  description     = "Workflow for processing articles from various news sources"
  service_account = google_service_account.workflow_service_account.id

  source_contents = templatefile("${path.module}/src/workflows/article_processing.yaml", {
    PROJECT                  = var.project
    LOCATION                 = var.region
    SUMMARY_QUEUE_NAME       = google_cloud_tasks_queue.summary_queue.name
    CLUSTERING_URL           = module.clustering_articles.function_url
    SUMMARIZER_URL           = module.cluster_summarizer.function_url
    WORKFLOW_SERVICE_ACCOUNT = google_service_account.workflow_service_account.email

    FETCHER_URLS = jsonencode([
      # 한국 뉴스 - 진보
      "${module.newsapi_fetcher.function_url}?source_uri=khan.co.kr&num_articles=${local.NUM_ARTICLES_PER_SOURCE}",
      "${module.newsapi_fetcher.function_url}?source_uri=ohmynews.com&num_articles=${local.NUM_ARTICLES_PER_SOURCE}",

      # 한국 뉴스 - 중도
      "${module.newsapi_fetcher.function_url}?source_uri=ytn.co.kr&num_articles=${local.NUM_ARTICLES_PER_SOURCE}",

      # 한국 뉴스 - 보수
      "${module.newsapi_fetcher.function_url}?source_uri=donga.com&num_articles=${local.NUM_ARTICLES_PER_SOURCE}",
      "${module.newsapi_fetcher.function_url}?source_uri=joongang.co.kr&num_articles=${local.NUM_ARTICLES_PER_SOURCE}",
      "${module.newsapi_fetcher.function_url}?source_uri=chosun.com&num_articles=${local.NUM_ARTICLES_PER_SOURCE}",
      "${module.newsapi_fetcher.function_url}?source_uri=kmib.co.kr&num_articles=${local.NUM_ARTICLES_PER_SOURCE}",

      # 국제 뉴스 - 진보
      "${module.guardian_fetcher.function_url}?num_articles=${local.NUM_ARTICLES_PER_SOURCE}",
      "${module.newsapi_fetcher.function_url}?source_uri=apnews.com&num_articles=${local.NUM_ARTICLES_PER_SOURCE}",

      # 국제 뉴스 - 중도
      "${module.newsapi_fetcher.function_url}?source_uri=bbc.com&num_articles=${local.NUM_ARTICLES_PER_SOURCE}",
      "${module.newsapi_fetcher.function_url}?source_uri=reuters.com&num_articles=${local.NUM_ARTICLES_PER_SOURCE}",

      # 국제 뉴스 - 보수
      "${module.newsapi_fetcher.function_url}?source_uri=foxnews.com&num_articles=${local.NUM_ARTICLES_PER_SOURCE}",
      "${module.newsapi_fetcher.function_url}?source_uri=wsj.com&num_articles=${local.NUM_ARTICLES_PER_SOURCE}",
      "${module.newsapi_fetcher.function_url}?source_uri=dailymail.co.uk&num_articles=${local.NUM_ARTICLES_PER_SOURCE}",
      "${module.newsapi_fetcher.function_url}?source_uri=breitbart.com&num_articles=${local.NUM_ARTICLES_PER_SOURCE}",
    ])
  })

  depends_on = [google_cloud_tasks_queue.summary_queue]
}
