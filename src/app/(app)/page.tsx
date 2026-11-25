"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getCountFromServer,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/AuthProvider";

type ProductRow = {
  id: string;
  product: string;
  category: string;
  onhandQty: number;
};

type DeliveryRow = {
  id: string;
  referenceNo: string;
  outboundType: string;
  receiverName: string;
  dateTime: string;
};

type LogRow = {
  id: string;
  action: string;
  userName: string;
  createdAt?: { toDate: () => Date };
};

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [recentOutbound, setRecentOutbound] = useState<DeliveryRow[]>([]);
  const [totalOutbound, setTotalOutbound] = useState(0);
  const [outboundThisMonth, setOutboundThisMonth] = useState(0);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [userType, setUserType] = useState<"admin" | "employee">("employee");
  const [showAllActivity, setShowAllActivity] = useState(false);

  const lowStockThreshold = 10;
  const monthKey = new Date().toISOString().slice(0, 7);

  useEffect(() => {
    if (!user) return;
    const userRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(userRef, (snapshot) => {
      const data = snapshot.data() as { userType?: "admin" | "employee" };
      setUserType(data?.userType ?? "employee");
    });
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const productsRef = collection(db, "products");
    const deliveriesRef = collection(db, "deliveries");

    const unsubscribeProducts = onSnapshot(productsRef, (snapshot) => {
      const rows = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Omit<ProductRow, "id">;
        return { id: docSnap.id, ...data };
      });
      setProducts(rows);
    });

    // Only the 5 most recent deliveries are shown; the totals come from count
    // queries (about 1 read per 1,000 documents) rather than loading them all.
    const recentQuery = query(deliveriesRef, orderBy("dateTime", "desc"), limit(5));
    const unsubscribeDeliveries = onSnapshot(recentQuery, (snapshot) => {
      const rows = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Omit<DeliveryRow, "id">;
        return { id: docSnap.id, ...data };
      });
      setRecentOutbound(rows);
    });

    const [year, month] = monthKey.split("-").map(Number);
    const nextMonthKey = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
    Promise.all([
      getCountFromServer(deliveriesRef),
      getCountFromServer(
        query(
          deliveriesRef,
          where("dateTime", ">=", monthKey),
          where("dateTime", "<", nextMonthKey),
        ),
      ),
    ])
      .then(([total, thisMonth]) => {
        setTotalOutbound(total.data().count);
        setOutboundThisMonth(thisMonth.data().count);
      })
      .catch(() => {
        // Leave the counts at 0 if they can't be loaded.
      });

    return () => {
      unsubscribeProducts();
      unsubscribeDeliveries();
    };
  }, [user, monthKey]);

  useEffect(() => {
    if (!user || userType !== "admin") {
      setLogs([]);
      return;
    }
    const logsRef = collection(db, "userLogs");
    const logsQuery = query(logsRef, orderBy("createdAt", "desc"), limit(20));
    const unsubscribe = onSnapshot(logsQuery, (snapshot) => {
      const rows = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Omit<LogRow, "id">;
        return { id: docSnap.id, ...data };
      });
      setLogs(rows);
    });
    return () => unsubscribe();
  }, [user, userType]);

  const totalProducts = products.length;
  const lowStockCount = products.filter(
    (row) => (row.onhandQty ?? 0) <= lowStockThreshold,
  ).length;

  const totalOnhandUnits = useMemo(
    () => products.reduce((acc, row) => acc + (row.onhandQty ?? 0), 0),
    [products],
  );

  const topProducts = useMemo(() => {
    return [...products]
      .sort((a, b) => (b.onhandQty ?? 0) - (a.onhandQty ?? 0))
      .slice(0, 5);
  }, [products]);

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach((row) => {
      const current = map.get(row.category) ?? 0;
      map.set(row.category, current + (row.onhandQty ?? 0));
    });
    return Array.from(map.entries())
      .map(([category, qty]) => ({ category, qty }))
      .sort((a, b) => b.qty - a.qty);
  }, [products]);

  const activityRows = useMemo(() => {
    if (showAllActivity) return logs;
    return logs.slice(0, 5);
  }, [logs, showAllActivity]);

  return (
    <section className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
          Homepage / Dashboard
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-2 text-sm text-slate-500">
          Quick snapshot of inventory and outbound activity.
        </p>
      </div>

      {loading && (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600 shadow-sm">
          Loading dashboard...
        </div>
      )}

      {!loading && !user ? null : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Total Products
              </p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">
                {totalProducts}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Low Stock
              </p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">
                {lowStockCount}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Threshold: {lowStockThreshold} units
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Total Outbound
              </p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">
                {totalOutbound}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Outbound This Month
              </p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">
                {outboundThisMonth}
              </p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Total Onhand Units
                  </h2>
                  <span className="text-sm font-semibold text-slate-900">
                    {totalOnhandUnits.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Recent Outbound
                </h2>
                <div className="mt-4 space-y-3">
                  {recentOutbound.length === 0 && (
                    <p className="text-sm text-slate-500">
                      No outbound records yet.
                    </p>
                  )}
                  {recentOutbound.map((row) => (
                    <div
                      key={row.id}
                      className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">
                          {row.referenceNo}
                        </p>
                        <p className="text-xs text-slate-500">
                          {row.receiverName} - {row.dateTime?.replace("T", " ")}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-slate-600">
                        {row.outboundType}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Top Products (Onhand Qty)
                </h2>
                <div className="mt-4 space-y-3">
                  {topProducts.length === 0 && (
                    <p className="text-sm text-slate-500">No products yet.</p>
                  )}
                  {topProducts.map((row) => (
                    <div
                      key={row.id}
                      className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">
                          {row.product}
                        </p>
                        <p className="text-xs text-slate-500">
                          {row.category} - {row.onhandQty ?? 0} onhand
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-slate-900">
                        {row.onhandQty?.toLocaleString() ?? 0}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Category Breakdown
                </h2>
                <div className="mt-4 space-y-3">
                  {categoryBreakdown.length === 0 && (
                    <p className="text-sm text-slate-500">
                      No categories yet.
                    </p>
                  )}
                  {categoryBreakdown.map((row) => (
                    <div
                      key={row.category}
                      className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700"
                    >
                      <span className="font-semibold text-slate-900">
                        {row.category}
                      </span>
                      <span className="text-xs font-semibold text-slate-600">
                        {row.qty} units
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {userType === "admin" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
                Recent Activity
              </h2>
              <div className="mt-4 space-y-3">
                {logs.length === 0 && (
                  <p className="text-sm text-slate-500">
                    No recent activity.
                  </p>
                )}
                {activityRows.map((row) => {
                  const created = row.createdAt?.toDate?.();
                  const time = created
                    ? created.toLocaleTimeString("en-PH", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "";
                  return (
                    <div
                      key={row.id}
                      className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700"
                    >
                      <p className="font-semibold text-slate-900">
                        {row.action}
                      </p>
                      <p className="text-xs text-slate-500">
                        {row.userName || "User"} {time && `- ${time}`}
                      </p>
                    </div>
                  );
                })}
                {logs.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllActivity((prev) => !prev)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700"
                  >
                    {showAllActivity ? "Show less" : "Show more"}
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

