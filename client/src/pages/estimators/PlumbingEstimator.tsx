import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useData } from "@/lib/store";
import { Layout } from "@/components/layout/Layout";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function PlumbingEstimator() {
  const {
    shops: storeShops,
    materials: storeMaterials,
    products: storeProducts,
  } = useData();
  const { toast } = useToast();

  // --- Core States ---
  const [step, setStep] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [selectedProductObj, setSelectedProductObj] = useState<any>(null);
  const [finalBillNo, setFinalBillNo] = useState(
    `PLB-${Math.floor(1000 + Math.random() * 9000)}`,
  );
  const [finalBillDate, setFinalBillDate] = useState(
    new Date().toISOString().slice(0, 10),
  );

  // Selection states
  const [selectedMaterials, setSelectedMaterials] = useState<
    { materialId: string; selectedShopId: string; selectedBrand?: string }[]
  >([]);
  const [editableMaterials, setEditableMaterials] = useState<
    Record<
      string,
      { quantity: number; supplyRate: number; installRate: number }
    >
  >({});
  const [materialDescriptions, setMaterialDescriptions] = useState<
    Record<string, string>
  >({});
  const [materialLocations, setMaterialLocations] = useState<
    Record<string, string>
  >({});

  // Step 11 & 12 states
  const [step11SupplyRates, setStep11SupplyRates] = useState<
    Record<string, number>
  >({});
  const [step11InstallRates, setStep11InstallRates] = useState<
    Record<string, number>
  >({});
  const [dbStep9Items, setDbStep9Items] = useState<any[]>([]);
  const [dbStep11Items, setDbStep11Items] = useState<any[]>([]);
  const [savingStep11, setSavingStep11] = useState(false);

  // Load DB data on mount and when finalBillNo changes
  useEffect(() => {
    const loadDbData = async () => {
      if (!finalBillNo) return;
      try {
        const step9Response = await apiFetch(
          `/api/estimator-step9-items?session_id=${finalBillNo}&estimator=plumbing`,
        );
        if (step9Response.ok) {
          const data = await step9Response.json();
          setDbStep9Items(data.items || []);
        }

        const step11Response = await apiFetch(
          `/api/estimator-step11-groups?session_id=${finalBillNo}&estimator=plumbing`,
        );
        if (step11Response.ok) {
          const data = await step11Response.json();
          setDbStep11Items(data.items || []);
        }
      } catch (error) {
        console.warn("Failed to load DB data:", error);
      }
    };
    loadDbData();
  }, [finalBillNo]);

  // Normalize text for matching
  const normText = (s?: any) => String(s || "").toUpperCase();

  // Get plumbing products from the products list by subcategory
  const plumbingProducts = useMemo(() => {
    return (storeProducts || [])
      .filter((p: any) => {
        const subcat = normText(p.subcategory || p.subcategory_name || "");
        const cat = normText(p.category || p.category_name || "");
        return (
          subcat.includes("PLUMB") ||
          cat.includes("PLUMB") ||
          subcat.includes("PIPE") ||
          cat.includes("PIPE") ||
          subcat.includes("WATER") ||
          cat.includes("WATER")
        );
      })
      .sort((a: any, b: any) => {
        const aName = (a.name || "").toString();
        const bName = (b.name || "").toString();
        return aName.localeCompare(bName);
      });
  }, [storeProducts]);

  // Get materials for a selected product - use product field matching like DoorsEstimator
  const getMaterialsByProduct = (productNameOrObj: string | any) => {
    const productName =
      typeof productNameOrObj === "string"
        ? productNameOrObj
        : productNameOrObj?.name || "";
    
    if (!productName) return [];

    return storeMaterials.filter((m) => {
      const prod = normText(m.product || "");
      const subcat = normText(m.subCategory || "");
      const searchKey = normText(productName);
      
      // Strict product field matching first
      if (prod && searchKey && (prod.includes(searchKey) || searchKey.includes(prod))) {
        return true;
      }
      
      // Fallback to subcategory matching
      if (subcat && searchKey && (subcat.includes(searchKey) || searchKey.includes(subcat))) {
        return true;
      }
      
      return false;
    });
  };

  // Get unique brands for a material
  const getBrandsForMaterial = (materialId: string) => {
    const mat = storeMaterials.find((m) => m.id === materialId);
    if (!mat) return [];
    const variants = storeMaterials.filter(
      (m) => m.name === mat.name && m.code === mat.code,
    );
    return Array.from(
      new Set(variants.map((v) => v.brandName || "Generic")),
    ).sort();
  };

  // Get shops for a material and brand
  const getShopsForMaterialBrand = (materialId: string, brand?: string) => {
    const mat = storeMaterials.find((m) => m.id === materialId);
    if (!mat) return [];
    const variants = storeMaterials.filter(
      (m) =>
        m.name === mat.name &&
        (brand ? (m.brandName || "Generic") === brand : true),
    );
    return variants.filter(
      (v, i, arr) => arr.findIndex((a) => a.shopId === v.shopId) === i,
    );
  };

  const getMaterialsWithDetails = () => {
    return selectedMaterials.map((sel) => {
      const mat = storeMaterials.find((m) => m.id === sel.materialId);
      const shop = storeShops.find((s) => s.id === sel.selectedShopId);
      const qty = editableMaterials[mat?.id || ""]?.quantity ?? 1;
      const supplyRate =
        editableMaterials[mat?.id || ""]?.supplyRate ?? mat?.rate ?? 0;
      const installRate = editableMaterials[mat?.id || ""]?.installRate ?? 0;
      return {
        ...mat,
        quantity: qty,
        supplyRate,
        installRate,
        shopName: shop?.name || "Market",
        supplyAmount: qty * supplyRate,
        installAmount: qty * installRate,
      };
    });
  };

  const materials = getMaterialsWithDetails();
  const subTotal = materials.reduce(
    (s, m) =>
      s + (m.quantity || 0) * ((m.supplyRate || 0) + (m.installRate || 0)),
    0,
  );
  const sgst = subTotal * 0.09;
  const cgst = subTotal * 0.09;
  const roundOff =
    Math.round(subTotal + sgst + cgst) - (subTotal + sgst + cgst);
  const grandTotal = subTotal + sgst + cgst + roundOff;

  // Handle material selection with brand/shop logic
  const handleToggleMaterial = (matId: string) => {
    const isSelected = selectedMaterials.find((s) => s.materialId === matId);
    if (isSelected) {
      setSelectedMaterials((prev) =>
        prev.filter((s) => s.materialId !== matId),
      );
      setEditableMaterials((prev) => {
        const copy = { ...prev };
        delete copy[matId];
        return copy;
      });
    } else {
      const mat = getMaterialsByProduct(selectedProduct).find(
        (m) => m.id === matId,
      );
      if (mat) {
        const brands = getBrandsForMaterial(matId);
        const selectedBrand = brands[0] || "Generic";
        const shops = getShopsForMaterialBrand(matId, selectedBrand);
        const cheapest = shops.sort((a, b) => (a.rate || 0) - (b.rate || 0))[0];

        setSelectedMaterials((prev) => [
          ...prev,
          {
            materialId: matId,
            selectedShopId: cheapest?.shopId || "",
            selectedBrand,
          },
        ]);

        setEditableMaterials((prev) => ({
          ...prev,
          [matId]: {
            quantity: 1,
            supplyRate: cheapest?.rate || mat.rate || 0,
            installRate: 0,
          },
        }));
      }
    }
  };

  // Step 9 save
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

      const items = materials.map((m, idx) => ({
        session_id: finalBillNo,
        estimator: "plumbing",
        s_no: idx + 1,
        material_id: m.id,
        name: m.name,
        productLabel: (m as any).productLabel || null,
        product_label: (m as any).productLabel || null,
        unit: m.unit || "pcs",
        quantity: m.quantity,
        supply_rate: m.supplyRate,
        install_rate: m.installRate,
        shop_id:
          selectedMaterials.find((s) => s.materialId === m.id)
            ?.selectedShopId || "",
        shop_name: m.shopName,
        description: materialDescriptions[m.id || ""] || "",
        location: materialLocations[m.id || ""] || "",
      }));

      const res = await apiFetch("/api/estimator-step9-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimator: "plumbing",
          session_id: finalBillNo,
          items,
        }),
      });

      if (!res.ok) throw new Error("Save failed");

      const data = await res.json();
      setDbStep9Items(data.items || []);
      toast({ title: "Success", description: "Step 9 saved to database." });
      setStep(11);
    } catch (err) {
      console.error("Failed to save step 9", err);
      toast({
        title: "Error",
        description: "Failed to save step 9.",
        variant: "destructive",
      });
    }
  };

  // Step 11: Create BOQ preview (just move to step 12 without saving)
  const handleCreateBOQ = () => {
    if (materials.length === 0) {
      toast({
        title: "Error",
        description: "Please select materials first.",
        variant: "destructive",
      });
      return;
    }
    setStep(12);
  };

  // Step 11: Save to database
  const handleSaveStep11 = async () => {
    setSavingStep11(true);
    try {
      let currentDbItems = dbStep11Items || [];
      if (finalBillNo) {
        try {
          const cur = await apiFetch(
            `/api/estimator-step11-groups?session_id=${finalBillNo}&estimator=plumbing`,
          );
          if (cur.ok) {
            const d = await cur.json();
            currentDbItems = d.items || [];
            setDbStep11Items(currentDbItems);
          }
        } catch (e) {
          console.warn("Failed to refresh step11 items", e);
        }
      }

      const groups = materials.map((m, idx) => ({
        estimator: "plumbing",
        session_id: finalBillNo,
        s_no: idx + 1,
        group_key: `plumbing_${m.id}`,
        group_id: `group_${m.id}`,
        item_name: m.name,
        unit: m.unit || "pcs",
        quantity: m.quantity,
        location: materialLocations[m.id || ""] || "",
        description: materialDescriptions[m.id || ""] || "",
        supply_rate: step11SupplyRates[m.id || ""] || m.supplyRate || 0,
        install_rate: step11InstallRates[m.id || ""] || m.installRate || 0,
        supply_amount:
          m.quantity * (step11SupplyRates[m.id || ""] || m.supplyRate || 0),
        install_amount:
          m.quantity * (step11InstallRates[m.id || ""] || m.installRate || 0),
        supply_subtotal: materials.reduce(
          (s, it) =>
            s +
            it.quantity *
              (step11SupplyRates[it.id || ""] || it.supplyRate || 0),
          0,
        ),
        install_subtotal: materials.reduce(
          (s, it) =>
            s +
            it.quantity *
              (step11InstallRates[it.id || ""] || it.installRate || 0),
          0,
        ),
        sgst: sgst,
        cgst: cgst,
        round_off: roundOff,
        grand_total: grandTotal,
      }));

      const existingKeys = new Set(
        (currentDbItems || []).map((it: any) => it.group_key),
      );
      const newGroups = groups.filter(
        (g: any) => !existingKeys.has(g.group_key),
      );

      if (newGroups.length === 0) {
        toast({ title: "No changes", description: "No new items to save." });
        setSavingStep11(false);
        return;
      }

      const res = await apiFetch("/api/estimator-step11-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups: newGroups }),
      });

      if (!res.ok) throw new Error("Save failed");

      const reloadRes = await apiFetch(
        `/api/estimator-step11-groups?session_id=${finalBillNo}&estimator=plumbing`,
      );
      if (reloadRes.ok) {
        const data = await reloadRes.json();
        setDbStep11Items(data.items || []);
      }

      toast({ title: "Success", description: "Step 11 saved to database." });
      setSavingStep11(false);
    } catch (err) {
      console.error("handleSaveStep11", err);
      toast({
        title: "Error",
        description: "Failed to save Step 11.",
        variant: "destructive",
      });
      setSavingStep11(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto p-4 space-y-8">
        <h1 className="text-3xl font-bold">Plumbing Estimator</h1>

        <AnimatePresence mode="wait">
          {/* STEP 1: SELECT PRODUCT TYPE */}
          {step === 1 && (
            <motion.div
              key="s1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              <h2 className="text-xl font-semibold">Select Products</h2>
              {plumbingProducts.length === 0 ? (
                <Card className="p-6 bg-yellow-50 border-yellow-200">
                  <p className="text-center text-yellow-800">
                    No plumbing materials available in database
                  </p>
                </Card>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {plumbingProducts.map((product: any) => {
                      const productName =
                        product.name ||
                        product.subcategory ||
                        product.subcategory_name ||
                        "";
                      const materialCount =
                        getMaterialsByProduct(productName).length;
                      return (
                        <Card
                          key={product.id || productName}
                          className="cursor-pointer border-2 hover:border-primary transition-all hover:shadow-lg"
                          onClick={() => {
                            setSelectedProduct(productName);
                            setSelectedProductObj(product);
                            setSelectedMaterials([]);
                            setEditableMaterials({});
                            setStep(2);
                          }}
                        >
                          <CardContent className="p-6 text-center">
                            <p className="font-bold text-lg">{productName}</p>
                            <p className="text-sm text-slate-500">
                              {materialCount} items available
                            </p>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* STEP 2: SELECT MATERIALS & SHOPS */}
          {step === 2 && (
            <motion.div
              key="s2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              <h2 className="text-xl font-semibold">
                Select Materials & Shops
              </h2>
              <p className="text-sm text-slate-600">
                Available materials for {selectedProduct}. Best price shop is
                pre-selected.
              </p>

              <div className="grid grid-cols-1 gap-3 max-h-[600px] overflow-y-auto p-3 border rounded bg-slate-50">
                {getMaterialsByProduct(selectedProduct).map((mat) => {
                  const isSelected = selectedMaterials.some(
                    (m) => m.materialId === mat.id,
                  );
                  const currentSelection = selectedMaterials.find(
                    (m) => m.materialId === mat.id,
                  );
                  const brands = getBrandsForMaterial(mat.id);
                  const currentBrand =
                    currentSelection?.selectedBrand || brands[0] || "Generic";
                  const shops = getShopsForMaterialBrand(mat.id, currentBrand);

                  return (
                    <div
                      key={mat.id}
                      className={cn(
                        "p-4 border-2 rounded-lg transition-all",
                        isSelected
                          ? "border-primary bg-white"
                          : "border-slate-200 bg-white",
                      )}
                    >
                      <div className="flex items-start gap-4">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleToggleMaterial(mat.id)}
                          className="mt-1"
                        />
                        <div className="flex-1">
                          <p className="font-bold">{mat.name}</p>
                          <p className="text-xs text-slate-500">{mat.code}</p>
                        </div>
                      </div>

                      {isSelected && (
                        <div className="mt-4 ml-8 grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-xs">Select Brand</Label>
                            <Select
                              value={currentBrand}
                              onValueChange={(val) => {
                                setSelectedMaterials((prev) =>
                                  prev.map((s) =>
                                    s.materialId === mat.id
                                      ? { ...s, selectedBrand: val }
                                      : s,
                                  ),
                                );
                                const shopsForNewBrand =
                                  getShopsForMaterialBrand(mat.id, val);
                                const cheapest = shopsForNewBrand.sort(
                                  (a, b) => (a.rate || 0) - (b.rate || 0),
                                )[0];
                                if (cheapest) {
                                  setSelectedMaterials((prev) =>
                                    prev.map((s) =>
                                      s.materialId === mat.id
                                        ? {
                                            ...s,
                                            selectedShopId:
                                              cheapest.shopId || "",
                                          }
                                        : s,
                                    ),
                                  );
                                }
                              }}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {brands.map((b) => (
                                  <SelectItem key={b} value={b}>
                                    {b}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label className="text-xs">Select Shop</Label>
                            <Select
                              value={currentSelection?.selectedShopId || ""}
                              onValueChange={(val) =>
                                setSelectedMaterials((prev) =>
                                  prev.map((s) =>
                                    s.materialId === mat.id
                                      ? { ...s, selectedShopId: val }
                                      : s,
                                  ),
                                )
                              }
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue placeholder="Choose shop" />
                              </SelectTrigger>
                              <SelectContent>
                                {shops.map((s) => {
                                  const shop = storeShops.find(
                                    (sh) => sh.id === s.shopId,
                                  );
                                  return (
                                    <SelectItem
                                      key={s.id}
                                      value={s.shopId || ""}
                                    >
                                      {shop?.name || "Unknown"} — ₹{s.rate}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="flex-1"
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button
                  disabled={selectedMaterials.length === 0}
                  onClick={() => setStep(3)}
                  className="flex-1"
                >
                  Review Materials <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* STEP 3: SELECTED MATERIALS TABLE */}
          {step === 3 && (
            <motion.div
              key="s3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              <h2 className="text-xl font-semibold">Selected Materials</h2>
              <p className="text-sm text-slate-600">
                Edit quantities or rates before generating BOQ.
              </p>

              <div className="overflow-x-auto border rounded">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900 text-white">
                    <tr>
                      <th className="border p-3 text-left">Item</th>
                      <th className="border p-3">Brand</th>
                      <th className="border p-3">Qty</th>
                      <th className="border p-3">Unit</th>
                      <th className="border p-3">Shop</th>
                      <th className="border p-3 text-right">Rate (₹)</th>
                      <th className="border p-3 text-right">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materials.map((m) => (
                      <tr key={m.id} className="border-b hover:bg-slate-50">
                        <td className="border p-3 font-bold">{m.name}</td>
                        <td className="border p-3 text-center">
                          {selectedMaterials.find((s) => s.materialId === m.id)
                            ?.selectedBrand || "Generic"}
                        </td>
                        <td className="border p-3">
                          <Input
                            type="number"
                            min="1"
                            value={
                              editableMaterials[m.id || ""]?.quantity ??
                              m.quantity
                            }
                            onChange={(e) =>
                              setEditableMaterials((p) => ({
                                ...p,
                                [m.id!]: {
                                  ...(p[m.id!] || {
                                    supplyRate: m.supplyRate,
                                    installRate: 0,
                                  }),
                                  quantity: Number(e.target.value),
                                },
                              }))
                            }
                            className="h-8 w-20 text-center"
                          />
                        </td>
                        <td className="border p-3 text-center">{m.unit}</td>
                        <td className="border p-3 text-sm">{m.shopName}</td>
                        <td className="border p-3">
                          <Input
                            type="number"
                            value={
                              editableMaterials[m.id || ""]?.supplyRate ??
                              m.supplyRate
                            }
                            onChange={(e) =>
                              setEditableMaterials((p) => ({
                                ...p,
                                [m.id!]: {
                                  ...(p[m.id!] || {
                                    quantity: 1,
                                    installRate: 0,
                                  }),
                                  supplyRate: Number(e.target.value),
                                },
                              }))
                            }
                            className="h-8 w-24 text-right"
                          />
                        </td>
                        <td className="border p-3 text-right font-bold">
                          ₹
                          {(
                            Number(
                              editableMaterials[m.id || ""]?.quantity ??
                                m.quantity,
                            ) *
                            Number(
                              editableMaterials[m.id || ""]?.supplyRate ??
                                m.supplyRate ??
                                0,
                            )
                          ).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between items-center p-4 bg-blue-50 rounded font-bold text-lg">
                <span>Total Cost</span>
                <span>
                  ₹
                  {materials
                    .reduce(
                      (s, m) =>
                        s +
                        Number(
                          editableMaterials[m.id || ""]?.quantity ?? m.quantity,
                        ) *
                          Number(
                            editableMaterials[m.id || ""]?.supplyRate ??
                              m.supplyRate ??
                              0,
                          ),
                      0,
                    )
                    .toFixed(2)}
                </span>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setStep(2)}
                  className="flex-1"
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button onClick={() => setStep(8)} className="flex-1">
                  Review BOM <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* STEP 8: BOM DISPLAY */}
          {step === 8 && (
            <motion.div
              key="s8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6 max-w-5xl mx-auto"
            >
              <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <span className="text-green-600 text-3xl">✓</span>
                </div>
                <h2 className="text-4xl font-bold">Bill of Materials (BOM)</h2>
                <p className="text-slate-600 mt-2">
                  Generated on {new Date().toLocaleDateString()}
                </p>
              </div>

              <Card className="p-6 border-slate-200">
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">
                      Product Type
                    </p>
                    <p className="text-xl font-bold text-slate-900 mt-1">
                      {selectedProduct}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">
                      Quantities
                    </p>
                    <p className="text-xl font-bold text-slate-900 mt-1">
                      {materials.length} Items
                    </p>
                  </div>
                </div>
              </Card>

              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Materials Schedule</h3>
                <div className="overflow-x-auto border rounded">
                  <table className="w-full text-sm bg-white">
                    <thead className="bg-slate-100 border-b">
                      <tr>
                        <th className="p-3 text-left font-semibold text-slate-700">
                          S.No
                        </th>
                        <th className="p-3 text-left font-semibold text-slate-700">
                          Description
                        </th>
                        <th className="p-3 text-center font-semibold text-slate-700">
                          Unit
                        </th>
                        <th className="p-3 text-center font-semibold text-slate-700">
                          Qty
                        </th>
                        <th className="p-3 text-right font-semibold text-slate-700">
                          Rate (#)
                        </th>
                        <th className="p-3 text-left font-semibold text-slate-700">
                          Supplier
                        </th>
                        <th className="p-3 text-right font-semibold text-slate-700">
                          Amount (₹)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {materials.map((m, i) => (
                        <tr key={m.id} className="border-b hover:bg-slate-50">
                          <td className="p-3">{i + 1}</td>
                          <td className="p-3 font-medium">{m.name}</td>
                          <td className="p-3 text-center">{m.unit}</td>
                          <td className="p-3 text-center">
                            {editableMaterials[m.id || ""]?.quantity ??
                              m.quantity}
                          </td>
                          <td className="p-3 text-right">
                            {Number(
                              editableMaterials[m.id || ""]?.supplyRate ??
                                m.supplyRate ??
                                0,
                            ).toFixed(2)}
                          </td>
                          <td className="p-3">{m.shopName || "Market"}</td>
                          <td className="p-3 text-right font-bold">
                            {(
                              Number(
                                editableMaterials[m.id || ""]?.quantity ??
                                  m.quantity,
                              ) *
                              Number(
                                editableMaterials[m.id || ""]?.supplyRate ??
                                  m.supplyRate ??
                                  0,
                              )
                            ).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <Card className="p-6 bg-slate-50 border-slate-200">
                <div className="grid grid-cols-3 gap-8">
                  <div>
                    <p className="text-xs text-slate-600 font-semibold uppercase">
                      Total Materials
                    </p>
                    <p className="text-2xl font-bold text-slate-900 mt-2">
                      {materials.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-600 font-semibold uppercase">
                      Total Quantity
                    </p>
                    <p className="text-2xl font-bold text-slate-900 mt-2">
                      {materials.reduce(
                        (s, m) =>
                          s +
                          (editableMaterials[m.id || ""]?.quantity ??
                            m.quantity),
                        0,
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-600 font-semibold uppercase">
                      Grand Total
                    </p>
                    <p className="text-3xl font-bold text-blue-600 mt-2">
                      ₹{subTotal.toFixed(2)}
                    </p>
                  </div>
                </div>
              </Card>

              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={() => setStep(3)}>
                  Back
                </Button>
                <Button className="bg-green-600 hover:bg-green-700">
                  Export Excel
                </Button>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  Export PDF
                </Button>
                <Button
                  onClick={() => setStep(9)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Add to BOM <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep(1);
                    setSelectedMaterials([]);
                    setEditableMaterials({});
                    setMaterialDescriptions({});
                    setMaterialLocations({});
                    setStep11SupplyRates({});
                    setStep11InstallRates({});
                  }}
                >
                  New Estimate
                </Button>
              </div>
            </motion.div>
          )}

          {/* STEP 9: ADD TO BOQ */}
          {step === 9 && (
            <motion.div
              key="s9"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <div>
                <h2 className="text-3xl font-bold">Add to BOQ</h2>
                <p className="text-slate-600 mt-2">Plumbing Estimator</p>
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="destructive">Delete Selected</Button>
                <Button
                  onClick={handleSaveStep9}
                  className="bg-slate-600 hover:bg-slate-700"
                >
                  Save
                </Button>
                <Button
                  onClick={() => setStep(11)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Add to BOQ
                </Button>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-lg">Saved BOQs</h3>
                {dbStep9Items.length === 0 ? (
                  <p className="text-slate-500">No saved BOQs</p>
                ) : null}

                <div className="overflow-x-auto border rounded">
                  <table className="w-full text-sm bg-white">
                    <thead className="bg-slate-100 border-b">
                      <tr>
                        <th className="p-3">
                          <Checkbox />
                        </th>
                        <th className="p-3 text-left font-semibold">S.No</th>
                        <th className="p-3 text-left font-semibold">Item</th>
                        <th className="p-3 text-left font-semibold">
                          Description
                        </th>
                        <th className="p-3 font-semibold">Unit</th>
                        <th className="p-3 font-semibold">Qty</th>
                        <th className="p-3 font-semibold">Rate</th>
                        <th className="p-3 font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {materials.map((m, idx) => (
                        <React.Fragment key={m.id}>
                          <tr className="border-b bg-slate-50">
                            <td className="p-3">
                              <Checkbox />
                            </td>
                            <td colSpan={7} className="p-3">
                              <p className="font-bold text-slate-900">
                                {idx + 1}. {m.name}
                              </p>
                              {materialDescriptions[m.id || ""] && (
                                <p className="text-xs text-slate-600 mt-1">
                                  Group description
                                </p>
                              )}
                            </td>
                          </tr>
                          <tr className="border-b">
                            <td></td>
                            <td className="p-3 text-center">{idx + 1}</td>
                            <td className="p-3 font-medium">{m.name}</td>
                            <td className="p-3">
                              <textarea
                                value={materialDescriptions[m.id || ""] || ""}
                                onChange={(e) =>
                                  setMaterialDescriptions((p) => ({
                                    ...p,
                                    [m.id!]: e.target.value,
                                  }))
                                }
                                placeholder="Description"
                                className="w-full h-12 p-2 rounded border text-xs"
                              />
                            </td>
                            <td className="p-3 text-center">{m.unit}</td>
                            <td className="p-3">
                              <Input
                                type="number"
                                value={
                                  editableMaterials[m.id || ""]?.quantity ??
                                  m.quantity
                                }
                                onChange={(e) =>
                                  setEditableMaterials((p) => ({
                                    ...p,
                                    [m.id!]: {
                                      ...(p[m.id!] || {
                                        supplyRate: m.supplyRate,
                                        installRate: 0,
                                      }),
                                      quantity: Number(e.target.value),
                                    },
                                  }))
                                }
                                className="h-8 w-20 text-center"
                              />
                            </td>
                            <td className="p-3">
                              <Input
                                type="number"
                                value={
                                  editableMaterials[m.id || ""]?.supplyRate ??
                                  m.supplyRate
                                }
                                onChange={(e) =>
                                  setEditableMaterials((p) => ({
                                    ...p,
                                    [m.id!]: {
                                      ...(p[m.id!] || {
                                        quantity: 1,
                                        installRate: 0,
                                      }),
                                      supplyRate: Number(e.target.value),
                                    },
                                  }))
                                }
                                className="h-8 w-24 text-right"
                              />
                            </td>
                            <td className="p-3 text-right font-bold">
                              ₹
                              {(
                                Number(
                                  editableMaterials[m.id || ""]?.quantity ??
                                    m.quantity,
                                ) *
                                Number(
                                  editableMaterials[m.id || ""]?.supplyRate ??
                                    m.supplyRate ??
                                    0,
                                )
                              ).toFixed(2)}
                            </td>
                          </tr>
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(8)}>
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button
                  onClick={() => setStep(10)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Finalize PO
                </Button>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  Export PDF <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* STEP 10: BILL ENTRY & PREVIEW */}
          {step === 10 && (
            <motion.div
              key="s10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6 max-w-4xl mx-auto"
            >
              <h2 className="text-2xl font-bold">Finalize Bill</h2>

              <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 rounded border">
                <div>
                  <Label>Bill No</Label>
                  <Input
                    value={finalBillNo}
                    onChange={(e) => setFinalBillNo(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Bill Date</Label>
                  <Input
                    type="date"
                    value={finalBillDate}
                    onChange={(e) => setFinalBillDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Due Date</Label>
                  <Input type="date" placeholder="mm/dd/yyyy" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Customer Name</Label>
                  <Input placeholder="Enter customer name" />
                </div>
                <div>
                  <Label>Customer Address</Label>
                  <Input placeholder="Enter customer address" />
                </div>
              </div>

              <div>
                <Label>Terms & Conditions</Label>
                <Input defaultValue="50% Advance and 50% on Completion" />
              </div>

              <div>
                <Label>Material Description Entry</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Material" />
                  </SelectTrigger>
                  <SelectContent>
                    {materials.map((m) => (
                      <SelectItem key={m.id} value={m.id || ""}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="border-t-2 pt-6 mt-6">
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="w-32 h-20 bg-black rounded flex items-center justify-center text-white font-bold text-xs text-center">
                    PLUMBING
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-sm">PLUMBING ESTIMATOR</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-600">BILL</p>
                    <p className="font-bold">{finalBillNo}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-8 mb-6 text-sm">
                  <div>
                    <p className="font-bold text-sm mb-2">
                      Concept Trunk Interiors
                    </p>
                    <p className="text-xs">12/36A, Indira Nagar</p>
                    <p className="text-xs">Medavakkam</p>
                    <p className="text-xs">Chennai – 600100</p>
                    <p className="text-xs">GSTIN: 33ASOPS5560M1Z1</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-600">
                      Bill Date: {finalBillDate}
                    </p>
                    <p className="text-xs text-slate-600">Due Date</p>
                    <p className="text-xs text-slate-600">
                      Terms: 50% Advance and 50% on Completion
                    </p>
                    <p className="text-xs text-slate-600 mt-2">Customer Name</p>
                  </div>
                </div>

                <div className="border-t pt-4 mb-6 text-sm">
                  <p className="font-bold mb-2">Bill From</p>
                  <p className="font-bold">New TamilNadu Steel</p>
                  <p className="text-xs">Chennai</p>
                  <p className="text-xs">Tamil Nadu</p>
                  <p className="text-xs">600100</p>
                </div>

                <div className="overflow-x-auto border rounded mb-6">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-800 text-white">
                      <tr>
                        <th className="p-2 text-left">S.No</th>
                        <th className="p-2 text-left">Item</th>
                        <th className="p-2 text-left">Description</th>
                        <th className="p-2">HSN</th>
                        <th className="p-2">Qty</th>
                        <th className="p-2 text-right">Rate</th>
                        <th className="p-2 text-left">Supplier</th>
                        <th className="p-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {materials.map((m, i) => (
                        <tr key={m.id} className="border-b">
                          <td className="p-2">{i + 1}</td>
                          <td className="p-2">{m.name}</td>
                          <td className="p-2">
                            {materialDescriptions[m.id || ""] || m.name}
                          </td>
                          <td className="p-2">7308</td>
                          <td className="p-2">
                            {editableMaterials[m.id || ""]?.quantity ??
                              m.quantity}
                          </td>
                          <td className="p-2 text-right">
                            {Number(
                              editableMaterials[m.id || ""]?.supplyRate ??
                                m.supplyRate ??
                                0,
                            ).toFixed(2)}
                          </td>
                          <td className="p-2">{m.shopName || "Market"}</td>
                          <td className="p-2 text-right">
                            {(
                              Number(
                                editableMaterials[m.id || ""]?.quantity ??
                                  m.quantity,
                              ) *
                              Number(
                                editableMaterials[m.id || ""]?.supplyRate ??
                                  m.supplyRate ??
                                  0,
                              )
                            ).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end gap-32 text-sm mb-6 font-bold">
                  <div>
                    <p>Sub Total</p>
                    <p>SGST 9%</p>
                    <p>CGST 9%</p>
                    <p>Round Off</p>
                    <p className="border-t pt-1">Total</p>
                    <p>Balance Due</p>
                  </div>
                  <div className="text-right">
                    <p>₹{subTotal.toFixed(2)}</p>
                    <p>₹{sgst.toFixed(2)}</p>
                    <p>₹{cgst.toFixed(2)}</p>
                    <p>₹{roundOff.toFixed(2)}</p>
                    <p className="border-t pt-1">₹{grandTotal.toFixed(2)}</p>
                    <p>₹{grandTotal.toFixed(2)}</p>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <p className="text-xs">Authorized Signature</p>
                  <div className="h-20"></div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(9)}>
                  Back
                </Button>
                <Button
                  onClick={() => setStep(11)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Continue <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  Export PDF <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* STEP 11: FINALIZE BOQ */}
          {step === 11 && (
            <motion.div
              key="s11"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="w-24 h-24 bg-black rounded flex items-center justify-center text-white font-bold text-xs text-center">
                  PLUMBING
                </div>
                <div className="text-center flex-1">
                  <h1 className="text-3xl font-bold tracking-wide">
                    PLUMBING ESTIMATOR
                  </h1>
                  <p className="text-slate-600 text-sm mt-1">
                    BILL OF QUANTITIES (BOQ)
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-slate-900">
                    {new Date().toISOString().slice(0, 10)}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto border rounded">
                <table className="w-full text-xs bg-white">
                  <thead>
                    <tr className="bg-slate-100 border-b">
                      <th className="p-2 text-left">S.No</th>
                      <th className="p-2 text-left">Item</th>
                      <th className="p-2 text-left">Location</th>
                      <th className="p-2 text-left">Description</th>
                      <th className="p-2">Unit</th>
                      <th className="p-2">Qty</th>
                      <th colSpan={2} className="p-2 text-center border-l">
                        Rate
                      </th>
                      <th colSpan={2} className="p-2 text-center border-l">
                        Amount
                      </th>
                    </tr>
                    <tr className="bg-slate-50 border-b">
                      <th colSpan={6}></th>
                      <th className="p-2 border-l text-center text-xs font-semibold">
                        Supply
                      </th>
                      <th className="p-2 text-center text-xs font-semibold">
                        Installation
                      </th>
                      <th className="p-2 border-l text-center text-xs font-semibold">
                        Supply
                      </th>
                      <th className="p-2 text-center text-xs font-semibold">
                        Installation
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {materials.map((m, idx) => (
                      <tr key={m.id} className="border-b">
                        <td className="p-2 font-bold">{idx + 1}</td>
                        <td className="p-2 font-bold">{m.name}</td>
                        <td className="p-2">
                          <Input
                            value={materialLocations[m.id || ""] || ""}
                            onChange={(e) =>
                              setMaterialLocations((p) => ({
                                ...p,
                                [m.id!]: e.target.value,
                              }))
                            }
                            placeholder="Location"
                            className="h-7 text-xs p-1"
                          />
                        </td>
                        <td className="p-2">
                          <textarea
                            value={materialDescriptions[m.id || ""] || ""}
                            onChange={(e) =>
                              setMaterialDescriptions((p) => ({
                                ...p,
                                [m.id!]: e.target.value,
                              }))
                            }
                            placeholder="Description"
                            className="w-full h-12 p-1 rounded border text-xs"
                          />
                        </td>
                        <td className="p-2 text-center">{m.unit}</td>
                        <td className="p-2 text-center">
                          {editableMaterials[m.id || ""]?.quantity ??
                            m.quantity}
                        </td>
                        <td className="p-2 border-l">
                          <Input
                            type="number"
                            value={
                              step11SupplyRates[m.id || ""] ||
                              (editableMaterials[m.id || ""]?.supplyRate ??
                                m.supplyRate ??
                                0)
                            }
                            onChange={(e) =>
                              setStep11SupplyRates((p) => ({
                                ...p,
                                [m.id!]: Number(e.target.value),
                              }))
                            }
                            className="h-7 text-xs p-1 text-right w-20"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            value={step11InstallRates[m.id || ""] || 0}
                            onChange={(e) =>
                              setStep11InstallRates((p) => ({
                                ...p,
                                [m.id!]: Number(e.target.value),
                              }))
                            }
                            className="h-7 text-xs p-1 text-right w-20"
                          />
                        </td>
                        <td className="p-2 border-l text-right font-bold">
                          ₹
                          {(
                            Number(
                              editableMaterials[m.id || ""]?.quantity ??
                                m.quantity,
                            ) *
                            Number(
                              step11SupplyRates[m.id || ""] ||
                                (editableMaterials[m.id || ""]?.supplyRate ??
                                  m.supplyRate ??
                                  0),
                            )
                          ).toFixed(2)}
                        </td>
                        <td className="p-2 text-right font-bold">
                          ₹
                          {(
                            Number(
                              editableMaterials[m.id || ""]?.quantity ??
                                m.quantity,
                            ) * Number(step11InstallRates[m.id || ""] || 0)
                          ).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="text-right p-4 bg-slate-50 rounded border">
                <p className="font-bold text-slate-900">
                  Subtotal <span className="ml-8">₹{subTotal.toFixed(2)}</span>
                </p>
              </div>

              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={() => setStep(9)}>
                  Back
                </Button>
                <Button variant="destructive">Delete Selected</Button>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  Add Product
                </Button>
                <Button
                  onClick={handleSaveStep11}
                  disabled={savingStep11}
                  className="bg-slate-600 hover:bg-slate-700"
                >
                  Save
                </Button>
                <Button
                  onClick={handleCreateBOQ}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Create BOQ
                </Button>
              </div>
            </motion.div>
          )}

          {/* STEP 12: FINAL QA BOQ */}
          {step === 12 && (
            <motion.div
              key="s12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    width: 56,
                    height: 56,
                    backgroundColor: "#000",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 8,
                  }}
                >
                  PLB
                </div>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
                    PLUMBING ESTIMATOR
                  </h1>
                  <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
                    QA BILL OF QUANTITIES (BOQ)
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {finalBillDate}
                  </div>
                </div>
              </div>

              {materials.length === 0 ? (
                <div className="text-center py-8">
                  <p>No materials selected. Complete Step 11 first.</p>
                </div>
              ) : (
                <div className="overflow-x-auto border rounded-lg p-2">
                  <table className="min-w-full border-collapse text-sm w-full">
                    <thead>
                      <tr style={{ background: "#f3f4f6" }}>
                        <th className="border px-2 py-2">S.No</th>
                        <th className="border px-2 py-2">Item</th>
                        <th className="border px-2 py-2">Location</th>
                        <th className="border px-2 py-2">Description</th>
                        <th className="border px-2 py-2">Unit</th>
                        <th className="border px-2 py-2">Qty</th>
                        <th
                          colSpan={2}
                          className="border px-2 py-2 text-center"
                        >
                          Rate
                        </th>
                        <th
                          colSpan={2}
                          className="border px-2 py-2 text-center"
                        >
                          Amount
                        </th>
                      </tr>
                      <tr style={{ background: "#f9fafb" }}>
                        <th className="border px-2 py-1"></th>
                        <th className="border px-2 py-1"></th>
                        <th className="border px-2 py-1"></th>
                        <th className="border px-2 py-1"></th>
                        <th className="border px-2 py-1"></th>
                        <th className="border px-2 py-1"></th>
                        <th className="border px-2 py-1 text-center">Supply</th>
                        <th className="border px-2 py-1 text-center">
                          Installation
                        </th>
                        <th className="border px-2 py-1 text-center">Supply</th>
                        <th className="border px-2 py-1 text-center">
                          Installation
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {materials.map((m, i) => {
                        const supplyRate = Number(
                          step11SupplyRates[m.id || ""] ||
                            (editableMaterials[m.id || ""]?.supplyRate ??
                              m.supplyRate ??
                              0),
                        );
                        const installRate = Number(
                          step11InstallRates[m.id || ""] || 0,
                        );
                        const qty = Number(
                          editableMaterials[m.id || ""]?.quantity ??
                            m.quantity ??
                            0,
                        );
                        const supplyAmt = qty * supplyRate;
                        const installAmt = qty * installRate;
                        const locVal = materialLocations[m.id || ""] || "";
                        const descVal = materialDescriptions[m.id || ""] || "";
                        return (
                          <tr key={m.id}>
                            <td className="border px-2 py-1 text-center">
                              {i + 1}
                            </td>
                            <td className="border px-2 py-1">{m.productLabel || m.name}</td>
                            <td className="border px-2 py-1 text-center">
                              <div className="text-sm">{locVal || "—"}</div>
                            </td>
                            <td
                              className="border px-2 py-1"
                              style={{ maxWidth: 650, wordBreak: "break-word" }}
                            >
                              <div className="text-sm whitespace-pre-wrap">
                                {descVal || "—"}
                              </div>
                            </td>
                            <td className="border px-2 py-1 text-center">
                              {m.unit}
                            </td>
                            <td className="border px-2 py-1 text-center">
                              {qty}
                            </td>
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
                          ₹
                          {materials
                            .reduce((s, m) => {
                              const qty = Number(
                                editableMaterials[m.id || ""]?.quantity ??
                                  m.quantity ??
                                  0,
                              );
                              const installRate = Number(
                                step11InstallRates[m.id || ""] || 0,
                              );
                              return s + qty * installRate;
                            }, 0)
                            .toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              <div className="flex justify-end gap-2 mt-6">
                <Button variant="outline" onClick={() => setStep(11)}>
                  Back
                </Button>
                <Button
                  onClick={handleSaveStep11}
                  disabled={savingStep11}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Save to DB
                </Button>
                <Button
                  onClick={() => {
                    setStep(1);
                    setSelectedMaterials([]);
                    setEditableMaterials({});
                    setMaterialDescriptions({});
                    setMaterialLocations({});
                    setStep11SupplyRates({});
                    setStep11InstallRates({});
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Add More Products
                </Button>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  Export Excel
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
}
