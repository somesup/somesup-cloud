CREATE DATABASE IF NOT EXISTS somesup;

CREATE TABLE somesup.article_provider (
  id    INT           NOT NULL AUTO_INCREMENT,
  name  VARCHAR(255)  NOT NULL,

  PRIMARY KEY (id)
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

CREATE TABLE somesup.article (
  id            INT           NOT NULL AUTO_INCREMENT,
  provider_id   INT           NOT NULL,
  processed_id  INT           NULL,
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

  FOREIGN KEY (provider_id) REFERENCES article_provider(id) ON DELETE CASCADE,
  FOREIGN KEY (processed_id) REFERENCES processed_article(id) ON DELETE SET NULL
);

CREATE TABLE somesup.keyword (
  id      INT         NOT NULL AUTO_INCREMENT,
  keyword VARCHAR(50) NOT NULL,

  PRIMARY KEY (id),
  UNIQUE (keyword)
);

CREATE TABLE somesup.keyword_article_mapping (
  p_article_id  INT NOT NULL,
  keyword_id    INT NOT NULL,

  FOREIGN KEY (p_article_id) REFERENCES processed_article(id) ON DELETE CASCADE,
  FOREIGN KEY (keyword_id) REFERENCES keyword(id) ON DELETE CASCADE
);

CREATE TABLE somesup.user (
  id                INT           NOT NULL AUTO_INCREMENT,
  nickname          VARCHAR(255)  NOT NULL,
  phone             VARCHAR(255)  NOT NULL,
  is_authenticated  BOOLEAN       NOT NULL DEFAULT FALSE,

  PRIMARY KEY (id),
  UNIQUE (nickname),
  UNIQUE (phone)
);

CREATE TABLE somesup.refresh_token (
  id          INT           NOT NULL AUTO_INCREMENT,
  user_id     INT           NOT NULL,
  token       VARCHAR(255)  NOT NULL,
  expires_at  DATETIME      NOT NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at  DATETIME      NULL,
  is_revoked  BOOLEAN       NOT NULL DEFAULT FALSE,

  PRIMARY KEY (id),

  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE somesup.like (
  p_article_id  INT       NOT NULL,
  user_id       INT       NOT NULL,
  liked_at      DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (p_article_id) REFERENCES processed_article(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE somesup.scrap (
  p_article_id  INT NOT NULL,
  user_id       INT NOT NULL,
  scrapped_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (p_article_id) REFERENCES processed_article(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);
