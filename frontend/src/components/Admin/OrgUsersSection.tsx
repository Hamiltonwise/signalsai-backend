import { useState } from "react";
import { motion } from "framer-motion";
import {
  Users,
  Key,
  X,
  Loader2,
  Check,
  Copy,
  UserPlus,
  Trash2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "react-hot-toast";
import {
  adminStartPilotSession,
  adminSetUserPassword,
  adminCreateOrgUser,
  adminChangeOrgUserRole,
  adminRemoveOrgUser,
  adminResetOrgUserPassword,
  type AdminOrganizationDetail,
  type AdminUser,
} from "../../api/admin-organizations";

interface OrgUsersSectionProps {
  org: AdminOrganizationDetail;
  orgId: number;
  onRefresh: () => Promise<void>;
}

type ModalState =
  | { type: "none" }
  | { type: "setPassword"; user: AdminUser }
  | { type: "addUser" }
  | { type: "resetPassword"; user: AdminUser }
  | { type: "removeUser"; user: AdminUser };

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "viewer", label: "Viewer" },
];

function roleBadgeClass(role: string): string {
  switch (role) {
    case "admin":
      return "bg-purple-50 text-purple-700 border-purple-200";
    case "manager":
      return "bg-blue-50 text-blue-700 border-blue-200";
    default:
      return "bg-gray-50 text-gray-600 border-gray-200";
  }
}

