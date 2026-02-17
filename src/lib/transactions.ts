import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type TransactionPayload = {
  productId?: string;
  productName: string;
  category?: string;
  sku?: string;
  unit?: string;
  type: string;
  qtyIn?: number;
  qtyOut?: number;
  balanceAfter?: number;
  price?: number;
  total?: number;
  reference?: string;
  source?: string;
  destination?: string;
  partyName?: string;
  date?: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
};

export async function addTransaction(payload: TransactionPayload) {
  const qtyIn = payload.qtyIn ?? 0;
  const qtyOut = payload.qtyOut ?? 0;
  const price = payload.price ?? 0;
  const total = payload.total ?? (qtyIn > 0 ? qtyIn * price : qtyOut * price);
  const date = payload.date ?? new Date().toISOString().slice(0, 10);

  await addDoc(collection(db, "transactions"), {
    productId: payload.productId ?? "",
    productName: payload.productName,
    category: payload.category ?? "",
    sku: payload.sku ?? "",
    unit: payload.unit ?? "",
    type: payload.type,
    qtyIn,
    qtyOut,
    balanceAfter: payload.balanceAfter ?? null,
    price,
    total,
    reference: payload.reference ?? "",
    source: payload.source ?? "",
    destination: payload.destination ?? "",
    partyName: payload.partyName ?? "",
    date,
    userId: payload.userId ?? "",
    userName: payload.userName ?? "",
    userEmail: payload.userEmail ?? "",
    createdAt: serverTimestamp(),
  });
}
