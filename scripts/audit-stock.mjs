// Read-only stock card audit. Nothing is written to the database.
//
// For each product it walks the stock card in the order entries were saved
// and checks that each row's Balance = previous row's Balance + In - Out.
// Each place where that fails is a "break": stock changed in a way the card
// doesn't explain. A positive break usually means a deduction was lost
// (two saves at the same time, the later one overwrote the earlier one).
// It also checks that the last Balance on the card equals the current onhand.
//
// Usage (from the project root):
//   node --env-file=.env.local scripts/audit-stock.mjs
//   node --env-file=.env.local scripts/audit-stock.mjs --csv breaks.csv

import { writeFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const credentialsJson = process.env.FIREBASE_ADMIN_CREDENTIALS;
if (!credentialsJson) {
  console.error("Missing FIREBASE_ADMIN_CREDENTIALS. Run with --env-file=.env.local");
  process.exit(1);
}
const db = getFirestore(
  initializeApp({ credential: cert(JSON.parse(credentialsJson)) }),
);
const csvIndex = process.argv.indexOf("--csv");
const csvPath = csvIndex > -1 ? process.argv[csvIndex + 1] : null;

const [productSnap, txnSnap] = await Promise.all([
  db.collection("products").get(),
  db.collection("transactions").get(),
]);

const txnsByProduct = new Map();
for (const docSnap of txnSnap.docs) {
  const data = docSnap.data();
  if (!data.productId) continue;
  const list = txnsByProduct.get(data.productId) ?? [];
  list.push({
    date: data.date ?? "",
    createdAt: data.createdAt?.toDate?.() ?? null,
    type: data.type ?? "",
    reference: data.reference ?? "",
    qtyIn: Number(data.qtyIn ?? 0),
    qtyOut: Number(data.qtyOut ?? 0),
    balanceAfter: typeof data.balanceAfter === "number" ? data.balanceAfter : null,
  });
  txnsByProduct.set(data.productId, list);
}

const summary = [];
const breaks = [];
for (const productDoc of productSnap.docs) {
  const product = productDoc.data();
  const name = product.product ?? productDoc.id;
  const onhand = Number(product.onhandQty ?? 0);
  const entries = (txnsByProduct.get(productDoc.id) ?? []).sort(
    (a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0),
  );

  let previous = null;
  let unexplained = 0;
  let productBreaks = 0;
  for (const entry of entries) {
    if (entry.balanceAfter === null) continue;
    const expected = (previous ?? 0) + entry.qtyIn - entry.qtyOut;
    // The first entry has no previous balance to check against unless it is
    // the initial stock entry.
    const checkable = previous !== null || entry.type.includes("Initial");
    if (checkable && entry.balanceAfter !== expected) {
      const jump = entry.balanceAfter - expected;
      unexplained += jump;
      productBreaks += 1;
      breaks.push({
        product: name,
        savedAt: entry.createdAt?.toISOString().replace("T", " ").slice(0, 19) ?? "",
        date: entry.date,
        type: entry.type,
        reference: entry.reference,
        in: entry.qtyIn,
        out: entry.qtyOut,
        previousBalance: previous ?? 0,
        expected,
        recorded: entry.balanceAfter,
        jump,
      });
    }
    previous = entry.balanceAfter;
  }
  const lastBalance = previous;
  const cardVsOnhand = lastBalance === null ? 0 : onhand - lastBalance;
  if (productBreaks || cardVsOnhand) {
    summary.push({
      product: name,
      onhand,
      lastCardBalance: lastBalance,
      breaks: productBreaks,
      netJump: unexplained,
      onhandMinusLastBalance: cardVsOnhand,
    });
  }
}

console.log(
  `Checked ${productSnap.size} products and ${txnSnap.size} stock card entries.`,
);
if (!summary.length) {
  console.log("No breaks found: every stock card is consistent.");
  process.exit(0);
}
summary.sort((a, b) => b.breaks - a.breaks);
console.log(`\n${summary.length} product(s) with unexplained stock changes:`);
console.table(summary);
console.log(
  "netJump > 0: stock is higher than the card explains (usually lost deductions).\n" +
    "onhandMinusLastBalance != 0: onhand was changed after the last card entry.",
);

if (csvPath) {
  const header = Object.keys(breaks[0] ?? { product: "" });
  const escape = (value) => `"${String(value).replaceAll('"', '""')}"`;
  const lines = [
    header.join(","),
    ...breaks.map((row) => header.map((key) => escape(row[key])).join(",")),
  ];
  writeFileSync(csvPath, lines.join("\n"));
  console.log(`\nWrote ${breaks.length} breaks to ${csvPath}`);
} else {
  console.log("\nBreaks (pass --csv <file> to save them all):");
  console.table(breaks.slice(0, 40));
  if (breaks.length > 40) console.log(`...and ${breaks.length - 40} more.`);
}
