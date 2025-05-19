CREATE DATABASE IF NOT EXISTS somesup;

CREATE TABLE somesup.article_provider (
  id    INT           NOT NULL AUTO_INCREMENT,
  name  VARCHAR(255)  NOT NULL,

  PRIMARY KEY (id)
);

CREATE TABLE somesup.article (
  id            INT           NOT NULL AUTO_INCREMENT,
  provider_id   INT           NOT NULL,
  title         VARCHAR(255)  NOT NULL,
  content       TEXT          NOT NULL,
  language      VARCHAR(30)   NOT NULL,
  region        VARCHAR(30)   NULL,
  section       VARCHAR(30)   NULL,
  thumbnail_url VARCHAR(255)  NOT NULL,
  news_url      VARCHAR(255)  NOT NULL,
  is_processed  BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  FOREIGN KEY (provider_id) REFERENCES article_provider(id)
);

CREATE TABLE somesup.processed_article (
  id                INT           NOT NULL AUTO_INCREMENT,
  title             VARCHAR(255)  NOT NULL,
  one_line_summary  TEXT          NOT NULL,
  full_summary      TEXT          NOT NULL,
  language          VARCHAR(30)   NOT NULL,
  region            VARCHAR(30)   NULL,
  section           VARCHAR(30)   NULL,
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id)
);

CREATE TABLE somesup.article_processed_mapping (
  article_id    INT           NOT NULL,
  processed_id  INT           NOT NULL,
  mapped_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (article_id)    REFERENCES article(id),
  FOREIGN KEY (processed_id)  REFERENCES processed_article(id)
);
