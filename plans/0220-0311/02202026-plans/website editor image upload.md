# Website Editor Image Upload Feature

## Conversation Log

### Initial Request
User wants to add an image uploader feature with the following specs:

1. **New Media Tab** in single project page
2. **Upload Interface**
   - Allowed formats: jpg, png, webp, jpeg, pdf, mp4
   - File size limit: 50mb
   - Upload to S3: `uploads/{project-id}/`
3. **Database Table**: `website_builder.media`
   - Links: project_id, s3_link, name, other necessary references
4. **Document conversation** in this file

---

## Questions & Scrutiny

### Architecture Questions

#### 1. S3 Configuration
- **Which S3 bucket?** Do we already have an S3 bucket configured in the backend?
- **AWS credentials setup?** Are AWS SDK and credentials already in place?
- **Public vs Private?** Should uploaded media be publicly accessible via CloudFront/CDN, or signed URLs?
- **Bucket structure?** Is it `uploads/{project-id}/{filename}` or `uploads/{project-id}/{media-id}/{filename}`?

#### 2. Single Project Page Location
- **Where is this page?** I need to find the "single project page" component
  - Is it `/admin/websites/:id`?
  - What's the current tab structure? (if any)
  - Are we using a tab component already (Radix UI Tabs, custom, etc.)?

#### 3. Database Schema Needs
For `website_builder.media` table, should we track:
- ✅ `id` (primary key)
- ✅ `project_id` (foreign key → `website_builder.projects.id`)
- ✅ `name` (original filename)
- ✅ `s3_key` (full S3 path: `uploads/{project-id}/{filename}`)
- ✅ `s3_url` (public URL if applicable)
- ✅ `file_size` (bytes)
- ✅ `mime_type` (image/jpeg, video/mp4, etc.)
- ✅ `created_at`, `updated_at`
- ❓ `uploaded_by` (user_id)? For audit trail?
- ❓ `alt_text`? For accessibility when inserting images into pages?
- ❓ `width`, `height`? For image dimensions (useful for responsive images)?
- ❓ `thumbnail_url`? For video preview thumbnails?
- ❓ `status`? (active, deleted, processing for videos)?

#### 4. Upload Flow Architecture
- **Direct upload or presigned URL?**
  - Option A: Upload file to backend → backend uploads to S3 (simpler, but ties up backend)
  - Option B: Frontend requests presigned URL → upload directly to S3 → notify backend (faster, scalable)
  - **Recommendation:** Option B for files up to 50mb

- **Progress indication?** For large files (videos), should we show upload progress?