export function OrgUsersSection({
  org,
  orgId,
  onRefresh,
}: OrgUsersSectionProps) {
  const [modal, setModal] = useState<ModalState>({ type: "none" });
  const [notifyUser, setNotifyUser] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Add User form state
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("viewer");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");

  // Reset Password form state
  const [resetPw, setResetPw] = useState("");

  // Role change loading
  const [roleChangingUserId, setRoleChangingUserId] = useState<number | null>(null);

  const closeModal = () => {
    setModal({ type: "none" });
    setGeneratedPassword(null);
    setNotifyUser(true);
    setCopied(false);
    setNewEmail("");
    setNewPassword("");
    setNewRole("viewer");
    setNewFirstName("");
    setNewLastName("");
    setResetPw("");
  };

  const handleCopyPassword = (pw: string) => {
    navigator.clipboard.writeText(pw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Set Temp Password (existing flow) ────────────────────────
  const handleSetPassword = async () => {
    if (modal.type !== "setPassword") return;
    setIsSubmitting(true);
    try {
      const response = await adminSetUserPassword(modal.user.id, notifyUser);
      if (response.success) {
        setGeneratedPassword(response.temporaryPassword);
        toast.success(response.message);
        await onRefresh();
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      const message = err?.response?.data?.error || err?.message || "Failed to set password";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Add User ─────────────────────────────────────────────────
  const handleAddUser = async () => {
    if (!newEmail.trim()) {
      toast.error("Email is required");
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await adminCreateOrgUser(orgId, {
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
        firstName: newFirstName.trim() || undefined,
        lastName: newLastName.trim() || undefined,
      });
      if (response.success) {
        toast.success(response.message);
        await onRefresh();
        closeModal();
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      const message = err?.response?.data?.error || err?.message || "Failed to add user";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Reset Password ───────────────────────────────────────────
  const handleResetPassword = async () => {
    if (modal.type !== "resetPassword") return;
    if (!resetPw || resetPw.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await adminResetOrgUserPassword(orgId, modal.user.id, resetPw);
      if (response.success) {
        toast.success(`Password reset for ${modal.user.email}`);
        await onRefresh();
        closeModal();
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      const message = err?.response?.data?.error || err?.message || "Failed to reset password";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Change Role ──────────────────────────────────────────────
  const handleChangeRole = async (userId: number, newRoleValue: string) => {
    setRoleChangingUserId(userId);
    try {
      const response = await adminChangeOrgUserRole(orgId, userId, newRoleValue);
      if (response.success) {
        toast.success(`Role updated to ${newRoleValue}`);
        await onRefresh();
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      const message = err?.response?.data?.error || err?.message || "Failed to change role";
      toast.error(message);
    } finally {
      setRoleChangingUserId(null);
    }
  };

  // ── Remove User ──────────────────────────────────────────────
  const handleRemoveUser = async () => {
    if (modal.type !== "removeUser") return;
    setIsSubmitting(true);
    try {
      const response = await adminRemoveOrgUser(orgId, modal.user.id);
      if (response.success) {
        toast.success(`${modal.user.email} removed from organization`);
        await onRefresh();
        closeModal();
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      const message = err?.response?.data?.error || err?.message || "Failed to remove user";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Pilot Session ────────────────────────────────────────────
  const handlePilotSession = async (
    userId: number,
    userName: string,
    userRole: string
  ) => {
    try {
      toast.loading(`Starting pilot session for ${userName}...`);
      const response = await adminStartPilotSession(userId);

      if (response.success) {
        toast.dismiss();
        toast.success("Pilot session started!");

        let pilotUrl = `/?pilot_token=${response.token}`;
        if (response.googleAccountId) {
          pilotUrl += `&organization_id=${response.googleAccountId}`;
        }
        pilotUrl += `&user_role=${userRole}`;

        const width = 1280;
        const height = 800;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;

        window.open(
          pilotUrl,
          "Pilot",
          `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
        );
      }
    } catch (error) {
      toast.dismiss();
      const message =
        error instanceof Error ? error.message : "Unknown error";
      toast.error(`Pilot failed: ${message}`);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-gray-200 bg-white p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-alloro-navy" />
            <h3 className="font-semibold text-gray-900">Users & Roles</h3>
            <span className="text-xs text-gray-400 ml-1">
              {(org.users || []).length} member{(org.users || []).length !== 1 ? "s" : ""}
            </span>
          </div>
          <button
            onClick={() => setModal({ type: "addUser" })}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-alloro-orange hover:bg-alloro-orange/90 rounded-lg transition-colors"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add User
          </button>
        </div>

        {/* User Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="pb-2 pl-3 font-medium text-gray-500 text-xs uppercase tracking-wider">User</th>
                <th className="pb-2 font-medium text-gray-500 text-xs uppercase tracking-wider">Email</th>
                <th className="pb-2 font-medium text-gray-500 text-xs uppercase tracking-wider">Role</th>
                <th className="pb-2 font-medium text-gray-500 text-xs uppercase tracking-wider">Password</th>
                <th className="pb-2 font-medium text-gray-500 text-xs uppercase tracking-wider">Joined</th>
                <th className="pb-2 pr-3 font-medium text-gray-500 text-xs uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(org.users || []).map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                >
                  <td className="py-3 pl-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-alloro-navy/10 text-xs font-semibold text-alloro-navy">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-900">{user.name}</span>
                    </div>
                  </td>
                  <td className="py-3 text-gray-600">{user.email}</td>
                  <td className="py-3">
                    <select
                      value={user.role}
                      onChange={(e) => handleChangeRole(user.id, e.target.value)}
                      disabled={roleChangingUserId === user.id}
                      className={`text-xs font-semibold px-2 py-1 rounded-full border cursor-pointer transition-colors ${roleBadgeClass(user.role)} ${
                        roleChangingUserId === user.id ? "opacity-50" : ""
                      }`}
                    >
                      {ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3">
                    {user.has_password ? (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-bold rounded-full bg-green-50 text-green-600 border border-green-200">
                        <Key className="h-2.5 w-2.5" /> Set
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-bold rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                        <Key className="h-2.5 w-2.5" /> None
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-gray-500 text-xs">
                    {user.joined_at
                      ? new Date(user.joined_at).toLocaleDateString()
                      : "N/A"}
                  </td>
                  <td className="py-3 pr-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => {
                          setModal({ type: "setPassword", user });
                          setGeneratedPassword(null);
                          setNotifyUser(true);
                          setCopied(false);
                        }}
                        className="p-1.5 text-gray-400 hover:text-alloro-orange hover:bg-alloro-orange/10 rounded-lg transition-colors"
                        title="Set temp password"
                      >
                        <Key className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setResetPw("");
                          setModal({ type: "resetPassword", user });
                        }}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Reset password"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() =>
                          handlePilotSession(user.id, user.name, user.role)
                        }
                        className="p-1.5 text-gray-400 hover:text-alloro-orange hover:bg-alloro-orange/10 rounded-lg transition-colors"
                        title="Pilot as this user"
                      >
                        <span className="text-xs font-bold">Pilot</span>
                      </button>
                      <button
                        onClick={() => setModal({ type: "removeUser", user })}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remove from org"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(org.users || []).length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-400 text-sm">
                    No users in this organization
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* ── Modals ──────────────────────────────────────────────── */}

      {modal.type !== "none" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm"
            onClick={() => !isSubmitting && closeModal()}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden"
          >
            <button
              onClick={() => !isSubmitting && closeModal()}
              disabled={isSubmitting}
              className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            >
              <X className="h-5 w-5 text-gray-400" />
            </button>

            <div className="p-6">
              {/* ── Add User Modal ─────────────────────────────── */}
              {modal.type === "addUser" && (
                <>
                  <div className="flex items-center gap-4 mb-5">
                    <div className="p-3 rounded-xl bg-alloro-orange/10 text-alloro-orange">
                      <UserPlus className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Add User</h3>
                      <p className="text-sm text-gray-500">Create and link to {org.name}</p>
                    </div>
                  </div>

                  <div className="space-y-3 mb-5">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">First Name</label>
                        <input
                          type="text"
                          value={newFirstName}
                          onChange={(e) => setNewFirstName(e.target.value)}
                          placeholder="Jay"
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-alloro-orange/30 focus:border-alloro-orange outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Last Name</label>
                        <input
                          type="text"
                          value={newLastName}
                          onChange={(e) => setNewLastName(e.target.value)}
                          placeholder="Smith"
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-alloro-orange/30 focus:border-alloro-orange outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="user@company.com"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-alloro-orange/30 focus:border-alloro-orange outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Password *</label>
                      <input
                        type="text"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimum 6 characters"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-alloro-orange/30 focus:border-alloro-orange outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                      <select
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-alloro-orange/30 focus:border-alloro-orange outline-none"
                      >
                        {ROLE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                    <button
                      onClick={closeModal}
                      disabled={isSubmitting}
                      className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddUser}
                      disabled={isSubmitting}
                      className="px-4 py-2 text-sm font-medium text-white bg-alloro-orange hover:bg-alloro-orange/90 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                      Add User
                    </button>
                  </div>
                </>
              )}

              {/* ── Set Temp Password Modal ────────────────────── */}
              {modal.type === "setPassword" && (
                <>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 rounded-xl bg-alloro-orange/10 text-alloro-orange">
                      <Key className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        Set Temporary Password
                      </h3>
                      <p className="text-sm text-gray-500">
                        {modal.user.email}
                      </p>
                    </div>
                  </div>

                  {!generatedPassword ? (
                    <>
                      <div className="space-y-4 mb-6">
                        <p className="text-sm text-gray-600">
                          This will generate a temporary password for{" "}
                          <strong>{modal.user.name}</strong>.
                          {modal.user.has_password
                            ? " Their existing password will be replaced."
                            : " They currently have no password set (Google-only account)."}
                        </p>

                        <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-alloro-orange/30 transition-colors cursor-pointer">
                          <input
                            type="checkbox"
                            checked={notifyUser}
                            onChange={(e) => setNotifyUser(e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-alloro-orange focus:ring-alloro-orange"
                          />
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              Notify user via email
                            </p>
                            <p className="text-xs text-gray-500">
                              Send an email with the temporary password and a link
                              to change it
                            </p>
                          </div>
                        </label>
                      </div>

                      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                        <button
                          onClick={closeModal}
                          disabled={isSubmitting}
                          className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSetPassword}
                          disabled={isSubmitting}
                          className="px-4 py-2 text-sm font-medium text-white bg-alloro-orange hover:bg-alloro-orange/90 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                          {isSubmitting && (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          )}
                          Set Temporary Password
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-4 mb-6">
                        <p className="text-sm text-gray-600">
                          Temporary password has been set
                          {notifyUser ? " and emailed to the user" : ""}.
                        </p>

                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                          <p className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-2">
                            Temporary Password
                          </p>
                          <div className="flex items-center gap-3">
                            <code className="text-lg font-mono font-bold text-gray-900 tracking-wider flex-1">
                              {generatedPassword}
                            </code>
                            <button
                              onClick={() => handleCopyPassword(generatedPassword)}
                              className="p-2 text-gray-400 hover:text-alloro-orange hover:bg-alloro-orange/10 rounded-lg transition-colors"
                              title="Copy to clipboard"
                            >
                              {copied ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </div>

                        {!notifyUser && (
                          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                            The user was not notified. Make sure to communicate the
                            password through another channel.
                          </p>
                        )}
                      </div>

                      <div className="flex justify-end pt-4 border-t border-gray-200">
                        <button
                          onClick={closeModal}
                          className="px-4 py-2 text-sm font-medium text-white bg-alloro-navy hover:bg-alloro-navy/90 rounded-lg transition-colors"
                        >
                          Done
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ── Reset Password Modal ───────────────────────── */}
              {modal.type === "resetPassword" && (
                <>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 rounded-xl bg-blue-100 text-blue-600">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        Reset Password
                      </h3>
                      <p className="text-sm text-gray-500">
                        {modal.user.email}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4 mb-6">
                    <p className="text-sm text-gray-600">
                      Enter a new password for <strong>{modal.user.name}</strong>.
                    </p>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">New Password</label>
                      <input
                        type="text"
                        value={resetPw}
                        onChange={(e) => setResetPw(e.target.value)}
                        placeholder="Minimum 6 characters"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                    <button
                      onClick={closeModal}
                      disabled={isSubmitting}
                      className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleResetPassword}
                      disabled={isSubmitting || resetPw.length < 6}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                      Reset Password
                    </button>
                  </div>
                </>
              )}

              {/* ── Remove User Modal ──────────────────────────── */}
              {modal.type === "removeUser" && (
                <>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 rounded-xl bg-red-100 text-red-600">
                      <Trash2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        Remove User
                      </h3>
                      <p className="text-sm text-gray-500">
                        {modal.user.email}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4 mb-6">
                    <p className="text-sm text-gray-600">
                      Are you sure you want to remove <strong>{modal.user.name}</strong> from{" "}
                      <strong>{org.name}</strong>?
                    </p>
                    <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-3">
                      This removes their access to this organization. Their user account will not be deleted.
                    </p>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                    <button
                      onClick={closeModal}
                      disabled={isSubmitting}
                      className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleRemoveUser}
                      disabled={isSubmitting}
                      className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                      Remove User
                    </button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}
