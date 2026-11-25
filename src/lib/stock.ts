import {
  collection,
  doc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  where,
  type Transaction,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  buildTransactionData,
  type TransactionPayload,
} from "@/lib/transactions";

export type StockMovement = TransactionPayload & {
  productId: string;
  // Restock also raises the product's total quantity.
  raiseTotal?: boolean;
};

export class StockError extends Error {}

// Applies stock movements inside a Firestore transaction. Onhand is read from
// the database at commit time (not from a list loaded when the page opened),
// so concurrent saves can't overwrite each other, and every stock card entry
// records the exact balance it produced. Firestore requires all reads before
// any writes: do the caller's own reads before calling this, and its writes
// after.
export async function applyStockMovements(
  txn: Transaction,
  movements: StockMovement[],
) {
  const productIds = Array.from(new Set(movements.map((m) => m.productId)));
  const onhandById = new Map<string, number>();
  for (const productId of productIds) {
    const snap = await txn.get(doc(db, "products", productId));
    if (!snap.exists()) {
      const name = movements.find((m) => m.productId === productId)?.productName;
      throw new StockError(`${name ?? "A product"} no longer exists.`);
    }
    onhandById.set(productId, Number(snap.data().onhandQty ?? 0));
  }

  const totalRaiseById = new Map<string, number>();
  for (const { raiseTotal, ...payload } of movements) {
    const qtyIn = payload.qtyIn ?? 0;
    const qtyOut = payload.qtyOut ?? 0;
    const current = onhandById.get(payload.productId) ?? 0;
    const balanceAfter = current + qtyIn - qtyOut;
    if (balanceAfter < 0) {
      throw new StockError(
        `Insufficient onhand for ${payload.productName} (available: ${current}).`,
      );
    }
    onhandById.set(payload.productId, balanceAfter);
    if (raiseTotal) {
      totalRaiseById.set(
        payload.productId,
        (totalRaiseById.get(payload.productId) ?? 0) + qtyIn,
      );
    }
    txn.set(
      doc(collection(db, "transactions")),
      buildTransactionData({ ...payload, balanceAfter }),
    );
  }

  for (const productId of productIds) {
    const raise = totalRaiseById.get(productId) ?? 0;
    txn.update(doc(db, "products", productId), {
      onhandQty: onhandById.get(productId) ?? 0,
      ...(raise ? { totalQty: increment(raise) } : {}),
    });
  }

  return onhandById;
}

// Suggests the next series for a reference prefix by reading only the highest
// existing reference number (1 read, not the whole collection). Numbers are
// zero-padded, so text order matches number order.
export async function getNextSeries(
  collectionName: string,
  prefix: string,
  year: string,
) {
  const start = `${prefix}-${year}-`;
  const snap = await getDocs(
    query(
      collection(db, collectionName),
      where("referenceNo", ">=", start),
      where("referenceNo", "<", `${start}`),
      orderBy("referenceNo", "desc"),
      limit(1),
    ),
  );
  const last = snap.docs[0]?.data().referenceNo as string | undefined;
  return (last ? Number(last.slice(start.length)) || 0 : 0) + 1;
}

// Claims a reference number inside a transaction (call it before any writes).
// New records use their reference number as the document ID, so if another
// save takes the same number first, this transaction is retried, sees the
// number is taken, and moves on to the next one. Returns the document ref to
// create the record at.
export async function claimReferenceNo(
  txn: Transaction,
  collectionName: string,
  prefix: string,
  year: string,
  startSeries: number,
) {
  for (let series = startSeries; series < startSeries + 50; series += 1) {
    const referenceNo = `${prefix}-${year}-${String(series).padStart(4, "0")}`;
    const ref = doc(db, collectionName, referenceNo);
    const snap = await txn.get(ref);
    if (!snap.exists()) return { ref, referenceNo, series };
  }
  throw new StockError("Unable to assign a reference number. Please try again.");
}

// Stock card order: newest date first, then newest entry within the same
// date, so the balance column reads in the order the movements happened.
export function compareLedgerNewestFirst(
  a: { date: string; createdAt: number },
  b: { date: string; createdAt: number },
) {
  return b.date.localeCompare(a.date) || b.createdAt - a.createdAt;
}

export function createdAtMillis(value: unknown) {
  const ts = value as { toMillis?: () => number } | null | undefined;
  return ts?.toMillis?.() ?? 0;
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof StockError ? error.message : fallback;
}
