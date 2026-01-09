import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ChevronLeft, Download } from "lucide-react";
import { useData } from "@/lib/store";
import { WallType, wallOptions, subOptionsMap } from "@/lib/constants";
import { computeRequired, ComputedMaterials } from "./computeRequired";
import { CheckCircle2 } from "lucide-react";

const ctintLogo = "/image.png";

interface MaterialWithQuantity {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  rate: number;
  shopId: string;
  shopName: string;
}

export default function CivilWallEstimator() {
  const { shops: storeShops, materials: storeMaterials } = useData();

  const [step, setStep] = useState(1);
  const [wallType, setWallType] = useState<WallType | null>("civil");
  const [subOption, setSubOption] = useState<string | null>("9 inch");
  const [length, setLength] = useState<number | null>(10);
  const [height, setHeight] = useState<number | null>(8);
  const [brickWastage, setBrickWastage] = useState(0);

  const [selectedMaterials, setSelectedMaterials] = useState<
    { materialId: string; selectedShopId: string }[]
  >([]);

  const [computed, setComputed] = useState<ComputedMaterials | null>(null);

  // Editable materials state used in Step 5 (rate/quantity editable by user)
  const [editableMaterials, setEditableMaterials] = useState<Record<string, { quantity: number; rate: number }>>({});
  // Step 4: per-material shop selection (keyed by material code)
  const [step4ShopSelection, setStep4ShopSelection] = useState<Record<string, string>>({});
  // Final BOQ manual fields
  const [finalBillNo, setFinalBillNo] = useState<string>("");
  const [finalBillDate, setFinalBillDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [finalDueDate, setFinalDueDate] = useState<string>("");
  const [finalTerms, setFinalTerms] = useState<string>("50% Advance and 50% on Completion");
  const [finalCustomerName, setFinalCustomerName] = useState<string>("");
  const [finalCustomerAddress, setFinalCustomerAddress] = useState<string>("");
  const [finalShopDetails, setFinalShopDetails] = useState<string>("");
  // Compute materials automatically
  useEffect(() => {
    if (length && height && wallType && subOption) {
      const result = computeRequired(wallType, length, height, subOption, brickWastage);
      setComputed(result);
    }
  }, [length, height, wallType, subOption, brickWastage]);

  // Get available materials filtered by wall type
  const getAvailableMaterials = () => {
    if (!wallType) return [];

    const keywordsMap: Record<string, string[]> = {
      civil: ["BRICK", "CEMENT", "SAND", "MORTAR", "AGGREGATE", "MASON", "STEEL"],
      gypsum: ["GYPSUM", "PLASTER", "ROCKWOOL", "STUD", "FURRING", "BOARD", "DRYWALL"],
      plywood: ["PLYWOOD", "LAMINATE", "ALUMINIUM", "CHANNEL", "ROCKWOOL", "BOARD"],
      "gypsum-plywood": ["GYPSUM", "PLASTER", "ROCKWOOL", "STUD", "FURRING", "BOARD", "DRYWALL", "PLYWOOD", "LAMINATE", "ALUMINIUM", "CHANNEL"],
      "gypsum-glass": ["GYPSUM", "PLASTER", "ROCKWOOL", "STUD", "FURRING", "BOARD", "DRYWALL", "GLASS", "ALUMINIUM", "FRAME"],
      "plywood-glass": ["PLYWOOD", "LAMINATE", "ALUMINIUM", "CHANNEL", "ROCKWOOL", "BOARD", "GLASS", "FRAME"],
    };

    const kws = keywordsMap[wallType] || [wallType.toUpperCase()];
    const normalize = (s: string | undefined) => (s || "").toString().toUpperCase();

    // Filter materials whose category/subCategory/name/code include any keyword
    const candidates = storeMaterials.filter((m) => {
      const cat = normalize(m.category);
      const sub = normalize(m.subCategory as string);
      const name = normalize(m.name);
      const code = normalize(m.code);
      // Exclude obvious non-wall hardware for civil walls
      const excludeForCivil = ["DOOR", "HINGE", "LOCK", "HANDLE", "HARDWARE", "GLASS", "FRAME-001"];
      if (wallType === "civil") {
        const isExcluded = excludeForCivil.some((ex) => cat.includes(ex) || sub.includes(ex) || name.includes(ex) || code.includes(ex));
        if (isExcluded) return false;
      }
      return kws.some((kw) => cat.includes(kw) || sub.includes(kw) || name.includes(kw) || code.includes(kw));
    });

    return candidates;
  };

  // Unique materials by code for step 4 listing
  const getUniqueMaterials = () => {
    const mats = getAvailableMaterials();
    const map = new Map<string, typeof mats[0]>();

    // Deduplicate by normalized code if available, otherwise by name
    const normalizeKey = (m: typeof mats[0]) => (m.code && m.code.toString().trim()) ? m.code.trim().toUpperCase() : m.name.trim().toUpperCase();

    for (const m of mats) {
      const key = normalizeKey(m);
      const existing = map.get(key);
      // Prefer the lowest-rate representative for the unique list
      if (!existing || (m.rate || 0) < (existing.rate || 0)) {
        map.set(key, m);
      }
    }

    return Array.from(map.values());
  };

  // Initialize default shop selection (lowest-rate) for step 4
  useEffect(() => {
    const unique = getUniqueMaterials();
    const map: Record<string, string> = {};
    unique.forEach((mat) => {
      const shops = storeMaterials
        .filter((m) => (m.code || m.id) === (mat.code || mat.id) && m.shopId)
        .map((m) => ({ shopId: m.shopId as string, rate: m.rate }))
        .sort((a, b) => a.rate - b.rate);
      if (shops.length > 0) map[mat.code || mat.id] = shops[0].shopId;
    });
    setStep4ShopSelection((prev) => ({ ...map, ...prev }));
  }, [storeMaterials]);

  // Toggle material selection with optional shopId
  const handleToggleMaterial = (materialId: string, shopId?: string) => {
    setSelectedMaterials((prev) => {
      const exists = prev.find((m) => m.materialId === materialId);
      if (exists) {
        // Toggle off - remove from selection
        return prev.filter((m) => m.materialId !== materialId);
      } else {
        // Toggle on - add to selection
        let selectedShopId = shopId;
        if (!selectedShopId) {
          // find material code for this materialId and pick lowest-rate shop for that code
          const mat = storeMaterials.find((m) => m.id === materialId);
          const codeKey = mat ? (mat.code || mat.id) : materialId;
          const availableShops = storeMaterials
            .filter((m) => (m.code || m.id) === codeKey && m.shopId)
            .sort((a, b) => a.rate - b.rate);
          selectedShopId = availableShops[0]?.shopId || "";
        }
        return [...prev, { materialId, selectedShopId }];
      }
    });
  };

  // Change shop for a selected material
  const handleChangeShop = (materialId: string, shopId: string) => {
    setSelectedMaterials((prev) =>
      prev.map((m) =>
        m.materialId === materialId ? { ...m, selectedShopId: shopId } : m
      )
    );
  };

  // Helper: Check if a material is selected
  const isMaterialSelected = (materialId: string): boolean => {
    return selectedMaterials.some((m) => m.materialId === materialId);
  };

  // Helper: Get selected shop info for a material
  const getSelectedShopInfo = (materialId: string) => {
    const selection = selectedMaterials.find((m) => m.materialId === materialId);
    if (!selection) return null;
    const allShopsForMaterial = storeMaterials.filter((m) => m.id === materialId);
    const bestShop = allShopsForMaterial.sort((a, b) => a.rate - b.rate)[0];
    if (!bestShop) return null;
    return {
      shopName: storeShops.find((s) => s.id === bestShop.shopId)?.name || "Unknown",
      rate: bestShop.rate,
      unit: bestShop.unit || "pcs",
    };
  };

  // Helper: Check if any material matching keywords is selected
  const isMaterialTypeSelected = (keywords: string[]): boolean => {
    return selectedMaterials.some((selected) => {
      const material = storeMaterials.find((m) => m.id === selected.materialId);
      if (!material) return false;
      const name = material.name.toLowerCase();
      return keywords.some((kw) => name.includes(kw.toLowerCase()));
    });
  };

  // Helper component to render a material row with status
  const MaterialRow = ({
    name,
    quantity,
    unit,
    keywords,
  }: {
    name: string;
    quantity: number;
    unit: string;
    keywords: string[];
  }) => {
    const isSelected = isMaterialTypeSelected(keywords);
    return (
      <div
        className={`grid grid-cols-12 gap-2 p-3 border rounded ${
          isSelected
            ? "bg-green-50 border-green-200"
            : "bg-red-50 border-red-200"
        }`}
      >
        <div className="col-span-5 font-medium">{name}</div>
        <div className="col-span-2 text-right font-bold">{Math.ceil(quantity)}</div>
        <div className="col-span-2 text-right text-muted-foreground">{unit}</div>
        <div
          className={`col-span-3 text-right font-semibold ${
            isSelected ? "text-green-600" : "text-red-600"
          }`}
        >
          {isSelected ? "✓ SELECTED" : "⚠️ MISSING"}
        </div>
      </div>
    );
  };

  // Get materials with quantities and shop info
  const getMaterialsWithDetails = (): MaterialWithQuantity[] => {
    return selectedMaterials.map(({ materialId, selectedShopId }) => {
      // materialId refers to the unique representative id (from getUniqueMaterials)
      const rep = storeMaterials.find((m) => m.id === materialId) || storeMaterials.find((m) => (m.code || m.id) === materialId);
      if (!rep) return null;

      let quantity = 0;
      let unit = rep.unit || "pcs";

      // Find the selected shop's material record by matching code and shopId
      const codeKey = (rep.code || rep.id).toString();
      const selectedMat = storeMaterials.find(
        (m) => ((m.code || m.id).toString() === codeKey) && m.shopId === selectedShopId
      );
      const rate = selectedMat?.rate ?? rep.rate ?? 0;

      // Calculate quantity based on material name keywords
      const nameLower = (rep.name || "").toLowerCase();
      if (wallType === "civil" && computed) {
        if (nameLower.includes("brick")) quantity = computed.roundedBricks || 0;
        else if (nameLower.includes("cement")) {
          quantity = computed.roundedCementBags || 0;
          unit = "bags";
        } else if (nameLower.includes("sand")) {
          quantity = computed.roundedSandCubicFt || 0;
          unit = "cft";
        }
      } else if (wallType === "gypsum" && computed) {
        if (nameLower.includes("gypsum")) quantity = computed.boards || 0;
        else if (nameLower.includes("rockwool")) {
          quantity = computed.rockwoolSheets || 0;
          unit = "bags";
        }
      } else if (wallType === "plywood" && computed) {
        if (nameLower.includes("plywood")) quantity = computed.boardsPlywood || 0;
        else if (nameLower.includes("laminate")) quantity = computed.laminateSheets || 0;
        else if (nameLower.includes("aluminium")) quantity = computed.aluminiumChannels || 0;
        else if (nameLower.includes("rockwool")) quantity = computed.rockwoolBags || 0;
      }

      return {
        id: rep.id,
        name: rep.name,
        quantity: Math.ceil(quantity),
        unit,
        rate,
        shopId: selectedShopId,
        shopName: storeShops.find((s) => s.id === selectedShopId)?.name || "Unknown",
      };
    }).filter(Boolean) as MaterialWithQuantity[];
  };

  // Initialize editable materials when entering Step 5 or when selection changes
  useEffect(() => {
    if (step === 5) {
      const details = getMaterialsWithDetails();
      const map: Record<string, { quantity: number; rate: number }> = {};
      details.forEach((d) => {
        map[d.id] = { quantity: d.quantity || 0, rate: d.rate || 0 };
      });
      setEditableMaterials(map);
    }
  }, [step, selectedMaterials, computed]);

  const setEditableQuantity = (materialId: string, quantity: number) => {
    setEditableMaterials((prev) => ({
      ...prev,
      [materialId]: { ...(prev[materialId] || { rate: 0 }), quantity: Math.max(0, Math.ceil(quantity)) },
    }));
  };

  const changeEditableRate = (materialId: string, delta: number) => {
    setEditableMaterials((prev) => {
      const cur = prev[materialId] || { quantity: 0, rate: 0 };
      const newRate = Math.max(0, Math.round((cur.rate + delta) * 100) / 100);
      return { ...prev, [materialId]: { ...cur, rate: newRate } };
    });
  };

  // Final materials used for BOQ and totals (take editable overrides when available)
  const getFinalMaterials = (): MaterialWithQuantity[] => {
    return getMaterialsWithDetails().map((m) => {
      const override = editableMaterials[m.id];
      if (!override) return m;
      return { ...m, quantity: override.quantity, rate: override.rate };
    });
  };

  const calculateTotalCost = () =>
    getFinalMaterials().reduce((sum, m) => sum + m.quantity * m.rate, 0);

  const handleExportBOQ = () => {
    const materials = getMaterialsWithDetails();
    const csvLines = [
      "BILL OF QUANTITIES (BOQ)",
      `Generated: ${new Date().toLocaleString()}`,
      `Wall Type: ${wallType}`,
      `Dimensions: ${length}ft × ${height}ft`,
      "",
      "MATERIALS SCHEDULE",
      "S.No,Item,Unit,Quantity,Unit Rate,Total,Shop",
    ];
    materials.forEach((mat, idx) => {
      const total = mat.quantity * mat.rate;
      csvLines.push(
        `${idx + 1},"${mat.name}","${mat.unit}",${mat.quantity},${mat.rate},${total},"${mat.shopName}"`
      );
    });
    csvLines.push("", `TOTAL COST,,,,${calculateTotalCost().toFixed(2)}`);

    const csv = csvLines.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BOQ-${wallType}-${new Date().getTime()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Prefill final shop/company details when opening final BOQ step
  useEffect(() => {
    if (step === 7) {
      const details = getMaterialsWithDetails();
      if (details.length > 0) {
        const firstShopId = details[0].shopId;
        const shop = storeShops.find((s) => s.id === firstShopId);
        if (shop) {
          const parts = [
            shop.name || "",
            shop.address || "",
            shop.area || "",
            shop.city || "",
            shop.state || "",
            shop.pincode || "",
            shop.gstin ? `GSTIN: ${shop.gstin}` : "",
            shop.phone ? `Ph: ${shop.phone}` : "",
          ].filter(Boolean);
          setFinalShopDetails(parts.join("\n"));
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedMaterials, storeShops]);

  const handleExportFinalBOQ = async () => {
    const element = document.getElementById("boq-final-pdf");

    if (!element) {
      alert("Final BOQ content not found");
      return;
    }

    const html2pdf = (await import("html2pdf.js")).default;

    html2pdf()
      .set({
        margin: 10,
        filename: `BOQ-${finalBillNo || new Date().getTime()}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: "#ffffff",
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(element)
      .save();
  };

  const steps = [
    { number: 1, title: "Type", description: "Select wall type" },
    { number: 2, title: "Specifications", description: "Choose thickness/config" },
    { number: 3, title: "Dimensions", description: "Enter measurements" },
    { number: 4, title: "Materials", description: "Select materials & shops" },
    { number: 5, title: "Required", description: "Review required materials" },
    { number: 6, title: "BOQ", description: "Review & export" },
  ];

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Civil Wall Estimator
          </h2>
          <p className="text-muted-foreground mt-1">
            Complete 5-step process to generate your Bill of Quantities
          </p>
        </div>

        <Card className="border-border/50">
          <CardContent className="pt-8 min-h-96">
            <AnimatePresence mode="wait">
              {/* Step 1: Wall Type */}
              {step === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-4"
                >
                  <Label className="text-lg">Select Wall Type</Label>
                  <div className="grid gap-3">
                    {wallOptions.map((opt) => (
                      <Button
                        key={opt.value}
                        variant={wallType === opt.value ? "default" : "outline"}
                        onClick={() => {
                          setWallType(opt.value as WallType);
                          setSubOption(null);
                          setSelectedMaterials([]);
                        }}
                        className="justify-start h-auto py-3"
                      >
                        <div className="text-left">
                          <div className="font-semibold">{opt.label}</div>
                        </div>
                      </Button>
                    ))}
                  </div>
                  <div className="flex justify-end gap-2 pt-6">
                    <Button disabled={!wallType} onClick={() => setStep(2)}>
                      Next <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* Step 2: Specifications */}
              {step === 2 && wallType && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-4"
                >
                  <Label className="text-lg">Select Thickness/Configuration</Label>
                  <div className="space-y-2">
                    {subOptionsMap[wallType]?.map((opt) => (
                      <Button
                        key={opt}
                        variant={subOption === opt ? "default" : "outline"}
                        onClick={() => setSubOption(opt)}
                        className="w-full justify-start"
                      >
                        {opt}
                      </Button>
                    ))}
                  </div>

                  {/* Additional options for glass partitions */}
                  {(wallType === "gypsum-glass" || wallType === "plywood-glass") && subOption && (
                    <Card className="mt-6 p-4 bg-blue-50 border-blue-200">
                      <Label className="text-base font-semibold mb-4 block">Glass Partition Options</Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="glassType" className="text-sm">Glass Type</Label>
                          <Select defaultValue="Clear">
                            <SelectTrigger id="glassType" className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Clear">Clear</SelectItem>
                              <SelectItem value="Tinted">Tinted</SelectItem>
                              <SelectItem value="Frosted">Frosted</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="laminateType" className="text-sm">Laminate Thickness</Label>
                          <Select defaultValue="6mm">
                            <SelectTrigger id="laminateType" className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="6mm">6mm</SelectItem>
                              <SelectItem value="8mm">8mm</SelectItem>
                              <SelectItem value="10mm">10mm</SelectItem>
                              <SelectItem value="12mm">12mm</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="beading" className="text-sm">Beading Style</Label>
                          <Select defaultValue="Aluminum">
                            <SelectTrigger id="beading" className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Aluminum">Aluminum</SelectItem>
                              <SelectItem value="Wooden">Wooden</SelectItem>
                              <SelectItem value="PVC">PVC</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="finish" className="text-sm">Finish</Label>
                          <Select defaultValue="Glossy">
                            <SelectTrigger id="finish" className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Matte">Matte</SelectItem>
                              <SelectItem value="Glossy">Glossy</SelectItem>
                              <SelectItem value="Semi-Gloss">Semi-Gloss</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2 col-span-2">
                          <Label htmlFor="frame" className="text-sm">Frame Type</Label>
                          <Select defaultValue="Aluminum">
                            <SelectTrigger id="frame" className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Aluminum">Aluminum</SelectItem>
                              <SelectItem value="Wooden">Wooden</SelectItem>
                              <SelectItem value="Steel">Steel</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </Card>
                  )}

                  <div className="flex justify-between gap-2 pt-6">
                    <Button variant="outline" onClick={() => setStep(1)}>
                      <ChevronLeft className="mr-2 h-4 w-4" /> Back
                    </Button>
                    <Button disabled={!subOption} onClick={() => setStep(3)}>
                      Next <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* Step 3: Dimensions */}
              {step === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-4"
                >
                  <Label className="text-lg">Enter Wall Dimensions (in feet)</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="length">Length</Label>
                      <Input
                        id="length"
                        type="number"
                        value={length || ""}
                        onChange={(e) =>
                          setLength(e.target.value ? parseFloat(e.target.value) : null)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="height">Height</Label>
                      <Input
                        id="height"
                        type="number"
                        value={height || ""}
                        onChange={(e) =>
                          setHeight(e.target.value ? parseFloat(e.target.value) : null)
                        }
                      />
                    </div>
                  </div>

                  {wallType === "civil" && (
                    <div className="space-y-2">
                      <Label htmlFor="wastage">Brick Wastage (%)</Label>
                      <Input
                        id="wastage"
                        type="number"
                        min="0"
                        max="20"
                        value={brickWastage}
                        onChange={(e) =>
                          setBrickWastage(parseFloat(e.target.value) || 0)
                        }
                      />
                    </div>
                  )}

                  <div className="flex justify-between gap-2 pt-6">
                    <Button variant="outline" onClick={() => setStep(2)}>
                      <ChevronLeft className="mr-2 h-4 w-4" /> Back
                    </Button>
                    <Button disabled={!length || !height} onClick={() => setStep(4)}>
                      Next <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* Step 4: Materials & Shops */}
              {step === 4 && (
                <motion.div
                  key="step4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-4"
                >
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-900">
                      <strong>ℹ️ Note:</strong> No materials available in shop master yet. All materials will show as <strong>Missing Required</strong> in the next step. You can proceed without selecting any materials.
                    </p>
                  </div>
                  
                  <Label className="text-lg">Select Materials & Shops</Label>
                  <div className="space-y-3 max-h-64 overflow-y-auto border rounded-lg p-4">
                    {getAvailableMaterials().length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <p>No materials available for {wallType}</p>
                        <p className="text-xs">Materials will be added to the shop master soon</p>
                      </div>
                    ) : (
                      getUniqueMaterials().map((mat) => {
                        const isSelected = selectedMaterials.some(
                          (m) => m.materialId === mat.id
                        );
                        const currentSelection = selectedMaterials.find(
                          (m) => m.materialId === mat.id
                        );

                        const availableShops = storeMaterials
                          .filter((m) => (m.code || m.id) === (mat.code || mat.id) && m.shopId)
                          .map((m) => ({
                            shopId: m.shopId as string,
                            rate: m.rate,
                            shopName:
                              storeShops.find((s) => s.id === m.shopId)?.name ||
                              "Unknown",
                          }))
                          .sort((a, b) => a.rate - b.rate);

                        const codeKey = mat.code || mat.id;
                        const selectedShopForRow = step4ShopSelection[codeKey] || availableShops[0]?.shopId;

                        return (
                          <div
                            key={mat.id}
                            className="border rounded-lg p-3 hover:bg-muted/50 transition"
                          >
                            <div className="flex items-start gap-3">
                              <Checkbox
                                id={mat.id}
                                checked={isSelected}
                                onCheckedChange={() => handleToggleMaterial(mat.id)}
                              />
                              <div className="flex-1">
                                <label
                                  htmlFor={mat.id}
                                  className="font-medium cursor-pointer"
                                >
                                  {mat.name}
                                </label>
                                <p className="text-xs text-muted-foreground">
                                  {mat.code || mat.brandName}
                                </p>

                                {availableShops.length > 0 ? (
                                  <div className="mt-3 space-y-2">
                                    <Label className="text-xs">Select Shop:</Label>
                                    <Select
                                      value={selectedShopForRow}
                                      onValueChange={(newShopId) => {
                                        setStep4ShopSelection((p) => ({ ...p, [codeKey]: newShopId }));
                                        // if already selected, just change shop for that material
                                        if (isSelected) handleChangeShop(mat.id, newShopId);
                                      }}
                                    >
                                      <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {availableShops.map((shop) => (
                                          <SelectItem key={shop.shopId} value={shop.shopId}>
                                            {shop.shopName} - ₹{shop.rate}/{mat.unit}
                                            {shop.rate === availableShops[0].rate && " (Best)"}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                ) : (
                                  <div className="mt-3 text-xs text-red-600">No shops available</div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className="flex justify-between gap-2 pt-6">
                    <Button variant="outline" onClick={() => setStep(3)}>
                      <ChevronLeft className="mr-2 h-4 w-4" /> Back
                    </Button>
                    <div className="flex items-center gap-3">
                      <Button onClick={() => setStep(5)}>
                        Next: Review Requirements <ChevronRight className="ml-2 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Step 5: BOQ & Required Materials */}
              {/* STEP 5: Review Required Materials */}
              {step === 5 && (
                <motion.div
                  key="step5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-4"
                >
                  <Label className="text-lg font-semibold">Review Required Materials</Label>
                  <p className="text-sm text-muted-foreground mb-4">
                    Ensure all required materials are selected with correct quantities.
                  </p>

                  <div className="space-y-2">
                    {getFinalMaterials().length > 0 ? (
                      <>
                        <div className="grid grid-cols-7 gap-2 p-2 text-sm text-muted-foreground">
                          <div className="col-span-2 font-medium">Item</div>
                          <div className="text-center">Qty</div>
                          <div className="text-center">Unit</div>
                          <div className="text-center">Shop</div>
                          <div className="text-center">Rate (₹)</div>
                          <div className="text-right">Amount (₹)</div>
                        </div>
                        {getFinalMaterials().map((mat) => (
                          <div key={mat.id} className={cn("p-3 border rounded grid grid-cols-7 items-center")}>
                            <span className="col-span-2 font-medium">{mat.name}</span>
                            <div className="col-span-1 text-center">
                              <Input
                                type="number"
                                value={editableMaterials[mat.id]?.quantity ?? mat.quantity}
                                onChange={(e) => setEditableQuantity(mat.id, parseInt(e.target.value || "0", 10))}
                                className="w-20 mx-auto"
                              />
                            </div>
                            <span className="col-span-1 text-center text-muted-foreground">{mat.unit}</span>
                            <div className="col-span-1 text-center font-semibold">{mat.shopName || "-"}</div>
                            <div className="col-span-1 text-center">
                              <div className="inline-flex items-center justify-center gap-2">
                                <Button size="sm" onClick={() => changeEditableRate(mat.id, -1)}>-</Button>
                                <div className="font-semibold">₹{editableMaterials[mat.id]?.rate ?? mat.rate}</div>
                                <Button size="sm" onClick={() => changeEditableRate(mat.id, 1)}>+</Button>
                              </div>
                            </div>
                            <div className="col-span-1 text-right font-semibold">₹{((editableMaterials[mat.id]?.quantity ?? mat.quantity) * (editableMaterials[mat.id]?.rate ?? mat.rate)).toFixed(2)}</div>
                          </div>
                        ))}
                      </>
                    ) : (
                      <p className="text-center text-muted-foreground py-4">No materials selected</p>
                    )}
                  </div>

                  <div className="flex justify-between gap-2 pt-6">
                    <Button variant="outline" onClick={() => setStep(4)}>
                      <ChevronLeft className="mr-2 h-4 w-4" /> Back
                    </Button>
                    <Button onClick={() => setStep(6)}>
                      Next: Generate BOQ <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* STEP 6: Final BOQ */}
              {step === 6 && (
                <motion.div
                  key="step6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-6"
                >
                  {/* Header */}
                  <div className="text-center space-y-2">
                    <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto text-green-500">
                      <CheckCircle2 className="h-8 w-8" />
                    </div>
                    <h2 className="text-2xl font-bold">Bill of Quantities (BOQ)</h2>
                    <p className="text-sm text-muted-foreground">
                      Generated on {new Date().toLocaleDateString()}
                    </p>
                  </div>

                  {/* BOQ CONTENT (PDF TARGET) */}
                  <div
                    id="boq-pdf"
                    style={{
                      backgroundColor: "#ffffff",
                      color: "#000000",
                      fontFamily: "Arial, sans-serif",
                      padding: "16px",
                    }}
                  >
                    {/* Project Details */}
                    <div style={{ border: "1px solid #d1d5db", borderRadius: "8px", marginBottom: "16px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px", padding: "16px", fontSize: "0.875rem" }}>
                        <div>
                          <p style={{ fontSize: "0.75rem", color: "#6b7280" }}>WALL TYPE</p>
                          <p style={{ fontWeight: 600, textTransform: "capitalize" }}>{wallType}</p>
                        </div>
                        <div>
                          <p style={{ fontSize: "0.75rem", color: "#6b7280" }}>DIMENSIONS</p>
                          <p style={{ fontWeight: 600 }}>{length} ft × {height} ft</p>
                        </div>
                        {subOption && (
                          <div>
                            <p style={{ fontSize: "0.75rem", color: "#6b7280" }}>SPECIFICATION</p>
                            <p style={{ fontWeight: 600 }}>{subOption}</p>
                          </div>
                        )}
                        <div>
                          <p style={{ fontSize: "0.75rem", color: "#6b7280" }}>TOTAL COST</p>
                          <p style={{ fontWeight: 600, color: "#22c55e" }}>₹{calculateTotalCost().toFixed(2)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Materials Table */}
                    <div style={{ border: "1px solid #d1d5db", borderRadius: "8px", marginBottom: "16px", overflow: "hidden" }}>
                      <div style={{ padding: "16px" }}>
                        <h3 style={{ fontWeight: 600, marginBottom: "8px" }}>Materials Schedule</h3>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                          <thead style={{ backgroundColor: "#f3f4f6" }}>
                            <tr>
                              {["S.No", "Description", "Unit", "Qty", "Rate (₹)", "Supplier", "Amount (₹)"].map((h) => (
                                <th
                                  key={h}
                                  style={{
                                    border: "1px solid #d1d5db",
                                    padding: "8px",
                                    textAlign: h === "Qty" || h.includes("Rate") || h.includes("Amount") ? "right" : "left",
                                  }}
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {getFinalMaterials().length > 0 ? (
                              getFinalMaterials().map((mat, index) => (
                                <tr key={mat.id}>
                                  <td style={{ border: "1px solid #d1d5db", padding: "8px" }}>{index + 1}</td>
                                  <td style={{ border: "1px solid #d1d5db", padding: "8px", fontWeight: 500 }}>{mat.name}</td>
                                  <td style={{ border: "1px solid #d1d5db", padding: "8px", textAlign: "center" }}>{mat.unit}</td>
                                  <td style={{ border: "1px solid #d1d5db", padding: "8px", textAlign: "right" }}>{Math.ceil(mat.quantity)}</td>
                                  <td style={{ border: "1px solid #d1d5db", padding: "8px", textAlign: "right" }}>₹{mat.rate}</td>
                                  <td style={{ border: "1px solid #d1d5db", padding: "8px" }}>{mat.shopName}</td>
                                  <td style={{ border: "1px solid #d1d5db", padding: "8px", textAlign: "right", fontWeight: 600 }}>
                                    ₹{(Math.ceil(mat.quantity) * mat.rate).toFixed(2)}
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={7} style={{ border: "1px solid #d1d5db", padding: "16px", textAlign: "center", color: "#6b7280" }}>
                                  No materials selected
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Total Summary */}
                    {getFinalMaterials().length > 0 && (
                      <div style={{ border: "1px solid #d1d5db", borderRadius: "8px", padding: "16px", display: "flex", justifyContent: "space-between", backgroundColor: "#eff6ff" }}>
                        <div>
                          <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>Total Materials</p>
                          <p style={{ fontWeight: 600 }}>{selectedMaterials.length}</p>
                        </div>
                        <div>
                          <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>Total Quantity</p>
                          <p style={{ fontWeight: 600 }}>{getFinalMaterials().reduce((s, m) => s + Math.ceil(m.quantity), 0)}</p>
                        </div>
                        <div>
                          <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>Grand Total</p>
                          <p style={{ fontWeight: 600, color: "#22c55e", fontSize: "1.125rem" }}>₹{calculateTotalCost().toFixed(2)}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between gap-2 pt-6">
                    <Button variant="outline" onClick={() => setStep(5)}>
                      <ChevronLeft className="mr-2 h-4 w-4" /> Back
                    </Button>
                    <div className="flex gap-2">
                      <Button onClick={handleExportBOQ} disabled={selectedMaterials.length === 0}>
                        <Download className="mr-2 h-4 w-4" /> Export BOQ
                      </Button>
                      <Button
                        className="bg-indigo-600 text-white font-semibold px-4 py-2 rounded-lg"
                        onClick={() => setStep(7)}
                        disabled={getFinalMaterials().length === 0}
                      >
                        Finalize BOQ
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setStep(1);
                          setWallType(null);
                          setSubOption(null);
                          setLength(null);
                          setHeight(null);
                          setSelectedMaterials([]);
                          setComputed(null);
                          setBrickWastage(0);
                        }}
                      >
                        New Estimate
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* STEP 7: Finalize BOQ (manual fields + export) */}
              {step === 7 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Bill No</Label>
                      <Input value={finalBillNo} onChange={(e) => setFinalBillNo(e.target.value)} />
                    </div>
                    <div>
                      <Label>Bill Date</Label>
                      <Input type="date" value={finalBillDate} onChange={(e) => setFinalBillDate(e.target.value)} />
                    </div>
                    <div>
                      <Label>Due Date</Label>
                      <Input type="date" value={finalDueDate} onChange={(e) => setFinalDueDate(e.target.value)} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Customer Name</Label>
                      <Input value={finalCustomerName} onChange={(e) => setFinalCustomerName(e.target.value)} />
                    </div>
                    <div>
                      <Label>Terms & Conditions</Label>
                      <Input value={finalTerms} onChange={(e) => setFinalTerms(e.target.value)} />
                    </div>
                  </div>

                  <div id="boq-final-pdf" style={{ width: "210mm", minHeight: "297mm", padding: "20mm", background: "#fff", color: "#000", fontFamily: "Arial", fontSize: 12 }}>
                    {/* HEADER: logo left, company block + bill info right (match Doors layout) */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ width: "55%", display: "flex", gap: 12 }}>
                        <img src={ctintLogo} alt="Concept Trunk Interiors" style={{ height: 60, flexShrink: 0 }} />
                        <div style={{ lineHeight: 1.4 }}>
                          <strong>Concept Trunk Interiors</strong><br />
                          12/36A, Indira Nagar<br />
                          Medavakkam<br />
                          Chennai – 600100<br />
                          GSTIN: 33ASOPS5560M1Z1
                          <br /><br />
                          <strong>Bill From</strong><br />
                          <pre style={{ margin: 0, fontFamily: "Arial", whiteSpace: "pre-wrap", fontSize: 11 }}>{finalShopDetails}</pre>
                        </div>
                      </div>

                      <div style={{ textAlign: "right", width: "40%" }}>
                        <div style={{ fontWeight: "bold", fontSize: 16 }}>BILL</div>
                        <div>Bill No: {finalBillNo || "-"}</div>
                        <div>Bill Date: {finalBillDate && new Date(finalBillDate).toLocaleDateString("en-GB")}</div>
                        <div>Due Date: {finalDueDate && new Date(finalDueDate).toLocaleDateString("en-GB")}</div>
                        <div style={{ marginTop: 6 }}>Terms: {finalTerms}</div>
                        <div style={{ marginTop: 6 }}>Customer: {finalCustomerName}</div>
                      </div>
                    </div>

                    <hr style={{ margin: "10px 0" }} />

                    <div style={{ marginBottom: 12, lineHeight: 1.5 }}>
                      <strong style={{ fontSize: 12 }}>Bill To:</strong>
                      <div style={{ fontSize: 11, marginTop: 4 }}>{finalCustomerName}<br />{finalCustomerAddress}</div>
                    </div>

                    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
                      <thead>
                        <tr>
                          {["#","Item","Unit","Qty","Rate","Supplier","Amount"].map((h) => (
                            <th key={h} style={{ border: "1px solid #000", padding: 6, background: "#000", color: "#fff", fontSize: 10, textAlign: h === "Qty" || h === "Rate" || h === "Amount" ? "right" : "left", fontWeight: "bold" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {getFinalMaterials().map((m, i) => (
                          <tr key={m.id}>
                            <td style={{ border: "1px solid #000", padding: 6, textAlign: "center" }}>{i+1}</td>
                            <td style={{ border: "1px solid #000", padding: 6 }}>{m.name}</td>
                            <td style={{ border: "1px solid #000", padding: 6, textAlign: "center" }}>{m.unit}</td>
                            <td style={{ border: "1px solid #000", padding: 6, textAlign: "right" }}>{m.quantity}</td>
                            <td style={{ border: "1px solid #000", padding: 6, textAlign: "right" }}>{Number(m.rate || 0).toFixed(2)}</td>
                            <td style={{ border: "1px solid #000", padding: 6 }}>{m.shopName}</td>
                            <td style={{ border: "1px solid #000", padding: 6, textAlign: "right", fontWeight: 600 }}>{(Number(m.quantity || 0) * Number(m.rate || 0)).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {(() => {
                      const subTotal = calculateTotalCost();
                      const sgst = subTotal * 0.09;
                      const cgst = subTotal * 0.09;
                      const roundOff = Math.round((subTotal + sgst + cgst) * 100) / 100 - (subTotal + sgst + cgst);
                      const total = subTotal + sgst + cgst + roundOff;

                      return (
                        <table style={{ width: 300, marginLeft: "auto", marginTop: 12, borderCollapse: "collapse" }}>
                          <tbody>
                            <tr>
                              <td style={{ padding: "6px 8px", textAlign: "left", fontSize: 11 }}>Sub Total</td>
                              <td style={{ padding: "6px 8px", textAlign: "right", fontSize: 11 }}>{Number(subTotal || 0).toFixed(2)}</td>
                            </tr>
                            <tr>
                              <td style={{ padding: "6px 8px", textAlign: "left", fontSize: 11 }}>SGST 9%</td>
                              <td style={{ padding: "6px 8px", textAlign: "right", fontSize: 11 }}>{Number(sgst || 0).toFixed(2)}</td>
                            </tr>
                            <tr>
                              <td style={{ padding: "6px 8px", textAlign: "left", fontSize: 11 }}>CGST 9%</td>
                              <td style={{ padding: "6px 8px", textAlign: "right", fontSize: 11 }}>{Number(cgst || 0).toFixed(2)}</td>
                            </tr>
                            <tr>
                              <td style={{ padding: "6px 8px", textAlign: "left", fontSize: 11 }}>Round Off</td>
                              <td style={{ padding: "6px 8px", textAlign: "right", fontSize: 11 }}>{Number(roundOff || 0).toFixed(2)}</td>
                            </tr>
                            <tr style={{ borderTop: "2px solid #000", borderBottom: "2px solid #000" }}>
                              <td style={{ padding: "6px 8px", textAlign: "left", fontSize: 11, fontWeight: "bold" }}>Total</td>
                              <td style={{ padding: "6px 8px", textAlign: "right", fontSize: 12, fontWeight: "bold" }}>₹{Number(total || 0).toFixed(2)}</td>
                            </tr>
                          </tbody>
                        </table>
                      );
                    })()}

                    <div style={{ marginTop: 50 }}>
                      <div style={{ width: 200, borderTop: "1px solid #000" }} />
                      <div>Authorized Signature</div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setStep(6)}>Back</Button>
                    <Button onClick={handleExportFinalBOQ}>Export PDF</Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
