import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  ChevronLeft,
  Paintbrush,
  CheckCircle2,
  Droplets,
  Layers,
  Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useData } from "@/lib/store";
import { Layout } from "@/components/layout/Layout";
import { useToast } from "@/hooks/use-toast";
import apiFetch from "@/lib/api";
import html2pdf from "html2pdf.js";

const ctintLogo = "/image.png";

const PAINT_CONFIG = {
  interior: { label: "Interior Painting", requirements: ["Primer", "Putty", "Interior Emulsion", "Sandpaper"] },
  exterior: { label: "Exterior Painting", requirements: ["External Primer", "Exterior Emulsion", "Crack Filler"] },
};

const makeSafeForPDF = (el: HTMLElement) => {
  const computed = getComputedStyle(el);

  // Only convert colors that are in unsupported format (like oklch/lab)
  const safeColor = (c: string) => {
    if (!c) return c;
    if (c.startsWith("oklch") || c.startsWith("lab")) {
      try {
        const ctx = document.createElement("canvas").getContext("2d");
        if (!ctx) return "#000";
        ctx.fillStyle = c;
        return ctx.fillStyle;
      } catch {
        return "#000";
      }
    }
    return c; // leave normal rgb/hex untouched
  };

  if (computed.backgroundColor && computed.backgroundColor !== "rgba(0, 0, 0, 0)") {
    el.style.backgroundColor = safeColor(computed.backgroundColor);
  }

  // Keep table text color as-is if safe
  if (computed.color) {
    el.style.color = safeColor(computed.color);
  }

  el.style.fontFamily = computed.fontFamily;
  el.style.fontSize = computed.fontSize;
  el.style.fontWeight = computed.fontWeight;
  el.style.border = computed.border;
  el.style.padding = computed.padding;
  el.style.margin = computed.margin;
  el.style.textAlign = computed.textAlign;
  el.style.lineHeight = computed.lineHeight;

  Array.from(el.children).forEach((child: any) => makeSafeForPDF(child));
  return el;
};

