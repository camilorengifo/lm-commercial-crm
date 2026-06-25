"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { AdminAccessDenied, AdminSubNav } from "@/components/admin-shared";
import {
  deleteAdminUser,
  fetchAdminUsers,
  inviteAdminUser,
  updateAdminUser,
} from "@/lib/adminClient";
import type { AdminUserListItem } from "@/lib/adminUserManagement";
import { formatDate, formatDateTime } from "@/lib/crmFormat";
import {
  USER_ROLES,
  fetchUserProfile,
  isAdminProfile,
  type UserProfile,
  type UserRole,
} from "@/lib/userProfile";
import { supabase } from "@/lib/supabaseClient";

const EMPTY_INVITE_FORM = {
  fullName: "",
  email: "",
  role: "broker" as UserRole,
};

export function AdminUsersPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [inviteForm, setInviteForm] = useState(EMPTY_INVITE_FORM);
  const [inviting, setInviting] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [deleteFeedback, setDeleteFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const loadUsers = useCallback(async () => {
    setFetchError(null);
    const { data, error } = await fetchAdminUsers();

    if (error || !data) {
      setFetchError(error ?? "Unable to load users.");
      return false;
    }

    setUsers(data.users);
    return true;
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }

      setUser(session.user);

      const { data: userProfile } = await fetchUserProfile(session.user.id);
      if (!isAdminProfile(userProfile)) {
        setAccessDenied(true);
        setLoading(false);
        return;
      }

      setProfile(userProfile);
      await loadUsers();
      setLoading(false);
    });
  }, [router, loadUsers]);

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviting(true);
    setInviteError(null);
    setInviteMessage(null);

    const { data, error } = await inviteAdminUser({
      email: inviteForm.email.trim(),
      fullName: inviteForm.fullName.trim(),
      role: inviteForm.role,
    });

    if (error || !data) {
      setInviteError(error ?? "Unable to invite user.");
      setInviting(false);
      return;
    }

    setInviteMessage(data.message);
    setInviteForm(EMPTY_INVITE_FORM);
    await loadUsers();
    setInviting(false);
  }

  async function handleRoleChange(targetUserId: string, role: UserRole) {
    setUpdatingUserId(targetUserId);
    setFetchError(null);

    const { error } = await updateAdminUser({ userId: targetUserId, role });

    if (error) {
      setFetchError(error);
      setUpdatingUserId(null);
      return;
    }

    await loadUsers();
    setUpdatingUserId(null);
  }

  async function handleActiveChange(targetUserId: string, isActive: boolean) {
    setUpdatingUserId(targetUserId);
    setFetchError(null);

    const { error } = await updateAdminUser({
      userId: targetUserId,
      isActive,
    });

    if (error) {
      setFetchError(error);
      setUpdatingUserId(null);
      return;
    }

    await loadUsers();
    setUpdatingUserId(null);
  }

  async function handleDelete(targetUserId: string) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this user? This cannot be undone.",
    );

    if (!confirmed) {
      return;
    }

    setDeletingUserId(targetUserId);
    setDeleteFeedback(null);
    setFetchError(null);

    const { data, error } = await deleteAdminUser(targetUserId);

    if (error || !data) {
      setDeleteFeedback({
        type: "error",
        message: error ?? "Unable to delete user.",
      });
      setDeletingUserId(null);
      return;
    }

    setDeleteFeedback({
      type: "success",
      message: data.message,
    });
    await loadUsers();
    setDeletingUserId(null);
  }

  if (loading) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50">
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (accessDenied) {
    return <AdminAccessDenied />;
  }

  if (!user || !profile) {
    return null;
  }

  return (
    <AuthenticatedLayout maxWidthClass="max-w-[1400px]">
      <AdminSubNav />
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Users / Brokers
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Invite broker users and manage CRM access.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin"
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Back to Admin
          </Link>
        </div>
      </div>

      {fetchError && (
        <p className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {fetchError}
        </p>
      )}

      <section className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-zinc-900">Invite user</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Send a Supabase invitation email to a new broker or admin user.
        </p>

        <form onSubmit={handleInvite} className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="invite-full-name"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Full name
            </label>
            <input
              id="invite-full-name"
              type="text"
              required
              value={inviteForm.fullName}
              onChange={(event) =>
                setInviteForm((prev) => ({
                  ...prev,
                  fullName: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
          </div>

          <div>
            <label
              htmlFor="invite-email"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              required
              value={inviteForm.email}
              onChange={(event) =>
                setInviteForm((prev) => ({
                  ...prev,
                  email: event.target.value,
                }))
              }
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            />
          </div>

          <div>
            <label
              htmlFor="invite-role"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              Role
            </label>
            <select
              id="invite-role"
              value={inviteForm.role}
              onChange={(event) =>
                setInviteForm((prev) => ({
                  ...prev,
                  role: event.target.value as UserRole,
                }))
              }
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
            >
              {USER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={inviting}
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {inviting ? "Inviting..." : "Invite User"}
            </button>
          </div>
        </form>

        {inviteError && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {inviteError}
          </p>
        )}

        {inviteMessage && (
          <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {inviteMessage}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-zinc-900">All users</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Manage roles, active access, and remove test users with no CRM records.
        </p>

        {deleteFeedback && (
          <p
            className={`mt-4 rounded-lg px-3 py-2 text-sm ${
              deleteFeedback.type === "success"
                ? "bg-emerald-50 text-emerald-800"
                : "bg-red-50 text-red-700"
            }`}
          >
            {deleteFeedback.message}
          </p>
        )}

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200">
            <thead className="bg-zinc-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                  User
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Role
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Active
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Created
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Last sign-in
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Companies
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Due today
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Open opps
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white">
              {users.map((row) => {
                const isSelf = row.id === user.id;
                const isUpdating = updatingUserId === row.id;
                const isDeleting = deletingUserId === row.id;

                return (
                  <tr key={row.id}>
                    <td className="px-3 py-3 text-sm text-zinc-900">
                      <div className="font-medium">
                        {row.fullName || "—"}
                        {isSelf ? " (you)" : ""}
                      </div>
                      <div className="text-zinc-600">{row.email}</div>
                    </td>
                    <td className="px-3 py-3 text-sm">
                      <select
                        value={row.role}
                        disabled={isUpdating || (isSelf && row.role === "admin")}
                        onChange={(event) =>
                          handleRoleChange(
                            row.id,
                            event.target.value as UserRole,
                          )
                        }
                        className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {USER_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3 text-sm">
                      <select
                        value={row.isActive ? "active" : "inactive"}
                        disabled={isUpdating || isSelf}
                        onChange={(event) =>
                          handleActiveChange(
                            row.id,
                            event.target.value === "active",
                          )
                        }
                        className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </td>
                    <td className="px-3 py-3 text-sm text-zinc-700">
                      {formatDate(row.createdAt)}
                    </td>
                    <td className="px-3 py-3 text-sm text-zinc-700">
                      {formatDateTime(row.lastSignInAt)}
                    </td>
                    <td className="px-3 py-3 text-sm text-zinc-700">
                      {row.companyCount}
                    </td>
                    <td className="px-3 py-3 text-sm text-zinc-700">
                      {row.followUpsDueToday}
                    </td>
                    <td className="px-3 py-3 text-sm text-zinc-700">
                      {row.openOpportunities}
                    </td>
                    <td className="px-3 py-3 text-sm">
                      <button
                        type="button"
                        disabled={isSelf || isUpdating || isDeleting}
                        onClick={() => handleDelete(row.id)}
                        className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isDeleting ? "Deleting..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </AuthenticatedLayout>
  );
}
