"use client";

import { Fragment, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/AuthProvider";
import { INBOUND_COLLECTION, partyLabel, type InboundDoc } from "@/lib/inbound";

const readOnlyInput =
  "mt-2 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600";

export default function InboundViewPage() {
  const { user, loading } = useAuth();
  const params = useParams();
  const router = useRouter();
  const [inbound, setInbound] = useState<InboundDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) return;
    const id = params?.id as string | undefined;
    if (!id) return;
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, INBOUND_COLLECTION, id));
        if (!snap.exists()) {
          setError("Inbound record not found.");
          return;
        }
        setInbound(snap.data() as InboundDoc);
      } catch {
        setError("Unable to load inbound record.");
      }
    };
    load();
  }, [params, user]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600 shadow-sm">
        Loading...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600 shadow-sm">
        Please sign in to view inbound records.
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-700 shadow-sm">
        {error}
      </div>
    );
  }

  if (!inbound) {
    return null;
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
          Inbound
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">View Inbound</h1>
      </div>

      <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Reference No.
          <input type="text" value={inbound.referenceNo} readOnly className={readOnlyInput} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Date & Time
          <input
            type="text"
            value={inbound.dateTime?.replace("T", " ")}
            readOnly
            className={readOnlyInput}
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Source
          <input type="text" value={inbound.source} readOnly className={readOnlyInput} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          {partyLabel(inbound.source)}
          <input type="text" value={inbound.partyName} readOnly className={readOnlyInput} />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Status
          <input
            type="text"
            value={inbound.status ?? "Closed"}
            readOnly
            className={readOnlyInput}
          />
        </label>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            Items
          </h2>
        </div>
        <div className="w-full">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Product</th>
                <th className="hidden px-4 py-3 md:table-cell">SKU</th>
                <th className="hidden px-4 py-3 md:table-cell">Quantity</th>
                <th className="hidden px-4 py-3 md:table-cell">UoM</th>
                <th className="px-4 py-3 text-right md:hidden">More</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!inbound.items?.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                    No items.
                  </td>
                </tr>
              )}
              {inbound.items?.map((item) => (
                <Fragment key={item.id}>
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-700">{item.category}</td>
                    <td className="px-4 py-3 text-slate-700">{item.productName}</td>
                    <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                      {item.sku}
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                      {item.quantity}
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                      {item.unit}
                    </td>
                    <td className="px-4 py-3 text-right md:hidden">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedItems((prev) => ({
                            ...prev,
                            [item.id]: !prev[item.id],
                          }))
                        }
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600"
                      >
                        {expandedItems[item.id] ? "Hide" : "View"}
                      </button>
                    </td>
                  </tr>
                  {expandedItems[item.id] && (
                    <tr className="md:hidden">
                      <td colSpan={6} className="px-4 pb-4">
                        <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              SKU
                            </span>
                            <span>{item.sku || "-"}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Quantity
                            </span>
                            <span>{item.quantity}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              UoM
                            </span>
                            <span>{item.unit}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={() => router.push("/inbound")}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
        >
          Back to Inbound
        </button>
      </div>
    </section>
  );
}
