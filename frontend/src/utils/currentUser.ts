/**
 * currentUser — shared helper to decode the signed-in user id from the JWT
 * payload without pulling in a full jwt lib. Returns null if the token is
 * missing or malformed — callers should treat that the same as "not the
 * author/uploader" (UI hides edit/delete controls; the server still
 * enforces the real authorization check).
 *
 * Uses getPriorityItem("auth_token") so pilot-mode (sessionStorage) and
 * normal-mode (localStorage) sessions both resolve to the current user.
 */
import { getPriorityItem } from "../hooks/useLocalStorage";

export function getCurrentUserId(): number | null {
  try {
    const token =
      getPriorityItem("auth_token") || getPriorityItem("token");
    if (!token) return null;
    const payload = token.split(".")[1];
    if (!payload) return null;
    const decoded = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    );
    const id = decoded?.userId ?? decoded?.id ?? decoded?.user_id;
    return typeof id === "number" ? id : null;
  } catch {
    return null;
  }
}
