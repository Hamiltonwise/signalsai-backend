# Media Picker for Featured Image & Media URL Fields

**Ticket:** --no-ticket

## Problem Statement

The featured image field in PostsTab and `media_url` custom fields use plain text URL inputs. Users should be able to browse the existing media library or upload a new image (S3), matching the page editor experience.

## Context Summary

- `MediaBrowser` component exists at `PageEditor/MediaBrowser.tsx` — takes `projectId`, `onSelect(media)`, `onClose()`
- Media upload endpoint: `POST /api/admin/websites/{projectId}/media` (multipart, `files` field)
- Returns `{ success, data: [{ s3_url, ... }] }`
- PostsTab already has `projectId` prop
- Featured image is stored as a URL string (`formFeaturedImage`)
- Custom fields of type `media_url` are stored as string values in `formCustomFields`

## Existing Patterns to Follow

- `ChatPanel.tsx`: toggle state + inline `<MediaBrowser>` render
- Upload: `FormData` with `files` field, `fetch` with `credentials: "include"`

## Proposed Approach

### 1. Import MediaBrowser + icons

Add `MediaBrowser` import and `ImageIcon`, `Upload` from lucide-react.

### 2. Add state

- `showFeaturedMediaBrowser: boolean` — toggles media browser for featured image
- `mediaPickerField: string | null` — slug of the custom field showing media browser (null = hidden)
- `uploading: string | null` — tracks which field is currently uploading ("featured" or field slug)

### 3. Upload handler

`handleMediaUpload(file: File, target: "featured" | string)` — uploads file via POST, sets the resulting `s3_url` on the appropriate form field.

### 4. Featured image UI replacement

Replace the plain text input (lines 304-321) with:
- Image preview + remove button (if URL set)
- Button row: [Browse Library] [Upload]
- Hidden file input triggered by Upload button
- Inline `<MediaBrowser>` when browsing
- Small text input for manual URL paste (collapsed, "or paste URL" toggle)

### 5. Custom field `media_url` type

Replace the plain `<input type="url">` (lines 396-406) with the same picker pattern.

### 6. Reusable inner component

Extract a `MediaPickerField` component within PostsTab to avoid code duplication between featured image and custom field media_url.

## Risk Analysis

- **Level 1**: UI-only change to PostsTab. Uses existing MediaBrowser and upload endpoint. No backend changes.

## Definition of Done

- [x] Featured image opens media browser or allows upload
- [x] `media_url` custom fields open media browser or allow upload
- [x] Upload saves to S3 and sets the URL automatically
- [x] Manual URL paste still works
- [x] Image preview shown when URL is set
- [x] Build passes clean