export default function PaintingEstimator() {
  const {
    shops: storeShops,
    materials: storeMaterials,
    products,
  } = useData();
  const { toast } = useToast();

  // --- HELPER: Painting Product IDs ---
  const paintingProductIds = useMemo(() => {
    if (!products) return [];
    return products
      .filter(p => p.subcategory?.toLowerCase() === "painting")
      .map(p => p.id);
  }, [products]);

  // --- Core States ---
  const [step, setStep] = useState(1);
  const [paintType, setPaintType] = useState<string | null>(null);
  const [selectedPaintTypeName, setSelectedPaintTypeName] = useState<string>("");
  const [length, setLength] = useState(20);
  const [height, setHeight] = useState(10);

  // --- Selection States ---
  const [selectedMaterials, setSelectedMaterials] = useState<{ materialId: string; selectedShopId: string; selectedBrand?: string }[]>([]);
  const [editableMaterials, setEditableMaterials] = useState<Record<string, { quantity: number; rate: number }>>({});

  // --- Final BOQ States (Step 9) ---
  const [finalBillNo, setFinalBillNo] = useState(`PNT-${Math.floor(Math.random() * 10000)}`);
  const [finalBillDate, setFinalBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [finalDueDate, setFinalDueDate] = useState("");
  const [finalCustomerName, setFinalCustomerName] = useState("");
  const [finalCustomerAddress, setFinalCustomerAddress] = useState("");
  const [finalTerms, setFinalTerms] = useState("Payment: 50% Advance, 50% on Completion");
  const [finalShopDetails, setFinalShopDetails] = useState("Main Showroom\nChennai");
  // Material-wise descriptions
  const [materialDescriptions, setMaterialDescriptions] = useState<Record<string, string>>({});
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  // Step 11 DB States
  const [dbStep11Items, setDbStep11Items] = useState<any[]>([]);
  const [savingStep11, setSavingStep11] = useState(false);

  // --- Logic Helpers ---
  const availableMaterials = useMemo(() => {
    if (!storeMaterials || !paintType || !products) return [];

    // Get the selected product
    const selectedProduct = products.find(p => p.id === paintType);
    if (!selectedProduct) return [];

    // Filter materials by product name (or you can use another matching criteria)
    return storeMaterials.filter(
      (m) => {
        const productName = selectedProduct.name?.toLowerCase() || "";
        const materialProduct = (m.product || "").toLowerCase();
        return (m.subCategory || "").toLowerCase() === "painting" &&
          (materialProduct.includes(productName) || materialProduct === paintType);
      }
    );
  }, [storeMaterials, paintType, products]);

  const calculateQuantity = (mat: any) => {
    const area = length * height;
    if (mat.code?.includes("PAINT")) return Math.ceil(area / 100); // 1L per 100sqft
    if (mat.code?.includes("PUTTY")) return Math.ceil(area / 50);  // 1kg per 50sqft
    return 1;
  };

  const getMaterialsWithDetails = () => {
    return selectedMaterials.map((sel) => {
      const mat = storeMaterials.find((m) => m.id === sel.materialId);
      const shop = storeShops.find((s) => s.id === sel.selectedShopId);
      const qty = mat?.id ? (editableMaterials[mat.id]?.quantity ?? calculateQuantity(mat)) : calculateQuantity(mat);
      const rate = mat?.id ? (editableMaterials[mat.id]?.rate ?? (mat?.rate || 0)) : (mat?.rate || 0);
      return { ...mat, quantity: qty, rate: rate, shopName: shop?.name || "Market", amount: qty * rate };
    });
  };

  const currentMaterials = getMaterialsWithDetails();
  const subTotal = currentMaterials.reduce((s, m) => s + m.amount, 0);
  const sgst = subTotal * 0.09;
  const cgst = subTotal * 0.09;
  const grandTotal = subTotal + sgst + cgst;
  const roundOff = Math.round(grandTotal) - grandTotal;

  const handleExportStep9PDF = () => {
    // Helper to convert unsupported colors to safe format
    const toSafeColor = (c: string) => {
      try {
        const ctx = document.createElement("canvas").getContext("2d");
        if (!ctx) return c;
        ctx.fillStyle = c; // Browser converts unsupported formats to rgb(a)
        return ctx.fillStyle;
      } catch {
        return "#000"; // fallback
      }
    };

    // Create a temporary container
    const container = document.createElement("div");
    container.style.width = "210mm";
    container.style.minHeight = "297mm";
    container.style.padding = "20mm";
    container.style.background = toSafeColor("#fff");
    container.style.color = toSafeColor("#000");
    container.style.fontFamily = "Arial, sans-serif";
    container.style.fontSize = "12px";

    // Add Logo + Company Name
    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";

    const logo = document.createElement("img");
    logo.src = ctintLogo;
    logo.style.height = "60px";

    const companyName = document.createElement("div");
    companyName.innerHTML = `<h2 style="margin:0">Concept Trunk Interiors</h2><div>12/36A, Indira Nagar, Medavakkam, Chennai – 600100</div>`;
    companyName.style.textAlign = "center";
    companyName.style.flex = "1";
    companyName.style.marginLeft = "20px";

    header.appendChild(logo);
    header.appendChild(companyName);
    container.appendChild(header);
    container.appendChild(document.createElement("hr"));

    // Clone the Step 9 table
    const table = document.getElementById("boq-add-table-pdf");
    if (!table) return alert("Table not found for PDF export");

    const tableClone = table.cloneNode(true) as HTMLElement;

    // --- SANITIZE TABLE STYLES recursively ---
    const makeSafeForPDF = (el: HTMLElement) => {
      const computed = getComputedStyle(el);
      el.style.backgroundColor = toSafeColor(computed.backgroundColor);
      el.style.color = toSafeColor(computed.color);
      el.style.fontFamily = computed.fontFamily;
      el.style.fontSize = computed.fontSize;
      el.style.fontWeight = computed.fontWeight;
      el.style.border = computed.border;
      el.style.padding = computed.padding;
      el.style.margin = computed.margin;
      el.style.textAlign = computed.textAlign;
      el.style.lineHeight = computed.lineHeight;

      Array.from(el.children).forEach((child: any) => makeSafeForPDF(child));
      return el;
    };

    makeSafeForPDF(tableClone);
    tableClone.style.marginTop = "20px";
    container.appendChild(tableClone);

    // Generate PDF
    html2pdf()
      .from(container)
      .set({
        margin: 0,
        filename: `BOQ_${finalBillNo}.pdf`,
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
      })
      .save();
  };

  {/* step 10 pdf */ }

  const handleExportFinalBOQ = () => {
    const element = document.getElementById("boq-final-pdf");
    if (element) {
      html2pdf().from(element).set({ margin: 0, filename: `Painting_Invoice_${finalBillNo}.pdf` }).save();
    }
  };

  // Get selected paint type product name
  const selectedPaintType = useMemo(() => {
    if (!paintType || !products) return "";
    const product = products.find(p => p.id === paintType);
    return product?.name || "";
  }, [paintType, products]);

  // Calculate total area
  const totalArea = useMemo(() => length * height, [length, height]);

  // Placeholder values (these can be made dynamic based on requirements)
  const coats = 2;
  const surfaceType = "wall";

  // Calculate total cost
  const calculateTotalCost = () => {
    return getMaterialsWithDetails().reduce((s, m) => s + m.amount, 0);
  };

  // Export to Excel
  const handleExportBOQ = () => {
    // Placeholder function - implement as needed
    alert("Export to Excel feature coming soon");
  };

  // Export to PDF
  const handleExportPDF = () => {
    handleExportStep9PDF();
  };

  // Add to cart and open step 9
  const addToCartAndOpenStep9 = () => {
    setStep(9);
  };

  // Step 9 state
  const [selectedForDelete, setSelectedForDelete] = useState<string[]>([]);

  // Materials list (from getMaterialsWithDetails)
  const materials = getMaterialsWithDetails();

  // Paint area - same as totalArea
  const paintArea = totalArea;

  // Handle delete selected materials
  const handleDeleteSelected = () => {
    const remainingMaterials = selectedMaterials.filter(
      m => !selectedForDelete.includes(m.materialId)
    );
    setSelectedMaterials(remainingMaterials);
    setSelectedForDelete([]);
  };

  // Handle save step 9
  const handleSaveStep9 = async () => {
    const mats = getMaterialsWithDetails().map((m: any) => ({
      id: m.id,
      name: m.name,
      productLabel: (m as any).productLabel || null,
      product_label: (m as any).productLabel || null,
      unit: m.unit,
      quantity: materialQtys[m.id] ?? m.quantity,
      rate: step11SupplyRates[m.id] ?? m.rate,
      shopId: m.shopId,
      shopName: m.shopName,
      description: materialDescriptions[m.id] || "",
    }));

    if (mats.length === 0) {
      alert("No materials to save");
      return;
    }

    const payload = {
      id: `paint-${Date.now()}`,
      estimator: "painting",
      bill_no: finalBillNo,
      area: paintArea,
      coats,
      materials: mats,
      subtotal: mats.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.rate || 0), 0),
      created_at: new Date().toISOString(),
    };

    try {
      const res = await fetch("/api/estimator/step9-cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: payload }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Failed to save");
      }

      const json = await res.json();
      setCurrentSavedBoq(payload);
      alert("Saved to cart successfully");
    } catch (err: any) {
      console.error("Save step9 error", err);
      alert("Save failed: " + (err?.message || err));
    }
  };

  // Handle save BOQ
  const handleSaveBOQ = () => {
    // Save logic can be added here
  };

  // Toggle select all
  const toggleSelectAll = () => {
    if (selectedForDelete.length === materials.length) {
      setSelectedForDelete([]);
    } else {
      setSelectedForDelete(materials.map(m => m.id || ""));
    }
  };

  // Toggle select item
  const toggleSelectItem = (materialId: string) => {
    if (selectedForDelete.includes(materialId)) {
      setSelectedForDelete(prev => prev.filter(id => id !== materialId));
    } else {
      setSelectedForDelete(prev => [...prev, materialId]);
    }
  };

  // Set editable quantity
  const setEditableQuantity = (materialId: string, quantity: number) => {
    setEditableMaterials(prev => ({
      ...prev,
      [materialId]: { ...prev[materialId], quantity }
    }));
  };

  // Set editable rate
  const setEditableRate = (materialId: string, rate: number) => {
    setEditableMaterials(prev => ({
      ...prev,
      [materialId]: { ...prev[materialId], rate }
    }));
  };

  // Set current saved BOQ - placeholder state
  const setCurrentSavedBoq = (boq: any) => {
    // Store current BOQ in state if needed
    console.log("BOQ saved:", boq);
  };

  // Step 11 state
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [materialQtys, setMaterialQtys] = useState<Record<string, number>>({});
  const [step11SupplyRates, setStep11SupplyRates] = useState<Record<string, number>>({});
  const [step11InstallRates, setStep11InstallRates] = useState<Record<string, number>>({});
  const [materialUnits, setMaterialUnits] = useState<Record<string, string>>({});

  // Display materials (same as current materials)
  const displayMaterials = getMaterialsWithDetails();

  // Step 11: Aggregated product-level display (ONE row per paint product, not per material)
  // Derives product info from the materials selected, aggregating rates
  const step11DisplayProducts = useMemo(() => {
    if (!displayMaterials || displayMaterials.length === 0) return [];
    
    // Use the stored product name from selection, or derive from materials
    const productName = selectedPaintTypeName || 
      displayMaterials[0]?.product || 
      "Painting Project";
    
    // Aggregate all materials into one product-level row
    const aggregatedSupplyRate = displayMaterials.reduce((sum, m) => {
      const rate = step11SupplyRates[m.id] ?? m.rate ?? 0;
      return sum + (Number(m.quantity || 0) * Number(rate));
    }, 0);
    
    const aggregatedInstallRate = displayMaterials.reduce((sum, m) => {
      const rate = step11InstallRates[m.id] ?? 0;
      return sum + (Number(m.quantity || 0) * Number(rate));
    }, 0);
    
    return [{
      id: "painting_product",
      name: productName,
      location: "",
      description: materialDescriptions["product"] || "",
      unit: "project",
      quantity: 1,
      supplyRate: aggregatedSupplyRate,
      installRate: aggregatedInstallRate,
      supplyAmount: aggregatedSupplyRate,
      installAmount: aggregatedInstallRate,
    }];
  }, [displayMaterials, step11SupplyRates, step11InstallRates, materialDescriptions, selectedPaintTypeName]);

  // Get current bill date formatted
  const displayBillDate = finalBillDate;

  // Handle delete painting materials
  const handleDeletePaintingMaterials = () => {
    const remainingMaterials = selectedMaterials.filter(
      m => !selectedGroupIds.includes(m.materialId)
    );
    setSelectedMaterials(remainingMaterials);
    setSelectedGroupIds([]);
  };

  // Handle save painting BOQ
  const handleSavePaintingBOQ = async () => {
    setSavingStep11(true);
    try {
      // Ensure we have the latest DB items to avoid duplicates
      let currentDbItems: any[] = dbStep11Items || [];
      if (finalBillNo) {
        try {
          const cur = await apiFetch(
            `/api/estimator-step11-groups?session_id=${finalBillNo}&estimator=painting`,
          );
          if (cur.ok) {
            const d = await cur.json();
            currentDbItems = d.items || [];
            setDbStep11Items(currentDbItems);
          }
        } catch (e) {
          console.warn("Failed to refresh step11 items before save", e);
        }
      }

      const groups = step11DisplayProducts.map((product) => ({
        estimator: "painting",
        session_id: finalBillNo,
        group_key: product.name,
        group_id: `group_${product.id}`,
        item_name: product.name,
        unit: product.unit,
        quantity: product.quantity,
        location: product.location || "",
        description: materialDescriptions["product"] || "",
        supply_rate: product.supplyRate,
        install_rate: product.installRate,
        supply_amount: product.supplyAmount,
        install_amount: product.installAmount,
        supply_subtotal: product.supplyAmount,
        install_subtotal: product.installAmount,
        sgst: sgst,
        cgst: cgst,
        round_off: roundOff,
        grand_total: product.supplyAmount + product.installAmount + sgst + cgst + roundOff,
      }));

      const existingKeys = new Set(
        (currentDbItems || []).map((it: any) => it.group_key || it.groupKey),
      );
      const newGroups = groups.filter(
        (g: any) => !existingKeys.has(g.group_key),
      );

      if (newGroups.length === 0) {
        toast({
          title: "No changes",
          description: "No new Step 11 items to save.",
        });
        setSavingStep11(false);
        return true;
      }

      const res = await apiFetch("/api/estimator-step11-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups: newGroups }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        toast({
          title: "Error",
          description: `Failed saving Step 11: ${txt || res.statusText}`,
          variant: "destructive",
        });
        setSavingStep11(false);
        return false;
      }

      // Reload fresh data
      try {
        const reloadRes = await apiFetch(
          `/api/estimator-step11-groups?session_id=${finalBillNo}&estimator=painting`,
        );
        if (reloadRes.ok) {
          const data = await reloadRes.json();
          setDbStep11Items(data.items || []);
        }
      } catch (e) {
        console.warn("Failed to reload step11 items after save", e);
      }

      toast({ title: "Success", description: "Step 11 saved to database." });
      setSavingStep11(false);
      return true;
    } catch (err) {
      console.error("handleSavePaintingBOQ", err);
      toast({
        title: "Error",
        description: "Failed to save Step 11.",
        variant: "destructive",
      });
      setSavingStep11(false);
      return false;
    }
  };

  // Step 12 / QA Materials (from step 11)
  const qaMaterials = displayMaterials;

  // Calculate QA supply subtotal
  const qaSupplySubtotal = qaMaterials.reduce((sum: number, m: any) => {
    const qty = Number(materialQtys[m.id] ?? m.quantity ?? 0);
    const supplyRate = Number(step11SupplyRates[m.id] ?? m.supplyRate ?? m.rate ?? 0);
    return sum + (qty * supplyRate);
  }, 0);

  // Export to Excel for Step 11
  const handleExportExcelStep11 = () => {
    // Placeholder - Excel export logic can be added here
    alert("Export to Excel coming soon");
  };

  const [materialLocations, setMaterialLocations] = useState<Record<string, string>>({});

  const handleChangeBrand = (materialId: string, newBrand: string) => {
    setSelectedMaterials(prev => prev.map(m => m.materialId === materialId ? { ...m, selectedBrand: newBrand } : m));
  };

  const handleChangeShop = (materialId: string, newShopId: string) => {
    setSelectedMaterials(prev => prev.map(m => m.materialId === materialId ? { ...m, selectedShopId: newShopId } : m));
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8 pb-20">
        <AnimatePresence mode="wait">

          {/* STEP 1: SELECT PAINTING PRODUCT */}
          {step === 1 && (
            <motion.div
              key="step-1-painting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <Label className="text-lg font-semibold">Select Painting Type</Label>
              <p className="text-sm text-muted-foreground">
                Choose a painting product to continue
              </p>

              <div className="grid gap-3 md:grid-cols-2">
                {products
                  ?.filter(
                    (p: any) => p.subcategory?.toLowerCase() === "painting"
                  )
                  .map((product: any) => {
                    const isActive = paintType === product.id;

                    return (
                      <Card
                        key={product.id}
                        onClick={() => {
                          setPaintType(product.id);
                          setSelectedPaintTypeName(product.name || product.label || "Painting");
                          setStep(6); // Skip Step 2
                        }}
                        className={cn(
                          "cursor-pointer border-2 transition-all",
                          isActive
                            ? "border-primary bg-primary/10"
                            : "border-border bg-white"
                        )}
                      >
                        <CardContent className="p-6 flex items-center gap-4">
                          <Paintbrush
                            className={cn(
                              "h-6 w-6",
                              isActive ? "text-primary" : "text-muted-foreground"
                            )}
                          />
                          <div>
                            <div className="font-bold">{product.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {product.subcategory}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}

                {/* EMPTY STATE */}
                {(!products ||
                  products.filter(
                    (p: any) => p.subcategory?.toLowerCase() === "painting"
                  ).length === 0) && (
                    <p className="text-sm text-muted-foreground">
                      No painting products found
                    </p>
                  )}
              </div>
            </motion.div>
          )}

          {/* STEP 6: MATERIAL & SHOP SELECTION */}
          {step === 6 && (
            <motion.div key="step6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <Label className="text-lg font-semibold">Select Materials & Shops</Label>
              <p className="text-sm text-muted-foreground mb-4">
                Available materials for painting. Best price shop is pre-selected.
              </p>

              {/* Select All Checkbox */}
              <div className="flex items-center gap-2 mb-2">
                <Checkbox
                  checked={selectedMaterials.length === availableMaterials.length && availableMaterials.length > 0}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedMaterials(
                        availableMaterials.map((m) => {
                          // get variants for this material
                          const variants = storeMaterials
                            .filter(sm => sm.name === m.name && sm.product === m.product)
                            .map(sm => ({
                              id: sm.id,
                              brand: sm.product,
                              shopId: sm.shopId,
                              rate: sm.rate,
                            }));
                          // pick the lowest rate shop as default
                          const bestShop = variants.sort((a, b) => (a.rate || 0) - (b.rate || 0))[0];
                          return {
                            materialId: m.id,
                            selectedShopId: bestShop?.shopId || "",
                            selectedBrand: bestShop?.brand || "Generic",
                          };
                        })
                      );
                    } else {
                      setSelectedMaterials([]);
                    }
                  }}
                />
                <span className="font-semibold">Select All Materials</span>
              </div>

              <div className="space-y-3 max-h-500 overflow-y-auto border rounded-lg p-4 bg-white">
                {availableMaterials.map((mat) => {
                  const isSelected = selectedMaterials.some(m => m.materialId === mat.id);
                  const currentSelection = selectedMaterials.find(m => m.materialId === mat.id);

                  // get all variants (brands + shops) for this material
                  const variants = storeMaterials
                    .filter(sm => sm.name === mat.name && sm.product === mat.product)
                    .map(sm => ({
                      id: sm.id,
                      brand: sm.brandName || "Generic",
                      shopId: sm.shopId || "",
                      rate: sm.rate,
                      unit: sm.unit,
                      shopName: storeShops.find(s => s.id === sm.shopId)?.name || "Unknown",
                    }));

                  const availableBrands = Array.from(new Set(variants.map(v => v.brand))).sort();

                  const selectedBrand = currentSelection?.selectedBrand || availableBrands[0] || "Generic";

                  // shops for the selected brand
                  const brandShops = variants
                    .filter(v => v.brand === selectedBrand)
                    .sort((a, b) => (a.rate || 0) - (b.rate || 0));

                  return (
                    <div key={mat.id} className="border rounded-lg p-3 hover:bg-muted/50 transition">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id={mat.id}
                          checked={isSelected}
                          onCheckedChange={() => {
                            if (isSelected) setSelectedMaterials(prev => prev.filter(x => x.materialId !== mat.id));
                            else {
                              setSelectedMaterials(prev => [
                                ...prev,
                                {
                                  materialId: mat.id,
                                  selectedShopId: brandShops[0]?.shopId || "",
                                  selectedBrand: selectedBrand,
                                },
                              ]);
                            }
                          }}
                        />
                        <div className="flex-1">
                          <label htmlFor={mat.id} className="font-medium cursor-pointer">{mat.name}</label>
                          <p className="text-xs text-muted-foreground">{mat.code} — {mat.unit}</p>

                          {/* Brand & Shop selection */}
                          {isSelected && availableBrands.length > 0 && (
                            <div className="mt-3 space-y-3">
                              {/* Brand selection dropdown */}
                              <div className="space-y-1">
                                <Label className="text-xs">Brand:</Label>
                                <Select
                                  value={selectedBrand}
                                  onValueChange={(newBrand) => handleChangeBrand(mat.id, newBrand)}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {availableBrands.map(brand => (
                                      <SelectItem key={brand} value={brand}>
                                        {brand}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              {/* Shop selection with dropdown */}
                              {brandShops.length > 0 && (
                                <div className="space-y-1">
                                  <Label className="text-xs">Shop:</Label>
                                  <Select
                                    value={currentSelection?.selectedShopId || brandShops[0].shopId}
                                    onValueChange={(newShopId) => handleChangeShop(mat.id, newShopId)}
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {brandShops.map(shop => (
                                        <SelectItem key={shop.shopId} value={shop.shopId || ""}>
                                          {shop.shopName} - ₹{shop.rate}/{shop.unit}
                                          {shop.rate === brandShops[0].rate && " (Best)"}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between gap-2 pt-6">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ChevronLeft className="mr-2 h-4 w-4" /> Back
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

          {/* STEP 7: EDIT QUANTITIES & RATES */}
          {/* STEP 7: Selected Materials Review */}
          {step === 7 && (
            <motion.div
              key="painting-step7"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              <Label className="text-lg font-semibold">Selected Materials</Label>
              <p className="text-sm text-muted-foreground">
                Review and edit quantities or rates before generating BOQ.
              </p>

              <div className="space-y-2">
                {selectedMaterials.length > 0 ? (
                  <>
                    {/* Header */}
                    <div className="grid grid-cols-8 gap-2 p-2 text-xs font-semibold text-muted-foreground uppercase">
                      <div className="col-span-2">Material</div>
                      <div className="text-center">Brand</div>
                      <div className="text-center">Qty</div>
                      <div className="text-center">Unit</div>
                      <div className="text-center">Shop</div>
                      <div className="text-center">Rate (₹)</div>
                      <div className="text-right">Amount (₹)</div>
                    </div>

                    {selectedMaterials.map((sel) => {
                      const material = storeMaterials.find(m => m.id === sel.materialId);
                      if (!material) return null;

                      const shop = storeShops.find(s => s.id === sel.selectedShopId);

                      const quantity =
                        editableMaterials[material.id]?.quantity ?? calculateQuantity(material) ?? 1;

                      const rate =
                        editableMaterials[material.id]?.rate ?? material.rate ?? 0;

                      const amount = quantity * rate;

                      return (
                        <div
                          key={material.id}
                          className="grid grid-cols-8 gap-2 p-3 border rounded items-center"
                        >
                          {/* Material */}
                          <span className="col-span-2 font-medium">
                            {material.name}
                          </span>

                          {/* Brand */}
                          <div className="text-center font-semibold">
                            {sel.selectedBrand || "-"}
                          </div>

                          {/* Quantity */}
                          <div className="text-center">
                            <Input
                              type="number"
                              className="w-20 mx-auto h-8"
                              value={quantity}
                              onChange={(e) =>
                                setEditableMaterials(p => ({
                                  ...p,
                                  [material.id]: {
                                    ...p[material.id],
                                    quantity: Number(e.target.value || 0),
                                  },
                                }))
                              }
                            />
                          </div>

                          {/* Unit */}
                          <span className="text-center text-muted-foreground">
                            {material.unit}
                          </span>

                          {/* Shop */}
                          <div className="text-center font-semibold">
                            {shop?.name || "-"}
                          </div>

                          {/* Rate */}
                          <div className="text-center">
                            <Input
                              type="number"
                              className="w-20 mx-auto h-8"
                              value={rate}
                              onChange={(e) =>
                                setEditableMaterials(p => ({
                                  ...p,
                                  [material.id]: {
                                    ...p[material.id],
                                    rate: Number(e.target.value || 0),
                                  },
                                }))
                              }
                            />
                          </div>

                          {/* Amount */}
                          <div className="text-right font-semibold">
                            ₹{amount.toFixed(2)}
                          </div>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <p className="text-center text-muted-foreground py-4">
                    No materials selected
                  </p>
                )}
              </div>

              <div className="flex justify-between gap-2 pt-6">
                <Button variant="outline" onClick={() => setStep(6)}>
                  <ChevronLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button
                  onClick={() => setStep(8)}
                  disabled={selectedMaterials.length === 0}
                >
                  Generate BOM <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 8 */}
          {step === 8 && (
            <motion.div
              key="painting-step8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              {/* Header */}
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
                  <CheckCircle2 size={32} />
                </div>
                <h2 className="text-2xl font-bold">Bill of Materials(BOM)</h2>
                <p className="text-sm text-muted-foreground">
                  Generated on {new Date().toLocaleDateString()}
                </p>
              </div>

              {/* PDF CONTENT */}
              <div
                id="boq-pdf"
                style={{
                  backgroundColor: "#ffffff",
                  color: "#000000",
                  fontFamily: "Arial, sans-serif",
                  padding: 16,
                }}
              >
                {/* Project Details */}
                <div className="border rounded-lg mb-4">
                  <div className="grid grid-cols-2 gap-4 p-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">PAINT TYPE</p>
                      <p className="font-semibold">{selectedPaintType}</p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">AREA</p>
                      <p className="font-semibold">{totalArea} sq.ft</p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">COATS</p>
                      <p className="font-semibold">{coats}</p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">SURFACE</p>
                      <p className="font-semibold capitalize">{surfaceType}</p>
                    </div>
                  </div>
                </div>

                {/* Materials Table */}
                <div className="border rounded-lg overflow-hidden mb-4">
                  <div className="p-4">
                    <h3 className="font-semibold mb-2">Materials Schedule</h3>

                    <table className="w-full border-collapse text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          {[
                            "S.No",
                            "Material",
                            "Brand",
                            "Unit",
                            "Qty",
                            "Rate (₹)",
                            "Shop",
                            "Amount (₹)",
                          ].map((h) => (
                            <th
                              key={h}
                              className="border px-2 py-2 text-left"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>

                      <tbody>
                        {getMaterialsWithDetails().map((mat, index) => (
                          <tr key={mat.id}>
                            <td className="border px-2 py-2">{index + 1}</td>
                            <td className="border px-2 py-2 font-medium">{mat.name}</td>
                            <td className="border px-2 py-2">
                              {mat.brandName || "-"}
                            </td>
                            <td className="border px-2 py-2 text-center">{mat.unit}</td>
                            <td className="border px-2 py-2 text-center">{mat.quantity}</td>
                            <td className="border px-2 py-2 text-right">{mat.rate}</td>
                            <td className="border px-2 py-2">{mat.shopName || "-"}</td>
                            <td className="border px-2 py-2 text-right font-semibold">
                              ₹{(mat.quantity * mat.rate).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Summary */}
                <div className="border rounded-lg p-4 flex justify-between bg-blue-50">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Materials</p>
                    <p className="font-semibold">{getMaterialsWithDetails().length}</p>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground">Total Quantity</p>
                    <p className="font-semibold">
                      {getMaterialsWithDetails().reduce((s, m) => s + m.quantity, 0)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Grand Total</p>
                    <p className="text-2xl font-bold text-blue-700">
                      ₹{calculateTotalCost().toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-3 justify-end pt-4">
                <Button variant="outline" onClick={() => setStep(7)}>
                  Back
                </Button>

                <button
                  onClick={handleExportBOQ}
                  className="flex items-center gap-2 bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600"
                >
                  <Download className="w-4 h-4" />
                  Export Excel
                </button>

                <button
                  onClick={handleExportPDF}
                  className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
                >
                  <Download className="w-4 h-4" />
                  Export PDF
                </button>

                <Button onClick={() => addToCartAndOpenStep9()}>
                  Add to BOM <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* STEP 9*/}
          {step === 9 && (
            <motion.div
              key="painting-step-add-to-boq"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              {/* STEP HEADING */}
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">
                  Painting Estimator
                </p>
                <h2 className="text-2xl font-bold">Add to BOQ</h2>
                <p className="text-sm text-muted-foreground">
                  Review selected painting materials before finalizing BOQ
                </p>
              </div>

              {/* ACTION BAR */}
              <div className="flex items-center justify-between">
                <div />
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    onClick={handleDeleteSelected}
                    disabled={selectedForDelete.length === 0}
                  >
                    Delete Selected
                  </Button>

                  <Button
                    onClick={handleSaveStep9}
                    disabled={getMaterialsWithDetails().length === 0}
                  >
                    Save
                  </Button>

                  <Button
                    onClick={async () => {
                      const mats = getMaterialsWithDetails().map((m: any) => ({
                        id: m.id,
                        name: m.name,
                        unit: m.unit,
                        quantity: materialQtys[m.id] ?? m.quantity,
                        supplyRate: step11SupplyRates[m.id] ?? m.rate,
                        shopId: m.shopId,
                        shopName: m.shopName,
                        description: materialDescriptions[m.id] || "",
                      }));

                      if (mats.length === 0) return;

                      const paintingBoq = {
                        id: `paint-${Date.now()}`,
                        estimator: "painting",
                        bill_no: finalBillNo,
                        area: paintArea,
                        coats: coats,
                        materials: mats,
                        subtotal: mats.reduce(
                          (s, it) => s + Number(it.quantity || 0) * Number(it.supplyRate || 0),
                          0
                        ),
                        created_at: new Date().toISOString(),
                      };

                      setCurrentSavedBoq(paintingBoq);
                      try { await handleSaveBOQ(); } catch { }
                      setSelectedForDelete([]);
                      setStep(11); // Finalize PO
                    }}
                    disabled={getMaterialsWithDetails().length === 0}
                  >
                    Add to BOQ
                  </Button>
                </div>
              </div>

              {/* BOQ TABLE */}
              <div id="boq-pdf" className="overflow-x-auto border rounded-lg">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="border px-2 py-2">
                        <Checkbox
                          checked={(() => {
                            const ids = getMaterialsWithDetails().map((m: any) => m.id);
                            return ids.length > 0 && ids.every(id => selectedForDelete.includes(id));
                          })()}
                          onCheckedChange={toggleSelectAll}
                        />
                      </th>
                      <th className="border px-2 py-2">S.No</th>
                      <th className="border px-2 py-2">Item</th>
                      <th className="border px-2 py-2">Description</th>
                      <th className="border px-2 py-2 text-center">Unit</th>
                      <th className="border px-2 py-2 text-center">Qty</th>
                      <th className="border px-2 py-2 text-right">Rate</th>
                      <th className="border px-2 py-2 text-right">Amount</th>
                    </tr>
                  </thead>

                  <tbody>
                    {(() => {
                      const materials = getMaterialsWithDetails();
                      const groups = new Map<string, any[]>();
                      const groupMeta = new Map<string, { label: string }>();

                      // Group materials by product type
                      materials.forEach((m: any) => {
                        const productType = m.product || selectedPaintType || "Painting";
                        if (!groups.has(productType)) groups.set(productType, []);
                        groups.get(productType)!.push(m);
                        if (!groupMeta.has(productType)) {
                          groupMeta.set(productType, { label: productType });
                        }
                      });

                      const rows: React.ReactNode[] = [];
                      let idx = 0;

                      // Create rows for each group
                      const groupsArray = Array.from(groups.entries());
                      for (const [gk, groupMaterials] of groupsArray) {
                        const materialIds = groupMaterials.map((m: any) => m.id);
                        const allSelected = materialIds.length > 0 && materialIds.every((id: string) => selectedForDelete.includes(id));

                        const groupId = `group_${gk}`;
                        const groupDesc = materialDescriptions[groupId] || '';

                        // Group header row
                        rows.push(
                          <tr key={`group-${gk}`} className="bg-gray-50">
                            <td className="border px-2 py-1 text-center">
                              <Checkbox
                                id={`group-${gk}`}
                                checked={allSelected}
                                onCheckedChange={() => {
                                  if (allSelected) setSelectedForDelete((prev) => prev.filter((p) => !materialIds.includes(p)));
                                  else setSelectedForDelete((prev) => Array.from(new Set([...prev, ...materialIds])));
                                }}
                              />
                            </td>
                            <td className="border px-2 py-1 text-center"></td>
                            <td className="border px-2 py-1"><strong>{groupMeta.get(gk)?.label}</strong></td>
                            <td className="border px-2 py-1">
                              <Input
                                placeholder="Group description"
                                value={groupDesc?.replace(/\n?Qty:\s*\d+(?:\.\d+)?\s*$/,'') || ''}
                                onChange={(e) => setMaterialDescriptions(prev => ({ ...prev, [groupId]: e.target.value }))}
                                className="w-full"
                              />
                            </td>
                            <td className="border px-2 py-1 text-center"></td>
                            <td className="border px-2 py-1 text-center"></td>
                            <td className="border px-2 py-1 text-right"></td>
                            <td className="border px-2 py-1 text-right"></td>
                          </tr>
                        );

                        // Individual material rows for this group
                        groupMaterials.forEach((m: any) => {
                          idx += 1;
                          const qty = materialQtys[m.id] ?? m.quantity;
                          const rate = step11SupplyRates[m.id] ?? m.rate;
                          const amount = Number(qty || 0) * Number(rate || 0);

                        rows.push(
                          <tr key={m.id}>
                            <td className="border px-2 py-1 text-center">
                              <Checkbox
                                checked={selectedForDelete.includes(m.id)}
                                onCheckedChange={() => toggleSelectItem(m.id)}
                              />
                            </td>

                            <td className="border px-2 py-1 text-center">
                              {idx}
                            </td>

                            <td className="border px-2 py-1 font-medium">
                              {m.name}
                            </td>

                            <td className="border px-2 py-1" style={{ maxWidth: 450 }}>
                              <textarea
                                className="h-20 w-full p-2 border rounded"
                                placeholder="Description"
                                value={materialDescriptions[m.id] ?? ""}
                                onChange={(e) =>
                                  setMaterialDescriptions(prev => ({
                                    ...prev,
                                    [m.id]: e.target.value,
                                  }))
                                }
                              />
                            </td>

                            <td className="border px-2 py-1 text-center">
                              {m.unit}
                            </td>

                            <td className="border px-2 py-1 text-center">
                              <Input
                                type="number"
                                className="h-8 text-center"
                                value={qty}
                                onChange={(e) =>
                                setEditableQuantity(m.id, Number(e.target.value || 0))
                              }
                            />
                            </td>

                            <td className="border px-2 py-1 text-right">
                              <Input
                                type="number"
                                className="h-8 text-right"
                                value={rate}
                                onChange={(e) =>
                                  setEditableRate(m.id, Number(e.target.value || 0))
                                }
                              />
                            </td>

                            <td className="border px-2 py-1 text-right font-semibold">
                              ₹{amount.toFixed(2)}
                            </td>
                          </tr>
                        );
                        });
                      }

                      return rows;
                    })()}
                  </tbody>
                </table>
              </div>

              {/* FOOTER ACTIONS */}
              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => setStep(8)}>
                  <ChevronLeft className="mr-2 h-4 w-4" /> Back
                </Button>

                <Button
                  onClick={() => setStep(11)}
                  disabled={getMaterialsWithDetails().length === 0}
                >
                  Finalize PO
                </Button>

                <Button onClick={handleExportPDF}>
                  Export PDF <Download className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {/*step 11*/}
          {step === 11 && (
            <motion.div
              key="step11-painting-finalize-boq"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              {/* HEADER */}
              <div className="flex items-center gap-4">
                <img src={ctintLogo} alt="logo" className="h-14" />
                <div className="flex-1 text-center">
                  <h1 className="text-lg font-bold">CONCEPT TRUNK INTERIORS</h1>
                  <div className="text-xs text-muted-foreground">
                    BILL OF QUANTITIES (PAINTING)
                  </div>
                </div>
                <div className="text-right text-xs">{displayBillDate}</div>
              </div>

              {/* TABLE */}
              <div className="overflow-x-auto border rounded-lg p-2">
                <table className="min-w-full border-collapse text-sm w-full">
                  <thead>
                    <tr className="bg-slate-100">
                      <th rowSpan={2} className="border px-2 py-2 text-center">
                        <Checkbox
                          checked={
                            step11DisplayProducts.length > 0 &&
                            step11DisplayProducts.every((m: any) =>
                              selectedGroupIds.includes(m.id)
                            )
                          }
                          onCheckedChange={(v) =>
                            setSelectedGroupIds(v ? step11DisplayProducts.map((m: any) => m.id) : [])
                          }
                        />
                      </th>
                      <th rowSpan={2} className="border px-2 py-2">S.No</th>
                      <th rowSpan={2} className="border px-2 py-2">Item</th>
                      <th rowSpan={2} className="border px-2 py-2">Location</th>
                      <th rowSpan={2} className="border px-2 py-2">Description</th>
                      <th rowSpan={2} className="border px-2 py-2">Unit</th>
                      <th rowSpan={2} className="border px-2 py-2">Qty</th>
                      <th colSpan={2} className="border px-2 py-2 text-center">Rate</th>
                      <th colSpan={2} className="border px-2 py-2 text-center">Amount</th>
                    </tr>
                    <tr className="bg-slate-50">
                      <th className="border px-2 py-1 text-center">Supply</th>
                      <th className="border px-2 py-1 text-center">Install</th>
                      <th className="border px-2 py-1 text-center">Supply</th>
                      <th className="border px-2 py-1 text-center">Install</th>
                    </tr>
                  </thead>

                  <tbody>
                    {step11DisplayProducts.map((m: any, i: number) => {
                      const qty = Number(m.quantity ?? 1);
                      const supplyRate = Number(m.supplyRate ?? 0);
                      const installRate = Number(m.installRate ?? 0);

                      return (
                        <tr key={m.id}>
                          <td className="border px-2 py-1 text-center">
                            <Checkbox
                              checked={selectedGroupIds.includes(m.id)}
                              onCheckedChange={() =>
                                setSelectedGroupIds((p) =>
                                  p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id]
                                )
                              }
                            />
                          </td>

                          <td className="border px-2 py-1 text-center">{i + 1}</td>
                          <td className="border px-2 py-1 font-medium">{m.name}</td>

                          <td className="border px-2 py-1 text-center">
                            <Input
                              value={m.location ?? ""}
                              onChange={(e) =>
                                setMaterialDescriptions((p) => ({ ...p, "location": e.target.value }))
                              }
                              className="w-28 mx-auto"
                            />
                          </td>

                          <td className="border px-2 py-1">
                            <textarea
                              value={materialDescriptions["product"] ?? m.description ?? ""}
                              onChange={(e) =>
                                setMaterialDescriptions((p) => ({ ...p, "product": e.target.value }))
                              }
                              className="w-full min-h-16 border rounded p-2"
                            />
                          </td>

                          <td className="border px-2 py-1 text-center">
                            {m.unit}
                          </td>

                          <td className="border px-2 py-1 text-center">
                            {qty}
                          </td>

                          <td className="border px-2 py-1">
                            <div className="text-right">₹{supplyRate.toFixed(2)}</div>
                          </td>

                          <td className="border px-2 py-1">
                            <div className="text-right">₹{installRate.toFixed(2)}</div>
                          </td>

                          <td className="border px-2 py-1 text-right font-semibold">
                            ₹{(qty * supplyRate).toFixed(2)}
                          </td>
                          <td className="border px-2 py-1 text-right font-semibold">
                            ₹{(qty * installRate).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ACTIONS */}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setStep(9)}>Back</Button>
                <Button variant="destructive" disabled={!selectedGroupIds.length} onClick={handleDeletePaintingMaterials}>
                  Delete Selected
                </Button>
                <Button onClick={handleSavePaintingBOQ}>Save</Button>
                <Button onClick={() => setStep(1)}>
                  Add Product
                </Button>
                <Button onClick={() => setStep(12)}>Create BOQ</Button>
              </div>
            </motion.div>
          )}

          {/* STEP 12: QA BOQ – Painting Estimator */}
          {step === 12 && (
            <motion.div
              key="step-12-qa-boq-painting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              {/* HEADER */}
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <img src={ctintLogo} alt="logo" style={{ height: 56 }} />

                <div style={{ flex: 1, textAlign: "center" }}>
                  <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
                    CONCEPT TRUNK INTERIORS
                  </h1>
                  <div style={{ fontSize: 12, color: "#555" }}>
                    QA BILL OF QUANTITIES – PAINTING
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12 }}>{displayBillDate}</div>
                </div>
              </div>

              {/* TABLE */}
              {!qaMaterials || qaMaterials.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No finalized painting BOQ lines found. Complete Step 11 first.
                </div>
              ) : (
                <div className="overflow-x-auto border rounded-lg p-2">
                  <table className="min-w-full border-collapse text-sm w-full">
                    <thead>
                      <tr style={{ background: "#f3f4f6" }}>
                        <th className="border px-2 py-2">S.No</th>
                        <th className="border px-2 py-2">Material</th>
                        <th className="border px-2 py-2">Location</th>
                        <th className="border px-2 py-2">Description</th>
                        <th className="border px-2 py-2">Unit</th>
                        <th className="border px-2 py-2">Qty</th>
                        <th colSpan={2} className="border px-2 py-2 text-center">Rate</th>
                        <th colSpan={2} className="border px-2 py-2 text-center">Amount</th>
                      </tr>
                      <tr style={{ background: "#f9fafb" }}>
                        <th className="border px-2 py-1" />
                        <th className="border px-2 py-1" />
                        <th className="border px-2 py-1" />
                        <th className="border px-2 py-1" />
                        <th className="border px-2 py-1" />
                        <th className="border px-2 py-1" />
                        <th className="border px-2 py-1 text-center">Supply</th>
                        <th className="border px-2 py-1 text-center">Installation</th>
                        <th className="border px-2 py-1 text-center">Supply</th>
                        <th className="border px-2 py-1 text-center">Installation</th>
                      </tr>
                    </thead>

                    <tbody>
                      {qaMaterials.map((m: any, i: number) => {
                        const supplyRate = Number(
                          step11SupplyRates[m.id] ?? m.supplyRate ?? m.rate ?? 0
                        );
                        const installRate = Number(
                          step11InstallRates[m.id] ?? m.installRate ?? 0
                        );

                        const qty = Number(materialQtys[m.id] ?? m.quantity ?? 0);

                        const supplyAmt = qty * supplyRate;
                        const installAmt = qty * installRate;

                        const location = materialLocations[m.id] ?? m.location ?? "—";
                        const description = materialDescriptions[m.id] ?? m.description ?? "—";
                        const unit = materialUnits[m.id] ?? m.unit ?? "—";

                        return (
                          <tr key={m.id}>
                            <td className="border px-2 py-1 text-center">{i + 1}</td>
                            <td className="border px-2 py-1 font-medium">{m.name}</td>
                            <td className="border px-2 py-1 text-center">{location}</td>
                            <td
                              className="border px-2 py-1"
                              style={{ maxWidth: 650, wordBreak: "break-word" }}
                            >
                              <div className="whitespace-pre-wrap">{description}</div>
                            </td>
                            <td className="border px-2 py-1 text-center">{unit}</td>
                            <td className="border px-2 py-1 text-center">{qty}</td>
                            <td className="border px-2 py-1 text-right">
                              ₹{supplyRate.toFixed(2)}
                            </td>
                            <td className="border px-2 py-1 text-right">
                              ₹{installRate.toFixed(2)}
                            </td>
                            <td className="border px-2 py-1 text-right font-medium">
                              ₹{supplyAmt.toFixed(2)}
                            </td>
                            <td className="border px-2 py-1 text-right font-medium">
                              ₹{installAmt.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>

                    <tfoot>
                      <tr>
                        <td className="border px-2 py-1 text-right" colSpan={9}>
                          <strong>Subtotal</strong>
                        </td>
                        <td className="border px-2 py-1 text-right font-medium">
                          ₹{(qaSupplySubtotal || 0).toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* ACTIONS */}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setStep(11)}>Back</Button>
                <Button onClick={() => setStep(1)}>Add More Painting Items</Button>
                <Button onClick={handleExportExcelStep11}>Export Excel</Button>
              </div>
            </motion.div>
          )}



          {/* STEP 10: FINALIZE BOQ (Your exact Template) */}
          {step === 10 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div><Label>Bill No</Label><Input value={finalBillNo} onChange={(e) => setFinalBillNo(e.target.value)} /></div>
                <div><Label>Bill Date</Label><Input type="date" value={finalBillDate} onChange={(e) => setFinalBillDate(e.target.value)} /></div>
                <div><Label>Due Date</Label><Input type="date" value={finalDueDate} onChange={(e) => setFinalDueDate(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Customer Name</Label><Input value={finalCustomerName} onChange={(e) => setFinalCustomerName(e.target.value)} /></div>
                <div><Label>Customer Address</Label><Input value={finalCustomerAddress} onChange={(e) => setFinalCustomerAddress(e.target.value)} /></div>
              </div>
              <div><Label>Terms & Conditions</Label><Input value={finalTerms} onChange={(e) => setFinalTerms(e.target.value)} /></div>

              {/* MATERIAL DESCRIPTION INPUT */}
              <div className="space-y-4 border p-4 rounded-md bg-slate-50">
                <Label className="font-semibold">Material Description Entry</Label>
                <select className="w-full border rounded px-3 py-2" value={selectedMaterialId} onChange={(e) => setSelectedMaterialId(e.target.value)}>
                  <option value="">Select Material</option>
                  {currentMaterials.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
                </select>
                {selectedMaterialId && (<Input placeholder="Enter description for selected material" value={materialDescriptions[selectedMaterialId] || ""} onChange={(e) => setMaterialDescriptions((prev) => ({ ...prev, [selectedMaterialId]: e.target.value, }))} />)}
              </div>

              <div id="boq-final-pdf" style={{ width: "210mm", minHeight: "297mm", padding: "20mm", background: "#fff", color: "#000", fontFamily: "Arial", fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <img src={ctintLogo} alt="Logo" style={{ height: 60 }} />
                  <div style={{ textAlign: "right" }}>
                    <h2 style={{ margin: 0 }}>BILL</h2>
                    <div>Bill No: {finalBillNo}</div>
                  </div>
                </div>
                <hr style={{ margin: "10px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
                  <div style={{ width: "55%", lineHeight: 1.5 }}>
                    <strong>Concept Trunk Interiors</strong><br />
                    12/36A, Indira Nagar, Medavakkam, Chennai – 600100<br />
                    GSTIN: 33ASOPS5560M1Z1<br /><br />
                    <strong>Bill From</strong><br />
                    <pre style={{ margin: 0, fontFamily: "Arial", whiteSpace: "pre-wrap" }}>{finalShopDetails}</pre>
                  </div>
                  <div style={{ width: "40%", lineHeight: 1.6 }}>
                    <div><strong>Bill Date</strong> : {finalBillDate}</div>
                    <div><strong>Due Date</strong> : {finalDueDate}</div>
                    <div style={{ marginTop: 6 }}><strong>Terms</strong> : {finalTerms}</div>
                    <div style={{ marginTop: 6 }}><strong>Customer</strong> : {finalCustomerName}</div>
                  </div>
                </div>
                <table style={{ width: "100%", marginTop: 20, borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["S.No", "Item", "Description", "HSN", "Qty", "Rate", "Supplier", "Amount"].map(h => (
                        <th key={h} style={{ border: "1px solid #000", padding: 6, background: "#000", color: "#fff", fontSize: 11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {currentMaterials.map((m, i) => (
                      <tr key={i}>
                        <td style={{ border: "1px solid #000", padding: 6 }}>{i + 1}</td>
                        <td style={{ border: "1px solid #000", padding: 6 }}>{m.name}</td>
                        <td style={{ border: "1px solid #000", padding: 6 }}>{m.id ? (materialDescriptions[m.id] || m.name) : m.name}</td>
                        <td style={{ border: "1px solid #000", padding: 6 }}>3208</td>
                        <td style={{ border: "1px solid #000", padding: 6 }}>{m.quantity}</td>
                        <td style={{ border: "1px solid #000", padding: 6 }}>{m.rate}</td>
                        <td style={{ border: "1px solid #000", padding: 6 }}>{m.shopName}</td>
                        <td style={{ border: "1px solid #000", padding: 6, textAlign: "right" }}>{m.amount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                  <table style={{ width: 250 }}>
                    <tbody>
                      <tr><td>Sub Total</td><td style={{ textAlign: "right" }}>{subTotal.toFixed(2)}</td></tr>
                      <tr><td>SGST 9%</td><td style={{ textAlign: "right" }}>{sgst.toFixed(2)}</td></tr>
                      <tr><td>CGST 9%</td><td style={{ textAlign: "right" }}>{cgst.toFixed(2)}</td></tr>
                      <tr><td>Round Off</td><td style={{ textAlign: "right" }}>{roundOff.toFixed(2)}</td></tr>
                      <tr style={{ borderTop: "1px solid #000" }}><td><strong>Total</strong></td><td style={{ textAlign: "right" }}><strong>₹{Math.round(grandTotal).toFixed(2)}</strong></td></tr>
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: 50 }}>
                  <div style={{ width: 200, borderTop: "1px solid #000" }} />
                  <div>Authorized Signature</div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button onClick={() => setStep(8)} variant="outline">Back</Button>
                <Button onClick={handleExportFinalBOQ}>Export PDF</Button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </Layout>
  );
}