"use client";

import React from "react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  increment,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/AuthProvider";
import MultiSelect from "@/components/MultiSelect";
import TablePagination from "@/components/TablePagination";
import { logAction } from "@/lib/logs";
import { addTransaction } from "@/lib/transactions";

type ProductRow = {
  id: string;
  category: string;
  product: string;
  sku: string;
  unit: string;
  totalQty: number;
  onhandQty: number;
  notes?: string;
};

type CategoryRow = {
  id: string;
  name: string;
};

type ProductFormState = {
  product: string;
  category: string;
  sku: string;
  unit: string;
  quantity: string;
  notes: string;
};

const emptyProductForm: ProductFormState = {
  product: "",
  category: "",
  sku: "",
  unit: "",
  quantity: "",
  notes: "",
};

const iconBase = "h-4 w-4";
const iconButton =
  "inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:border-slate-400 hover:text-slate-900";

const PlusIcon = (
  <svg viewBox="0 0 24 24" className={iconBase} fill="none">
    <path
      d="M12 5v14M5 12h14"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

const TagIcon = (
  <svg viewBox="0 0 24 24" className={iconBase} fill="none">
    <path
      d="M7 5h6l6 6-6 6-6-6V5Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <circle cx="10" cy="9" r="1.2" fill="currentColor" />
  </svg>
);

const ListIcon = (
  <svg viewBox="0 0 24 24" className={iconBase} fill="none">
    <path
      d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

const EditIcon = (
  <svg viewBox="0 0 24 24" className={iconBase} fill="none">
    <path
      d="M4 20h4l11-11-4-4L4 16v4Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

const NoteIcon = (
  <svg viewBox="0 0 24 24" className={iconBase} fill="none">
    <path
      d="M6 4h8l4 4v12H6V4Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M8 12h8M8 16h6"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

const TrashIcon = (
  <svg viewBox="0 0 24 24" className={iconBase} fill="none">
    <path
      d="M4 7h16M9 7V5h6v2M7 7l1 12h8l1-12"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const IncomingIcon = (
  <svg viewBox="0 0 24 24" className={iconBase} fill="none">
    <path
      d="M4 7h16v10H4V7Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M12 4v6m0 0 3-3m-3 3-3-3"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const LedgerIcon = (
  <svg viewBox="0 0 24 24" className={iconBase} fill="none">
    <path
      d="M6 4h9l3 3v13H6V4Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M8 12h8M8 16h6"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

const PdfIcon = (
  <svg viewBox="0 0 24 24" className={iconBase} fill="none">
    <path
      d="M6 3h9l4 4v14H6V3Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M9 11h6M9 15h6"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

function Modal({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-3 sm:p-4 md:items-center md:p-6">
      <div className="w-[calc(100%-0.75rem)] max-w-2xl rounded-2xl bg-white p-5 shadow-2xl sm:w-[calc(100%-2rem)] sm:p-6 md:max-h-[90vh] md:overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
          >
            Close
          </button>
        </div>
        <div className="pt-5">{children}</div>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const { user, loading } = useAuth();
  const pageSize = 10;
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [productFilter, setProductFilter] = useState<string[]>([]);
  const [skuFilter, setSkuFilter] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [productForm, setProductForm] =
    useState<ProductFormState>(emptyProductForm);
  const [categoryName, setCategoryName] = useState("");
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [notesPreview, setNotesPreview] = useState("");
  const [notesProduct, setNotesProduct] = useState<ProductRow | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesEditing, setNotesEditing] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [incomingModalOpen, setIncomingModalOpen] = useState(false);
  const [incomingProduct, setIncomingProduct] = useState<ProductRow | null>(null);
  const [incomingQty, setIncomingQty] = useState("");
  const [incomingSource, setIncomingSource] = useState("Restock");
  const [incomingBy, setIncomingBy] = useState("");
  const [outgoingModalOpen, setOutgoingModalOpen] = useState(false);
  const [outgoingProduct, setOutgoingProduct] = useState<ProductRow | null>(null);
  const [outgoingQty, setOutgoingQty] = useState("");
  const [outgoingDestination, setOutgoingDestination] = useState("Sale");
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerProduct, setLedgerProduct] = useState<ProductRow | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<
    Array<{
      id: string;
      type: string;
      date: string;
      qtyIn: number;
      qtyOut: number;
      balance?: number;
      ref: string;
      actor: string;
    }>
  >([]);
  const [productError, setProductError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [incomingError, setIncomingError] = useState<string | null>(null);
  const [outgoingError, setOutgoingError] = useState<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [productPage, setProductPage] = useState(1);
  const [productShowAll, setProductShowAll] = useState(false);

  const hasActiveFilters =
    categoryFilter.length > 0 || productFilter.length > 0 || skuFilter.length > 0;

  const categoryOptions = useMemo(
    () => Array.from(new Set(products.map((row) => row.category))).sort(),
    [products],
  );
  const productOptions = useMemo(
    () => Array.from(new Set(products.map((row) => row.product))).sort(),
    [products],
  );
  const skuOptions = useMemo(
    () => Array.from(new Set(products.map((row) => row.sku))).sort(),
    [products],
  );

  const filteredProducts = useMemo(
    () =>
      products.filter((row) => {
        const categoryMatch =
          categoryFilter.length === 0 || categoryFilter.includes(row.category);
        const productMatch =
          productFilter.length === 0 || productFilter.includes(row.product);
        const skuMatch = skuFilter.length === 0 || skuFilter.includes(row.sku);
        return categoryMatch && productMatch && skuMatch;
      }),
    [products, categoryFilter, productFilter, skuFilter],
  );

  const pagedProducts = useMemo(() => {
    if (productShowAll) return filteredProducts;
    const start = (productPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, productPage, productShowAll]);

  const visibleIds = pagedProducts.map((row) => row.id);
  const allSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const someSelected =
    visibleIds.some((id) => selectedIds.includes(id)) && !allSelected;

  useEffect(() => {
    if (!user) return;
    const productsRef = collection(db, "products");
    const categoriesRef = collection(db, "categories");

    const unsubscribeProducts = onSnapshot(productsRef, (snapshot) => {
      const nextProducts = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Omit<ProductRow, "id">;
        return { id: docSnap.id, ...data };
      });
      nextProducts.sort((a, b) => a.product.localeCompare(b.product));
      setProducts(nextProducts);
    });

    const unsubscribeCategories = onSnapshot(categoriesRef, (snapshot) => {
      const nextCategories = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Omit<CategoryRow, "id">;
        return { id: docSnap.id, ...data };
      });
      nextCategories.sort((a, b) => a.name.localeCompare(b.name));
      setCategories(nextCategories);
    });

    return () => {
      unsubscribeProducts();
      unsubscribeCategories();
    };
  }, [user]);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = Boolean(someSelected);
    }
  }, [someSelected]);

  useEffect(() => {
    setProductPage(1);
  }, [filteredProducts.length]);

  const clampQtyInput = (value: string) => {
    if (!value.trim()) return "";
    const next = Math.floor(Number(value));
    if (Number.isNaN(next)) return "";
    return String(Math.max(0, next));
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
      return;
    }
    setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
  };

  const openNewProduct = () => {
    setProductError(null);
    setCategoryError(null);
    setIncomingError(null);
    setOutgoingError(null);
    setEditingProduct(null);
    setProductForm(emptyProductForm);
    setProductModalOpen(true);
  };

  const openEditProduct = (row: ProductRow) => {
    setProductError(null);
    setCategoryError(null);
    setIncomingError(null);
    setOutgoingError(null);
    setEditingProduct(row);
    setProductForm({
      product: row.product,
      category: row.category,
      sku: row.sku,
      unit: row.unit,
      quantity: String(row.totalQty),
      notes: row.notes ?? "",
    });
    setProductModalOpen(true);
  };

  const openIncoming = (row: ProductRow) => {
    setIncomingProduct(row);
    setIncomingQty("");
    setIncomingSource("Restock");
    setIncomingBy("");
    setIncomingError(null);
    setProductError(null);
    setCategoryError(null);
    setOutgoingError(null);
    setIncomingModalOpen(true);
  };

  const openOutgoing = (row: ProductRow) => {
    setOutgoingProduct(row);
    setOutgoingQty("");
    setOutgoingDestination("Sale");
    setOutgoingError(null);
    setProductError(null);
    setCategoryError(null);
    setIncomingError(null);
    setOutgoingModalOpen(true);
  };

  const openLedger = (row: ProductRow) => {
    setLedgerProduct(row);
    setLedgerEntries([]);
    setLedgerOpen(true);
  };

  const getPartyName = (type: string, ref: string, partyName?: string) => {
    if (partyName?.trim()) return partyName.trim();
    const isIncoming =
      type === "Incoming (Restock)" || type === "Incoming (Return)";
    if (!isIncoming) return "";
    const parts = ref.split(" - ");
    if (parts.length < 2) return "";
    return parts.slice(1).join(" - ").trim();
  };

  const handleStockCardPdf = async (row: ProductRow) => {
    const transactionsRef = collection(db, "transactions");
    const transactionsQuery = query(
      transactionsRef,
      where("productId", "==", row.id),
    );
    const snapshot = await getDocs(transactionsQuery);
    const entries = snapshot.docs.map((docSnap) => {
      const data = docSnap.data() as {
        type?: string;
        date?: string;
        qtyIn?: number;
        qtyOut?: number;
        balanceAfter?: number;
        reference?: string;
        partyName?: string;
      };
      return {
        id: docSnap.id,
        type: data.type ?? "",
        date: data.date ?? "",
        qtyIn: data.qtyIn ?? 0,
        qtyOut: data.qtyOut ?? 0,
        balance: data.balanceAfter,
        ref: data.reference ?? "",
        actor: getPartyName(data.type ?? "", data.reference ?? "", data.partyName),
      };
    });
    entries.sort((a, b) => b.date.localeCompare(a.date));

    const docPdf = new jsPDF({ orientation: "portrait" });
    const now = new Date();
    docPdf.setFontSize(14);
    docPdf.text(`Stock Card - ${row.product}`, 14, 18);
    docPdf.setFontSize(10);
    docPdf.text(
      `Generated: ${now.toLocaleDateString("en-PH")} ${now.toLocaleTimeString("en-PH")}`,
      14,
      26,
    );
    docPdf.text(`Category: ${row.category}`, 14, 32);
    docPdf.text(`SKU: ${row.sku || "-"}`, 14, 38);
    docPdf.text(`UoM: ${row.unit}`, 14, 44);
    docPdf.text(`Total Qty: ${row.totalQty}`, 14, 50);
    docPdf.text(`Onhand Qty: ${row.onhandQty}`, 14, 56);

    const rows = entries.map((entry) => [
      entry.date,
      entry.type,
      entry.qtyIn ? String(entry.qtyIn) : "",
      entry.qtyOut ? String(entry.qtyOut) : "",
      entry.balance !== undefined ? String(entry.balance) : "",
      entry.actor,
      entry.ref,
    ]);

    autoTable(docPdf, {
      startY: 64,
      head: [[
        "Date",
        "Type",
        "In",
        "Out",
        "Balance",
        "Restocked/Returned by",
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

  const saveProduct = async () => {
    setProductError(null);
    const trimmedProduct = productForm.product.trim();
    const trimmedCategory = productForm.category.trim();
    const trimmedSku = productForm.sku.trim();
    const trimmedUnit = productForm.unit.trim();
    const quantity = Number(productForm.quantity);
    if (!trimmedProduct || !trimmedCategory || !trimmedUnit) {
      setProductError("Product name, category, and unit are required.");
      return;
    }

    if (Number.isNaN(quantity)) {
      setProductError("Quantity must be a valid number.");
      return;
    }

    const payload = {
      product: trimmedProduct,
      category: trimmedCategory,
      sku: trimmedSku,
      unit: trimmedUnit,
      totalQty: quantity,
      onhandQty: editingProduct ? editingProduct.onhandQty : quantity,
      notes: productForm.notes.trim(),
    };

    try {
      if (editingProduct) {
        await updateDoc(doc(db, "products", editingProduct.id), payload);
        await logAction(user, {
          action: `Edited ${payload.product}`,
          entity: "product",
          entityId: editingProduct.id,
          entityName: payload.product,
        });
      } else {
        const created = await addDoc(collection(db, "products"), payload);
        await addTransaction({
          productId: created.id,
          productName: payload.product,
          category: payload.category,
          sku: payload.sku,
          unit: payload.unit,
          type: "Incoming (Initial Stock)",
          qtyIn: payload.onhandQty,
          qtyOut: 0,
          balanceAfter: payload.onhandQty,
          reference: "Initial Stock",
          source: "Initial Stock",
          partyName: "",
          userId: user?.uid,
          userName: user?.displayName ?? "",
          userEmail: user?.email ?? "",
        });
        await logAction(user, {
          action: `Added ${payload.product}`,
          entity: "product",
          entityId: created.id,
          entityName: payload.product,
        });
      }
      setProductModalOpen(false);
      setProductForm(emptyProductForm);
      setEditingProduct(null);
    } catch {
      setProductError("Unable to save product. Please try again.");
    }
  };

  const deleteSelectedProducts = async () => {
    if (!selectedIds.length) return;
    const batch = writeBatch(db);
    const namesById = new Map(products.map((row) => [row.id, row.product]));
    selectedIds.forEach((id) => batch.delete(doc(db, "products", id)));
    await batch.commit();
    for (const id of selectedIds) {
      await logAction(user, {
        action: `Deleted ${namesById.get(id) ?? "Product"}`,
        entity: "product",
        entityId: id,
        entityName: namesById.get(id),
      });
    }
    setSelectedIds([]);
    setConfirmDeleteOpen(false);
  };

  const applyIncomingStock = async () => {
    setIncomingError(null);
    if (!incomingProduct) return;
    const incomingByTrimmed = incomingBy.trim();
    const qty = Number(incomingQty);
    if (!Number.isInteger(qty) || qty <= 0) {
      setIncomingError("Incoming quantity must be a positive integer.");
      return;
    }
    if (!incomingByTrimmed) {
      setIncomingError(
        incomingSource === "Restock"
          ? "Restocked by is required."
          : "Returned by is required.",
      );
      return;
    }
    const updates =
      incomingSource === "Restock"
        ? { totalQty: increment(qty), onhandQty: increment(qty) }
        : { onhandQty: increment(qty) };
    await updateDoc(doc(db, "products", incomingProduct.id), updates);
    await addTransaction({
      productId: incomingProduct.id,
      productName: incomingProduct.product,
      category: incomingProduct.category,
      sku: incomingProduct.sku,
      unit: incomingProduct.unit,
      type:
        incomingSource === "Restock"
          ? "Incoming (Restock)"
          : "Incoming (Return)",
      qtyIn: qty,
      qtyOut: 0,
      balanceAfter: incomingProduct.onhandQty + qty,
      reference: incomingSource,
      source: incomingSource,
      partyName: incomingByTrimmed,
      userId: user?.uid,
      userName: user?.displayName ?? "",
      userEmail: user?.email ?? "",
    });
    await logAction(user, {
      action:
        incomingSource === "Restock"
          ? `Restocked ${incomingProduct.product}`
          : `Returned ${incomingProduct.product}`,
      entity: "product",
      entityId: incomingProduct.id,
      entityName: incomingProduct.product,
      details: { qty, source: incomingSource, by: incomingByTrimmed },
    });
    setIncomingModalOpen(false);
  };

  const applyOutgoingStock = async () => {
    setOutgoingError(null);
    if (!outgoingProduct) return;
    const qty = Number(outgoingQty);
    if (!Number.isInteger(qty) || qty <= 0) {
      setOutgoingError("Outgoing quantity must be a positive integer.");
      return;
    }
    if (qty > outgoingProduct.onhandQty) {
      setOutgoingError("Outgoing quantity cannot exceed onhand quantity.");
      return;
    }
    await updateDoc(doc(db, "products", outgoingProduct.id), {
      onhandQty: increment(-qty),
    });
    await addTransaction({
      productId: outgoingProduct.id,
      productName: outgoingProduct.product,
      category: outgoingProduct.category,
      sku: outgoingProduct.sku,
      unit: outgoingProduct.unit,
      type: "Outgoing",
      qtyIn: 0,
      qtyOut: qty,
      balanceAfter: outgoingProduct.onhandQty - qty,
      reference: outgoingDestination,
      destination: outgoingDestination,
      partyName: "",
      userId: user?.uid,
      userName: user?.displayName ?? "",
      userEmail: user?.email ?? "",
    });
    await logAction(user, {
      action: `Outgoing ${outgoingProduct.product}`,
      entity: "product",
      entityId: outgoingProduct.id,
      entityName: outgoingProduct.product,
      details: { qty, destination: outgoingDestination },
    });
    setOutgoingModalOpen(false);
  };

  const saveCategory = async () => {
    setCategoryError(null);
    const trimmedName = categoryName.trim();
    if (!trimmedName) {
      setCategoryError("Category name is required.");
      return;
    }
    try {
      await addDoc(collection(db, "categories"), { name: trimmedName });
      await logAction(user, {
        action: `Added ${trimmedName}`,
        entity: "category",
        entityName: trimmedName,
      });
      setCategoryName("");
      setCategoryModalOpen(false);
    } catch {
      setCategoryError("Unable to save category. Please try again.");
    }
  };

  useEffect(() => {
    if (!ledgerOpen || !ledgerProduct) return;

    const transactionsRef = collection(db, "transactions");
    const transactionsQuery = query(
      transactionsRef,
      where("productId", "==", ledgerProduct.id),
    );
    const unsubscribe = onSnapshot(transactionsQuery, (snapshot) => {
      const entries: Array<{
        id: string;
        type: string;
        date: string;
        qtyIn: number;
        qtyOut: number;
        balance?: number;
        ref: string;
        actor: string;
      }> = [];
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data() as {
          type?: string;
          date?: string;
          qtyIn?: number;
          qtyOut?: number;
          balanceAfter?: number;
          reference?: string;
          partyName?: string;
        };
        entries.push({
          id: docSnap.id,
          type: data.type ?? "",
          date: data.date ?? "",
          qtyIn: data.qtyIn ?? 0,
          qtyOut: data.qtyOut ?? 0,
          balance: data.balanceAfter,
          ref: data.reference ?? "",
          actor: getPartyName(data.type ?? "", data.reference ?? "", data.partyName),
        });
      });

      setLedgerEntries(entries);
    });

    return () => unsubscribe();
  }, [ledgerOpen, ledgerProduct]);

  const ledgerRows = useMemo(() => {
    return [...ledgerEntries].sort((a, b) => b.date.localeCompare(a.date));
  }, [ledgerEntries]);

  const saveNotes = async () => {
    if (!notesProduct) return;
    setNotesError(null);
    try {
      await updateDoc(doc(db, "products", notesProduct.id), {
        notes: notesDraft.trim(),
      });
      setNotesPreview(notesDraft.trim());
      setNotesEditing(false);
      await logAction(user, {
        action: `Edited notes for ${notesProduct.product}`,
        entity: "product",
        entityId: notesProduct.id,
        entityName: notesProduct.product,
      });
    } catch {
      setNotesError("Unable to save notes. Please try again.");
    }
  };

  return (
    <section className="space-y-6">
      {loading && (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600 shadow-sm">
          Loading...
        </div>
      )}
      {!loading && !user && (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600 shadow-sm">
          Please sign in to view products.
        </div>
      )}
      {!loading && !user ? null : (
        <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
            Products
          </p>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">
              Manage Products
            </h1>
            <button
              type="button"
              onClick={() => setFiltersOpen((prev) => !prev)}
              className="relative inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-600 hover:border-slate-400 hover:text-slate-900"
              aria-label="Toggle filters"
              title="Toggle filters"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                <path
                  d="M4 6h16M7 12h10M10 18h4"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
              {hasActiveFilters && (
                <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-emerald-500" />
              )}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={openNewProduct}
            className="inline-flex items-baseline gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-slate-800"
          >
            <span className="relative top-[1px] inline-flex">{PlusIcon}</span>
            New Product
          </button>
          <button
            type="button"
            onClick={() => setCategoryModalOpen(true)}
            className="inline-flex items-baseline gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-slate-400"
          >
            <span className="relative top-[1px] inline-flex">{TagIcon}</span>
            New Category
          </button>
          <Link
            href="/categories"
            className="inline-flex items-baseline gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-slate-400"
          >
            <span className="relative top-[1px] inline-flex">{ListIcon}</span>
            Category List
          </Link>
        </div>
      </div>

      {filtersOpen && (
        <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
          <MultiSelect
            label="Category"
            options={categoryOptions}
            values={categoryFilter}
            onChange={setCategoryFilter}
            placeholder="All categories"
          />
          <MultiSelect
            label="Product"
            options={productOptions}
            values={productFilter}
            onChange={setProductFilter}
            placeholder="All products"
          />
          <MultiSelect
            label="SKU"
            options={skuOptions}
            values={skuFilter}
            onChange={setSkuFilter}
            placeholder="All SKUs"
          />
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <span className="text-sm font-medium text-slate-600">
            {selectedIds.length} selected
          </span>
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-500"
          >
            <span className="inline-flex">{TrashIcon}</span>
            Delete
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    className="h-4 w-4"
                    checked={Boolean(allSelected)}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">SKU</th>
                <th className="hidden px-4 py-3 md:table-cell">
                  Unit of Measure
                </th>
                <th className="hidden px-4 py-3 md:table-cell">
                  Total Quantity
                </th>
                <th className="hidden px-4 py-3 md:table-cell">
                  Onhand Quantity
                </th>
                <th className="hidden px-4 py-3 md:table-cell">Actions</th>
                <th className="px-4 py-3 pr-6 text-right md:hidden">More</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.length === 0 && (
                <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-8 text-center text-sm text-slate-500"
                    >
                      No products found.
                    </td>
                </tr>
              )}
              {pagedProducts.map((row) => (
                <React.Fragment key={row.id}>
                  <tr
                    className={`transition hover:bg-slate-50 ${
                      selectedIds.includes(row.id)
                        ? "bg-slate-50 ring-1 ring-inset ring-slate-200"
                        : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={selectedIds.includes(row.id)}
                        onChange={() => toggleOne(row.id)}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {row.category}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <button
                        type="button"
                        onClick={() => openLedger(row)}
                        className="inline-flex items-center gap-2 rounded-lg border border-sky-200 px-3 py-1 text-sm font-semibold text-sky-700 transition hover:border-sky-400 hover:text-sky-800"
                      >
                        <span className="inline-flex">{LedgerIcon}</span>
                        {row.product}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{row.sku}</td>
                    <td className="hidden px-4 py-3 text-slate-500 md:table-cell">
                      {row.unit}
                    </td>
                    <td className="hidden px-4 py-3 text-slate-500 md:table-cell">
                      {row.totalQty.toLocaleString()}
                    </td>
                    <td className="hidden px-4 py-3 text-slate-500 md:table-cell">
                      {row.onhandQty.toLocaleString()}
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <button
                        type="button"
                        onClick={() => openEditProduct(row)}
                        className={iconButton}
                        aria-label="Edit product"
                        title="Edit"
                      >
                        {EditIcon}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNotesError(null);
                          setNotesProduct(row);
                          const initialNotes = row.notes?.trim() ?? "";
                          setNotesPreview(initialNotes);
                          setNotesDraft(initialNotes);
                          setNotesEditing(false);
                          setNotesModalOpen(true);
                        }}
                        className={`${iconButton} ml-2`}
                        aria-label="View notes"
                        title="Notes"
                      >
                        {NoteIcon}
                      </button>
                      <button
                        type="button"
                        onClick={() => openIncoming(row)}
                        className={`${iconButton} ml-2`}
                        aria-label="Incoming stocks"
                        title="Incoming Stocks"
                      >
                        {IncomingIcon}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStockCardPdf(row)}
                        className={`${iconButton} ml-2`}
                        aria-label="Save stock card as PDF"
                        title="Save PDF"
                      >
                        {PdfIcon}
                      </button>
                    </td>
                    <td className="px-4 py-3 pr-6 text-right md:hidden">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedRows((prev) => ({
                            ...prev,
                            [row.id]: !prev[row.id],
                          }))
                        }
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600"
                      >
                        {expandedRows[row.id] ? "Hide" : "View"}
                      </button>
                    </td>
                  </tr>
                  {expandedRows[row.id] && (
                    <tr className="md:hidden">
                      <td colSpan={9} className="px-4 pb-4">
                        <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Unit of Measure
                            </span>
                            <span>{row.unit}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Total Qty
                            </span>
                            <span>{row.totalQty.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase text-slate-500">
                              Onhand Qty
                            </span>
                            <span>{row.onhandQty.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center gap-2 pt-2">
                            <button
                              type="button"
                              onClick={() => openEditProduct(row)}
                              className={iconButton}
                              aria-label="Edit product"
                              title="Edit"
                            >
                              {EditIcon}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setNotesError(null);
                                setNotesProduct(row);
                                const initialNotes = row.notes?.trim() ?? "";
                                setNotesPreview(initialNotes);
                                setNotesDraft(initialNotes);
                                setNotesEditing(false);
                                setNotesModalOpen(true);
                              }}
                              className={iconButton}
                              aria-label="View notes"
                              title="Notes"
                            >
                              {NoteIcon}
                            </button>
                            <button
                              type="button"
                              onClick={() => openIncoming(row)}
                              className={iconButton}
                              aria-label="Incoming stocks"
                              title="Incoming Stocks"
                            >
                              {IncomingIcon}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStockCardPdf(row)}
                              className={iconButton}
                              aria-label="Save stock card as PDF"
                              title="Save PDF"
                            >
                              {PdfIcon}
                            </button>
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
      </div>
      <TablePagination
        total={filteredProducts.length}
        page={productPage}
        pageSize={pageSize}
        showAll={productShowAll}
        onPageChange={setProductPage}
        onToggleShowAll={() => setProductShowAll((prev) => !prev)}
      />

      <Modal
        title={editingProduct ? "Edit Product" : "New Product"}
        open={productModalOpen}
        onClose={() => {
          setProductModalOpen(false);
          setProductError(null);
        }}
      >
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            saveProduct();
          }}
        >
          <label className="text-sm font-medium text-slate-700">
            Product Name
            <input
              type="text"
              value={productForm.product}
              onChange={(event) =>
                setProductForm((prev) => ({
                  ...prev,
                  product: event.target.value,
                }))
              }
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Category
            <select
              value={productForm.category}
              onChange={(event) =>
                setProductForm((prev) => ({
                  ...prev,
                  category: event.target.value,
                }))
              }
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Select category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.name}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Product Number (SKU)
            <input
              type="text"
              value={productForm.sku}
              onChange={(event) =>
                setProductForm((prev) => ({
                  ...prev,
                  sku: event.target.value,
                }))
              }
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Unit of Measure
            <input
              type="text"
              value={productForm.unit}
              onChange={(event) =>
                setProductForm((prev) => ({
                  ...prev,
                  unit: event.target.value,
                }))
              }
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Quantity
            <input
              type="number"
              value={productForm.quantity}
              readOnly={Boolean(editingProduct)}
              onChange={(event) =>
                setProductForm((prev) => ({
                  ...prev,
                  quantity: clampQtyInput(event.target.value),
                }))
              }
              min={0}
              className={`mt-2 w-full rounded-xl border px-3 py-2 text-sm ${
                editingProduct
                  ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500"
                  : "border-slate-200"
              }`}
            />
          </label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            Notes
            <textarea
              value={productForm.notes}
              onChange={(event) =>
                setProductForm((prev) => ({
                  ...prev,
                  notes: event.target.value,
                }))
              }
              className="mt-2 min-h-[100px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          {productError && (
            <p className="md:col-span-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {productError}
            </p>
          )}
          <div className="md:col-span-2 flex flex-wrap justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setProductModalOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Save
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        title="Product Notes"
        open={notesModalOpen}
        onClose={() => {
          setNotesModalOpen(false);
          setNotesEditing(false);
          setNotesError(null);
        }}
      >
        <div className="space-y-4">
          <textarea
            value={notesEditing ? notesDraft : notesPreview}
            onChange={(event) => setNotesDraft(event.target.value)}
            readOnly={!notesEditing}
            className={`min-h-[120px] w-full rounded-xl border px-4 py-3 text-sm ${
              notesEditing
                ? "border-slate-200 bg-white text-slate-700"
                : "border-slate-200 bg-slate-50 text-slate-700"
            }`}
          />
          {notesError && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {notesError}
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                if (notesEditing) {
                  void saveNotes();
                  return;
                }
                setNotesEditing(true);
              }}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              {notesEditing ? "Save" : "Edit"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        title="Incoming Stocks"
        open={incomingModalOpen}
        onClose={() => setIncomingModalOpen(false)}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            applyIncomingStock();
          }}
        >
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">
              {incomingProduct?.product ?? "Selected product"}
            </p>
            <p className="text-xs text-slate-500">
              Current Onhand: {incomingProduct?.onhandQty ?? 0} · Total:{" "}
              {incomingProduct?.totalQty ?? 0}
            </p>
          </div>
          <label className="block text-sm font-medium text-slate-700">
            QTY
            <input
              type="number"
              value={incomingQty}
              onChange={(event) => setIncomingQty(clampQtyInput(event.target.value))}
              min={0}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Source
            <select
              value={incomingSource}
              onChange={(event) => setIncomingSource(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="Restock">Restock</option>
              <option value="Returns">Returns</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            {incomingSource === "Restock" ? "Restocked by" : "Returned by"}
            <input
              type="text"
              value={incomingBy}
              onChange={(event) => setIncomingBy(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
            <p className="font-semibold">How this affects quantities</p>
            <p className="mt-1">
              Restock increases both Onhand and Total quantities.
            </p>
            <p>Returns increase Onhand only (Total stays the same).</p>
          </div>
          {incomingError && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {incomingError}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setIncomingModalOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Save
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        title="Outgoing Stocks"
        open={outgoingModalOpen}
        onClose={() => setOutgoingModalOpen(false)}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            applyOutgoingStock();
          }}
        >
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">
              {outgoingProduct?.product ?? "Selected product"}
            </p>
            <p className="text-xs text-slate-500">
              Current Onhand: {outgoingProduct?.onhandQty ?? 0}
            </p>
          </div>
          <label className="block text-sm font-medium text-slate-700">
            QTY
            <input
              type="number"
              value={outgoingQty}
              onChange={(event) => setOutgoingQty(clampQtyInput(event.target.value))}
              min={0}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Destination
            <select
              value={outgoingDestination}
              onChange={(event) => setOutgoingDestination(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="Sale">Sale</option>
              <option value="Others">Others</option>
            </select>
          </label>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
            <p className="font-semibold">How this affects quantities</p>
            <p className="mt-1">Outgoing reduces Onhand quantity only.</p>
          </div>
          {outgoingError && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {outgoingError}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setOutgoingModalOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Save
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        title={`Product Card (${ledgerProduct?.product ?? ""})`}
        open={ledgerOpen}
        onClose={() => setLedgerOpen(false)}
      >
        <div className="space-y-3">
          {ledgerEntries.length === 0 && (
            <p className="text-sm text-slate-500">No ledger entries yet.</p>
          )}
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2 text-right">In</th>
                  <th className="px-3 py-2 text-right">Out</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                  <th className="px-3 py-2">Restocked/Returned by</th>
                  <th className="px-3 py-2">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledgerRows.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-3 py-2 text-slate-600">{entry.date}</td>
                    <td className="px-3 py-2 text-slate-700">{entry.type}</td>
                    <td className="px-3 py-2 text-right text-emerald-600">
                      {entry.qtyIn || ""}
                    </td>
                    <td className="px-3 py-2 text-right text-rose-600">
                      {entry.qtyOut || ""}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">
                      {entry.balance ?? "-"}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {entry.actor || "-"}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{entry.ref}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      <Modal
        title="Confirm Delete"
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
      >
        <div className="space-y-4 text-sm text-slate-700">
          <p>
            Delete {selectedIds.length} selected product
            {selectedIds.length === 1 ? "" : "s"}? This action cannot be undone.
          </p>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setConfirmDeleteOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={deleteSelectedProducts}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
            >
              <span className="inline-flex">{TrashIcon}</span>
              Delete
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        title="New Category"
        open={categoryModalOpen}
        onClose={() => {
          setCategoryModalOpen(false);
          setCategoryError(null);
        }}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            saveCategory();
          }}
        >
          <label className="block text-sm font-medium text-slate-700">
            Category Name
            <input
              type="text"
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          {categoryError && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {categoryError}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setCategoryModalOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Save
            </button>
          </div>
        </form>
      </Modal>
        </>
      )}
    </section>
  );
}
