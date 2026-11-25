import {
  doc,
  runTransaction,
  serverTimestamp,
  type DocumentReference,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "@/lib/firebase";
import { logAction } from "@/lib/logs";
import {
  applyStockMovements,
  claimReferenceNo,
  getNextSeries,
  StockError,
} from "@/lib/stock";

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
  const series = await getNextSeries(INBOUND_COLLECTION, "REFNO-IN", year);
  return { year, series, referenceNo: generateInboundRefNo(year, series) };
}

// Local time in the format a datetime-local input expects (YYYY-MM-DDTHH:mm).
export function nowLocalDateTime() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
}


/**
 * Saves an inbound as a draft or finalizes it, in one Firestore transaction.
 * Finalizing applies the Incoming Stocks rules (Restock adds to onhand and
 * total, Returns adds to onhand only) using onhand read at save time, and
 * writes the stock card entries in the same transaction. A new inbound claims
 * its reference number here: the number on the form is a suggestion, and if
 * someone else saved it first the next free number is used.
 */
export async function saveInbound(
  existingId: string | null,
  data: Omit<InboundDoc, "status">,
  status: InboundStatus,
  user: User | null,
) {
  const saved = await runTransaction(db, async (txn) => {
    let inboundRef: DocumentReference;
    let referenceNo = data.referenceNo;
    let series = data.series;
    if (existingId) {
      inboundRef = doc(db, INBOUND_COLLECTION, existingId);
      const existing = await txn.get(inboundRef);
      if (!existing.exists()) throw new StockError("Inbound record not found.");
      if ((existing.data().status ?? "Closed") !== "Draft") {
        throw new StockError(`${data.referenceNo} has already been saved.`);
      }
    } else {
      const claimed = await claimReferenceNo(
        txn,
        INBOUND_COLLECTION,
        "REFNO-IN",
        data.inYear,
        data.series,
      );
      inboundRef = claimed.ref;
      referenceNo = claimed.referenceNo;
      series = claimed.series;
    }

    if (status === "Closed") {
      await applyStockMovements(
        txn,
        data.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          category: item.category,
          sku: item.sku,
          unit: item.unit,
          type: transactionType(data.source),
          qtyIn: item.quantity,
          qtyOut: 0,
          raiseTotal: data.source === "Restock",
          reference: referenceNo,
          source: data.source,
          partyName: data.partyName,
          date: data.dateTime.slice(0, 10),
          userId: user?.uid,
          userName: user?.displayName ?? "",
          userEmail: user?.email ?? "",
        })),
      );
    }

    const record = {
      ...data,
      referenceNo,
      series,
      status,
      ...(status === "Closed" ? { closedAt: serverTimestamp() } : {}),
    };
    if (existingId) {
      txn.update(inboundRef, record);
    } else {
      txn.set(inboundRef, { ...record, createdAt: serverTimestamp() });
    }
    return { id: inboundRef.id, referenceNo };
  });

  if (status === "Closed") {
    for (const item of data.items) {
      await logAction(user, {
        action: `${data.source === "Restock" ? "Restocked" : "Returned"} ${item.productName}`,
        entity: "product",
        entityId: item.productId,
        entityName: item.productName,
        details: {
          qty: item.quantity,
          source: data.source,
          by: data.partyName,
          reference: saved.referenceNo,
        },
      });
    }
  }
  await logAction(user, {
    action:
      status === "Closed"
        ? `Added ${saved.referenceNo}`
        : `Saved draft ${saved.referenceNo}`,
    entity: "inbound",
    entityId: saved.id,
    entityName: saved.referenceNo,
  });
}
