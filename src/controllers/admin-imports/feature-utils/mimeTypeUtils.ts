/** Determine the import "type" category from a MIME type */
export function categorizeType(mimeType: string): string {
  if (mimeType === "text/css") return "css";
  if (
    mimeType === "application/javascript" ||
    mimeType === "text/javascript" ||
    mimeType === "application/x-javascript"
  )
    return "javascript";
  if (mimeType.startsWith("image/")) return "image";
  if (
    mimeType.startsWith("font/") ||
    mimeType === "application/font-woff" ||
    mimeType === "application/font-woff2" ||
    mimeType === "application/vnd.ms-fontobject"
  )
    return "font";
  return "file";
}

/** Check if the file type is text-editable */
export function isTextType(type: string): boolean {
  return type === "css" || type === "javascript";
}