- **File validation:**
  - Client-side: check extension + size before upload
  - Server-side: validate MIME type (don't trust client), re-check size

#### 5. Media Management Features
Beyond basic upload, do we need:
- ❓ **Delete media?** Hard delete or soft delete (status flag)?
- ❓ **Replace/update media?** Upload new version with same ID?
- ❓ **Search/filter?** By type (images vs videos), date, name?
- ❓ **Bulk upload?** Multiple files at once?
- ❓ **Copy URL button?** For easy insertion into pages?
- ❓ **Preview modal?** Click thumbnail to see full size?

#### 6. Integration with Page Editor
This is the critical part:
- **How will users insert uploaded media into pages?**
  - Option A: Manual copy/paste S3 URL into HTML via AI instructions
  - Option B: Media picker modal in PageEditor (click image → browse media library → insert)
  - Option C: AI-aware: "Use the hero image from my media library"

- **Do we need to:**
  - Track which media is used in which pages?
  - Prevent deletion of media that's in use?
  - Show "orphaned" media that's not used anywhere?

---

## Potential Issues & Pushbacks

### 🚨 Security Concerns
1. **File type validation**: PDFs and MP4s can contain malicious payloads
   - Need to validate MIME type server-side (not just extension)
   - Consider virus scanning for large deployments (AWS Lambda ClamAV?)

2. **Public access**: If media is publicly accessible:
   - Anyone with the URL can view it
   - Need to decide: is this per-project media or per-user?
   - Should deleted projects also delete associated media?

3. **Storage costs**: 50mb × many users = $$$ over time
   - Do we need storage quotas per project/user?
   - Cleanup policy for abandoned projects?

### ⚠️ Architecture Concerns
1. **Existing S3 setup?**
   - If we don't have AWS SDK configured yet, this adds:
     - `aws-sdk` or `@aws-sdk/client-s3` dependency
     - Environment variables (`AWS_REGION`, `AWS_BUCKET_NAME`, credentials)
     - IAM permissions for backend service

2. **Migration complexity**:
   - New table creation
   - Foreign key constraints
   - Indexes for performance (project_id, mime_type)

3. **Frontend upload library**:
   - Do we use native `<input type="file">` + fetch?
   - Or a library like `react-dropzone` for better UX (drag & drop)?

### 🤔 UX Questions
1. **Empty state**: What does the media tab show when no files uploaded?
   - Drag-and-drop zone?
   - Placeholder with upload button?

2. **Grid vs List view?**
   - Images: thumbnail grid makes sense
   - Videos/PDFs: list view with icons?

3. **Loading states**:
   - Uploading spinner per file?
   - Optimistic UI (show file immediately, then confirm)?

---

## Suggested Improvements

### 💡 Enhancements to Consider

1. **Image optimization on upload**:
   - Generate thumbnails (e.g., 200px width for grid view)
   - Compress large images (Sharp library on backend)
   - Store both original + optimized versions
   - **Tradeoff:** Adds processing time, but saves bandwidth & improves UX

2. **Video thumbnail generation**:
   - Extract first frame as JPEG thumbnail
   - Use `ffmpeg` or AWS MediaConvert
   - **Tradeoff:** More complex, but necessary for video preview

3. **Drag-and-drop UI**:
   - Much better UX than file input button
   - Use `react-dropzone` (7kb gzipped, battle-tested)
   - Shows upload progress, supports multiple files

4. **Copy-to-clipboard**:
   - Click media item → copies S3 URL
   - Makes it easy to use in editor or share

5. **Usage tracking** (future-proofing):
   - Store which pages reference which media
   - Show "Used in 3 pages" badge
   - Warn before deleting in-use media

---

## Proposed Simplified MVP

To ship this quickly without over-engineering:

### Phase 1: Core Upload (MVP)
1. **New Media tab** in project page
2. **Upload interface**:
   - Simple file input button (no drag-drop yet)
   - Single file upload (no bulk)
   - Client-side validation: extension + 50mb limit
   - Show upload progress bar
3. **Backend**:
   - POST `/api/admin/websites/:id/media/upload`
   - Presigned URL approach (frontend → S3 directly)
   - Server validates, creates DB record
4. **Database**:
   - Basic schema: id, project_id, name, s3_key, s3_url, file_size, mime_type, created_at
5. **Display**:
   - Grid view for images (thumbnail = full image for now)
   - List view for PDFs/videos with icons
   - Click to copy URL
6. **Delete**: Soft delete (status flag), cron job to cleanup later

### Phase 2: Polish (Next Sprint)
- Drag-and-drop with `react-dropzone`
- Bulk upload
- Image thumbnails (Sharp)
- Preview modal
- Search/filter

### Phase 3: Editor Integration (Later)
- Media picker in PageEditor
- AI-aware media insertion
- Usage tracking

---

## Open Questions for User

Before I build the plan, I need answers to:

1. **Do we already have AWS S3 configured in the backend?** (bucket name, credentials, SDK installed?)

2. **Where is the "single project page"?** (Give me the file path or route so I can see the current structure)

3. **Public or private media?**
   - Public = anyone with URL can view (simpler, use for published websites)
   - Private = signed URLs with expiration (more secure, more complex)

4. **Database fields**: Do we need `uploaded_by`, `alt_text`, `width/height`, `thumbnail_url`?

5. **Delete behavior**: Soft delete (flag) or hard delete (remove from S3 immediately)?

6. **MVP or full-featured?** Should we start simple (basic upload + display + delete) or build all the bells and whistles upfront?

---

## User Responses (ANSWERED)

1. **S3 Configuration:** ✅ Yes, AWS setup exists — see imports feature with Multer + S3Client
2. **Single Project Page:** ✅ `/admin/websites/:id` → WebsiteDetail.tsx (lines 878-893 have custom tabs)
3. **Public vs Private:** ✅ Public (for embedding in published websites)
4. **MVP Scope:** ✅ Basic upload, grid display, copy URL, delete + AI integration
5. **Delete Behavior:** ✅ Hard delete always, no prevention needed
6. **Storage/Security:**
   - Max 25MB (not 50MB — consistent with imports)
   - Cleanup policy: delete project → pages → media (DB + S3)
   - MIME validation server-side with user-friendly errors
   - Presigned URLs not needed for 25MB (direct backend upload is fine)

---

## Final Approach (APPROVED BY USER)

### Architecture Decisions

**Upload Pattern:** Direct backend upload (Multer memoryStorage → S3)
- Reuses existing imports pattern exactly
- Simple, no presigned URL complexity
- Acceptable performance for 25MB files

**Database Schema:** `website_builder.media`
- Links: project_id (FK with CASCADE), s3_key, s3_url, filename, display_name, alt_text
- Indexes: project_id, mime_type, created_at
- Alt text for AI integration + accessibility

**S3 Structure:** `uploads/{project-id}/{uuid}-{filename}`
- UUID prefix prevents filename collisions
- Project-scoped folders for organization
- Reuses existing bucket + credentials

**Frontend:** New Media tab in WebsiteDetail
- Custom Tailwind tabs (no Radix UI)
- Grid layout with thumbnails (images) and icons (videos/PDFs)
- Copy URL, edit metadata, delete actions

**PageEditor Integration:** Backend injects media context before LLM call
- Lists all project media with URLs in user message
- AI can reference "hero banner" or "sunset photo" by name
- No frontend changes needed

**Cleanup:** Project deletion triggers media cleanup
- ON DELETE CASCADE removes DB rows automatically
- Backend loops through S3 keys and deletes objects
- Non-blocking (logs errors but doesn't fail deletion)

---

## Implementation Complete ✅

### Backend
✅ Database migration created and executed (`website_builder.media` table)
✅ Media routes fully implemented (`/api/admin/websites/:projectId/media`)
  - POST `/` - Bulk upload (up to 20 files, 25MB each)
  - GET `/` - List media with pagination, filtering, search
  - PATCH `/:mediaId` - Update display name & alt text
  - DELETE `/:mediaId` - Hard delete with S3 cleanup
✅ Image processing service (Sharp) - WebP conversion + thumbnails
✅ S3 integration - uploads to `uploads/{project-id}/` bucket
✅ Storage quota enforcement (5GB per project)
✅ AI context injection - media library URLs injected into PageEditor LLM calls

### Frontend
✅ MediaTab component created ([src/components/admin/MediaTab.tsx](signalsai/src/components/admin/MediaTab.tsx))
  - Upload interface with progress indication
  - Grid layout with thumbnails (images) and icons (videos/PDFs)
  - Filter by type (all, image, video, pdf)
  - Search by filename
  - Copy URL button (clipboard)
  - Edit metadata inline (display name, alt text)
  - Delete confirmation
  - Storage quota display with color-coded progress bar
✅ Integrated into WebsiteDetail as third tab (Pages | Layouts | Media)

### AI Integration
✅ Media library context automatically injected into:
  - Page component edits (`POST /api/admin/websites/:id/pages/:pageId/edit`)
  - Layout edits (`POST /api/admin/websites/:id/edit-layout`)
✅ LLM receives formatted list of all project media with URLs, alt text, dimensions
✅ Users can now instruct AI: "Use the hero banner from my media library" or "Replace this image with sunset.jpg from uploads"

---

## Ready for Testing

Both dev servers are running:
- Frontend: Vite dev server (PID 4281)
- Backend: tsx watch (PID 14183, auto-reloaded)

### Test Checklist
1. Navigate to `/admin/websites/:id` in browser
2. Click "Media" tab
3. Upload test images (JPG, PNG, WebP)
4. Verify:
   - Images are converted to WebP
   - Thumbnails generated
   - Quota bar updates
   - Grid displays correctly
5. Test copy URL button
6. Test edit metadata (display name, alt text)
7. Test delete functionality
8. Test AI integration:
   - Open PageEditor
   - Edit a component
   - Instruct AI to use media from library (e.g., "add the logo.png image")
   - Verify AI has access to media URLs in context

---

## Files Changed

### Backend
- [signalsai-backend/src/database/migrations/20260214000000_create_media_table.ts](signalsai-backend/src/database/migrations/20260214000000_create_media_table.ts) - Migration (fixed raw SQL syntax)
- [signalsai-backend/src/routes/admin/media.ts](signalsai-backend/src/routes/admin/media.ts) - CRUD routes (already existed)
- [signalsai-backend/src/services/mediaProcessor.ts](signalsai-backend/src/services/mediaProcessor.ts) - Image processing (already existed)
- [signalsai-backend/src/routes/admin/websites.ts](signalsai-backend/src/routes/admin/websites.ts):1818-1891 - Added media context injection to page edit endpoint
- [signalsai-backend/src/routes/admin/websites.ts](signalsai-backend/src/routes/admin/websites.ts):1902-1951 - Added media context injection to layout edit endpoint
- [signalsai-backend/src/services/pageEditorService.ts](signalsai-backend/src/services/pageEditorService.ts):24-29 - Added `mediaContext` param to EditRequest interface
- [signalsai-backend/src/services/pageEditorService.ts](signalsai-backend/src/services/pageEditorService.ts):49-70 - Injected mediaContext into user message

### Frontend
- [signalsai/src/components/admin/MediaTab.tsx](signalsai/src/components/admin/MediaTab.tsx) - NEW: Full media library component
- [signalsai/src/pages/admin/WebsiteDetail.tsx](signalsai/src/pages/admin/WebsiteDetail.tsx):40 - Import MediaTab
- [signalsai/src/pages/admin/WebsiteDetail.tsx](signalsai/src/pages/admin/WebsiteDetail.tsx):121 - Updated tab state type
- [signalsai/src/pages/admin/WebsiteDetail.tsx](signalsai/src/pages/admin/WebsiteDetail.tsx):879 - Updated tab bar to include "media"
- [signalsai/src/pages/admin/WebsiteDetail.tsx](signalsai/src/pages/admin/WebsiteDetail.tsx):1095-1102 - Added Media tab section

---

## What's Next?

Feature is **complete** and ready for user testing. No known blockers.
