import {
  collection,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
  type DocumentReference,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "@/lib/firebase";
import { logAction } from "@/lib/logs";
import { addTransaction } from "@/lib/transactions";

export const INBOUND_COLLECTION = "inbounds";

export type InboundSource = "Restock" | "Returns";
export type InboundStatus = "Draft" | "Closed";

export type InboundItem = {
  id: string;
  productId: string;
  productName: string;
  category: string;
  sku: string;
  unit: string;
  quantity: number;
};

export type InboundDoc = {
  referenceNo: string;
  inYear: string;
  series: number;
  source: InboundSource;
  partyName: string;
  dateTime: string;
  items: InboundItem[];
  status?: InboundStatus;
};

export type InboundRow = InboundDoc & { id: string };

export function partyLabel(source: InboundSource) {
  return source === "Restock" ? "Restocked by" : "Returned by";
}

function transactionType(source: InboundSource) {
  return source === "Restock" ? "Incoming (Restock)" : "Incoming (Return)";
}

export function generateInboundRefNo(year: string, series: number) {
  return `REFNO-IN-${year}-${String(series).padStart(4, "0")}`;
}

export async function getNextInboundRef() {
  const year = new Date().getFullYear().toString().slice(-2);
  const snap = await getDocs(collection(db, INBOUND_COLLECTION));
  let maxSeries = 0;
  snap.docs.forEach((docSnap) => {
    const data = docSnap.data() as { inYear?: string; series?: number };
    if (data.inYear === year && typeof data.series === "number") {
      maxSeries = Math.max(maxSeries, data.series);
    }
  });
  const series = maxSeries + 1;
  return { year, series, referenceNo: generateInboundRefNo(year, series) };
}

// Local time in the format a datetime-local input expects (YYYY-MM-DDTHH:mm).
export function nowLocalDateTime() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
}

/**
 * Finalizes an inbound: applies the Incoming Stocks rules to every product in
 * one atomic Firestore transaction (Restock adds to onhand and total, Returns
 * adds to onhand only), then writes per-product transaction history and logs.
 */
export async function closeInbound(
  inboundRef: DocumentReference,
  data: Omit<InboundDoc, "status">,
  user: User | null,
) {
  const balances = await runTransaction(db, async (tx) => {
    const existing = await tx.get(inboundRef);
    if (existing.exists() && existing.data().status === "Closed") {
      throw new Error(`${data.referenceNo} has already been saved.`);
    }

    const productRefs = data.items.map((item) =>
      doc(db, "products", item.productId),
    );
    const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));

    const nextBalances = new Map<string, number>();
    data.items.forEach((item, index) => {
      const snap = productSnaps[index];
      if (!snap.exists()) {
        throw new Error(`${item.productName} no longer exists in Products.`);
      }
      const current = snap.data() as { onhandQty?: number; totalQty?: number };
      const onhandQty = (current.onhandQty ?? 0) + item.quantity;
      const updates: Record<string, number> = { onhandQty };
      if (data.source === "Restock") {
        updates.totalQty = (current.totalQty ?? 0) + item.quantity;
      }
      tx.update(productRefs[index], updates);
      nextBalances.set(item.productId, onhandQty);
    });

    tx.set(
      inboundRef,
      {
        ...data,
        status: "Closed",
        ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
        closedAt: serverTimestamp(),
      },
      { merge: true },
    );
    return nextBalances;
  });

  for (const item of data.items) {
    await addTransaction({
      productId: item.productId,
      productName: item.productName,
      category: item.category,
      sku: item.sku,
      unit: item.unit,
      type: transactionType(data.source),
      qtyIn: item.quantity,
      qtyOut: 0,
      balanceAfter: balances.get(item.productId),
      reference: data.referenceNo,
      source: data.source,
      partyName: data.partyName,
      date: data.dateTime.slice(0, 10),
      userId: user?.uid,
      userName: user?.displayName ?? "",
      userEmail: user?.email ?? "",
    });
    await logAction(user, {
      action: `${data.source === "Restock" ? "Restocked" : "Returned"} ${item.productName}`,
      entity: "product",
      entityId: item.productId,
      entityName: item.productName,
      details: {
        qty: item.quantity,
        source: data.source,
        by: data.partyName,
        reference: data.referenceNo,
      },
    });
  }
  await logAction(user, {
    action: `Added ${data.referenceNo}`,
    entity: "inbound",
    entityId: inboundRef.id,
    entityName: data.referenceNo,
  });
}
