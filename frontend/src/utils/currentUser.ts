/**
 * currentUser — shared helper to decode the signed-in user id from the JWT
 * payload without pulling in a full jwt lib. Returns null if the token is
 * missing or malformed — callers should treat that the same as "not the
 * author/uploader" (UI hides edit/delete controls; the server still
 * enforces the real authorization check).
 *
 * Lives in utils/ so any PM feature (attachments, comments, future
 * surfaces) can import a single source of truth for "who is the caller?"
 * client-side.
 */
export function getCurrentUserId(): number | null {
  try {
    const isPilot =
      typeof window !== "undefined" &&
      (window.sessionStorage?.getItem("pilot_mode") === "true" ||
        !!window.sessionStorage?.getItem("token"));
    const token = isPilot
      ? window.sessionStorage.getItem("token")
      : localStorage.getItem("auth_token") || localStorage.getItem("token");
    if (!token) return null;
    const payload = token.split(".")[1];
    if (!payload) return null;
    const decoded = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    );
    const id = decoded?.userId ?? decoded?.id;
    return typeof id === "number" ? id : null;
  } catch {
    return null;
  }
}
