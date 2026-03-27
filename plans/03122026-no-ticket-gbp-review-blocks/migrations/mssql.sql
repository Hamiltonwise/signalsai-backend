-- GBP Review Blocks: MSSQL Migration
-- Tables: website_builder.reviews, website_builder.review_blocks

-- ============================================================
-- reviews
-- ============================================================
CREATE TABLE [website_builder].[reviews] (
  [id]                  UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  [location_id]         INT              NOT NULL,
  [google_review_name]  NVARCHAR(MAX)    NOT NULL,
  [stars]               SMALLINT         NOT NULL CHECK ([stars] BETWEEN 1 AND 5),
  [text]                NVARCHAR(MAX)    NULL,
  [reviewer_name]       NVARCHAR(500)    NULL,
  [reviewer_photo_url]  NVARCHAR(2000)   NULL,
  [is_anonymous]        BIT              NOT NULL DEFAULT 0,
  [review_created_at]   DATETIMEOFFSET   NULL,
  [has_reply]           BIT              NOT NULL DEFAULT 0,
  [reply_text]          NVARCHAR(MAX)    NULL,
  [reply_date]          DATETIMEOFFSET   NULL,
  [synced_at]           DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  [created_at]          DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  [updated_at]          DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [FK_reviews_location] FOREIGN KEY ([location_id]) REFERENCES [dbo].[locations]([id]) ON DELETE CASCADE
);

CREATE UNIQUE INDEX [idx_reviews_google_name] ON [website_builder].[reviews] ([google_review_name](900));
CREATE INDEX [idx_reviews_location_stars] ON [website_builder].[reviews] ([location_id], [stars]);
CREATE INDEX [idx_reviews_location_date] ON [website_builder].[reviews] ([location_id], [review_created_at] DESC);

-- ============================================================
-- review_blocks
-- ============================================================
CREATE TABLE [website_builder].[review_blocks] (
  [id]            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
  [template_id]   UNIQUEIDENTIFIER NOT NULL,
  [name]          NVARCHAR(500)    NOT NULL,
  [slug]          NVARCHAR(500)    NOT NULL,
  [description]   NVARCHAR(MAX)    NULL,
  [sections]      NVARCHAR(MAX)    NOT NULL DEFAULT '[]',
  [created_at]    DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  [updated_at]    DATETIMEOFFSET   NOT NULL DEFAULT SYSDATETIMEOFFSET(),
  CONSTRAINT [FK_review_blocks_template] FOREIGN KEY ([template_id]) REFERENCES [website_builder].[templates]([id]) ON DELETE CASCADE
);

CREATE UNIQUE INDEX [idx_review_blocks_template_slug] ON [website_builder].[review_blocks] ([template_id], [slug]);

-- ============================================================
-- Rollback
-- ============================================================
-- DROP TABLE IF EXISTS [website_builder].[review_blocks];
-- DROP TABLE IF EXISTS [website_builder].[reviews];
