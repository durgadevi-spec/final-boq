import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
} from "lucide-react";

import { Layout } from "@/components/layout/Layout";
import apiFetch from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useData } from "@/lib/store";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type SelectedMaterial = {
  materialId: string;
  selectedShopId: string;
  selectedBrand?: string;
};

type EditableMaterial = {
  quantity: number;
  supplyRate: number;
  installRate: number;
};

type SavedBoq = {
  id: string;
  name?: string;
  created_at?: string;
};

const ctintLogo = "/image.png";

export default function DynamicEstimator() {
  const [, params] = useRoute("/estimators/:subcategory");
  const [, navigate] = useLocation();
  const subcategoryParam = params?.subcategory
    ? decodeURIComponent(params.subcategory)
    : "";

  const { shops: storeShops, materials: storeMaterials, products: storeProducts } =
    useData();
  const { toast } = useToast();

  // --- Core states ---
  const [step, setStep] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [selectedProductObj, setSelectedProductObj] = useState<any>(null);

  const [finalBillNo, setFinalBillNo] = useState(
    `${subcategoryParam.toUpperCase().slice(0, 3)}-${Math.floor(
      1000 + Math.random() * 9000,
    )}`,
  );
  const [finalBillDate, setFinalBillDate] = useState(
    new Date().toISOString().slice(0, 10),
  );

  // Step 10 fields (Door estimator style)
  const [finalDueDate, setFinalDueDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
  const [finalCustomerName, setFinalCustomerName] = useState("");
  const [finalCustomerAddress, setFinalCustomerAddress] = useState("");
  const [finalTerms, setFinalTerms] = useState(
    "1. Payment Terms: 50% advance, 50% on completion",
  );

  // Selection states
  const [selectedMaterials, setSelectedMaterials] = useState<SelectedMaterial[]>(
    [],
  );
  const [editableMaterials, setEditableMaterials] = useState<
    Record<string, EditableMaterial>
  >({});
  const [materialDescriptions, setMaterialDescriptions] = useState<
    Record<string, string>
  >({});
  const [materialLocations, setMaterialLocations] = useState<Record<string, string>>(
    {},
  );

  // Step 9/11 (Door estimator style selection)
  const [selectedForDelete, setSelectedForDelete] = useState<string[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>("");

  const [savedBoqs, setSavedBoqs] = useState<SavedBoq[]>([]);
  const lastBoqErrorRef = useRef<string>("");

  // Step 11 DB result list
  const [step11Items, setStep11Items] = useState<any[]>([]);
  const [loadingStep11, setLoadingStep11] = useState(false);

  const subcategoryKey = subcategoryParam.toLowerCase();
  const estimatorKey = subcategoryKey.replace(/[-\s]/g, "");

  const groupId = useMemo(() => {
    const raw =
      selectedProductObj?.id ||
      selectedProductObj?.name ||
      selectedProduct ||
      "product";
    return `group_${String(raw).replace(/\s+/g, "_").toLowerCase()}`;
  }, [selectedProduct, selectedProductObj]);

  // ===== Data helpers =====
  const filteredProducts = useMemo(() => {
    const normalize = (s: any) =>
      String(s || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, " ")
        .trim();

    const normalizeCompact = (s: any) =>
      String(s || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "")
        .trim();

    const subcatNormalized = normalize(subcategoryParam);
    const subcatCompact = normalizeCompact(subcategoryParam);

    // Filter by subcategory first
    const matched = (storeProducts || []).filter((p: any) => {
      const subcatFromDB = normalize(p.subcategory || p.subcategory_name || "");
      const subcatFromDBCompact = normalizeCompact(p.subcategory || p.subcategory_name || "");

      return (
        subcatFromDB === subcatNormalized ||
        subcatFromDB.includes(subcatNormalized) ||
        subcatNormalized.includes(subcatFromDB) ||
        subcatFromDBCompact === subcatCompact ||
        subcatFromDBCompact.includes(subcatCompact) ||
        subcatCompact.includes(subcatFromDBCompact)
      );
    });

    // Deduplicate products by normalized name (handles duplicate rows from API/joins)
    const map = new Map<string, any>();
    matched.forEach((p: any) => {
      const key = normalizeCompact(p.name || p.product || p.title || "");
      if (!map.has(key)) map.set(key, p);
    });

    return Array.from(map.values());
  }, [storeProducts, subcategoryParam]);

  const getProductMaterials = (productName: string) => {
    if (!productName) return [];
    const normalize = (s: any) =>
      String(s || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, " ")
        .trim();

    const normalizeCompact = (s: any) =>
      String(s || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "")
        .trim();

    const normalized = normalize(productName);
    const normalizedCompact = normalizeCompact(productName);
    const matched = (storeMaterials || []).filter((m: any) => {
      const prodName = normalize(m.product || "");
      const prodNameCompact = normalizeCompact(m.product || "");
      const subcatName = normalize(m.subCategory || "");
      const subcatNameCompact = normalizeCompact(m.subCategory || "");
      return (
        prodName === normalized ||
        prodName.includes(normalized) ||
        prodNameCompact === normalizedCompact ||
        prodNameCompact.includes(normalizedCompact) ||
        subcatName === normalized ||
        subcatName.includes(normalized) ||
        subcatNameCompact === normalizedCompact ||
        subcatNameCompact.includes(normalizedCompact)
      );
    });

    // Deduplicate materials by normalized name/code so each material appears once per product
    const dedupe = new Map<string, any>();
    matched.forEach((m: any) => {
      const key = normalizeCompact(m.name || m.code || m.product || m.id);
      if (!dedupe.has(key)) dedupe.set(key, m);
    });

    return Array.from(dedupe.values());
  };

  const selectedMaterialObjects = useMemo(() => {
    if (!selectedProduct) return [];

    return getProductMaterials(selectedProduct)
      .filter((m: any) => selectedMaterials.some((sm) => sm.materialId === m.id))
      .map((m: any) => {
        const sel = selectedMaterials.find((sm) => sm.materialId === m.id);
        const shop = (storeShops || []).find((s: any) => s.id === sel?.selectedShopId);

        const qty = editableMaterials[m.id]?.quantity ?? 1;
        const supplyRate = editableMaterials[m.id]?.supplyRate ?? m.rate ?? 0;

        return {
          ...m,
          quantity: qty,
          supplyRate,
          installRate: editableMaterials[m.id]?.installRate ?? 0,
          shopName: shop?.name || "Market",
          shopId: sel?.selectedShopId || "",
          brandName: sel?.selectedBrand || m.brandName || "Generic",
        };
      });
  }, [editableMaterials, selectedMaterials, selectedProduct, storeMaterials, storeShops]);

  const supplySubtotal = useMemo(() => {
    return selectedMaterialObjects.reduce((sum: number, m: any) => {
      const q = Number(editableMaterials[m.id]?.quantity ?? m.quantity ?? 0);
      const r = Number(editableMaterials[m.id]?.supplyRate ?? m.supplyRate ?? 0);
      return sum + q * r;
    }, 0);
  }, [editableMaterials, selectedMaterialObjects]);

  const installSubtotal = useMemo(() => {
    return selectedMaterialObjects.reduce((sum: number, m: any) => {
      const q = Number(editableMaterials[m.id]?.quantity ?? m.quantity ?? 0);
      const r = Number(editableMaterials[m.id]?.installRate ?? m.installRate ?? 0);
      return sum + q * r;
    }, 0);
  }, [editableMaterials, selectedMaterialObjects]);

  const totalCost = supplySubtotal + installSubtotal;

  const groupQty = useMemo(() => {
    const q = editableMaterials[groupId]?.quantity;
    return Number.isFinite(q) ? Number(q) : 1;
  }, [editableMaterials, groupId]);

  const groupSupplyRate = useMemo(() => {
    const qty = Math.max(1, groupQty || 1);
    return supplySubtotal / qty;
  }, [groupQty, supplySubtotal]);

  const groupInstallRate = useMemo(() => {
    const qty = Math.max(1, groupQty || 1);
    return installSubtotal / qty;
  }, [groupQty, installSubtotal]);

  // ===== Saved BOQs (Door estimator UI) =====
  const fetchSavedBoqs = async () => {
    try {
      const res = await apiFetch("/api/boq");

      if (res.status === 401) {
        setSavedBoqs([]);
        if (lastBoqErrorRef.current !== "401") {
          lastBoqErrorRef.current = "401";
          toast({
            title: "Unauthorized",
            description: "Your session has expired. Please login again.",
            variant: "destructive",
          });
        }
        return;
      }

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`failed to fetch boqs: ${txt || res.status}`);
      }

      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        setSavedBoqs([]);
        return;
      }

      const data = await res.json();
      setSavedBoqs(data.boqs || []);
      lastBoqErrorRef.current = "";
    } catch (err: any) {
      const msg = String(err?.message || err || "");
      if (msg && lastBoqErrorRef.current !== msg) {
        lastBoqErrorRef.current = msg;
        console.warn("fetchSavedBoqs", err);
      }
      setSavedBoqs([]);
    }
  };

  useEffect(() => {
    if (step === 9) void fetchSavedBoqs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ===== Step 11 loader =====
  useEffect(() => {
    if (finalBillNo && step >= 11) void loadStep11Data();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalBillNo, step]);

  const loadStep11Data = async () => {
    try {
      setLoadingStep11(true);
      const res = await apiFetch(
        `/api/estimator-step11-groups?session_id=${finalBillNo}&estimator=${estimatorKey}`,
        { headers: {} },
      );
      if (res.ok) {
        const data = await res.json();
        setStep11Items(data.items || []);
      }
    } catch (err) {
      console.warn("load step11 failed", err);
    } finally {
      setLoadingStep11(false);
    }
  };

  // ===== Step 9 actions (Door estimator UI) =====
  const toggleSelectAllStep9 = (checked: boolean) => {
    if (!checked) {
      setSelectedForDelete([]);
      return;
    }
    const ids = [groupId, ...selectedMaterialObjects.map((m: any) => m.id)];
    setSelectedForDelete(ids);
  };
    
  const handleDeleteSelectedStep9 = () => {
    if (selectedForDelete.length === 0) return;

    // If group selected: wipe everything
    if (selectedForDelete.includes(groupId)) {
      setSelectedMaterials([]);
      setEditableMaterials((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => delete next[k]);
        return next;
      });
      setMaterialDescriptions({});
      setMaterialLocations({});
      setSelectedForDelete([]);
      return;   
    }

    // Otherwise delete only material rows
    setSelectedMaterials((prev) =>
      prev.filter((sm) => !selectedForDelete.includes(sm.materialId)),
    );

    setEditableMaterials((prev) => {
      const next = { ...prev };
      selectedForDelete.forEach((id) => delete next[id]);
      return next;
    });

    setMaterialDescriptions((prev) => {
      const next = { ...prev };
      selectedForDelete.forEach((id) => delete next[id]);
      return next;
    });

    setMaterialLocations((prev) => {
      const next = { ...prev };
      selectedForDelete.forEach((id) => delete next[id]);
      return next;
    });

    setSelectedForDelete([]);
  };

  // ===== Step 9 save (items) =====
  const handleSaveStep9 = async () => {
    try {
      if (!finalBillNo.trim()) {
        toast({
          title: "Error",
          description: "Please enter a Bill No.",
          variant: "destructive",
        });
        return;
      }

      const items = selectedMaterialObjects.map((m: any, idx: number) => ({
        session_id: finalBillNo,
        estimator: subcategoryKey,
        s_no: idx + 1,
        material_id: m.id,
        name: m.name,
        unit: m.unit || "pcs",
        quantity: Number(editableMaterials[m.id]?.quantity ?? m.quantity ?? 0),
        supply_rate: Number(editableMaterials[m.id]?.supplyRate ?? m.supplyRate ?? 0),
        install_rate: Number(editableMaterials[m.id]?.installRate ?? m.installRate ?? 0),
        shop_id: m.shopId || "",
        shop_name: m.shopName || "",
        description: materialDescriptions[m.id] || "",
        location: materialLocations[m.id] || "",
        group_id: groupId,
        group_name: selectedProduct || selectedProductObj?.name || "",
        group_qty: groupQty,
        group_description: materialDescriptions[groupId] || "",
      }));

      const res = await apiFetch("/api/estimator-step9-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimator: subcategoryKey,
          session_id: finalBillNo,
          items,
        }),
      });

      if (!res.ok) throw new Error("Save failed");

      toast({ title: "Success", description: "Saved." });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to save.",
        variant: "destructive",
      });
    }
  };

  // ===== Export PDF (same behavior as DoorsEstimator) =====
  const handleExportPDF = async (elementId: string, filename: string) => {
    const element = document.getElementById(elementId);
    if (!element) {
      toast({
        title: "Error",
        description: "PDF content not found",
        variant: "destructive",
      });
      return;
    }

    try {
      const html2pdf = (await import("html2pdf.js")).default;
      html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: "#ffffff",
            ignoreElements: (el: HTMLElement) =>
              el.className?.toString().includes("bg-") ||
              el.className?.toString().includes("text-"),
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(element)
        .save();
    } catch (err) {
      console.error("PDF Export Error:", err);
      toast({
        title: "Error",
        description: "PDF export failed. Check console.",
        variant: "destructive",
      });
    }
  };

  // ===== Step 11 save (groups) =====
  const handleSaveStep11 = async () => {
    try {
      setLoadingStep11(true);

      const group = {
        estimator: estimatorKey,
        session_id: finalBillNo,
        s_no: 1,
        group_key: `${subcategoryKey}_${groupId}`,
        group_id: groupId,
        item_name: selectedProduct || selectedProductObj?.name || "Product",
        unit: "pcs",
        quantity: groupQty,
        location: materialLocations[groupId] || "",
        description: materialDescriptions[groupId] || "",
        supply_rate: groupSupplyRate,
        install_rate: groupInstallRate,
        supply_amount: groupQty * groupSupplyRate,
        install_amount: groupQty * groupInstallRate,
        supply_subtotal: supplySubtotal,
        install_subtotal: installSubtotal,
        sgst: totalCost * 0.09,
        cgst: totalCost * 0.09,
        round_off: 0,
        grand_total: totalCost,
      };

      const res = await apiFetch("/api/estimator-step11-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups: [group] }),
      });

      if (!res.ok) throw new Error("Save failed");

      await loadStep11Data();
      toast({ title: "Success", description: "Saved." });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to save.",
        variant: "destructive",
      });
    } finally {
      setLoadingStep11(false);
    }
  };

  const resetForNewEstimate = () => {
    setStep(1);
    setSelectedProduct("");
    setSelectedProductObj(null);
    setSelectedMaterials([]);
    setEditableMaterials({});
    setMaterialDescriptions({});
    setMaterialLocations({});
    setSelectedForDelete([]);
    setSelectedMaterialId("");
    setStep11Items([]);
    setFinalBillNo(
      `${subcategoryParam.toUpperCase().slice(0, 3)}-${Math.floor(
        1000 + Math.random() * 9000,
      )}`,
    );
    setFinalBillDate(new Date().toISOString().slice(0, 10));
  };

  if (!subcategoryParam) {
    return (
      <Layout>
        <div className="p-6 text-center">
          <p className="text-red-600">Subcategory not found</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto p-4 space-y-6">
        <div>
          <h1 className="text-3xl font-bold capitalize">
            {subcategoryParam} Estimator
          </h1>
          <p className="text-gray-600 mt-1">Complete workflow: Steps 1-11</p>
        </div>

        <AnimatePresence mode="wait">
          {/* Step 1: Select Product */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <h2 className="text-xl font-semibold">Step 1: Select Product</h2>
              {filteredProducts.length === 0 ? (
                <Card className="p-6 bg-yellow-50 border-yellow-200">
                  <p className="text-center text-yellow-800">
                    No products found for this sub-category in the database.
                  </p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredProducts.map((product: any) => (
                    <Card
                      key={product.id}
                      className={cn(
                        "cursor-pointer border-2 hover:border-primary transition-all",
                        selectedProduct === product.name
                          ? "border-primary bg-blue-50"
                          : "border-gray-200",
                      )}
                      onClick={() => {
                        setSelectedProduct(product.name);
                        setSelectedProductObj(product);
                        setSelectedMaterials([]);
                        setEditableMaterials({});
                        setMaterialDescriptions({});
                        setMaterialLocations({});
                        setSelectedForDelete([]);
                        setSelectedMaterialId("");
                      }}
                    >
                      <CardContent className="p-4">
                        <p className="font-semibold text-lg">{product.name}</p>
                        <p className="text-sm text-gray-600 mt-1">
                          {getProductMaterials(product.name).length} materials
                          available
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              <div className="flex justify-end gap-2 mt-6">
                <Button onClick={() => navigate("/estimators")} variant="outline">
                  Cancel
                </Button>
                <Button disabled={!selectedProduct} onClick={() => setStep(2)}>
                  Next <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 2: Select Materials & Shops */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <h2 className="text-xl font-semibold">
                Select Materials & Shops
              </h2>
              <p className="text-sm text-gray-600">
                Available materials for {selectedProduct}. Best price shop is
                pre-selected.
              </p>

              {/* Select All / Deselect All */}
              <div className="flex items-center gap-2 p-3 border rounded bg-blue-50">
                <Checkbox
                  checked={selectedMaterials.length === getProductMaterials(selectedProduct).length && selectedMaterials.length > 0}
                  indeterminate={selectedMaterials.length > 0 && selectedMaterials.length < getProductMaterials(selectedProduct).length}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      // Select all materials
                      const normalize = (s: any) =>
                        String(s || "")
                          .toUpperCase()
                          .replace(/[^A-Z0-9]+/g, " ")
                          .trim();

                      const allMaterials = getProductMaterials(selectedProduct);
                      const newSelections = allMaterials.map((material: any) => {
                        // Find the cheapest variant for best shop pre-selection
                        const variantMaterials = (storeMaterials || []).filter(
                          (m: any) =>
                            normalize(m.product || "") === normalize(material.product || "") &&
                            normalize(m.name || "") === normalize(material.name || "")
                        );
                        const bestVariant = variantMaterials.sort(
                          (a: any, b: any) => (a.rate || 0) - (b.rate || 0)
                        )[0];

                        return {
                          materialId: material.id,
                          selectedShopId: bestVariant?.shopId || "",
                          selectedBrand: material.brandName || "Generic",
                        };
                      });
                      setSelectedMaterials(newSelections);
                    } else {
                      // Deselect all
                      setSelectedMaterials([]);
                    }
                  }}
                />
                <Label className="text-sm font-medium">
                  Select All Materials
                </Label>
              </div>

              <div className="grid grid-cols-1 gap-3 max-h-[600px] overflow-y-auto p-3 border rounded bg-gray-50">
                {getProductMaterials(selectedProduct).map((material: any) => {
                  const isSelected = selectedMaterials.some(
                    (sm) => sm.materialId === material.id,
                  );

                  return (
                    <div
                      key={material.id}
                      className={cn(
                        "p-4 border-2 rounded-lg transition-all",
                        isSelected
                          ? "border-blue-500 bg-white"
                          : "border-gray-200 bg-white",
                      )}
                    >
                      <div className="flex items-start gap-4">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => {
                            if (isSelected) {
                              setSelectedMaterials((prev) =>
                                prev.filter((sm) => sm.materialId !== material.id),
                              );
                            } else {
                              // Find all material variants (same product/name, different brands/shops)
                              const normalize = (s: any) =>
                                String(s || "")
                                  .toUpperCase()
                                  .replace(/[^A-Z0-9]+/g, " ")
                                  .trim();

                              const variantMaterials = (storeMaterials || []).filter(
                                (m: any) =>
                                  normalize(m.product || "") === normalize(material.product || "") &&
                                  normalize(m.name || "") === normalize(material.name || "")
                              );

                              // Get the cheapest variant to pre-select shop
                              const bestVariant = variantMaterials.sort(
                                (a: any, b: any) => (a.rate || 0) - (b.rate || 0)
                              )[0];

                              setSelectedMaterials((prev) => [
                                ...prev,
                                {
                                  materialId: material.id,
                                  selectedShopId: bestVariant?.shopId || "",
                                  selectedBrand: material.brandName || "Generic",
                                },
                              ]);

                              setEditableMaterials((prev) => ({
                                ...prev,
                                [material.id]: {
                                  quantity: 1,
                                  supplyRate: material.rate || 0,
                                  installRate: 0,
                                },
                                [groupId]: prev[groupId] || {
                                  quantity: 1,
                                  supplyRate: 0,
                                  installRate: 0,
                                },
                              }));
                            }
                          }}
                        />

                        <div className="flex-1">
                          <p className="font-semibold">{material.name}</p>
                          <p className="text-xs text-gray-600">{material.code}</p>

                          {isSelected && (
                            <div className="mt-3 space-y-3">
                              <div>
                                <Label className="text-xs">Select Brand</Label>
                                <Select
                                  value={
                                    selectedMaterials.find(
                                      (sm) => sm.materialId === material.id,
                                    )?.selectedBrand || "Generic"
                                  }
                                  onValueChange={(brand) => {
                                    setSelectedMaterials((prev) =>
                                      prev.map((sm) =>
                                        sm.materialId === material.id
                                          ? { ...sm, selectedBrand: brand }
                                          : sm,
                                      ),
                                    );
                                  }}
                                >
                                  <SelectTrigger className="h-9 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(() => {
                                      // derive unique brands from variants for this material
                                      const normalize = (s: any) =>
                                        String(s || "").trim();

                                      const variantMaterials = (storeMaterials || []).filter(
                                        (m: any) =>
                                          normalize(m.product || "") === normalize(material.product || "") &&
                                          normalize(m.name || "") === normalize(material.name || "")
                                      );

                                      const brandMap = new Map<string, string>();
                                      variantMaterials.forEach((m: any) => {
                                        const b = m.brandName || "Generic";
                                        const key = String(b).toUpperCase().trim();
                                        if (!brandMap.has(key)) brandMap.set(key, b);
                                      });

                                      const brands = Array.from(brandMap.values());
                                      if (brands.length === 0) brands.push("Generic");

                                      return brands.map((b: string) => (
                                        <SelectItem key={b} value={b}>
                                          {b}
                                        </SelectItem>
                                      ));
                                    })()}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div>
                                <Label className="text-xs">Select Shop</Label>
                                <Select
                                  value={
                                    selectedMaterials.find(
                                      (sm) => sm.materialId === material.id,
                                    )?.selectedShopId || ""
                                  }
                                  onValueChange={(shopId) => {
                                    setSelectedMaterials((prev) =>
                                      prev.map((sm) =>
                                        sm.materialId === material.id
                                          ? { ...sm, selectedShopId: shopId }
                                          : sm,
                                      ),
                                    );
                                  }}
                                >
                                  <SelectTrigger className="h-9 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(() => {
                                      // Get all materials matching this product/name
                                      const normalize = (s: any) =>
                                        String(s || "")
                                          .toUpperCase()
                                          .replace(/[^A-Z0-9]+/g, " ")
                                          .trim();

                                      const variantMaterials = (storeMaterials || []).filter(
                                        (m: any) =>
                                          normalize(m.product || "") === normalize(material.product || "") &&
                                          normalize(m.name || "") === normalize(material.name || "")
                                      );

                                      // Get selected brand for this material
                                      const selectedBrand =
                                        selectedMaterials.find((sm) => sm.materialId === material.id)
                                          ?.selectedBrand || "Generic";

                                      // Filter variants by brand and map to shop options
                                      const shopOptions = variantMaterials
                                        .filter((m: any) => (m.brandName || "Generic") === selectedBrand)
                                        .map((m: any) => ({
                                          shopId: m.shopId,
                                          rate: m.rate,
                                          shopName:
                                            (storeShops || []).find((s: any) => s.id === m.shopId)
                                              ?.name || "Unknown",
                                        }))
                                        .filter((s: any) => s.shopId); // Remove undefined shopIds

                                      // Deduplicate by shopId (keep first/cheapest)
                                      const uniqueShops = Array.from(
                                        new Map(
                                          shopOptions.map((s: any) => [s.shopId, s])
                                        ).values()
                                      );

                                      return uniqueShops.map((shop: any) => (
                                        <SelectItem key={shop.shopId} value={shop.shopId}>
                                          {shop.shopName} — ₹{shop.rate}
                                        </SelectItem>
                                      ));
                                    })()}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between mt-6">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button
                  disabled={selectedMaterials.length === 0}
                  onClick={() => setStep(7)}
                >
                  Next <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 7: Selected Materials Review */}
          {step === 7 && (
            <motion.div
              key="step7"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-xl border p-8">
                <h2 className="text-2xl font-semibold mb-1">Selected Materials</h2>
                <p className="text-sm text-muted-foreground mb-8">
                  Edit quantities or rates before generating BOQ.
                </p>

                <div className="grid grid-cols-8 gap-4 text-sm text-muted-foreground mb-3">
                  <div className="col-span-2">Item</div>
                  <div className="text-center">Brand</div>
                  <div className="text-center">Qty</div>
                  <div className="text-center">Unit</div>
                  <div className="text-center">Shop</div>
                  <div className="text-center">Rate (₹)</div>
                  <div className="text-right">Amount (₹)</div>
                </div>

                <div className="space-y-4">
                  {selectedMaterialObjects.map((mat: any) => {
                    const qty = Number(editableMaterials[mat.id]?.quantity ?? mat.quantity ?? 0);
                    const rate = Number(editableMaterials[mat.id]?.supplyRate ?? mat.supplyRate ?? 0);
                    const amount = qty * rate;

                    return (
                      <div
                        key={mat.id}
                        className="grid grid-cols-8 gap-4 items-center border rounded-xl p-4"
                      >
                        <div className="col-span-2 font-medium">{mat.name}</div>

                        <div className="text-center font-semibold">
                          {mat.brandName || "Generic"}
                        </div>

                        <div className="text-center">
                          <Input
                            type="number"
                            value={qty}
                            onChange={(e) =>
                              setEditableMaterials((prev) => ({
                                ...prev,
                                [mat.id]: {
                                  ...prev[mat.id],
                                  quantity: Number(e.target.value || 0),
                                },
                              }))
                            }
                            className="w-24 mx-auto"
                          />
                        </div>

                        <div className="text-center text-muted-foreground">
                          {mat.unit || "pcs"}
                        </div>

                        <div className="text-center font-semibold">
                          {mat.shopName || "-"}
                        </div>

                        <div className="text-center">
                          <Input
                            type="number"
                            value={rate}
                            onChange={(e) =>
                              setEditableMaterials((prev) => ({
                                ...prev,
                                [mat.id]: {
                                  ...prev[mat.id],
                                  supplyRate: Number(e.target.value || 0),
                                },
                              }))
                            }
                            className="w-28 mx-auto"
                          />
                        </div>

                        <div className="text-right font-semibold">₹{amount.toFixed(2)}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-between mt-10">
                  <Button variant="outline" onClick={() => setStep(2)}>
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={() => setStep(8)}
                    disabled={selectedMaterialObjects.length === 0}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Next: Generate BOM <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 8: BOM */}
          {step === 8 && (
            <motion.div
              key="step8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <div className="text-center space-y-2">
                <div
                  style={{
                    width: 64,
                    height: 64,
                    backgroundColor: "rgba(34,197,94,0.1)",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    margin: "0 auto",
                    color: "#22c55e",
                  }}
                >
                  <CheckCircle2 style={{ width: 32, height: 32 }} />
                </div>
                <h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                  Bill of Materials (BOM)
                </h2>
                <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                  Generated on {new Date().toLocaleDateString()}
                </p>
              </div>

              <div
                id="boq-pdf"
                style={{
                  backgroundColor: "#ffffff",
                  color: "#000000",
                  fontFamily: "Arial, sans-serif",
                  padding: 16,
                }}
              >
                <div
                  style={{
                    border: "1px solid #d1d5db",
                    borderRadius: 8,
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, 1fr)",
                      gap: 16,
                      padding: 16,
                      fontSize: "0.875rem",
                    }}
                  >
                    <div>
                      <p style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                        PRODUCT TYPE
                      </p>
                      <p style={{ fontWeight: 600 }}>{selectedProduct || "Product"}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                        TOTAL ITEMS
                      </p>
                      <p style={{ fontWeight: 600 }}>
                        {selectedMaterialObjects.length} Materials
                      </p>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    border: "1px solid #d1d5db",
                    borderRadius: 8,
                    marginBottom: 16,
                    overflow: "hidden",
                  }}
                >
                  <div style={{ padding: 16 }}>
                    <h3 style={{ fontWeight: 600, marginBottom: 8 }}>
                      Materials Schedule
                    </h3>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: "0.875rem",
                      }}
                    >
                      <thead style={{ backgroundColor: "#f3f4f6" }}>
                        <tr>
                          {[
                            "S.No",
                            "Description",
                            "Unit",
                            "Qty",
                            "Rate (₹)",
                            "Supplier",
                            "Amount (₹)",
                          ].map((h) => (
                            <th
                              key={h}
                              style={{
                                border: "1px solid #d1d5db",
                                padding: 8,
                                textAlign:
                                  h === "Qty" ||
                                  h.includes("Rate") ||
                                  h.includes("Amount")
                                    ? "right"
                                    : "left",
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {selectedMaterialObjects.map((mat: any, index: number) => {
                          const qty = Number(editableMaterials[mat.id]?.quantity ?? mat.quantity ?? 0);
                          const rate = Number(editableMaterials[mat.id]?.supplyRate ?? mat.supplyRate ?? 0);
                          return (
                            <tr key={mat.id}>
                              <td style={{ border: "1px solid #d1d5db", padding: 8 }}>
                                {index + 1}
                              </td>
                              <td style={{ border: "1px solid #d1d5db", padding: 8 }}>
                                {mat.name}
                              </td>
                              <td
                                style={{
                                  border: "1px solid #d1d5db",
                                  padding: 8,
                                  textAlign: "center",
                                }}
                              >
                                {mat.unit || "pcs"}
                              </td>
                              <td
                                style={{
                                  border: "1px solid #d1d5db",
                                  padding: 8,
                                  textAlign: "right",
                                }}
                              >
                                {qty}
                              </td>
                              <td
                                style={{
                                  border: "1px solid #d1d5db",
                                  padding: 8,
                                  textAlign: "right",
                                }}
                              >
                                {rate.toFixed(2)}
                              </td>
                              <td style={{ border: "1px solid #d1d5db", padding: 8 }}>
                                {mat.shopName || "Market"}
                              </td>
                              <td
                                style={{
                                  border: "1px solid #d1d5db",
                                  padding: 8,
                                  textAlign: "right",
                                  fontWeight: 600,
                                }}
                              >
                                {(qty * rate).toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div
                  style={{
                    border: "1px solid #d1d5db",
                    borderRadius: 8,
                    padding: 16,
                    display: "flex",
                    justifyContent: "space-between",
                    backgroundColor: "#eff6ff",
                  }}
                >
                  <div>
                    <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                      Total Materials
                    </p>
                    <p style={{ fontWeight: 600 }}>{selectedMaterialObjects.length}</p>
                  </div>

                  <div>
                    <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                      Total Quantity
                    </p>
                    <p style={{ fontWeight: 600 }}>
                      {selectedMaterialObjects.reduce(
                        (s: number, m: any) =>
                          s + Number(editableMaterials[m.id]?.quantity ?? m.quantity ?? 0),
                        0,
                      )}
                    </p>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                      Grand Total
                    </p>
                    <p style={{ fontSize: "1.5rem", fontWeight: 700, color: "#1d4ed8" }}>
                      ₹{totalCost.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Door estimator buttons row */}
              <div className="flex flex-wrap gap-4 justify-center pt-4">
                <Button onClick={() => setStep(7)} variant="outline" className="px-8">
                  Back
                </Button>

                <button
                  onClick={() => handleExportPDF("boq-pdf", `BOM-${finalBillNo}.pdf`)}
                  className="flex items-center gap-2 bg-blue-500 text-white font-semibold px-6 py-2 rounded-lg shadow hover:bg-blue-600 transition"
                >
                  <Download className="w-5 h-5 rotate-12" />
                  Export PDF
                </button>

                <Button
                  onClick={() => setStep(9)}
                  className="bg-blue-600 hover:bg-blue-700 px-8"
                >
                  Add to BOM <ChevronRight className="ml-2 h-4 w-4" />
                </Button>

                <Button
                  variant="secondary"
                  className="px-8"
                  onClick={resetForNewEstimate}
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  New Estimate
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 9: Add to BOQ (exact Door estimator layout: group row + item rows) */}
          {step === 9 && (
            <motion.div
              key="step-add-to-boq"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-xl border p-8 space-y-6">
                <div className="flex items-start justify-between">
                  <h2 className="text-2xl font-semibold">Add to BOQ</h2>
                  <div className="flex gap-3">
                    <Button
                      variant="destructive"
                      onClick={handleDeleteSelectedStep9}
                      disabled={selectedForDelete.length === 0}
                      className="bg-red-300 hover:bg-red-400 text-white"
                    >
                      Delete Selected
                    </Button>

                    <Button
                      onClick={handleSaveStep9}
                      className="bg-blue-600 hover:bg-blue-700"
                      disabled={selectedMaterialObjects.length === 0}
                    >
                      Save
                    </Button>

                    <Button
                      onClick={() => setStep(11)}
                      className="bg-blue-600 hover:bg-blue-700"
                      disabled={selectedMaterialObjects.length === 0}
                    >
                      Add to BOQ
                    </Button>
                  </div>
                </div>

                <div>
                  <div className="font-semibold">Saved BOQs</div>
                  <div className="text-sm text-muted-foreground">
                    {savedBoqs.length === 0 ? "No saved BOQs" : ""}
                  </div>
                </div>

                <div className="overflow-x-auto border rounded-lg">
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="border px-2 py-2">
                          <Checkbox
                            id="select-all"
                            checked={(() => {
                              const ids = [groupId, ...selectedMaterialObjects.map((m: any) => m.id)];
                              return ids.length > 0 && selectedForDelete.length === ids.length;
                            })()}
                            onCheckedChange={(v) => toggleSelectAllStep9(Boolean(v))}
                          />
                        </th>
                        <th className="border px-2 py-2">S.No</th>
                        <th className="border px-2 py-2">Item</th>
                        <th className="border px-2 py-2">Description</th>
                        <th className="border px-2 py-2">Unit</th>
                        <th className="border px-2 py-2">Qty</th>
                        <th className="border px-2 py-2 text-right">Rate</th>
                        <th className="border px-2 py-2 text-right">Amount</th>
                      </tr>
                    </thead>

                    <tbody>
                      {/* GROUP ROW (product) */}
                      <tr>
                        <td className="border px-2 py-2">
                          <Checkbox
                            checked={selectedForDelete.includes(groupId)}
                            onCheckedChange={(v) => {
                              const next = Boolean(v);
                              setSelectedForDelete((prev) =>
                                next
                                  ? Array.from(new Set([...prev, groupId]))
                                  : prev.filter((x) => x !== groupId),
                              );
                            }}
                          />
                        </td>

                        <td className="border px-2 py-2 text-center"></td>

                        <td className="border px-2 py-2">
                          <strong>{selectedProduct || selectedProductObj?.name || "Product"}</strong>
                        </td>

                        <td className="border px-2 py-2">
                          <Input
                            placeholder="Group description"
                            value={materialDescriptions[groupId] || ""}
                            onChange={(e) =>
                              setMaterialDescriptions((prev) => ({
                                ...prev,
                                [groupId]: e.target.value,
                              }))
                            }
                          />
                        </td>

                        <td className="border px-2 py-2">
                          <Input className="w-20" value="pcs" readOnly />
                        </td>

                        <td className="border px-2 py-2">
                          <Input
                            type="number"
                            className="w-28"
                            value={groupQty}
                            onChange={(e) =>
                              setEditableMaterials((prev) => ({
                                ...prev,
                                [groupId]: {
                                  ...(prev[groupId] || {
                                    quantity: 1,
                                    supplyRate: 0,
                                    installRate: 0,
                                  }),
                                  quantity: Math.max(0, Number(e.target.value || 0)),
                                },
                              }))
                            }
                          />
                        </td>

                        <td className="border px-2 py-2 text-right"></td>
                        <td className="border px-2 py-2 text-right"></td>
                      </tr>

                      {/* ITEM ROWS */}
                      {selectedMaterialObjects.map((m: any, idx: number) => {
                        const id = m.id as string;
                        const qty = Number(editableMaterials[id]?.quantity ?? m.quantity ?? 0);
                        const rate = Number(editableMaterials[id]?.supplyRate ?? m.supplyRate ?? 0);
                        const amount = qty * rate;

                        return (
                          <tr key={id}>
                            <td className="border px-2 py-2">
                              <Checkbox
                                checked={selectedForDelete.includes(id)}
                                onCheckedChange={(v) => {
                                  const next = Boolean(v);
                                  setSelectedForDelete((prev) =>
                                    next
                                      ? Array.from(new Set([...prev, id]))
                                      : prev.filter((x) => x !== id),
                                  );
                                }}
                              />
                            </td>

                            <td className="border px-2 py-2 text-center">{idx + 1}</td>

                            <td className="border px-2 py-2 font-medium">{m.name}</td>

                            <td className="border px-2 py-2">
                              <Textarea
                                className="min-h-[44px]"
                                value={materialDescriptions[id] || ""}
                                onChange={(e) =>
                                  setMaterialDescriptions((prev) => ({
                                    ...prev,
                                    [id]: e.target.value,
                                  }))
                                }
                                placeholder="Description"
                              />
                            </td>

                            <td className="border px-2 py-2">{m.unit || "pcs"}</td>

                            <td className="border px-2 py-2">
                              <Input
                                type="number"
                                value={qty}
                                onChange={(e) =>
                                  setEditableMaterials((prev) => ({
                                    ...prev,
                                    [id]: {
                                      ...prev[id],
                                      quantity: Math.max(0, Number(e.target.value || 0)),
                                    },
                                  }))
                                }
                              />
                            </td>

                            <td className="border px-2 py-2 text-right">
                              <Input
                                type="number"
                                className="text-right"
                                value={rate}
                                onChange={(e) =>
                                  setEditableMaterials((prev) => ({
                                    ...prev,
                                    [id]: {
                                      ...prev[id],
                                      supplyRate: Math.max(0, Number(e.target.value || 0)),
                                    },
                                  }))
                                }
                              />
                            </td>

                            <td className="border px-2 py-2 text-right font-semibold">
                              ₹{amount.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Bottom buttons (Door estimator) */}
                <div className="flex justify-end gap-3 pt-6">
                  <Button variant="outline" onClick={() => setStep(8)} className="px-8">
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>

                  <Button
                    onClick={() => setStep(11)}
                    className="bg-blue-600 hover:bg-blue-700 px-8"
                  >
                    Finalize PO
                  </Button>

                  <Button
                    onClick={() => handleExportPDF("boq-pdf", `BOQ-${finalBillNo}.pdf`)}
                    className="bg-blue-600 hover:bg-blue-700 px-8"
                  >
                    Export PDF <Download className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          )}




          {step === 11 && (
            <motion.div
              key="step11"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-xl border p-8 space-y-6">
                <div
                  id="boq-final-pdf"
                  style={{
                    width: "100%",
                    background: "#fff",
                    color: "#000",
                    fontFamily: "Arial",
                    fontSize: 12,
                  }}
                >
                  {/* HEADER */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 16,
                    }}
                  >
                    <img
                      src={ctintLogo}
                      alt="Concept Trunk Interiors"
                      style={{ height: 56 }}
                    />
                    <div style={{ flex: 1, textAlign: "center" }}>
                      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
                        CONCEPT TRUNK INTERIORS
                      </h1>
                      <div style={{ fontSize: 12, color: "#555" }}>
                        BILL OF QUANTITIES (BOQ)
                      </div>
                    </div>
                    <div style={{ textAlign: "right", fontSize: 12 }}>
                      {finalBillDate}
                    </div>
                  </div>

                  {/* TABLE */}
                  <div className="overflow-x-auto border rounded">
                    <table className="w-full text-sm bg-white">
                      <thead>
                        <tr style={{ background: "#f3f4f6" }}>
                          <th rowSpan={2} className="border px-2 py-2">
                            <Checkbox
                              id="select-all-groups"
                              checked={selectedForDelete.includes(groupId)}
                              onCheckedChange={(v) => {
                                if (v) setSelectedForDelete([groupId]);
                                else setSelectedForDelete([]);
                              }}
                            />
                          </th>
                          <th rowSpan={2} className="border px-2 py-2">
                            S.No
                          </th>
                          <th rowSpan={2} className="border px-2 py-2">
                            Item
                          </th>
                          <th rowSpan={2} className="border px-2 py-2">
                            Location
                          </th>
                          <th rowSpan={2} className="border px-2 py-2">
                            Description
                          </th>
                          <th rowSpan={2} className="border px-2 py-2">
                            Unit
                          </th>
                          <th rowSpan={2} className="border px-2 py-2">
                            Qty
                          </th>
                          <th colSpan={2} className="border px-2 py-2 text-center">
                            Rate
                          </th>
                          <th colSpan={2} className="border px-2 py-2 text-center">
                            Amount
                          </th>
                        </tr>

                        <tr style={{ background: "#f9fafb" }}>
                          <th className="border px-2 py-1 text-center">Supply</th>
                          <th className="border px-2 py-1 text-center">Installation</th>
                          <th className="border px-2 py-1 text-center">Supply</th>
                          <th className="border px-2 py-1 text-center">Installation</th>
                        </tr>
                      </thead>

                      <tbody>
                        {/* PRODUCT ROW ONLY (as in Door estimator screenshot) */}
                        <tr>
                          <td className="border px-2 py-2">
                            <Checkbox
                              checked={selectedForDelete.includes(groupId)}
                              onCheckedChange={(v) => {
                                if (v) setSelectedForDelete([groupId]);
                                else setSelectedForDelete([]);
                              }}
                            />
                          </td>

                          <td className="border px-2 py-2 text-center">1</td>

                          <td className="border px-2 py-2 font-semibold">
                            {selectedProduct || selectedProductObj?.name || "Product"}
                          </td>

                          <td className="border px-2 py-2">
                            <Input
                              value={materialLocations[groupId] || ""}
                              onChange={(e) =>
                                setMaterialLocations((prev) => ({
                                  ...prev,
                                  [groupId]: e.target.value,
                                }))
                              }
                              placeholder="Location"
                            />
                          </td>

                          <td className="border px-2 py-2">
                            <Textarea
                              value={materialDescriptions[groupId] || ""}
                              onChange={(e) =>
                                setMaterialDescriptions((prev) => ({
                                  ...prev,
                                  [groupId]: e.target.value,
                                }))
                              }
                              placeholder="Group description"
                              className="min-h-[44px]"
                            />
                          </td>

                          <td className="border px-2 py-2">
                            <Input value="pcs" readOnly />
                          </td>

                          <td className="border px-2 py-2">
                            <Input
                              type="number"
                              value={groupQty}
                              onChange={(e) =>
                                setEditableMaterials((prev) => ({
                                  ...prev,
                                  [groupId]: {
                                    ...(prev[groupId] || {
                                      quantity: 1,
                                      supplyRate: 0,
                                      installRate: 0,
                                    }),
                                    quantity: Math.max(0, Number(e.target.value || 0)),
                                  },
                                }))
                              }
                            />
                          </td>

                          <td className="border px-2 py-2 text-center">
                            <Input
                              type="number"
                              value={Number(groupSupplyRate || 0).toFixed(2)}
                              readOnly
                            />
                          </td>

                          <td className="border px-2 py-2 text-center">
                            <Input
                              type="number"
                              value={Number(groupInstallRate || 0).toFixed(2)}
                              readOnly
                            />
                          </td>

                          <td className="border px-2 py-2 text-right font-semibold">
                            ₹{(groupQty * groupSupplyRate).toFixed(2)}
                          </td>

                          <td className="border px-2 py-2 text-right font-semibold">
                            ₹{(groupQty * groupInstallRate).toFixed(2)}
                          </td>
                        </tr>

                        {/* Subtotal Row */}
                        <tr>
                          <td className="border px-2 py-2" colSpan={9} />
                          <td className="border px-2 py-2 text-right font-semibold">
                            Subtotal
                          </td>
                          <td className="border px-2 py-2 text-right font-semibold">
                            ₹{supplySubtotal.toFixed(2)}
                          </td>
                          <td className="border px-2 py-2 text-right font-semibold">
                            ₹{installSubtotal.toFixed(2)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Buttons row exactly like Door estimator */}
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" onClick={() => setStep(9)} className="px-8">
                    Back
                  </Button>

                  <Button
                    variant="destructive"
                    onClick={() => {
                      setSelectedForDelete([groupId]);
                      handleDeleteSelectedStep9();
                    }}
                    className="bg-red-300 hover:bg-red-400 text-white px-8"
                  >
                    Delete Selected
                  </Button>

                  <Button
                    onClick={() => setStep(1)}
                    className="bg-blue-600 hover:bg-blue-700 px-8"
                  >
                    Add Product
                  </Button>

                  <Button
                    onClick={handleSaveStep11}
                    disabled={loadingStep11 || selectedMaterialObjects.length === 0}
                    className="bg-blue-600 hover:bg-blue-700 px-8"
                  >
                    {loadingStep11 ? "Saving..." : "Save"}
                  </Button>

                  <Button
                    onClick={async () => {
                      await handleSaveStep11();
                      await handleExportPDF("boq-final-pdf", `BOQ-${finalBillNo}.pdf`);
                    }}
                    disabled={loadingStep11 || selectedMaterialObjects.length === 0}
                    className="bg-blue-600 hover:bg-blue-700 px-8"
                  >
                    Create BOQ
                  </Button>
                </div>

                {step11Items.length > 0 && (
                  <Card className="p-4 bg-green-50 border-green-200">
                    <p className="text-green-800 font-semibold">
                      ✓ Success! {step11Items.length} item(s) saved to database
                    </p>
                  </Card>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
}
