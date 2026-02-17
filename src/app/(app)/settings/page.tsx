"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updateEmail,
  updatePassword,
  updateProfile,
} from "firebase/auth";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/AuthProvider";
import { logAction } from "@/lib/logs";
import TablePagination from "@/components/TablePagination";

type TransactionRow = {
  id: string;
  productId?: string;
  type: string;
  product: string;
  partyName: string;
  category: string;
  sku: string;
  unit: string;
  qtyIn: number;
  qtyOut: number;
  date: string;
  ref: string;
  balance?: number;
};

type LogRow = {
  id: string;
  date: string;
  time: string;
  action: string;
  userName: string;
};

type EmployeeRow = {
  id: string;
  name: string;
  email: string;
  userType: "admin" | "employee";
};

type PendingRow = {
  id: string;
  fullName: string;
  email: string;
  date: string;
};

type TransactionTypeFilter = "all" | "incoming" | "outgoing";

export default function SettingsPage() {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const pageSize = 10;
  const [txnDateFilter, setTxnDateFilter] = useState({
    from: today,
    to: today,
  });
  const [txnTypeFilter, setTxnTypeFilter] =
    useState<TransactionTypeFilter>("all");
  const [logsDateFilter, setLogsDateFilter] = useState({
    from: today,
    to: today,
  });
  const [transactionRows, setTransactionRows] = useState<TransactionRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [expandedTransactions, setExpandedTransactions] = useState<
    Record<string, boolean>
  >({});
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profileUserType, setProfileUserType] = useState<"admin" | "employee">(
    "employee",
  );
  const [savedUserType, setSavedUserType] = useState<"admin" | "employee">(
    "employee",
  );
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [activeUserTab, setActiveUserTab] = useState<"employees" | "pending">(
    "employees",
  );
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [pendingUsers, setPendingUsers] = useState<PendingRow[]>([]);
  const [actionError, setActionError] = useState("");
  const [transactionError, setTransactionError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [txnPage, setTxnPage] = useState(1);
  const [txnShowAll, setTxnShowAll] = useState(false);
  const [logPage, setLogPage] = useState(1);
  const [logShowAll, setLogShowAll] = useState(false);
  const [employeePage, setEmployeePage] = useState(1);
  const [employeeShowAll, setEmployeeShowAll] = useState(false);
  const [pendingPage, setPendingPage] = useState(1);
  const [pendingShowAll, setPendingShowAll] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<EmployeeRow | null>(null);

  useEffect(() => {
    setTxnDateFilter({ from: today, to: today });
    setLogsDateFilter({ from: today, to: today });
  }, [today]);

  useEffect(() => {
    setProfileName(user?.displayName ?? "");
    setProfileEmail(user?.email ?? "");
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const loadProfile = async () => {
      const userRef = doc(db, "users", user.uid);
      const snapshot = await getDoc(userRef);
      const data = snapshot.exists()
        ? (snapshot.data() as { userType?: "admin" | "employee" })
        : null;
      const nextType = data?.userType ?? "employee";
      setProfileUserType(nextType);
      setSavedUserType(nextType);
    };
    loadProfile();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const transactionsRef = collection(db, "transactions");
    const transactionsQuery = query(transactionsRef, orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(transactionsQuery, (snapshot) => {
      const rows: TransactionRow[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as {
          productId?: string;
          productName?: string;
          partyName?: string;
          category?: string;
          sku?: string;
          unit?: string;
          type?: string;
          qtyIn?: number;
          qtyOut?: number;
          date?: string;
          reference?: string;
          balanceAfter?: number | null;
          createdAt?: { toDate: () => Date };
        };
        const createdAt = data.createdAt?.toDate?.();
        const reference = data.reference ?? "";
        const type = data.type ?? "";
        const legacyIncomingName =
          (type === "Incoming (Restock)" || type === "Incoming (Return)") &&
          reference.includes(" - ")
            ? reference.split(" - ").slice(1).join(" - ").trim()
            : "";
        return {
          id: docSnap.id,
          productId: data.productId ?? "",
          type,
          product: data.productName ?? "",
          partyName: data.partyName?.trim() || legacyIncomingName,
          category: data.category ?? "",
          sku: data.sku ?? "",
          unit: data.unit ?? "",
          qtyIn: data.qtyIn ?? 0,
          qtyOut: data.qtyOut ?? 0,
          date: data.date ?? (createdAt ? createdAt.toISOString().slice(0, 10) : ""),
          ref: reference,
          balance:
            typeof data.balanceAfter === "number" ? data.balanceAfter : undefined,
        };
      });
      setTransactionRows(rows);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const logsRef = collection(db, "userLogs");
    const logsQuery = query(logsRef, orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(logsQuery, (snapshot) => {
      const rows: LogRow[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as {
          action?: string;
          userName?: string;
          userEmail?: string;
          createdAt?: { toDate: () => Date };
        };
        const createdAt = data.createdAt?.toDate?.();
        const date = createdAt
          ? createdAt.toISOString().slice(0, 10)
          : "";
        const time = createdAt
          ? createdAt.toLocaleTimeString("en-PH", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "";
        return {
          id: docSnap.id,
          date,
          time,
          action: data.action ?? "",
          userName: data.userName?.trim() || data.userEmail || "",
        };
      });
      setLogs(rows);
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user || profileUserType !== "admin") return;
    const usersRef = collection(db, "users");
    const usersQuery = query(usersRef, orderBy("email"));
    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
      const rows: EmployeeRow[] = snapshot.docs
        .map((docSnap) => {
          const data = docSnap.data() as {
            displayName?: string;
            email?: string;
            userType?: "admin" | "employee";
          };
          return {
            id: docSnap.id,
            name: data.displayName ?? "",
            email: data.email ?? "",
            userType: data.userType ?? "employee",
          };
        })
        .filter((row) => row.userType === "employee");
      setEmployees(rows);
    });

    const pendingRef = collection(db, "registrationRequests");
    const pendingQuery = query(pendingRef, where("status", "==", "pending"));
    const unsubscribePending = onSnapshot(pendingQuery, (snapshot) => {
      const rows: PendingRow[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as {
          fullName?: string;
          email?: string;
          createdAt?: { toDate: () => Date };
        };
        const createdAt = data.createdAt?.toDate?.();
        return {
          id: docSnap.id,
          fullName: data.fullName ?? "",
          email: data.email ?? "",
          date: createdAt ? createdAt.toISOString().slice(0, 10) : "",
        };
      });
      setPendingUsers(rows);
    });

    return () => {
      unsubscribeUsers();
      unsubscribePending();
    };
  }, [user, profileUserType]);

  const filteredTransactions = useMemo(() => {
    const from = txnDateFilter.from;
    const to = txnDateFilter.to;
    const rows = transactionRows.filter((row) => {
      if (from && row.date < from) return false;
      if (to && row.date > to) return false;
      if (txnTypeFilter === "incoming" && row.qtyIn <= 0) return false;
      if (txnTypeFilter === "outgoing" && row.qtyOut <= 0) return false;
      return true;
    });
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [transactionRows, txnDateFilter.from, txnDateFilter.to, txnTypeFilter]);

  const filteredLogs = useMemo(
    () => {
      const from = logsDateFilter.from;
      const to = logsDateFilter.to;
      return logs.filter((row) => {
        if (from && row.date < from) return false;
        if (to && row.date > to) return false;
        return true;
      });
    },
    [logsDateFilter, logs],
  );

  const pagedTransactions = useMemo(() => {
    if (txnShowAll) return filteredTransactions;
    const start = (txnPage - 1) * pageSize;
    return filteredTransactions.slice(start, start + pageSize);
  }, [filteredTransactions, txnPage, txnShowAll, pageSize]);

  const pagedLogs = useMemo(() => {
    if (logShowAll) return filteredLogs;
    const start = (logPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, logPage, logShowAll, pageSize]);

  const pagedEmployees = useMemo(() => {
    if (employeeShowAll) return employees;
    const start = (employeePage - 1) * pageSize;
    return employees.slice(start, start + pageSize);
  }, [employees, employeePage, employeeShowAll, pageSize]);

  const pagedPending = useMemo(() => {
    if (pendingShowAll) return pendingUsers;
    const start = (pendingPage - 1) * pageSize;
    return pendingUsers.slice(start, start + pageSize);
  }, [pendingUsers, pendingPage, pendingShowAll, pageSize]);

  useEffect(() => setTxnPage(1), [filteredTransactions.length]);
  useEffect(() => setLogPage(1), [filteredLogs.length]);
  useEffect(() => setEmployeePage(1), [employees.length]);
  useEffect(() => setPendingPage(1), [pendingUsers.length]);

  const userLabel =
    user?.displayName?.trim() ||
    user?.email ||
    "Current User";

  const callAdmin = async (path: string, payload: Record<string, unknown>) => {
    if (!user) {
      throw new Error("Not authenticated.");
    }
    const token = await user.getIdToken();
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      let message = "Request failed.";
      const raw = await response.text();
      if (raw) {
        try {
          const data = JSON.parse(raw) as { error?: string };
          message = data.error || message;
        } catch {
          message = raw;
        }
      }
      throw new Error(message);
    }
  };

  const handleProfileCancel = () => {
    setProfileEditing(false);
    setProfileName(user?.displayName ?? "");
    setProfileEmail(user?.email ?? "");
    setProfileUserType(savedUserType);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setProfileError("");
    setProfileMessage("");
  };

  const handleProfileSave = async () => {
    if (!user) return;
    setProfileError("");
    setProfileMessage("");

    if (!profileEditing) return;

    if (savedUserType !== "admin" && profileUserType !== savedUserType) {
      setProfileError("Only admins can change the user type.");
      return;
    }

    if (newPassword || confirmNewPassword) {
      if (!currentPassword) {
        setProfileError("Current password is required to change password.");
        return;
      }
      if (newPassword !== confirmNewPassword) {
        setProfileError("New passwords do not match.");
        return;
      }
    }

    try {
      if (savedUserType === "admin" && profileUserType === "employee") {
        const adminsSnapshot = await getDocs(
          query(collection(db, "users"), where("userType", "==", "admin")),
        );
        const adminCount = adminsSnapshot.size;
        if (adminCount <= 1) {
          setProfileError("At least one admin account must remain.");
          return;
        }
      }

      if ((profileEmail && profileEmail !== user.email) || newPassword) {
        if (!currentPassword) {
          setProfileError("Current password is required to update credentials.");
          return;
        }
        const credential = EmailAuthProvider.credential(
          user.email ?? "",
          currentPassword,
        );
        await reauthenticateWithCredential(user, credential);
      }

      if (profileName !== (user.displayName ?? "")) {
        await updateProfile(user, { displayName: profileName });
      }

      if (profileEmail && profileEmail !== user.email) {
        await updateEmail(user, profileEmail);
      }

      if (newPassword) {
        await updatePassword(user, newPassword);
      }

      await setDoc(
        doc(db, "users", user.uid),
        { userType: profileUserType },
        { merge: true },
      );
      setSavedUserType(profileUserType);

      setProfileEditing(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setProfileMessage("Profile updated.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update profile.";
      setProfileError(message);
    }
  };

  const handleApprove = (pending: PendingRow) => {
    setConfirmModal({
      title: "Approve Registration",
      message: `Approve ${pending.fullName || pending.email}? This will create the user account.`,
      confirmLabel: "Approve",
      onConfirm: async () => {
        setActionLoading(true);
        setActionError("");
        try {
          await callAdmin("/api/admin/approve-registration", {
            requestId: pending.id,
          });
          await logAction(user, {
            action: "Approved registration",
            entity: "registration",
            entityId: pending.id,
            entityName: pending.fullName || pending.email,
          });
        } catch (error) {
          setActionError(
            error instanceof Error ? error.message : "Approval failed.",
          );
        } finally {
          setActionLoading(false);
          setConfirmModal(null);
        }
      },
    });
  };

  const handleExportTransactionsPdf = () => {
    if (filteredTransactions.length === 0) {
      setTransactionError("No transactions to export for this date range.");
      return;
    }
    setTransactionError("");
    const docPdf = new jsPDF({ orientation: "landscape" });
    const now = new Date();
    const header = `Transaction History - ${txnDateFilter.from || "All"} to ${
      txnDateFilter.to || "All"
    }`;
    docPdf.setFontSize(14);
    docPdf.text(header, 14, 18);
    docPdf.setFontSize(10);
    docPdf.text(
      `Generated: ${now.toLocaleDateString("en-PH")} ${now.toLocaleTimeString("en-PH")}`,
      14,
      26,
    );

    const rows = filteredTransactions.map((row) => [
      row.date,
      row.type,
      row.product,
      row.category,
      row.sku,
      row.unit,
      row.qtyIn ? String(row.qtyIn) : "",
      row.qtyOut ? String(row.qtyOut) : "",
      row.balance !== undefined ? String(row.balance) : "",
      row.partyName || "-",
      row.ref,
    ]);

    autoTable(docPdf, {
      startY: 34,
      head: [[
        "Date",
        "Type",
        "Product",
        "Category",
        "SKU",
        "UoM",
        "In",
        "Out",
        "Balance",
        "Receiver/Handled By",
        "Reference",
      ]],
      body: rows,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 23, 42] },
    });

    const blob = docPdf.output("blob");
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleReject = (pending: PendingRow) => {
    setConfirmModal({
      title: "Reject Registration",
      message: `Reject ${pending.fullName || pending.email}? This cannot be undone.`,
      confirmLabel: "Reject",
      onConfirm: async () => {
        setActionLoading(true);
        setActionError("");
        try {
          await callAdmin("/api/admin/reject-registration", {
            requestId: pending.id,
          });
          await logAction(user, {
            action: "Rejected registration",
            entity: "registration",
            entityId: pending.id,
            entityName: pending.fullName || pending.email,
          });
        } catch (error) {
          setActionError(
            error instanceof Error ? error.message : "Rejection failed.",
          );
        } finally {
          setActionLoading(false);
          setConfirmModal(null);
        }
      },
    });
  };

  const handleDeleteEmployee = (employee: EmployeeRow) => {
    setConfirmModal({
      title: "Delete Employee",
      message: `Delete ${employee.name || employee.email}? This cannot be undone.`,
      confirmLabel: "Delete",
      onConfirm: async () => {
        setActionLoading(true);
        setActionError("");
        try {
          await callAdmin("/api/admin/delete-user", { uid: employee.id });
          await logAction(user, {
            action: "Deleted employee",
            entity: "user",
            entityId: employee.id,
            entityName: employee.name || employee.email,
          });
        } catch (error) {
          setActionError(
            error instanceof Error ? error.message : "Delete failed.",
          );
        } finally {
          setActionLoading(false);
          setConfirmModal(null);
        }
      },
    });
  };

  const handleResetPassword = (employee: EmployeeRow) => {
    setResetTarget(employee);
    setResetModalOpen(true);
  };

  const submitResetPassword = async () => {
    if (!resetTarget) return;
    setActionLoading(true);
    setActionError("");
    try {
      await callAdmin("/api/admin/reset-password", {
        uid: resetTarget.id,
      });
      await logAction(user, {
        action: "Reset password",
        entity: "user",
        entityId: resetTarget.id,
        entityName: resetTarget.name || resetTarget.email,
      });
      setResetModalOpen(false);
      setResetTarget(null);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Reset failed.",
      );
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <section className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
          Settings
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
      </div>

      <div className="grid gap-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
        <div className="md:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            Profile Settings
          </h2>
        </div>
        <label className="text-sm font-medium text-slate-700">
          Fullname
          <input
            type="text"
            value={profileName}
            onChange={(event) => setProfileName(event.target.value)}
            placeholder="Enter full name"
            disabled={!profileEditing}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Email Address
          <input
            type="email"
            value={profileEmail}
            onChange={(event) => setProfileEmail(event.target.value)}
            placeholder="Enter email address"
            disabled={!profileEditing}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          User Type
          <select
            value={profileUserType}
            onChange={(event) =>
              setProfileUserType(event.target.value as "admin" | "employee")
            }
            disabled={!profileEditing || savedUserType !== "admin"}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-50"
          >
            <option value="admin">Admin</option>
            <option value="employee">Employee</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Current Password
          <input
            type={showPasswords ? "text" : "password"}
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            placeholder="Enter current password"
            disabled={!profileEditing}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          New Password
          <input
            type={showPasswords ? "text" : "password"}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="Enter new password"
            disabled={!profileEditing}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Confirm New Password
          <input
            type={showPasswords ? "text" : "password"}
            value={confirmNewPassword}
            onChange={(event) => setConfirmNewPassword(event.target.value)}
            placeholder="Confirm new password"
            disabled={!profileEditing}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
          />
        </label>
        <div className="md:col-span-2 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showPasswords}
              onChange={(event) => setShowPasswords(event.target.checked)}
              disabled={!profileEditing}
              className="h-4 w-4 rounded border-slate-300 text-slate-900"
            />
            Show passwords
          </label>
          <button
            type="button"
            onClick={() =>
              profileEditing ? handleProfileCancel() : setProfileEditing(true)
            }
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            {profileEditing ? "Cancel" : "Update"}
          </button>
          <button
            type="button"
            onClick={handleProfileSave}
            disabled={!profileEditing}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            Save
          </button>
          {profileMessage && (
            <p className="text-sm font-medium text-emerald-600">
              {profileMessage}
            </p>
          )}
          {profileError && (
            <p className="text-sm font-medium text-rose-600">{profileError}</p>
          )}
        </div>
      </div>

      {profileUserType === "admin" && (
        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              Users
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveUserTab("employees")}
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                  activeUserTab === "employees"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                Employees
              </button>
              <button
                type="button"
                onClick={() => setActiveUserTab("pending")}
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                  activeUserTab === "pending"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                Pending
              </button>
            </div>
          </div>

          {actionError && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {actionError}
            </p>
          )}

          {activeUserTab === "employees" && (
            <div className="w-full space-y-3">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="hidden px-4 py-3 md:table-cell">Email</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {employees.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-6 text-center text-sm text-slate-500"
                      >
                        No employee accounts.
                      </td>
                    </tr>
                  )}
                  {pagedEmployees.map((employee) => (
                    <tr key={employee.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-700">
                        {employee.name || employee.email}
                      </td>
                      <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                        {employee.email}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleResetPassword(employee)}
                            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:border-slate-300 hover:text-slate-900"
                            title="Reset password"
                            disabled={actionLoading}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                              fill="none"
                            >
                              <path
                                d="M4 12a8 8 0 1 0 3-6.3"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <path
                                d="M4 4v4h4"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEmployee(employee)}
                            className="rounded-lg border border-rose-200 p-2 text-rose-600 hover:border-rose-300"
                            title="Delete employee"
                            disabled={actionLoading}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                              fill="none"
                            >
                              <path
                                d="M5 7h14"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                              />
                              <path
                                d="M9 7V5h6v2"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                              />
                              <path
                                d="M7 7l1 12h8l1-12"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePagination
                total={employees.length}
                page={employeePage}
                pageSize={pageSize}
                showAll={employeeShowAll}
                onPageChange={setEmployeePage}
                onToggleShowAll={() => setEmployeeShowAll((prev) => !prev)}
              />
            </div>
          )}

          {activeUserTab === "pending" && (
            <div className="w-full space-y-3">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="hidden px-4 py-3 md:table-cell">Email</th>
                    <th className="hidden px-4 py-3 md:table-cell">Date</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pendingUsers.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-6 text-center text-sm text-slate-500"
                      >
                        No pending registrations.
                      </td>
                    </tr>
                  )}
                  {pagedPending.map((pending) => (
                    <tr key={pending.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-700">
                        {pending.fullName || pending.email}
                      </td>
                      <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                        {pending.email}
                      </td>
                      <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                        {pending.date}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleApprove(pending)}
                            className="rounded-lg border border-emerald-200 p-2 text-emerald-600 hover:border-emerald-300"
                            title="Approve registration"
                            disabled={actionLoading}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                              fill="none"
                            >
                              <path
                                d="m6 12 4 4 8-8"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReject(pending)}
                            className="rounded-lg border border-rose-200 p-2 text-rose-600 hover:border-rose-300"
                            title="Reject registration"
                            disabled={actionLoading}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                              fill="none"
                            >
                              <path
                                d="M6 6l12 12M18 6l-12 12"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                              />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TablePagination
                total={pendingUsers.length}
                page={pendingPage}
                pageSize={pageSize}
                showAll={pendingShowAll}
                onPageChange={setPendingPage}
                onToggleShowAll={() => setPendingShowAll((prev) => !prev)}
              />
            </div>
          )}
        </div>
      )}

      {profileUserType === "admin" && (
        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              Transaction History
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span>From</span>
              <input
                type="date"
                value={txnDateFilter.from}
                onChange={(event) =>
                  setTxnDateFilter((prev) => ({
                    ...prev,
                    from: event.target.value,
                  }))
                }
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <span>To</span>
              <input
                type="date"
                value={txnDateFilter.to}
                onChange={(event) =>
                  setTxnDateFilter((prev) => ({
                    ...prev,
                    to: event.target.value,
                  }))
                }
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <span>Type</span>
              <select
                value={txnTypeFilter}
                onChange={(event) =>
                  setTxnTypeFilter(event.target.value as TransactionTypeFilter)
                }
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="all">All</option>
                <option value="incoming">Incoming</option>
                <option value="outgoing">Outgoing</option>
              </select>
              <button
                type="button"
                onClick={handleExportTransactionsPdf}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-400"
              >
                Export PDF
              </button>
            </div>
          </div>
          {transactionError && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {transactionError}
            </p>
          )}
          <div className="w-full">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="hidden px-4 py-3 md:table-cell">Category</th>
                  <th className="hidden px-4 py-3 md:table-cell">SKU</th>
                  <th className="hidden px-4 py-3 md:table-cell">UoM</th>
                  <th className="hidden px-4 py-3 md:table-cell">In</th>
                  <th className="hidden px-4 py-3 md:table-cell">Out</th>
                  <th className="hidden px-4 py-3 md:table-cell">Balance</th>
                  <th className="hidden px-4 py-3 md:table-cell">
                    Receiver/Handled By
                  </th>
                  <th className="hidden px-4 py-3 md:table-cell">Reference</th>
                  <th className="px-4 py-3 text-right md:hidden">More</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransactions.length === 0 && (
                  <tr>
                    <td
                      colSpan={12}
                      className="px-4 py-6 text-center text-sm text-slate-500"
                    >
                      No transactions for this date range.
                    </td>
                  </tr>
                )}
                {pagedTransactions.map((row) => (
                  <React.Fragment key={row.id}>
                    <tr className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-600">{row.date}</td>
                      <td className="px-4 py-3 text-slate-700">{row.type}</td>
                      <td className="px-4 py-3 text-slate-700">{row.product}</td>
                      <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                        {row.category}
                      </td>
                      <td className="hidden px-4 py-3 text-slate-500 md:table-cell">
                        {row.sku}
                      </td>
                      <td className="hidden px-4 py-3 text-slate-500 md:table-cell">
                        {row.unit}
                      </td>
                      <td className="hidden px-4 py-3 text-emerald-600 md:table-cell">
                        {row.qtyIn || ""}
                      </td>
                      <td className="hidden px-4 py-3 text-rose-600 md:table-cell">
                        {row.qtyOut || ""}
                      </td>
                      <td className="hidden px-4 py-3 text-slate-700 md:table-cell">
                        {row.balance ?? ""}
                      </td>
                      <td className="hidden px-4 py-3 text-slate-700 md:table-cell">
                        {row.partyName || "-"}
                      </td>
                      <td className="hidden px-4 py-3 text-slate-500 md:table-cell">
                        {row.ref}
                      </td>
                      <td className="px-4 py-3 text-right md:hidden">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedTransactions((prev) => ({
                              ...prev,
                              [row.id]: !prev[row.id],
                            }))
                          }
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600"
                        >
                          {expandedTransactions[row.id] ? "Hide" : "View"}
                        </button>
                      </td>
                    </tr>
                    {expandedTransactions[row.id] && (
                      <tr className="md:hidden">
                        <td colSpan={12} className="px-4 pb-4">
                          <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold uppercase text-slate-500">
                                Receiver/Handled By
                              </span>
                              <span>{row.partyName || "-"}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold uppercase text-slate-500">
                                Category
                              </span>
                              <span>{row.category}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold uppercase text-slate-500">
                                SKU
                              </span>
                              <span>{row.sku}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold uppercase text-slate-500">
                                UoM
                              </span>
                              <span>{row.unit}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold uppercase text-slate-500">
                                In
                              </span>
                              <span>{row.qtyIn || "-"}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold uppercase text-slate-500">
                                Out
                              </span>
                              <span>{row.qtyOut || "-"}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold uppercase text-slate-500">
                                Balance
                              </span>
                              <span>{row.balance ?? "-"}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold uppercase text-slate-500">
                                Reference
                              </span>
                              <span>{row.ref}</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination
            total={filteredTransactions.length}
            page={txnPage}
            pageSize={pageSize}
            showAll={txnShowAll}
            onPageChange={setTxnPage}
            onToggleShowAll={() => setTxnShowAll((prev) => !prev)}
          />
        </div>
      )}

      {profileUserType === "admin" && (
        <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
              User Logs
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span>From</span>
              <input
                type="date"
                value={logsDateFilter.from}
                onChange={(event) =>
                  setLogsDateFilter((prev) => ({
                    ...prev,
                    from: event.target.value,
                  }))
                }
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <span>To</span>
              <input
                type="date"
                value={logsDateFilter.to}
                onChange={(event) =>
                  setLogsDateFilter((prev) => ({
                    ...prev,
                    to: event.target.value,
                  }))
                }
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="w-full">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="hidden px-4 py-3 md:table-cell">Action</th>
                  <th className="hidden px-4 py-3 md:table-cell">User</th>
                  <th className="px-4 py-3 text-right md:hidden">More</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-center text-sm text-slate-500"
                    >
                      No logs for this date range.
                    </td>
                  </tr>
                )}
                {pagedLogs.map((row) => (
                  <React.Fragment key={row.id}>
                    <tr className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-600">{row.date}</td>
                      <td className="px-4 py-3 text-slate-600">{row.time}</td>
                      <td className="hidden px-4 py-3 text-slate-700 md:table-cell">
                        {row.action}
                      </td>
                      <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                        {row.userName || userLabel}
                      </td>
                      <td className="px-4 py-3 text-right md:hidden">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedLogs((prev) => ({
                              ...prev,
                              [row.id]: !prev[row.id],
                            }))
                          }
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600"
                        >
                          {expandedLogs[row.id] ? "Hide" : "View"}
                        </button>
                      </td>
                    </tr>
                    {expandedLogs[row.id] && (
                      <tr className="md:hidden">
                        <td colSpan={5} className="px-4 pb-4">
                          <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold uppercase text-slate-500">
                                Action
                              </span>
                              <span className="text-right">{row.action}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold uppercase text-slate-500">
                                User
                              </span>
                              <span>{row.userName || userLabel}</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination
            total={filteredLogs.length}
            page={logPage}
            pageSize={pageSize}
            showAll={logShowAll}
            onPageChange={setLogPage}
            onToggleShowAll={() => setLogShowAll((prev) => !prev)}
          />
        </div>
      )}

      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/60"
            onClick={() => setConfirmModal(null)}
            aria-label="Close confirmation"
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 text-slate-900 shadow-xl">
            <h2 className="text-lg font-semibold">{confirmModal.title}</h2>
            <p className="mt-2 text-sm text-slate-600">
              {confirmModal.message}
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {resetModalOpen && resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/60"
            onClick={() => setResetModalOpen(false)}
            aria-label="Close reset modal"
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 text-slate-900 shadow-xl">
            <h2 className="text-lg font-semibold">Reset Password</h2>
            <p className="mt-2 text-sm text-slate-600">
              This will reset the password for{" "}
              {resetTarget.name || resetTarget.email} to{" "}
              <span className="font-semibold">qweQWE123!@#</span>.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitResetPassword}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
