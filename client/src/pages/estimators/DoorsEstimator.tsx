import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import html2pdf from "html2pdf.js";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useData, Material, Product } from "@/lib/store";
import {
  doorFrameLengthLegacyFeet,
  glassAreaLegacySqft,
  glassPerimeterLegacyFeet,
} from "@/lib/estimators/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  ChevronLeft,
  Download,
  CheckCircle2,
  Star,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import apiFetch from "@/lib/api";
import {
  useProductFromUrl,
  getDefaultDoorTypeForProduct,
} from "@/hooks/useProduct";

const ctintLogo = "/image.png";

// Use shared `apiFetch` helper which attaches Authorization header when available.

interface MaterialWithQuantity {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  rate: number;
  shopId: string;
  shopName: string;
}

// ----- In-file door compute helpers and constants (kept local, not exported as default) -----
export interface RequiredMaterial {
  type: string;
  required: number;
  unit: string;
  rate: number;
  category: string;
}

export interface DoorComputeResult {
  doorArea: number;
  framePerimeter: number;
  frameRunningFeet: number;
  requiredMaterials: RequiredMaterial[];
}

export const computeDoorRequired = (
  doorType: string | null,
  width: number | null,
  height: number | null,
  frameWidth: number = 0.33,
  hasFrame: boolean = true,
  subOption?: string | null,
  glazingType?: string | null,
): DoorComputeResult | null => {
  if (!doorType || !width || !height) return null;

  const doorArea = width * height;
  const framePerimeter = 2 * (width + height);
  const frameRunningFeet = hasFrame ? Math.ceil(framePerimeter) : 0;

  const requiredMaterials: RequiredMaterial[] = [];

  let hingesRequired = 3;
  if (height > 7) hingesRequired = 4;
  if (height > 8) hingesRequired = 5;

  if (hasFrame) {
    requiredMaterials.push({
      type: "Door Frame - Wooden",
      required: frameRunningFeet,
      unit: "rft",
      rate: 280,
      category: "Frame",
    });
    requiredMaterials.push({
      type: "Frame Screws",
      required: Math.ceil(frameRunningFeet * 2),
      unit: "pcs",
      rate: 2,
      category: "Frame",
    });
    requiredMaterials.push({
      type: "Wall Plugs / Anchors",
      required: Math.ceil(frameRunningFeet * 1.5),
      unit: "pcs",
      rate: 5,
      category: "Frame",
    });
  }

  switch (doorType) {
    case "flush":
    case "flush-door":
      requiredMaterials.push({
        type:
          subOption === "With Vision Panel"
            ? "Flush Door - BWR (With VP)"
            : "Flush Door - BWR",
        required: 1,
        unit: "pcs",
        rate: subOption === "With Vision Panel" ? 4500 : 3500,
        category: "Door Panel",
      });
      if (subOption === "With Vision Panel") {
        requiredMaterials.push({
          type: "Vision Panel Glass",
          required: 1,
          unit: "sqft",
          rate: 280,
          category: "Door Panel",
        });
      }
      requiredMaterials.push({
        type: "Hinges - SS (Pair)",
        required: hingesRequired,
        unit: "pair",
        rate: 180,
        category: "Hardware",
      });
      break;

    case "wpc":
    case "wpc-door":
      requiredMaterials.push({
        type:
          subOption === "Hollow Core"
            ? "WPC Door - Hollow"
            : "WPC Door - Solid",
        required: 1,
        unit: "pcs",
        rate: subOption === "Hollow Core" ? 3800 : 5500,
        category: "Door Panel",
      });
      requiredMaterials.push({
        type: "Hinges - SS (Pair)",
        required: hingesRequired,
        unit: "pair",
        rate: 180,
        category: "Hardware",
      });
      break;

    case "glassdoor":
    case "glass-door":
      const glassThickness = subOption === "Frameless" ? "12mm" : "10mm";
      requiredMaterials.push({
        type: `Glass - Toughened ${glassThickness}`,
        required: Math.ceil(doorArea),
        unit: "sqft",
        rate: glassThickness === "12mm" ? 420 : 320,
        category: "Door Panel",
      });
      requiredMaterials.push({
        type: "Patch Fitting - Standard",
        required: 1,
        unit: "set",
        rate: 2800,
        category: "Hardware",
      });
      requiredMaterials.push({
        type: "Floor Spring - Standard",
        required: 1,
        unit: "pcs",
        rate: 3500,
        category: "Hardware",
      });
      if (subOption === "Framed") {
        requiredMaterials.push({
          type: "Header Rail",
          required: 1,
          unit: "pcs",
          rate: 1500,
          category: "Hardware",
        });
        requiredMaterials.push({
          type: "Side Rail",
          required: 2,
          unit: "pcs",
          rate: 1200,
          category: "Hardware",
        });
      }
      break;

    case "wooden":
    case "wooden-door":
      requiredMaterials.push({
        type:
          subOption === "Solid Wood"
            ? "Wooden Door - Teak"
            : "Wooden Door - Sal",
        required: 1,
        unit: "pcs",
        rate: subOption === "Solid Wood" ? 18000 : 12000,
        category: "Door Panel",
      });
      requiredMaterials.push({
        type: "Hinges - Brass (Pair)",
        required: hingesRequired,
        unit: "pair",
        rate: 350,
        category: "Hardware",
      });
      break;

    case "stile":
    case "stile-door":
      const glassArea = Math.ceil(doorArea * 0.6);
      const frameArea = Math.ceil(doorArea * 0.4);
      const isDoubleGlazing =
        glazingType === "Double Glazing" || subOption === "Double Glazing";
      requiredMaterials.push({
        type: isDoubleGlazing
          ? "Glass - Toughened 12mm (DGU)"
          : "Glass - Toughened 10mm",
        required: glassArea,
        unit: "sqft",
        rate: isDoubleGlazing ? 650 : 320,
        category: "Door Panel",
      });
      requiredMaterials.push({
        type: "Aluminium Stile Frame",
        required: frameArea,
        unit: "sqft",
        rate: 280,
        category: "Door Panel",
      });
      requiredMaterials.push({
        type: "Patch Fitting - Standard",
        required: 1,
        unit: "set",
        rate: 2800,
        category: "Hardware",
      });
      requiredMaterials.push({
        type: "Floor Spring - Standard",
        required: 1,
        unit: "pcs",
        rate: 3500,
        category: "Hardware",
      });
      break;
  }

  if (
    doorType !== "glass-door" &&
    doorType !== "stile-door" &&
    doorType !== "glassdoor" &&
    doorType !== "stile"
  ) {
    requiredMaterials.push({
      type: "Mortise Lock - Standard",
      required: 1,
      unit: "pcs",
      rate: 650,
      category: "Hardware",
    });
    requiredMaterials.push({
      type: "Door Handle - Standard",
      required: 1,
      unit: "pcs",
      rate: 450,
      category: "Hardware",
    });
  } else {
    requiredMaterials.push({
      type: "Glass Door Lock",
      required: 1,
      unit: "pcs",
      rate: 1200,
      category: "Hardware",
    });
    requiredMaterials.push({
      type: "Glass Door Handle - Standard",
      required: 1,
      unit: "pair",
      rate: 850,
      category: "Hardware",
    });
  }

  requiredMaterials.push({
    type: "Door Stopper - Floor Mount",
    required: 1,
    unit: "pcs",
    rate: 120,
    category: "Hardware",
  });

  if (
    doorType !== "glass-door" &&
    doorType !== "stile-door" &&
    doorType !== "glassdoor" &&
    doorType !== "stile"
  ) {
    requiredMaterials.push({
      type: "Door Screws",
      required: hingesRequired * 6,
      unit: "pcs",
      rate: 2,
      category: "Hardware",
    });
  }

  return { doorArea, framePerimeter, frameRunningFeet, requiredMaterials };
};

export type DoorTypeLocal =
  | "flush-door"
  | "wpc-door"
  | "glass-door"
  | "wooden-door"
  | "stile-door";

const STANDARD_DOOR_SIZES_LOCAL = [
  { label: "6'6\" x 2'6\" (Standard)", width: 2.5, height: 6.5 },
  { label: "7' x 3' (Common)", width: 3, height: 7 },
  { label: "7' x 3'6\" (Wide)", width: 3.5, height: 7 },
  { label: "8' x 4' (Double Door)", width: 4, height: 8 },
  { label: "Custom Size", width: 0, height: 0 },
];

// ----- end door helpers -----

interface SelectedMaterialConfig {
  materialId: string;
  selectedShopId: string;
  selectedBrand?: string; // ✅ NEW
}

// ✅ NEW: normalizers + product-based matcher
const norm = (s?: string) =>
  (s || "")
    .toString()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();

const normText = (s?: string) => (s || "").toString().toUpperCase();

const doorKeywordsByType: Record<string, string[]> = {
  flush: ["FLUSH", "FLUSH DOOR", "FLUSH DOORS", "BWR"],
  teak: ["WOOD", "TEAK", "WOODEN", "WOODEN DOOR", "TEAK WOOD"],
  wooden: ["WOOD", "TEAK", "WOODEN", "WOODEN DOOR", "TEAK WOOD"],
  wpc: ["WPC", "UPVC", "PVC", "WPC DOOR", "WPC DOORS", "COMPOSITE"],
  glassdoor: ["GLASS", "GLASS DOOR", "GLASS DOORS", "FRAMELESS", "TEMPERED"],
  "glass-door": ["GLASS", "GLASS DOOR", "GLASS DOORS", "FRAMELESS", "TEMPERED"],
  glasspanel: ["GLASS", "GLASS PANEL"],
  stile: ["STILE", "ALUMINIUM", "ALUMINUM", "STILE DOOR", "ALU"],
};

// Door type to product name mapping (moved here so materialMatchesDoor can reference it)
const DOOR_TYPE_TO_PRODUCT: Record<string, string> = {
  flush: "Flush door",
  "flush-door": "Flush door",
  wooden: "Wooden door",
  "wooden-door": "Wooden door",
  teak: "Wooden door",
  wpc: "WPC door",
  "wpc-door": "WPC door",
  glassdoor: "Glass door",
  "glass-door": "Glass door",
  stile: "Stile door",
  "stile-door": "Stile door",
  glasspanel: "Glass panel",
};

// ✅ NEW: match material by DB "product" field (primary) + fallback name/category
const materialMatchesDoor = (m: any, doorType: string) => {
  const prod = normText(m.product); // ✅ uses your DB field
  const name = normText(m.name);
  const cat = normText(m.category);
  const sub = normText(m.subCategory);

  const kws = doorKeywordsByType[doorType] || [doorType.toUpperCase()];

  // Primary: Check if any keyword matches product, name, category, or subcategory
  const keywordMatch = kws.some(
    (kw) =>
      prod.includes(kw) ||
      name.includes(kw) ||
      cat.includes(kw) ||
      sub.includes(kw),
  );

  // Secondary: Check against product type mapping if available
  const expectedProduct = DOOR_TYPE_TO_PRODUCT[doorType];
  const productTypeMatch =
    expectedProduct && normText(prod).includes(normText(expectedProduct));

  return keywordMatch || productTypeMatch;
};

// ✅ NEW: brand getter (works with or without real brand field)
const getBrandOfMaterial = (m: any) => {
  // If DB has brand-like fields, use them; else fallback to "Generic"
  return (
    m.brandName ||
    m.brand ||
    m.make ||
    m.manufacturer ||
    m.company ||
    "Generic"
  ).toString();
};

export default function DoorsEstimator() {
  const [, setLocation] = useLocation();
  const {
    shops: storeShops,
    materials: storeMaterials,
    products: storeProducts,
  } = useData();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const isCreateBOQMode =
    typeof window !== "undefined" && window.location.search.includes("step=11");
  const [selectedDoorProductId, setSelectedDoorProductId] =
    useState<string>("");
  const [selectedDoorProductLabel, setSelectedDoorProductLabel] =
    useState<string>("");
  const [frameChoice, setFrameChoice] = useState<
    "with-frame" | "without-frame" | null
  >(null);
  const [panelType, setPanelType] = useState<"panel" | "nopanel" | null>(null);
  const [doorType, setDoorType] = useState<string | null>(null);
  const [subOption, setSubOption] = useState<string | null>(null);
  const [visionPanel, setVisionPanel] = useState<string | null>(null);
  const [glazingType, setGlazingType] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(1);
  const [height, setHeight] = useState<number | null>(7);
  const [width, setWidth] = useState<number | null>(3);
  const [glassHeight, setGlassHeight] = useState<number | null>(6);
  const [glassWidth, setGlassWidth] = useState<number | null>(2);
  const [selectedMaterials, setSelectedMaterials] = useState<
    SelectedMaterialConfig[]
  >([]);

  // Accumulated products for multi-product BOQ
  const [accumulatedProducts, setAccumulatedProducts] = useState<any[]>([]);

  // Load accumulated products from DB on mount
  useEffect(() => {
    apiFetch("/api/accumulated-products/doors", {
      headers: {},
    })
      .then((res) => res.json())
      .then((data) => {
        setAccumulatedProducts(data.data || []);
      })
      .catch((e) => console.error("Failed to load accumulated products", e));
  }, []);

  // Check for initial step from URL query param
  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const stepParam = urlParams.get("step");
      if (stepParam) {
        const stepNum = parseInt(stepParam, 10);
        if (stepNum >= 1 && stepNum <= 12) {
          setStep(stepNum);
        }
      }
    }
  }, []);

  // Load product data when coming from product picker (Step 11 direct navigation)
  useEffect(() => {
    if (typeof window !== "undefined" && step === 11) {
      const urlParams = new URLSearchParams(window.location.search);
      const productId = urlParams.get("product");

      if (productId) {
        const loadProductData = async () => {
          try {
            const response = await apiFetch(`/api/products/${productId}`, {
              headers: {},
            });

            if (response.ok) {
              const data = await response.json();
              const product = data.product;

              // Set product-related state based on subcategory
              const defaultDoorType = getDefaultDoorTypeForProduct(product);

              if (defaultDoorType) {
                setDoorType(defaultDoorType);
                setSelectedDoorProductLabel(product.name);
                setSelectedDoorProductId(product.id);
              }
            }
          } catch (error) {
            console.error("Failed to load product data:", error);
          }
        };

        loadProductData();
      }
    }
  }, [step]);

  // Ensure accumulated products are reloaded when opening Step 12 (QA BOQ)
  useEffect(() => {
    if (step === 12) {
      apiFetch("/api/accumulated-products/doors", {
        headers: {},
      })
        .then((res) => res.json())
        .then((data) => {
          const parsed = data.data || [];
          setAccumulatedProducts(parsed);
          console.debug(
            "Restored doors_accumulated_products for Step 12:",
            parsed.length,
          );
        })
        .catch((e) =>
          console.error("Failed to load accumulated products for Step 12", e),
        );
    }
  }, [step]);

  // Door label helpers that use component state
  const getProductTypeOnly = (opts?: { doorType?: string | null }) => {
    const dt = opts?.doorType ?? doorType;
    if (!dt) return null;

    // Prefer descriptive label from DOOR_TYPES_LOCAL if available
    const typeEntry = DOOR_TYPES_LOCAL.find((t) => t.value === dt);
    let productLabel = typeEntry
      ? typeEntry.label
      : DOOR_TYPE_TO_PRODUCT[dt] || dt;

    // Normalize productLabel to include 'Door' suffix if not present
    if (!/door/i.test(productLabel)) productLabel = `${productLabel} Door`;

    return productLabel;
  };

  const getDoorLabelFrom = (opts?: {
    doorType?: string | null;
    panelType?: string | null;
    subOption?: string | null;
    visionPanel?: string | null;
    glazingType?: string | null;
  }) => {
    const dt = opts?.doorType ?? doorType;
    const pt = opts?.panelType ?? panelType;
    const so = opts?.subOption ?? subOption;
    if (!dt) return null;

    // Prefer descriptive label from DOOR_TYPES_LOCAL if available
    const typeEntry = DOOR_TYPES_LOCAL.find((t) => t.value === dt);
    let productLabel = typeEntry
      ? typeEntry.label
      : DOOR_TYPE_TO_PRODUCT[dt] || dt;

    // Normalize productLabel to include 'Door' suffix if not present
    if (!/door/i.test(productLabel)) productLabel = `${productLabel} Door`;

    const panelText = pt === "panel" ? "With Panel" : "Without Panel";

    const extra = so ? ` - ${so}` : "";

    return `${panelText} – ${productLabel}${extra}`;
  };

  const getSavedDoorLabel = () => {
    const meta = savedStep9Meta;
    if (meta && (meta.doorType || meta.panelType)) {
      return getDoorLabelFrom({
        doorType: meta.doorType || meta.door_type,
        panelType: meta.panelType || meta.panel_type,
        subOption: meta.subOption || meta.sub_option,
      });
    }

    if (
      currentSavedBoq &&
      (currentSavedBoq.door_type || currentSavedBoq.doorType)
    ) {
      return getDoorLabelFrom({
        doorType: currentSavedBoq.door_type || currentSavedBoq.doorType,
        panelType: currentSavedBoq.panel_type || currentSavedBoq.panelType,
        subOption: currentSavedBoq.sub_option || currentSavedBoq.subOption,
      });
    }

    return getDoorLabelFrom();
  };

  const getCurrentDoorConfig = () => {
    const selectedLabel = (selectedDoorProductLabel || "").toString();
    if (!doorType && !selectedLabel) return null;
    const label = selectedLabel || getDoorLabelFrom();
    const productName =
      selectedLabel || DOOR_TYPE_TO_PRODUCT[doorType!] || doorType!;
    const requiresGlazing = doorType
      ? [
          "glassdoor",
          "glass-door",
          "stile",
          "stile-door",
          "glasspanel",
        ].includes(doorType)
      : normText(label).includes("GLASS") || normText(label).includes("STILE");
    return { label, productName, requiresGlazing };
  };

  // Get available door types based on available products
  const getAvailableDoorTypes = () => {
    if (!storeMaterials.length) return [];
    const availableProducts = Array.from(
      new Set(storeMaterials.map((m) => m.product).filter(Boolean)),
    );

    // Map available products back to door types
    const availableDoorTypes: Array<{ value: string; label: string }> = [];

    if (availableProducts.includes("Flush door")) {
      availableDoorTypes.push(
        { value: "flush", label: "Flush Doors" },
        { value: "wpc", label: "WPC Doors" },
        { value: "glassdoor", label: "Glass Door" },
        { value: "stile", label: "Stile Door" },
      );
    }

    if (availableProducts.includes("Wooden door")) {
      availableDoorTypes.push({ value: "wooden", label: "Wooden Door" });
    }

    return availableDoorTypes;
  };

  // ✅ UPDATED: Get materials for selected door type driven by DB `product` field
  const getAvailableMaterials = () => {
    const selectedLabel = (selectedDoorProductLabel || "").toString();
    if ((!doorType && !selectedLabel) || !storeMaterials.length) return [];

    // Preferred Step: try strict product-based matching using DOOR_TYPE_TO_PRODUCT or selected product
    const expectedProduct =
      selectedLabel || (doorType ? DOOR_TYPE_TO_PRODUCT[doorType] : "");
    let doorMatched: typeof storeMaterials = [];

    if (expectedProduct) {
      doorMatched = storeMaterials.filter((m) => {
        const prod = (m.product || "").toString();
        if (!prod || !expectedProduct) return false;
        const p = normText(prod);
        const e = normText(expectedProduct);
        return p.includes(e) || e.includes(p);
      });
    }

    // Fallback: if strict product match yields nothing and user selected label explicitly,
    // don't use materialMatchesDoor fallback (too loose). Only use it if doorType was inferred.
    if ((!doorMatched || doorMatched.length === 0) && !selectedLabel) {
      doorMatched = doorType
        ? storeMaterials.filter((m) => materialMatchesDoor(m, doorType))
        : storeMaterials.filter((m) => {
            const prod = (m.product || "").toString();
            if (!expectedProduct) return false;
            const p = normText(prod);
            const e = normText(expectedProduct);
            return p.includes(e) || e.includes(p);
          });
    }

    if (doorMatched.length === 0) return [];

    // Step 2: Deduplicate by "product+name+code" (keep cheapest for default listing)
    const uniqueMap = new Map<string, (typeof doorMatched)[0]>();

    for (const mat of doorMatched) {
      const key = `${normText(mat.product)}__${normText(mat.name)}__${norm(mat.code)}`;
      const existing = uniqueMap.get(key);
      if (!existing || (mat.rate || 0) < (existing.rate || 0))
        uniqueMap.set(key, mat);
    }

    return Array.from(uniqueMap.values());
  };

  // (moved into component to access state)

  const DOOR_SUB_OPTIONS_LOCAL: Record<string, string[]> = {
    flush: ["With Vision Panel", "Without Vision Panel"],
    teak: ["Solid Wood", "Engineered Wood"],
    wpc: ["Solid Core", "Hollow Core"],
    glassdoor: ["Frameless", "Framed"],
    glasspanel: ["Frameless", "Framed"],
    stile: ["Single Glazing", "Double Glazing"],
  };

  const VISION_PANEL_OPTIONS_LOCAL = ["Single Glass", "Double Glass"];

  const DOOR_TYPES_LOCAL = [
    { value: "flush", label: "Flush Doors" },
    { value: "wpc", label: "WPC Doors" },
    { value: "glassdoor", label: "Glass Door" },
    { value: "teak", label: "Wooden Door" },
    { value: "stile", label: "Stile Door" },
  ];

  // Calculate quantities based on dimensions and door type
  const calculateQuantity = (
    materialName: string,
    materialUnit: string,
  ): number => {
    const c = count || 1;
    const h = height || 7;
    const w = width || 3;
    const gh = glassHeight || 6;
    const gw = glassWidth || 2;

    // Frame length using legacy estimator formula
    const frameLength = doorFrameLengthLegacyFeet(h, w);

    // Convert material name to lowercase for matching
    const name = materialName.toLowerCase();

    let quantity = 0;

    // Frame materials
    if (name.includes("frame") || name.includes("door frame")) {
      quantity = frameLength * c;
    }
    // Door panels/shutters
    else if (
      name.includes("door") &&
      (name.includes("panel") ||
        name.includes("shutter") ||
        name.includes("flush") ||
        name.includes("wooden"))
    ) {
      quantity = c;
    }
    // Hinges
    else if (name.includes("hinge")) {
      quantity = c * 3; // 3 hinges per door
    }
    // Hardware (locks, handles, etc.)
    else if (
      name.includes("lock") ||
      name.includes("handle") ||
      name.includes("stopper") ||
      name.includes("bolt")
    ) {
      quantity = c;
    }
    // Glass materials
    else if (name.includes("glass")) {
      const glassArea = glassAreaLegacySqft(gh, gw);
      quantity = glassArea * c;
    }
    // Default to 1 per door for other materials
    else {
      quantity = c;
    }

    return Math.max(1, Math.ceil(quantity));
  };

  // Get materials with quantities and shop info
  const getMaterialsWithDetails = (
    selectionsParam?: SelectedMaterialConfig[],
    editableOverride?: Record<
      string,
      { quantity: number; supplyRate: number; installRate: number }
    >,
  ): MaterialWithQuantity[] => {
    const selections = selectionsParam || selectedMaterials;
    const overrideBag = editableOverride || editableMaterials;
    // Use availableMaterials which includes both code-matched and fallback materials
    return selections
      .map((selection) => {
        let base = availableMaterials.find(
          (m) => m.id === selection.materialId,
        );
        // If the user switched door type, the material may no longer be in availableMaterials.
        // Fall back to finding the material directly in the store by id so cart items persist.
        if (!base)
          base =
            storeMaterials.find((m) => m.id === selection.materialId) || null;
        if (!base) return null;

        // ✅ NEW: find exact DB row matching product+name+brand+shop
        const chosen =
          storeMaterials.find((m) => {
            const sameProd = normText(m.product) === normText(base.product);
            const sameName = normText(m.name) === normText(base.name);
            const sameShop = m.shopId === selection.selectedShopId;
            const sameBrand =
              getBrandOfMaterial(m) === (selection.selectedBrand || "Generic");
            return sameProd && sameName && sameShop && sameBrand;
          }) || base;

        const shop = storeShops.find((s) => s.id === selection.selectedShopId);

        // Build a unique row key for this selection (batch-aware)
        const rowId =
          (selection as any).rowId ||
          (selection.batchId ? `${selection.batchId}-${chosen.id}` : chosen.id);

        // allow editable overrides (use provided override bag if present)
        const override =
          overrideBag[rowId] || overrideBag[chosen.id] || overrideBag[base.id];
        const computedQty = calculateQuantity(chosen.name, chosen.unit);
        const quantity = override?.quantity ?? computedQty;
        const supplyRate = override?.supplyRate ?? chosen.rate ?? 0;
        const installRate = override?.installRate ?? 0;

        // Try to find saved batch metadata (doorType, panelType, descriptions) from savedStep9Materials
        const savedRow = (savedStep9Materials || []).find(
          (s: any) =>
            s.rowId === rowId || `${s.batchId || ""}-${s.id}` === rowId,
        );

        return {
          id: chosen.id,
          batchId: selection.batchId,
          rowId,
          name: chosen.name,
          quantity,
          unit: chosen.unit,
          rate: supplyRate,
          shopId: selection.selectedShopId,
          shopName: shop?.name || "Unknown",
          // include installRate for downstream save/finalize
          installRate,
          // batch metadata
          doorType: savedRow?.doorType || savedRow?.door_type || undefined,
          panelType: savedRow?.panelType || savedRow?.panel_type || undefined,
          subOption: savedRow?.subOption || savedRow?.sub_option || undefined,
          glazingType:
            savedRow?.glazingType || savedRow?.glazing_type || undefined,
          productLabel: savedRow?.productLabel || undefined,
        } as any;
      })
      .filter((m): m is MaterialWithQuantity => m !== null);
  };

  const calculateTotalCost = (): number => {
    return getMaterialsWithDetails().reduce(
      (sum, m) => sum + m.quantity * m.rate,
      0,
    );
  };

  // materials available for current door (used in Step 6 render)
  const availableMaterials = getAvailableMaterials();

  const getProductLabel = (p: any) =>
    (
      p?.name ||
      p?.title ||
      p?.label ||
      p?.productName ||
      p?.product ||
      ""
    ).toString();
  const getProductCategory = (p: any) =>
    (p?.category || p?.type || p?.group || p?.section || "").toString();
  const isDoorProduct = (p: any) => {
    const label = normText(getProductLabel(p));
    const cat = normText(getProductCategory(p));
    return label.includes("DOOR") || cat.includes("DOOR");
  };
  const inferDoorTypeFromProductLabel = (label: string): string | null => {
    const s = normText(label);
    if (s.includes("FLUSH")) return "flush";
    if (s.includes("WPC")) return "wpc";
    if (s.includes("STILE") || s.includes("ALUMIN")) return "stile";
    if (s.includes("GLASS PANEL")) return "glasspanel";
    if (s.includes("GLASS")) return "glassdoor";
    if (s.includes("WOOD") || s.includes("TEAK")) return "wooden";
    return null;
  };
  const doorProducts = (storeProducts || [])
    .filter(isDoorProduct)
    .slice()
    .sort((a: any, b: any) => {
      const la = getProductLabel(a);
      const lb = getProductLabel(b);
      return la.localeCompare(lb);
    });
  const handleSelectDoorProduct = (p: Product) => {
    const label = getProductLabel(p);
    setSelectedDoorProductId((p as any).id || label);
    setSelectedDoorProductLabel(label);
    const inferred = inferDoorTypeFromProductLabel(label);
    if (inferred) setDoorType(inferred);
    else setDoorType(doorType); // keep existing if already set
    setSubOption(null);
    setVisionPanel(null);
    setGlazingType(null);
    setSelectedMaterials([]);
    setEditableMaterials({});
    setMaterialDescriptions({});
    setMaterialLocations({});
    setStep(6);
  };

  // Editable materials for Step 7 (allow user to tweak qty/supplyRate/installRate before BOQ)
  const [editableMaterials, setEditableMaterials] = useState<
    Record<
      string,
      { quantity: number; supplyRate: number; installRate: number }
    >
  >({});
  // Cart-specific selections and editable overrides used only for Step 9 (cart)
  const [cartSelections, setCartSelections] = useState<
    SelectedMaterialConfig[]
  >([]);
  const [cartEditableMaterials, setCartEditableMaterials] = useState<
    Record<
      string,
      { quantity: number; supplyRate: number; installRate: number }
    >
  >({});

  // Final BOQ manual fields (Step 9)
  const [finalCompanyName, setFinalCompanyName] = useState<string>(
    "Concept Trunk Interiors",
  );
  const [finalCompanyAddress, setFinalCompanyAddress] = useState<string>(
    "12/36A, Indira Nagar\nMedavakkam\nChennai Tamil Nadu 600100\nIndia",
  );
  const [finalCompanyGST, setFinalCompanyGST] =
    useState<string>("33ASOPS5560M1Z1");

  const [finalBillNo, setFinalBillNo] = useState<string>("");
  const [finalBillDate, setFinalBillDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [finalDueDate, setFinalDueDate] = useState<string>("");
  const [finalTerms, setFinalTerms] = useState<string>(
    "50% Advance and 50% on Completion",
  );
  const [finalCustomerName, setFinalCustomerName] = useState<string>("");
  const [finalCustomerAddress, setFinalCustomerAddress] = useState<string>("");

  const [finalShopDetails, setFinalShopDetails] = useState<string>("");
  // Material-wise descriptions
  const [materialDescriptions, setMaterialDescriptions] = useState<
    Record<string, string>
  >({});
  const [materialLocations, setMaterialLocations] = useState<
    Record<string, string>
  >({});
  const [materialQtys, setMaterialQtys] = useState<Record<string, number>>({});
  const [materialUnits, setMaterialUnits] = useState<Record<string, string>>(
    {},
  );
  const [step11InstallRates, setStep11InstallRates] = useState<
    Record<string, number>
  >({});
  const [step11SupplyRates, setStep11SupplyRates] = useState<
    Record<string, number>
  >({});
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [qaSelectedIds, setQaSelectedIds] = useState<string[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState("");

  // DB-loaded data for persistence
  const [dbStep9Items, setDbStep9Items] = useState<any[]>([]);
  const [dbStep11Items, setDbStep11Items] = useState<any[]>([]);
  const [dbStep12Items, setDbStep12Items] = useState<any[]>([]);
  const [savingStep11, setSavingStep11] = useState<boolean>(false);

  // Load data from DB on mount and when finalBillNo changes
  useEffect(() => {
    const loadDbData = async () => {
      if (!finalBillNo) return;

      try {
        // Load Step 9 data
        const step9Response = await apiFetch(
          `/api/estimator-step9-items?session_id=${finalBillNo}&estimator=doors`,
          {
            headers: {},
          },
        );
        if (step9Response.ok) {
          const step9Data = await step9Response.json();
          setDbStep9Items(step9Data.items || []);
        }

        // Load Step 11 data
        const step11Response = await apiFetch(
          `/api/estimator-step11-groups?session_id=${finalBillNo}&estimator=doors`,
          {
            headers: {},
          },
        );
        if (step11Response.ok) {
          const step11Data = await step11Response.json();
          setDbStep11Items(step11Data.items || []);
        }

        // Load Step 12 data
        const step12Response = await apiFetch(
          `/api/estimator-step12-qa-selection?session_id=${finalBillNo}&estimator=doors`,
          {
            headers: {},
          },
        );
        if (step12Response.ok) {
          const step12Data = await step12Response.json();
          setDbStep12Items(step12Data.items || []);
        }
      } catch (error) {
        console.warn("Failed to load data from DB:", error);
      }
    };

    loadDbData();
  }, [finalBillNo]);

  useEffect(() => {
    if (step === 7) {
      const details = getMaterialsWithDetails();
      const map: Record<
        string,
        { quantity: number; supplyRate: number; installRate: number }
      > = {};
      details.forEach((d) => {
        map[d.id] = {
          quantity: d.quantity || 0,
          supplyRate: d.rate || 0,
          installRate: 0,
        };
      });
      setEditableMaterials(map);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedMaterials]);

  // Prefill final shop/company details when opening final BOQ step
  useEffect(() => {
    if (step === 9) {
      const details = getMaterialsWithDetails(
        cartSelections,
        cartEditableMaterials,
      );
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
            shop.gstNo ? `GSTIN: ${shop.gstNo}` : "",
            shop.phone || "",
          ].filter(Boolean);
          setFinalShopDetails(parts.join("\n"));
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    step,
    cartSelections,
    cartEditableMaterials,
    selectedMaterials,
    storeShops,
  ]);

  // Fetch saved BOQs when opening Add to BOQ step
  useEffect(() => {
    if (step === 9) {
      fetchSavedBoqs();
      // When entering Step 9, combine saved cart data with current selections
      const combinedSelections: SelectedMaterialConfig[] = [];
      const combinedEditMap: Record<
        string,
        { quantity: number; supplyRate: number; installRate: number }
      > = {};
      const combinedDescMap: Record<string, string> = {};
      const combinedLocMap: Record<string, string> = {};

      // First, load from saved Step-9 cart (database-saved materials)
      // Start with in-memory cart (previously added items in this session, including unsaved)
      if (savedStep9Materials && savedStep9Materials.length > 0) {
        for (const m of savedStep9Materials as any[]) {
          const rowKey =
            (m as any).rowId || `${(m as any).batchId || ""}-${(m as any).id}`;
          const exists = combinedSelections.findIndex(
            (s) =>
              s.materialId === (m as any).id &&
              (s as any).rowId === rowKey &&
              (s.batchId || "") === ((m as any).batchId || ""),
          );
          if (exists !== -1) continue;
          combinedSelections.push({
            materialId: (m as any).id,
            selectedShopId: (m as any).shopId || "",
            selectedBrand: (m as any).brand || undefined,
            batchId: (m as any).batchId,
            rowId: rowKey,
          } as any);
          combinedEditMap[rowKey] = {
            quantity: Number((m as any).quantity || 0),
            supplyRate: Number((m as any).supplyRate ?? (m as any).rate ?? 0),
            installRate: Number((m as any).installRate || 0),
          };
          if ((m as any).description)
            combinedDescMap[rowKey] = (m as any).description;
          if ((m as any).location) combinedLocMap[rowKey] = (m as any).location;
        }
      }

      if (dbStep9Items && dbStep9Items.length > 0) {
        for (const item of dbStep9Items) {
          // Find the material in storeMaterials
          const match = storeMaterials.find((sm) => sm.id === item.material_id);
          if (!match) continue;

          const materialId = item.material_id;
          const rowKey =
            item.row_id ||
            (item.batch_id ? `${item.batch_id}-${materialId}` : materialId);
          const shopId = item.shop_id || "";
          const brand = item.brand || undefined;

          const existingIndex = combinedSelections.findIndex(
            (s: any) =>
              s.materialId === materialId &&
              (s.batchId || "") === ((item.batch_id as any) || "") &&
              ((s as any).rowId || "") === rowKey,
          );
          if (existingIndex !== -1) continue;

          combinedSelections.push({
            materialId,
            selectedShopId: shopId,
            selectedBrand: brand,
            batchId:
              item.batch_id ||
              (item.row_id ? rowKey.replace(`-${materialId}`, "") : undefined),
          });

          combinedEditMap[rowKey] = {
            quantity: Number(item.quantity || 0),
            supplyRate: Number(item.supply_rate || item.rate || 0),
            installRate: Number(item.install_rate || 0),
          };
          if (item.description) combinedDescMap[rowKey] = item.description;
          if (item.location) combinedLocMap[rowKey] = item.location;
        }
      }

      // DB only: no browser storage fallback.
      // Then, add current selections from previous steps (new materials)
      if (selectedMaterials && selectedMaterials.length > 0) {
        selectedMaterials.forEach((selection) => {
          // Check if this material is already in the combined selections
          const existingIndex = combinedSelections.findIndex(
            (s) =>
              s.materialId === selection.materialId &&
              s.batchId === selection.batchId,
          );
          if (existingIndex === -1) {
            // Add new material
            combinedSelections.push(selection);

            const material = storeMaterials.find(
              (m) => m.id === selection.materialId,
            );
            if (material) {
              const rowKey = selection.batchId
                ? `${selection.batchId}-${selection.materialId}`
                : selection.materialId;
              combinedEditMap[rowKey] = {
                quantity:
                  editableMaterials[selection.materialId]?.quantity ??
                  material.quantity ??
                  1,
                supplyRate:
                  editableMaterials[selection.materialId]?.supplyRate ??
                  material.rate ??
                  0,
                installRate:
                  editableMaterials[selection.materialId]?.installRate ?? 0,
              };
            }
          }
        });
      }

      // Update the cart with combined data
      if (combinedSelections.length > 0) setCartSelections(combinedSelections);
      if (Object.keys(combinedEditMap).length > 0)
        setCartEditableMaterials(combinedEditMap);
      if (Object.keys(combinedDescMap).length > 0)
        setMaterialDescriptions((prev) => ({ ...prev, ...combinedDescMap }));
      if (Object.keys(combinedLocMap).length > 0)
        setMaterialLocations((prev) => ({ ...prev, ...combinedLocMap }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedMaterials, dbStep9Items]);

  // Load saved Step 11 data when entering Step 11
  useEffect(() => {
    if (step === 11) {
      // Load saved step 11 data and combine with current cart data
      const loadStep11Data = async () => {
        if (!finalBillNo) return;

        try {
          const response = await apiFetch(
            `/api/estimator-step11-groups?session_id=${finalBillNo}&estimator=doors`,
            {
              headers: {},
            },
          );

          if (response.ok) {
            const data = await response.json();
            const savedItems = data.items || [];

            // Update step 11 rates from saved data
            const newSupplyRates: Record<string, number> = {};
            const newInstallRates: Record<string, number> = {};
            const newQtys: Record<string, number> = {};
            const newUnits: Record<string, string> = {};

            savedItems.forEach((item: any) => {
              // Find matching material by name (since we don't have IDs in saved data)
              const material = storeMaterials.find((m) => m.name === item.item);
              if (material) {
                newSupplyRates[material.id] = Number(item.supply_rate || 0);
                newInstallRates[material.id] = Number(item.install_rate || 0);
                newQtys[material.id] = Number(item.qty || 0);
                newUnits[material.id] = item.unit || "";
              }
            });

            setStep11SupplyRates((prev) => ({ ...prev, ...newSupplyRates }));
            setStep11InstallRates((prev) => ({ ...prev, ...newInstallRates }));
            setMaterialQtys((prev) => ({ ...prev, ...newQtys }));
            setMaterialUnits((prev) => ({ ...prev, ...newUnits }));
          }
        } catch (error) {
          console.warn("Failed to load step 11 data:", error);
        }
      };

      loadStep11Data();
    }
  }, [step, finalBillNo, dbStep11Items]);

  // ------------------- Cart persistence (DB only) -------------------
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Non-blocking: fetch BOQs list once on mount for Step 9 dropdowns (if API is available)
  useEffect(() => {
    fetchSavedBoqs().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load savedStep9Materials and meta from DB
  useEffect(() => {
    const loadFromDB = async () => {
      if (finalBillNo) {
        try {
          const res = await apiFetch(
            `/api/estimator-step9-items?session_id=${finalBillNo}&estimator=doors`,
            {
              headers: {},
            },
          );
          if (res.ok) {
            const data = await res.json();
            const mats = data.items.map((item: any) => ({
              id: item.material_id,
              rowId: item.row_id,
              batchId: item.batch_id,
              name: item.name,
              unit: item.unit,
              quantity: item.quantity,
              supplyRate: item.supply_rate,
              installRate: item.install_rate,
              shopId: item.shop_id,
              shopName: item.shop_name,
              description: item.description,
              location: item.location,
              doorType: item.door_type,
              panelType: item.panel_type,
              subOption: item.sub_option,
              glazingType: item.glazing_type,
            }));
            setSavedStep9Materials(mats);
            // Also set meta if available
            if (data.items.length > 0) {
              const first = data.items[0];
              setSavedStep9Meta({
                doorType: first.door_type,
                panelType: first.panel_type,
                subOption: first.sub_option,
                glazingType: first.glazing_type,
                count: first.qty,
                height: first.height,
                width: first.width,
                glassHeight: first.glass_height,
                glassWidth: first.glass_width,
                subtotal: first.subtotal,
                sgst: first.sgst,
                cgst: first.cgst,
                round_off: first.round_off,
                grand_total: first.grand_total,
              });
            }
          }
        } catch (e) {
          console.warn("Failed to load step 9 from DB", e);
        }
      }
    };
    loadFromDB();
  }, [finalBillNo]);

  // Auto-save cart (debounced): store in browser storage and POST silently to server
  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      const payload: any = {
        id: `local-cart-${Date.now()}`,
        estimator: "doors",
        bill_no: finalBillNo,
        door_type: doorType,
        panel_type: panelType,
        sub_option: subOption,
        glazing_type: glazingType,
        qty: count,
        height,
        width,
        glass_height: glassHeight,
        glass_width: glassWidth,
        selectedMaterials,
        editableMaterials,
        materialDescriptions,
        materialLocations,
        created_at: new Date().toISOString(),
      };

      try {
        // Removed browser storage save
        // browser storage.setItem(cartStorageKey, JSON.stringify(payload));
      } catch (e) {
        // ignore
      }

      try {
        if (!finalBillNo) return;

        const items = getMaterialsWithDetails().map((m: any, idx: number) => {
          const rowId = m.rowId || (m.batchId ? `${m.batchId}-${m.id}` : m.id);
          return {
            estimator: "doors",
            session_id: finalBillNo,
            s_no: idx + 1,
            row_id: String(rowId),
            batch_id: m.batchId || null,
            material_id: m.id,
            name: m.name,
            unit: m.unit,
            quantity: Number(
              editableMaterials[m.id]?.quantity ?? m.quantity ?? 0,
            ),
            supply_rate: Number(
              editableMaterials[m.id]?.supplyRate ?? m.rate ?? 0,
            ),
            install_rate: Number(editableMaterials[m.id]?.installRate ?? 0),
            shop_id: m.shopId || "",
            shop_name: m.shopName || "",
            description: materialDescriptions[m.id] || "",
            location: materialLocations[m.id] || "",
            door_type: doorType,
            panel_type: panelType,
            sub_option: subOption,
            glazing_type: glazingType,
            qty: count,
            height,
            width,
            glass_height: glassHeight,
            glass_width: glassWidth,
          };
        });

        // silent DB save (backend should dedupe by row_id/material_id as needed)
        await apiFetch("/api/estimator-step9-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            estimator: "doors",
            session_id: finalBillNo,
            items,
          }),
        });
      } catch (e) {
        // ignore network failures during autosave
      }
    }, 800);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedMaterials,
    editableMaterials,
    materialDescriptions,
    materialLocations,
    doorType,
    panelType,
    subOption,
    glazingType,
    count,
    height,
    width,
    glassHeight,
    glassWidth,
    finalBillNo,
  ]);

  const handleToggleMaterial = (materialId: string) => {
    const material = availableMaterials.find((m) => m.id === materialId);
    if (!material) return;

    const existingSelection = selectedMaterials.find(
      (m) => m.materialId === materialId,
    );

    if (existingSelection) {
      setSelectedMaterials((prev) =>
        prev.filter((m) => m.materialId !== materialId),
      );
      return;
    }

    // ✅ NEW: pick default brand and best (cheapest) shop within that brand
    const variants = storeMaterials
      .filter(
        (m) =>
          normText(m.product) === normText(material.product) &&
          normText(m.name) === normText(material.name),
      )
      .map((m) => ({
        brand: getBrandOfMaterial(m),
        shopId: m.shopId,
        rate: m.rate || 0,
      }));

    const brands = Array.from(new Set(variants.map((v) => v.brand))).sort();
    const selectedBrand = brands[0] || "Generic";

    const shopsForBrand = variants.filter((v) => v.brand === selectedBrand);
    const best = shopsForBrand.sort((a, b) => a.rate - b.rate)[0];

    if (!best?.shopId) return;

    setSelectedMaterials((prev) => [
      ...prev,
      { materialId, selectedShopId: best.shopId, selectedBrand },
    ]);
  };

  const handleChangeShop = (materialId: string, newShopId: string) => {
    setSelectedMaterials((prev) =>
      prev.map((m) =>
        m.materialId === materialId ? { ...m, selectedShopId: newShopId } : m,
      ),
    );
  };

  // ✅ NEW: update brand (also auto-switch to cheapest shop for that brand)
  const handleChangeBrand = (materialId: string, newBrand: string) => {
    const material = availableMaterials.find((m) => m.id === materialId);
    if (!material) return;

    const variants = storeMaterials
      .filter(
        (m) =>
          normText(m.product) === normText(material.product) &&
          normText(m.name) === normText(material.name),
      )
      .map((m) => ({
        brand: getBrandOfMaterial(m),
        shopId: m.shopId,
        rate: m.rate || 0,
      }))
      .filter((v) => v.brand === newBrand)
      .sort((a, b) => a.rate - b.rate);

    const bestShopId = variants[0]?.shopId || "";

    setSelectedMaterials((prev) =>
      prev.map((m) =>
        m.materialId === materialId
          ? {
              ...m,
              selectedBrand: newBrand,
              selectedShopId: bestShopId || m.selectedShopId,
            }
          : m,
      ),
    );
  };
  // Selection state for multi-delete on Add to BOQ page
  const [selectedForDelete, setSelectedForDelete] = useState<string[]>([]);

  const toggleSelectRow = (rowId: string) => {
    setSelectedForDelete((prev) =>
      prev.includes(rowId) ? prev.filter((x) => x !== rowId) : [...prev, rowId],
    );
  };

  const toggleSelectAll = () => {
    const ids = (
      step === 9
        ? getMaterialsWithDetails(cartSelections, cartEditableMaterials)
        : getMaterialsWithDetails()
    ).map((m) => (m as any).rowId || m.id);
    setSelectedForDelete((prev) => (prev.length === ids.length ? [] : ids));
  };

  const handleDeleteSelected = async () => {
    if (selectedForDelete.length === 0) return;

    try {
      // Separate saved materials (have DB ID) from new materials (don't have DB ID)
      const savedToDelete = [];
      const newToDelete = [];

      for (const rowId of selectedForDelete) {
        // Check if it's a saved material (has DB ID)
        const savedMaterial = savedStep9Materials?.find(
          (m) => `${m.batchId || ""}-${m.id}` === rowId,
        );
        if (savedMaterial && savedMaterial.id) {
          // Find the DB item
          const dbItem = dbStep9Items.find(
            (item) => item.id === savedMaterial.id,
          );
          if (dbItem) {
            savedToDelete.push(dbItem);
          }
        } else {
          // It's a new material (in cart but not saved to DB)
          const cartMaterial = cartSelections.find(
            (s) => `${s.batchId || ""}-${s.materialId}` === rowId,
          );
          if (cartMaterial) {
            newToDelete.push(cartMaterial);
          }
        }
      }

      // Delete saved materials from DB
      if (savedToDelete.length > 0 && finalBillNo) {
        await apiFetch("/api/estimator-step9-items", {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            session_id: finalBillNo,
            estimator: "doors",
            items: savedToDelete,
          }),
        });

        // Remove from saved materials
        setSavedStep9Materials((prev) =>
          prev
            ? prev.filter(
                (m) => !savedToDelete.some((item) => item.id === m.id),
              )
            : null,
        );
      }

      // Remove new materials from cart selections
      if (newToDelete.length > 0) {
        setCartSelections((prev) =>
          prev.filter(
            (s) =>
              !newToDelete.some(
                (item) =>
                  `${item.batchId || ""}-${item.materialId}` ===
                  `${s.batchId || ""}-${s.materialId}`,
              ),
          ),
        );
      }

      // Update cart selections and editable materials
      setCartSelections((prev) =>
        prev.filter(
          (s) =>
            !selectedForDelete.includes(`${s.batchId || ""}-${s.materialId}`),
        ),
      );
      setCartEditableMaterials((prev) => {
        const copy = { ...prev };
        selectedForDelete.forEach((id) => delete copy[id]);
        return copy;
      });

      // Reload DB data
      if (finalBillNo) {
        const response = await apiFetch(
          `/api/estimator-step9-items?session_id=${finalBillNo}&estimator=doors`,
          {
            headers: {},
          },
        );
        const data = await response.json();
        setDbStep9Items(data.items || []);
      }

      toast({
        title: "Success",
        description: `${selectedForDelete.length} item(s) deleted successfully!`,
      });
    } catch (e) {
      console.warn("Failed to delete items", e);
      toast({
        title: "Error",
        description: "Failed to delete items. Please try again.",
        variant: "destructive",
      });
    }

    setSelectedForDelete([]);
  };
  const handleDeleteSingle = (id: string) => {
    if (step === 9) {
      const rowId = id;
      // Find matching saved row by explicit rowId or constructed batchId-id key
      const saved = (savedStep9Materials || []).find(
        (m: any) => m.rowId === rowId || `${m.batchId || ""}-${m.id}` === rowId,
      );
      const materialId = saved ? saved.id : undefined;
      const batchId = saved ? saved.batchId || "" : undefined;

      if (materialId) {
        setCartSelections((prev) =>
          prev.filter(
            (s) =>
              !(
                s.materialId === materialId &&
                (s.batchId || "") === (batchId || "")
              ),
          ),
        );
      }

      setCartEditableMaterials((prev) => {
        const copy = { ...prev };
        delete copy[rowId];
        return copy;
      });

      setSavedStep9Materials((prev) => {
        const next = (prev || []).filter(
          (m) => !(m.rowId === rowId || `${m.batchId || ""}-${m.id}` === rowId),
        );
        // Removed browser storage save
        // try { browser storage.setItem("doors_saved_step9", JSON.stringify(next)); } catch (e) {}
        return next;
      });
    } else {
      setSelectedMaterials((prev) => prev.filter((s) => s.materialId !== id));
      setEditableMaterials((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      setMaterialDescriptions((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      setMaterialLocations((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    }
    setSelectedForDelete((prev) => prev.filter((x) => x !== id));
  };

  // Saved BOQs across estimators
  const [savedBoqs, setSavedBoqs] = useState<any[]>([]);
  const lastBoqErrorRef = useRef<string>("");
  const [currentSavedBoq, setCurrentSavedBoq] = useState<any | null>(null);
  // Materials specifically saved from Step 9 (cart). Only these should appear in Step 11.
  const [savedStep9Materials, setSavedStep9Materials] = useState<any[] | null>(
    null,
  );
  const [groupQtys, setGroupQtys] = useState<Record<string, number>>({});
  const [savedStep9Meta, setSavedStep9Meta] = useState<any | null>(null);
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
        const txt = await res.text().catch(() => "");
        console.warn("/api/boq returned non-json:", txt);
        setSavedBoqs([]);
        return;
      }

      const data = await res.json();
      setSavedBoqs(data.boqs || []);
      lastBoqErrorRef.current = "";
    } catch (err: any) {
      console.error("fetchSavedBoqs", err);
      const msg = String(err?.message || err || "");
      if (!msg) return;
      if (lastBoqErrorRef.current !== msg) {
        lastBoqErrorRef.current = msg;
        toast({
          title: "API not reachable",
          description:
            "Cannot connect to the server. Please make sure the backend API is running and reachable.",
          variant: "destructive",
        });
      }
    }
  };

  const handleSaveBOQ = async () => {
    try {
      if (!finalBillNo) {
        toast({
          title: "Bill No required",
          description: "Please enter Bill No in Step 9 before saving BOQ.",
          variant: "destructive",
        });
        return false;
      }

      const payload = {
        estimator: "doors",
        billNo: finalBillNo,
        doorType: doorType,
        panelType: panelType,
        subOption: subOption,
        glazingType: glazingType,
        qty: count,
        height,
        width,
        glassHeight,
        glassWidth,
        materials:
          savedStep9Materials && savedStep9Materials.length > 0
            ? savedStep9Materials
            : getMaterialsWithDetails(),
        subtotal: subTotal,
        sgst,
        cgst,
        roundOff,
        grandTotal,
      };

      const res = await apiFetch("/api/boq", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || "save failed");
      }

      const ct = res.headers.get("content-type") || "";
      let saved: any = null;
      if (ct.includes("application/json")) saved = await res.json();
      else {
        const txt = await res.text().catch(() => "");
        console.warn("POST /api/boq returned non-json:", txt);
        saved = { boq: null };
      }
      await fetchSavedBoqs();
      setCurrentSavedBoq(saved?.boq || saved?.boqs?.[0] || null);
      return true;
    } catch (err) {
      console.error("handleSaveBOQ", err);
      return false;
    }
  };

  const handleDeleteSavedBoq = async (id: string) => {
    try {
      const res = await apiFetch(`/api/boq/${id}`, {
        method: "DELETE",
        headers: {},
      });
      if (!res.ok) throw new Error("delete failed");
      await fetchSavedBoqs();
    } catch (err) {
      console.error("handleDeleteSavedBoq", err);
    }
  };

  const handleAddProductToAccumulated = () => {
    // Always go back to Step 1 to allow adding more products
    setStep(1);
    // Reset form to allow configuring new door
    setDoorType(null);
    setPanelType(null);
    setSubOption(null);
    setVisionPanel(null);
    setCount(1);
    setHeight(7);
    setWidth(3);
    setGlassHeight(0);
    setGlassWidth(0);
    setSelectedGroupIds([]);
    setMaterialQtys({});
    setMaterialDescriptions({});
    setMaterialLocations({});
    setMaterialUnits({});
    setStep11SupplyRates({});
    setStep11InstallRates({});
    setGroupQtys({});
    setCurrentSavedBoq(null);
  };

  const handleSaveAccumulatedBOQ = async () => {
    setSavingStep11(true);
    try {
      // Ensure we have the latest DB items to avoid duplicates
      let currentDbItems: any[] = dbStep11Items || [];
      if (finalBillNo) {
        try {
          const cur = await apiFetch(
            `/api/estimator-step11-groups?session_id=${finalBillNo}&estimator=doors`,
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

      const groups = displayMaterials.map((m) => ({
        estimator: "doors",
        session_id: finalBillNo,
        group_key:
          (m.groupKey ||
            `${m.doorType || "door"}||${m.panelType || ""}||${m.subOption || ""}`) +
          "::" +
          (m.name || ""),
        group_id: m.groupId || `group_${m.groupKey || ""}`,
        item_name: m.name,
        unit: m.unit,
        quantity: m.quantity,
        location: m.location || "",
        description: m.description || "",
        supply_rate: step11SupplyRates[m.id] || m.supplyRate || 0,
        install_rate: step11InstallRates[m.id] || m.installRate || 0,
        supply_amount:
          (m.quantity || 0) * (step11SupplyRates[m.id] || m.supplyRate || 0),
        install_amount:
          (m.quantity || 0) * (step11InstallRates[m.id] || m.installRate || 0),
        supply_subtotal: displayMaterials.reduce(
          (sum, it) =>
            sum +
            (it.quantity || 0) *
              (step11SupplyRates[it.id] || it.supplyRate || 0),
          0,
        ),
        install_subtotal: displayMaterials.reduce(
          (sum, it) =>
            sum +
            (it.quantity || 0) *
              (step11InstallRates[it.id] || it.installRate || 0),
          0,
        ),
        sgst: sgst,
        cgst: cgst,
        round_off: roundOff,
        grand_total:
          displayMaterials.reduce(
            (sum, it) =>
              sum +
              (it.quantity || 0) *
                ((step11SupplyRates[it.id] || it.supplyRate || 0) +
                  (step11InstallRates[it.id] || it.installRate || 0)),
            0,
          ) +
          sgst +
          cgst +
          roundOff,
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
          `/api/estimator-step11-groups?session_id=${finalBillNo}&estimator=doors`,
        );
        if (reloadRes.ok) {
          const data = await reloadRes.json();
          setDbStep11Items(data.items || []);
        }
      } catch (e) {
        console.warn("Failed to reload step11 items after save", e);
      }

      // Clear accumulatedProducts to prevent duplicates in display
      setAccumulatedProducts([]);

      toast({ title: "Success", description: "Step 11 saved to database." });
      setSavingStep11(false);
      return true;
    } catch (err) {
      console.error("handleSaveAccumulatedBOQ", err);
      toast({
        title: "Error",
        description: "Failed to save Step 11.",
        variant: "destructive",
      });
      setSavingStep11(false);
      return false;
    }
  };

  const handleLoadBoq = (b: any) => {
    // Load basic fields and materials into current estimate
    setFinalBillNo(b.bill_no || "");
    setDoorType(b.door_type || null);
    setPanelType(b.panel_type || null);
    setSubOption(b.sub_option || null);
    setGlazingType(b.glazing_type || null);
    setCount(b.qty || 1);
    setHeight(b.height || 7);
    setWidth(b.width || 3);
    setGlassHeight(b.glass_height || 6);
    setGlassWidth(b.glass_width || 2);

    // Try to reconstruct selectedMaterials from saved materials array
    if (Array.isArray(b.materials)) {
      const selections: SelectedMaterialConfig[] = b.materials.map(
        (m: any) => ({
          materialId: m.id,
          selectedShopId: m.shopId || m.shop_id || m.shopId || "",
          selectedBrand: m.shopName || m.brand || m.selectedBrand || undefined,
        }),
      );
      setSelectedMaterials(selections.filter(Boolean));
    }
    setCurrentSavedBoq(b);
  };
  const setEditableQuantity = (materialId: string, quantity: number) => {
    if (step === 9) {
      setCartEditableMaterials((prev) => ({
        ...prev,
        [materialId]: {
          ...(prev[materialId] || { supplyRate: 0, installRate: 0 }),
          quantity: Math.max(0, Math.ceil(quantity)),
        },
      }));
      return;
    }

    setEditableMaterials((prev) => ({
      ...prev,
      [materialId]: {
        ...(prev[materialId] || { supplyRate: 0, installRate: 0 }),
        quantity: Math.max(0, Math.ceil(quantity)),
      },
    }));
  };

  const setEditableRate = (materialId: string, rate: number) => {
    if (step === 9) {
      setCartEditableMaterials((prev) => ({
        ...prev,
        [materialId]: {
          ...(prev[materialId] || { quantity: 0, installRate: 0 }),
          supplyRate: Math.max(0, Number(rate)),
          installRate: prev[materialId]?.installRate || 0,
        },
      }));
      return;
    }

    setEditableMaterials((prev) => ({
      ...prev,
      [materialId]: {
        ...(prev[materialId] || { quantity: 0, installRate: 0 }),
        supplyRate: Math.max(0, Number(rate)),
        installRate: prev[materialId]?.installRate || 0,
      },
    }));
  };

  const setEditableInstallRate = (materialId: string, rate: number) => {
    if (step === 9) {
      setCartEditableMaterials((prev) => ({
        ...prev,
        [materialId]: {
          ...(prev[materialId] || { quantity: 0, supplyRate: 0 }),
          installRate: Math.max(0, Number(rate)),
          supplyRate: prev[materialId]?.supplyRate || 0,
        },
      }));
      return;
    }

    setEditableMaterials((prev) => ({
      ...prev,
      [materialId]: {
        ...(prev[materialId] || { quantity: 0, supplyRate: 0 }),
        installRate: Math.max(0, Number(rate)),
        supplyRate: prev[materialId]?.supplyRate || 0,
      },
    }));
  };
  const handleExportPDF = () => {
    const element = document.getElementById("boq-pdf");

    if (!element) {
      alert("BOQ content not found");
      return;
    }

    setTimeout(() => {
      html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename: "Door_BOQ.pdf",
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: "#ffffff",
            ignoreElements: (el: HTMLElement) => {
              // ignore elements that may contain Tailwind OKLCH colors
              return (
                el.className?.toString().includes("bg-") ||
                el.className?.toString().includes("text-")
              );
            },
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(element)
        .save()
        .catch((err: any) => {
          console.error("PDF Export Error:", err);
          alert("PDF export failed. Check console.");
        });
    }, 100);
  };

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

  const handleExportBOQ = () => {
    const materials = getMaterialsWithDetails();
    const doorConfig = getCurrentDoorConfig();
    const csvLines = [
      "BILL OF QUANTITIES (BOQ)",
      `Generated: ${new Date().toLocaleString()}`,
      `Door Type: ${panelType === "panel" ? "With Panel" : "Without Panel"} - ${doorConfig?.label}`,
      `Dimensions: ${height}ft × ${width}ft (Count: ${count})`,
      ...(glazingType ? [`Glazing: ${glazingType}`] : []),
      "",
      "MATERIALS SCHEDULE",
      "S.No,Item,Unit,Quantity,Unit Rate,Shop,Total",
    ];

    materials.forEach((mat, idx) => {
      const total = mat.quantity * mat.rate;
      csvLines.push(
        `${idx + 1},"${mat.name}","${mat.unit}",${mat.quantity},${mat.rate},"${mat.shopName}",${total}`,
      );
    });

    csvLines.push("", `TOTAL COST,,,${calculateTotalCost().toFixed(2)}`);

    const csv = csvLines.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BOQ-Doors-${new Date().getTime()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportExcelStep11 = () => {
    const mats = displayMaterials || [];
    const lines: string[] = [];
    lines.push(
      "S.No,Item,Location,Description,Unit,Qty,Supply Rate,Install Rate,Supply Amount,Install Amount",
    );

    mats.forEach((m: any, idx: number) => {
      const supplyRate = Number(m.supplyRate ?? m.rate ?? 0);
      const installRate = Number(m.installRate ?? 0);
      const qty = Number(m.quantity || 0);
      const supplyAmt = qty * supplyRate;
      const installAmt = qty * installRate;

      const location = (m.location || materialLocations[m.id] || "")
        .toString()
        .replace(/"/g, '""');
      const desc = (m.description || materialDescriptions[m.id] || m.name || "")
        .toString()
        .replace(/"/g, '""');

      // Mirror Step 11 Item rendering: prefer a door label built from material meta, otherwise use material name
      const perLabel = getDoorLabelFrom({
        doorType: (m as any).doorType || (m as any).door_type,
        panelType: (m as any).panelType || (m as any).panel_type,
        subOption: (m as any).subOption || (m as any).sub_option,
        glazingType: (m as any).glazingType || (m as any).glazing_type,
      });
      const itemText = perLabel || m.name || "";
      const itemEsc = itemText.replace(/"/g, '""');

      lines.push(
        `${idx + 1},"${itemEsc}","${location}","${desc}",${m.unit},${qty},${supplyRate.toFixed(2)},${installRate.toFixed(2)},${supplyAmt.toFixed(2)},${installAmt.toFixed(2)}`,
      );
    });

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BOQ-Doors-Step11-${new Date().getTime()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Save from Step 9 (Add to BOQ) — build materials using editable overrides + descriptions/locations
  const handleSaveStep9 = async () => {
    // Get current materials from cart
    const currentMaterials = getMaterialsWithDetails(
      cartSelections,
      cartEditableMaterials,
    ).map((m) => {
      const batchKey = (m as any).rowId || `${(m as any).batchId}-${m.id}`;
      return {
        id: m.id,
        rowId: batchKey,
        batchId: (m as any).batchId || null,
        name: m.name,
        unit: m.unit,
        quantity:
          cartEditableMaterials[batchKey]?.quantity ??
          cartEditableMaterials[m.id]?.quantity ??
          m.quantity,
        supplyRate:
          cartEditableMaterials[batchKey]?.supplyRate ??
          cartEditableMaterials[m.id]?.supplyRate ??
          m.rate,
        installRate:
          cartEditableMaterials[batchKey]?.installRate ??
          cartEditableMaterials[m.id]?.installRate ??
          (m as any).installRate ??
          0,
        shopId: m.shopId,
        shopName: m.shopName,
        description:
          materialDescriptions[batchKey] || materialDescriptions[m.id] || "",
        location: materialLocations[batchKey] || materialLocations[m.id] || "",
        doorType: (m as any).doorType,
        panelType: (m as any).panelType,
        subOption: (m as any).subOption,
        glazingType: (m as any).glazingType,
        isSaved: (m as any).isSaved || false, // Check if already saved
      };
    });

    // Filter to only unsaved materials
    const unsavedMaterials = currentMaterials.filter((m: any) => !m.isSaved);

    if (unsavedMaterials.length === 0) {
      toast({
        title: "No New Items",
        description: "All materials are already saved. No new items to save.",
        variant: "destructive",
      });
      return;
    }

    // Check if we have a bill number or a project passed via URL
    let billNoToUse = finalBillNo;
    const urlParams =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
    const projectParam = urlParams.get("project");
    if (projectParam && projectParam.trim() !== "") {
      billNoToUse = projectParam;
      setFinalBillNo(billNoToUse);
    } else if (!billNoToUse || billNoToUse.trim() === "") {
      // Generate a bill number if not set
      billNoToUse = `DOOR-${Date.now()}`;
      setFinalBillNo(billNoToUse);
    }

    // Prefer Step-8 totals (saved in savedStep9Meta) when available, otherwise compute from current materials
    const step8meta =
      savedStep9Meta ||
      (() => {
        const s = currentMaterials.reduce(
          (sum, it) =>
            sum +
            Number(it.quantity || 0) *
              (Number(it.supplyRate || 0) + Number(it.installRate || 0)),
          0,
        );
        const sg = s * 0.09;
        const cg = s * 0.09;
        const ro = Math.round(s + sg + cg) - (s + sg + cg);
        const gt = s + sg + cg + ro;
        return {
          subtotal: s,
          sgst: sg,
          cgst: cg,
          round_off: ro,
          grand_total: gt,
        };
      })();

    const localBoq = {
      id: `local-${Date.now()}`,
      estimator: "doors",
      bill_no: billNoToUse,
      door_type:
        savedStep9Meta?.doorType || savedStep9Meta?.door_type || doorType,
      panel_type:
        savedStep9Meta?.panelType || savedStep9Meta?.panel_type || panelType,
      sub_option:
        savedStep9Meta?.subOption || savedStep9Meta?.sub_option || subOption,
      glazing_type:
        savedStep9Meta?.glazingType ||
        savedStep9Meta?.glazing_type ||
        glazingType,
      qty: savedStep9Meta?.count || savedStep9Meta?.qty || count,
      height: savedStep9Meta?.height || height,
      width: savedStep9Meta?.width || width,
      glass_height:
        savedStep9Meta?.glassHeight ||
        savedStep9Meta?.glass_height ||
        glassHeight,
      glass_width:
        savedStep9Meta?.glassWidth || savedStep9Meta?.glass_width || glassWidth,
      materials: currentMaterials,
      subtotal: step8meta.subtotal,
      sgst: step8meta.sgst,
      cgst: step8meta.cgst,
      round_off: step8meta.round_off,
      grand_total: step8meta.grand_total,
      created_at: new Date().toISOString(),
    };

    setCurrentSavedBoq(localBoq);
    setSavedStep9Materials(currentMaterials);
    // Removed browser storage saves - now only DB storage
    try {
      // persist meta (ensure Step-8 grand total is saved alongside saved materials)
      setSavedStep9Meta((prev) => ({ ...(prev || {}), ...step8meta }));
    } catch (e) {
      /* ignore */
    }

    // Prepare items for DB save
    const itemsToSave = unsavedMaterials.map((m: any, index: number) => ({
      estimator: "doors",
      session_id: billNoToUse,
      s_no: index + 1,
      row_id: String(m.rowId || `${m.batchId || ""}-${m.id}`),
      batch_id: m.batchId || null,
      material_id: m.id,
      name: m.name,
      unit: m.unit,
      quantity: Number(m.quantity || 0),
      supply_rate: Number(m.supplyRate || 0),
      install_rate: Number(m.installRate || 0),
      shop_id: m.shopId || "",
      shop_name: m.shopName || "",
      description: m.description || "",
      location: m.location || "",
      door_type:
        m.doorType ||
        savedStep9Meta?.doorType ||
        savedStep9Meta?.door_type ||
        doorType ||
        null,
      panel_type:
        m.panelType ||
        savedStep9Meta?.panelType ||
        savedStep9Meta?.panel_type ||
        panelType ||
        null,
      sub_option:
        m.subOption ||
        savedStep9Meta?.subOption ||
        savedStep9Meta?.sub_option ||
        subOption ||
        null,
      glazing_type:
        m.glazingType ||
        savedStep9Meta?.glazingType ||
        savedStep9Meta?.glazing_type ||
        glazingType ||
        null,
      qty: savedStep9Meta?.count || savedStep9Meta?.qty || count,
      height: savedStep9Meta?.height || height,
      width: savedStep9Meta?.width || width,
      glass_height:
        savedStep9Meta?.glassHeight ||
        savedStep9Meta?.glass_height ||
        glassHeight,
      glass_width:
        savedStep9Meta?.glassWidth || savedStep9Meta?.glass_width || glassWidth,
      subtotal: step8meta.subtotal,
      sgst: step8meta.sgst,
      cgst: step8meta.cgst,
      round_off: step8meta.round_off,
      grand_total: step8meta.grand_total,
    }));

    try {
      // Save only the unsaved items
      await apiFetch("/api/estimator-step9-items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          estimator: "doors",
          session_id: billNoToUse,
          items: itemsToSave,
        }),
      });

      // Reload data from DB
      const reloadResponse = await apiFetch(
        `/api/estimator-step9-items?session_id=${billNoToUse}&estimator=doors`,
        {
          headers: {},
        },
      );
      const data = await reloadResponse.json();
      setDbStep9Items(data.items || []);

      // Mark the saved materials as saved in the UI state
      const updatedSavedMaterials = (savedStep9Materials || []).map(
        (m: any) => {
          const wasSaved = unsavedMaterials.some(
            (unsaved: any) =>
              m.rowId === unsaved.rowId ||
              `${m.batchId || ""}-${m.id}` ===
                `${unsaved.batchId || ""}-${unsaved.id}`,
          );
          return wasSaved ? { ...m, isSaved: true } : m;
        },
      );
      setSavedStep9Materials(updatedSavedMaterials);

      toast({
        title: "Success",
        description: `${unsavedMaterials.length} new material(s) saved successfully to database!`,
      });
    } catch (e) {
      console.warn("Failed to save step 9 to DB", e);
      toast({
        title: "Error",
        description:
          "Failed to save Step 9 data. Please check your connection and try again.",
        variant: "destructive",
      });
    }
  };

  // Add current selection to Step-9 cart (merge with existing saved cart) and open Step 9
  const stableHash = (input: string): string => {
    let hash = 5381;
    for (let i = 0; i < input.length; i += 1)
      hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
    return Math.abs(hash >>> 0).toString(36);
  };

  const buildDoorBatchId = (): string => {
    const signature = JSON.stringify({
      doorType,
      panelType,
      subOption,
      glazingType,
      count,
      height,
      width,
      glassHeight,
      glassWidth,
      selectedMaterials: (selectedMaterials || []).map((s: any) => ({
        materialId: s.materialId,
        selectedShopId: s.selectedShopId,
        selectedBrand: s.selectedBrand,
      })),
      editable: Object.keys(editableMaterials || {})
        .sort()
        .map((id) => ({ id, ...editableMaterials[id] })),
    });
    return `batch-${stableHash(signature)}`;
  };

  const addToCartAndOpenStep9 = () => {
    // Build materials from current selections (not from cart) when adding to cart
    // Create a unique batch ID per "Add" action so previous adds (even for same door type) stay listed in Step 9
    const baseBatchId = buildDoorBatchId();
    const batchId = `${baseBatchId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const mats = getMaterialsWithDetails(
      selectedMaterials,
      editableMaterials,
    ).map((m) => ({
      id: m.id,
      rowId: `${batchId}-${m.id}`,
      batchId, // Track which batch this material belongs to
      name: m.name,
      unit: m.unit,
      quantity: editableMaterials[m.id]?.quantity ?? m.quantity,
      supplyRate: editableMaterials[m.id]?.supplyRate ?? m.rate,
      installRate: editableMaterials[m.id]?.installRate ?? 0,
      shopId: m.shopId,
      shopName: m.shopName,
      description: materialDescriptions[m.id] || "",
      location: materialLocations[m.id] || "",
      doorType: doorType, // Store door type with this batch
      panelType: panelType,
      subOption: subOption,
      glazingType: glazingType,
      isSaved: false, // Mark as unsaved when newly added
    }));

    if (mats.length === 0) {
      setStep(9);
      return;
    }

    // Prevent re-adding materials that are already in the saved cart
    const existingIds = new Set(
      (savedStep9Materials || []).map((it: any) => it.id),
    );
    const newMats = mats.filter((m) => !existingIds.has(m.id));
    if (newMats.length === 0) {
      // nothing new to add, just open Step 9
      setStep(9);
      return;
    }

    // Merge with existing cart and deduplicate by rowId to avoid double-adds
    const existing = savedStep9Materials || [];
    const merged = [...existing, ...newMats];
    const dedupMap = new Map<string, any>();
    // Use material id + shop id as dedup key so repeated 'Add to BOM' (which
    // generates fresh rowIds) won't create duplicates for the same material
    for (const itm of merged) {
      // Deduplicate strictly by material id to avoid repeated adds
      const dedupKey = `${itm.id}`;
      if (!dedupMap.has(dedupKey)) dedupMap.set(dedupKey, itm);
    }
    const deduped = Array.from(dedupMap.values());

    setSavedStep9Materials(deduped);
    setCartSelections(
      deduped.map((m: any) => ({
        materialId: m.id,
        selectedShopId: m.shopId || "",
        selectedBrand: m.brand || undefined,
        batchId: m.batchId,
        rowId: m.rowId,
      })),
    );
    const cartEdits: Record<
      string,
      { quantity: number; supplyRate: number; installRate: number }
    > = {};
    deduped.forEach((m: any) => {
      const key = m.rowId || `${m.batchId}-${m.id}`;
      cartEdits[key] = {
        quantity: Number(m.quantity || 0),
        supplyRate: Number(m.supplyRate || m.rate || 0),
        installRate: Number(m.installRate || 0),
      };
    });
    setCartEditableMaterials(cartEdits);
    // Removed browser storage save
    // try { browser storage.setItem("doors_saved_step9", JSON.stringify(merged)); } catch (e) { /* ignore */ }
    try {
      // include Step 8 totals in meta: subtotal and grand_total (with SGST/CGST 9% each)
      const subTotalStep8 = calculateTotalCost();
      const sgstStep8 = subTotalStep8 * 0.09;
      const cgstStep8 = subTotalStep8 * 0.09;
      const roundOffStep8 =
        Math.round(subTotalStep8 + sgstStep8 + cgstStep8) -
        (subTotalStep8 + sgstStep8 + cgstStep8);
      const grandTotalStep8 =
        subTotalStep8 + sgstStep8 + cgstStep8 + roundOffStep8;
      const meta: any = {
        doorType,
        panelType,
        subOption,
        glazingType,
        count,
        height,
        width,
        glassHeight,
        glassWidth,
        subtotal: subTotalStep8,
        sgst: sgstStep8,
        cgst: cgstStep8,
        round_off: roundOffStep8,
        grand_total: grandTotalStep8,
      };
      setSavedStep9Meta(meta);
      // Removed browser storage save for meta
      // browser storage.setItem("doors_saved_step9_meta", JSON.stringify(meta));
    } catch (e) {
      /* ignore */
    }
    // Clear current step selections so the Step-9 combine effect doesn't
    // re-add the same selectedMaterials (causing duplicate rows).
    setSelectedMaterials([]);
    setEditableMaterials({});
    setMaterialDescriptions((prev) => {
      const copy = { ...prev };
      // remove any per-selection description keys (batch-less)
      Object.keys(copy).forEach((k) => {
        if (!k.startsWith("group_")) delete copy[k];
      });
      return copy;
    });
    setMaterialLocations((prev) => {
      const copy = { ...prev };
      Object.keys(copy).forEach((k) => {
        if (!k.startsWith("group_")) delete copy[k];
      });
      return copy;
    });
    setStep(9);
  };

  // ===== FINAL BOQ DATA (USED IN STEP 9 and 11) =====
  const materials =
    step === 9 || step === 11
      ? getMaterialsWithDetails(cartSelections, cartEditableMaterials)
      : getMaterialsWithDetails();

  const currentEditableBag =
    step === 9 ? cartEditableMaterials : editableMaterials;

  const subTotal = materials.reduce(
    (sum, m) =>
      sum +
      m.quantity *
        ((currentEditableBag[m.id]?.supplyRate ?? m.rate) +
          (currentEditableBag[m.id]?.installRate ??
            (m as any).installRate ??
            0)),
    0,
  );

  const sgst = subTotal * 0.09;
  const cgst = subTotal * 0.09;

  const roundOff =
    Math.round(subTotal + sgst + cgst) - (subTotal + sgst + cgst);

  const grandTotal = subTotal + sgst + cgst + roundOff;

  // Presentation values: Step 11 should show aggregated BOQ lines — one line per main item (door type).
  // Prefer the BOQ that was just finalized (currentSavedBoq) so Step 11 shows only selected items.
  const _srcMaterials: any[] =
    accumulatedProducts.length > 0
      ? accumulatedProducts.flatMap((p) => p.materials || [])
      : savedStep9Materials && savedStep9Materials.length > 0
        ? savedStep9Materials
        : materials && materials.length > 0
          ? materials
          : currentSavedBoq &&
              currentSavedBoq.materials &&
              currentSavedBoq.materials.length > 0
            ? Array.isArray(currentSavedBoq.materials)
              ? currentSavedBoq.materials
              : JSON.parse(currentSavedBoq.materials || "[]")
            : materials;

  const grouped = (() => {
    const map = new Map<string, any[]>();
    for (const m of _srcMaterials || []) {
      const dt =
        (m as any).doorType ||
        (m as any).door_type ||
        savedStep9Meta?.doorType ||
        savedStep9Meta?.door_type ||
        doorType ||
        "door";
      const pt =
        (m as any).panelType ||
        (m as any).panel_type ||
        savedStep9Meta?.panelType ||
        savedStep9Meta?.panel_type ||
        panelType ||
        "";
      const so =
        (m as any).subOption ||
        (m as any).sub_option ||
        savedStep9Meta?.subOption ||
        savedStep9Meta?.sub_option ||
        "";
      const key = `${dt}||${pt}||${so}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }

    const out: any[] = [];
    for (const [key, items] of map.entries()) {
      const [dt, pt, so] = key.split("||");
      // prefer group-level Qty stored in materialDescriptions[group_<key>] if present
      const gid = `group_${key}`;
      const groupDesc = materialDescriptions[gid] || "";
      const groupLoc = materialLocations[gid] || "";
      // prefer explicit numeric groupQtys state, then Qty in description, then saved meta
      let doorQty = Number(
        groupQtys[gid] ??
          savedStep9Meta?.count ??
          savedStep9Meta?.qty ??
          count ??
          1,
      );
      const match = String(groupDesc).match(/Qty:\s*(\d+(?:\.\d+)?)/);
      if (match && (groupQtys[gid] === undefined || groupQtys[gid] === null)) {
        doorQty = Number(match[1]);
      }

      const groupSupplyTotal = items.reduce(
        (s: number, it: any) =>
          s + Number(it.quantity || 0) * Number(it.supplyRate ?? it.rate ?? 0),
        0,
      );
      const supplyRatePerDoor =
        doorQty > 0 ? groupSupplyTotal / doorQty : groupSupplyTotal;

      const groupInstallTotal = items.reduce(
        (s: number, it: any) =>
          s + Number(it.quantity || 0) * Number(it.installRate ?? 0),
        0,
      );
      const installRatePerDoor =
        doorQty > 0 ? groupInstallTotal / doorQty : groupInstallTotal;

      const label = getProductTypeOnly({ doorType: dt }) || dt;

      const cleanedDesc = String(groupDesc)
        .replace(/\n?Qty:\s*\d+(?:\.\d+)?\s*$/, "")
        .trim();
      out.push({
        id: gid,
        groupKey: key,
        name: label,
        location: groupLoc || "",
        description: cleanedDesc || "",
        unit: "pcs",
        quantity: doorQty,
        supplyRate: Number(supplyRatePerDoor || 0),
        installRate: Number(step11InstallRates[gid] ?? installRatePerDoor ?? 0),
        supplyAmount: Number(supplyRatePerDoor * doorQty || 0),
        installAmount: Number(
          (step11InstallRates[gid] ?? installRatePerDoor) * doorQty || 0,
        ),
      });
    }
    return out;
  })();

  const dbDisplayMaterials = (dbStep11Items || [])
    .filter((item) => item.item || item.item_name)
    .map((item: any, idx: number) => {
      const groupKey =
        item.group_key ||
        item.groupKey ||
        `${item.door_type || item.doorType || "door"}||${item.panel_type || item.panelType || ""}||${item.sub_option || item.subOption || ""}`;

      return {
        id: item.id, // Use actual database ID
        groupKey,
        name:
          item.item_name ||
          item.item ||
          item.name ||
          item.door_label ||
          item.doorType ||
          item.door_type ||
          "Door",
        location: item.location || "",
        description: item.description || "",
        unit: item.unit || "pcs",
        quantity: Number(item.quantity ?? item.qty ?? 1), // Default to 1 if null
        supplyRate: Number(item.supply_rate ?? item.supplyRate ?? 0),
        installRate: Number(item.install_rate ?? item.installRate ?? 0),
        supplyAmount: Number(item.supply_amount ?? 0),
        installAmount: Number(item.install_amount ?? 0),
        doorType: item.door_type || item.doorType,
        panelType: item.panel_type || item.panelType,
        subOption: item.sub_option || item.subOption,
      };
    });

  const currentDisplayMaterials =
    accumulatedProducts.length === 0
      ? grouped.filter((g: any) => {
          // Exclude materials already in DB
          const inDb = (dbStep11Items || []).some((item: any) => {
            const dbGroupKey =
              item.group_key ||
              item.groupKey ||
              `${item.door_type || ""}||${item.panel_type || ""}||${item.sub_option || ""}`;
            return dbGroupKey === g.groupKey;
          });
          return !inDb;
        })
      : accumulatedProducts.map((p: any, idx: number) => ({
          id: `accumulated_${idx}`,
          groupKey: `${p.doorType || "door"}||${p.panelType || ""}||${p.subOption || ""}`,
          name:
            p.doorLabel ||
            getDoorLabelFrom({
              doorType: p.doorType,
              panelType: p.panelType,
              subOption: p.subOption,
            }) ||
            p.doorType,
          location: p.location || "",
          description: p.description || "",
          unit: "pcs",
          quantity: p.count || 1,
          supplyRate:
            p.materials?.reduce(
              (s: number, m: any) =>
                s +
                Number(m.quantity || 0) * Number(m.supplyRate ?? m.rate ?? 0),
              0,
            ) || 0,
          installRate:
            p.materials?.reduce(
              (s: number, m: any) =>
                s + Number(m.quantity || 0) * Number(m.installRate ?? 0),
              0,
            ) || 0,
          supplyAmount:
            p.materials?.reduce(
              (s: number, m: any) =>
                s +
                Number(m.quantity || 0) * Number(m.supplyRate ?? m.rate ?? 0),
              0,
            ) || 0,
          installAmount:
            p.materials?.reduce(
              (s: number, m: any) =>
                s + Number(m.quantity || 0) * Number(m.installRate ?? 0),
              0,
            ) || 0,
        }));

  const displayMaterials = currentDisplayMaterials || [];

  const qaMaterials = displayMaterials.filter((m) =>
    qaSelectedIds.includes(m.id),
  );

  // compute display totals: separate supply and installation subtotals
  const displaySupplySubtotal = displayMaterials.reduce(
    (s: number, it: any) => {
      const qty = Number(materialQtys[it.id] ?? (it.quantity || 0));
      const supplyRate = Number(
        step11SupplyRates[it.id] ?? it.supplyRate ?? it.rate ?? 0,
      );
      return s + qty * supplyRate;
    },
    0,
  );
  const displayInstallSubtotal = displayMaterials.reduce(
    (s: number, it: any) => {
      const qty = Number(materialQtys[it.id] ?? (it.quantity || 0));
      return s + qty * Number(it.installRate || 0);
    },
    0,
  );

  const qaSupplySubtotal = qaMaterials.reduce((s: number, it: any) => {
    const qty = Number(materialQtys[it.id] ?? (it.quantity || 0));
    const supplyRate = Number(
      step11SupplyRates[it.id] ?? it.supplyRate ?? it.rate ?? 0,
    );
    return s + qty * supplyRate;
  }, 0);

  const displaySgst = displaySupplySubtotal * 0.09;
  const displayCgst = displaySupplySubtotal * 0.09;
  const displayRoundOff =
    Math.round(displaySupplySubtotal + displaySgst + displayCgst) -
    (displaySupplySubtotal + displaySgst + displayCgst);
  const displayGrandTotal =
    displaySupplySubtotal +
    displayInstallSubtotal +
    displaySgst +
    displayCgst +
    displayRoundOff;

  // Backwards-compat alias used by Step 10 (original Finalize PO view)
  const displaySubTotal = displaySupplySubtotal;

  const displayBillNo = currentSavedBoq
    ? currentSavedBoq.bill_no || finalBillNo
    : finalBillNo;
  const displayBillDate = currentSavedBoq
    ? currentSavedBoq.created_at
      ? new Date(currentSavedBoq.created_at).toISOString().slice(0, 10)
      : finalBillDate
    : finalBillDate;

  // Helper: consider a material meaningful if it has name or non-zero qty/rates
  const materialIsMeaningful = (m: any) => {
    if (!m) return false;
    const name = (m.name || "").toString().trim();
    const qty = Number(m.quantity || 0);
    const supply = Number(m.supplyRate ?? m.rate ?? 0);
    const install = Number(m.installRate ?? 0);
    const desc = (m.description || "").toString().trim();
    const loc = (m.location || "").toString().trim();
    return !!name || qty > 0 || supply > 0 || install > 0 || !!desc || !!loc;
  };

  // Prepare visible accumulated products for Step 12 (filter out empty/placeholder materials)
  const visibleAccumulatedProducts = (accumulatedProducts || [])
    .map((p: any) => {
      const mats = (p.materials || []).filter(materialIsMeaningful);
      const supplySubtotal = mats.reduce(
        (s: number, it: any) =>
          s + Number(it.quantity || 0) * Number(it.supplyRate ?? it.rate ?? 0),
        0,
      );
      const installSubtotal = mats.reduce(
        (s: number, it: any) =>
          s + Number(it.quantity || 0) * Number(it.installRate ?? 0),
        0,
      );
      return {
        ...p,
        materials: mats,
        supplySubtotal,
        installSubtotal,
        subtotal: supplySubtotal + installSubtotal,
      };
    })
    .filter((p: any) => (p.materials || []).length > 0);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Door Estimator</h2>
          <p className="text-muted-foreground mt-1">
            Complete the process to generate your Bill of Quantities with
            precise calculations
          </p>
        </div>

        <Card className="border-border/50">
          <CardContent className="pt-8 min-h-96">
            <AnimatePresence mode="wait">
              {/* STEP 1: Select Product */}
              {step === 1 && (
                <motion.div
                  key="step-select-product"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-4"
                >
                  <Label className="text-lg font-semibold">
                    Select Door Product
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Choose a product from your database. After selecting, you’ll
                    pick the available materials.
                  </p>

                  <div className="space-y-3 max-h-72 overflow-y-auto border rounded-lg p-4">
                    {doorProducts.length === 0 ? (
                      <div className="p-4 text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded">
                        <div className="font-medium mb-2">
                          No door products found in DB.
                        </div>
                        <div className="text-xs">
                          Tip: Ensure your products have a category/type/name
                          that includes “Door”.
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        {doorProducts.map((p: any) => {
                          const label = getProductLabel(p);
                          const pid = (p?.id || label).toString();
                          const isActive = selectedDoorProductId === pid;
                          return (
                            <Button
                              key={pid}
                              variant={isActive ? "default" : "outline"}
                              onClick={() => handleSelectDoorProduct(p)}
                              className="justify-start h-auto py-4 text-left"
                            >
                              <div>
                                <div className="font-semibold">
                                  {label || "Unnamed Product"}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {getProductCategory(p)}
                                </div>
                              </div>
                            </Button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* STEP 11: Finalize BOQ (separate from Finalize PO) */}
              {step === 11 && (
                <motion.div
                  key="step-finalize-boq"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-6"
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 16 }}
                  >
                    <img src={ctintLogo} alt="logo" style={{ height: 56 }} />
                    <div style={{ flex: 1, textAlign: "center" }}>
                      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
                        CONCEPT TRUNK INTERIORS
                      </h1>
                      <div style={{ fontSize: 12, color: "#555" }}>
                        BILL OF QUANTITIES (BOQ)
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12 }}>{displayBillDate}</div>
                    </div>
                  </div>

                  <div className="overflow-x-auto border rounded-lg p-2">
                    <table className="min-w-full border-collapse text-sm w-full">
                      <thead>
                        {/* MAIN HEADER */}
                        <tr style={{ background: "#f3f4f6" }}>
                          <th rowSpan={2} className="border px-2 py-2">
                            <Checkbox
                              id="select-all-groups"
                              checked={(() => {
                                const ids = (displayMaterials || []).map(
                                  (m: any) => m.id,
                                );
                                return (
                                  ids.length > 0 &&
                                  ids.every((id) =>
                                    selectedGroupIds.includes(id),
                                  )
                                );
                              })()}
                              onCheckedChange={(v) => {
                                if (v)
                                  setSelectedGroupIds(
                                    (displayMaterials || []).map(
                                      (m: any) => m.id,
                                    ),
                                  );
                                else setSelectedGroupIds([]);
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

                        {/* SUB HEADER */}
                        <tr style={{ background: "#f9fafb" }}>
                          <th className="border px-2 py-1 text-center">
                            Supply
                          </th>
                          <th className="border px-2 py-1 text-center">
                            Installation
                          </th>
                          <th className="border px-2 py-1 text-center">
                            Supply
                          </th>
                          <th className="border px-2 py-1 text-center">
                            Installation
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {(displayMaterials || []).map((m: any, i: number) => {
                          const supplyRate = Number(
                            step11SupplyRates[m.id] ??
                              m.supplyRate ??
                              m.rate ??
                              0,
                          );
                          const installRate = Number(
                            step11InstallRates[m.id] ?? m.installRate ?? 0,
                          );

                          // manual quantity entry
                          let qty = Number(
                            materialQtys[m.id] ?? (m.quantity || 0),
                          );

                          const supplyAmt = qty * supplyRate;
                          const installAmt = qty * installRate;

                          const locVal =
                            materialLocations[m.id] ?? m.location ?? "";
                          const descVal =
                            materialDescriptions[m.id] ?? m.description ?? "";

                          return (
                            <tr key={m.id}>
                              <td className="border px-2 py-1 text-center">
                                <Checkbox
                                  checked={selectedGroupIds.includes(m.id)}
                                  onCheckedChange={() => {
                                    setSelectedGroupIds((prev) =>
                                      prev.includes(m.id)
                                        ? prev.filter((x) => x !== m.id)
                                        : [...prev, m.id],
                                    );
                                  }}
                                />
                              </td>
                              <td className="border px-2 py-1 text-center">
                                {i + 1}
                              </td>

                              <td className="border px-2 py-1">{m.productLabel || m.name}</td>

                              <td className="border px-2 py-1 text-center">
                                <div className="text-sm">
                                  <Input
                                    value={
                                      materialLocations[m.id] ??
                                      m.location ??
                                      ""
                                    }
                                    onChange={(e) =>
                                      setMaterialLocations((prev) => ({
                                        ...prev,
                                        [m.id]: e.target.value,
                                      }))
                                    }
                                    placeholder="Location"
                                    className="w-32 mx-auto"
                                  />
                                </div>
                              </td>

                              <td
                                className="border px-2 py-1"
                                style={{
                                  maxWidth: 650,
                                  wordBreak: "break-word",
                                }}
                              >
                                <div className="text-sm">
                                  <textarea
                                    value={
                                      materialDescriptions[m.id] ??
                                      m.description ??
                                      ""
                                    }
                                    onChange={(e) =>
                                      setMaterialDescriptions((prev) => ({
                                        ...prev,
                                        [m.id]: e.target.value,
                                      }))
                                    }
                                    placeholder="Group description"
                                    className="w-full min-h-20 p-2 rounded border"
                                  />
                                </div>
                              </td>

                              <td className="border px-2 py-1 text-center">
                                <Input
                                  value={materialUnits[m.id] ?? m.unit ?? ""}
                                  onChange={(e) =>
                                    setMaterialUnits((prev) => ({
                                      ...prev,
                                      [m.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="Unit"
                                  className="w-20 mx-auto"
                                />
                              </td>

                              <td className="border px-2 py-1 text-center">
                                <Input
                                  type="number"
                                  value={qty}
                                  onChange={(e) =>
                                    setMaterialQtys((prev) => ({
                                      ...prev,
                                      [m.id]: Number(e.target.value || 0),
                                    }))
                                  }
                                  className="w-20 mx-auto"
                                />
                              </td>

                              {/* RATE */}
                              <td className="border px-2 py-1 text-right">
                                <Input
                                  type="number"
                                  value={supplyRate}
                                  onChange={(e) =>
                                    setStep11SupplyRates((prev) => ({
                                      ...prev,
                                      [m.id]: Number(e.target.value || 0),
                                    }))
                                  }
                                  className="w-28 mx-auto"
                                />
                              </td>
                              <td className="border px-2 py-1 text-right">
                                <Input
                                  type="number"
                                  value={installRate}
                                  onChange={(e) =>
                                    setStep11InstallRates((prev) => ({
                                      ...prev,
                                      [m.id]: Number(e.target.value || 0),
                                    }))
                                  }
                                  className="w-28 mx-auto"
                                />
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
                        <tr style={{ borderTop: "2px solid #000" }}>
                          <td
                            className="border px-2 py-1 text-right"
                            colSpan={10}
                          >
                            <strong>Subtotal</strong>
                          </td>
                          <td className="border px-2 py-1 text-right font-medium">
                            ₹{(displaySupplySubtotal || 0).toFixed(2)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div className="flex justify-end gap-2">
                    {!isCreateBOQMode && (
                      <Button variant="outline" onClick={() => setStep(9)}>
                        Back
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      disabled={selectedGroupIds.length === 0}
                      onClick={async () => {
                        console.log("Delete selected:", selectedGroupIds);

                        // Delete from database if data exists
                        if (dbStep11Items.length > 0 && finalBillNo) {
                          try {
                            // Delete specific items by their database IDs
                            await apiFetch("/api/estimator-step11-groups", {
                              method: "DELETE",
                              headers: {
                                "Content-Type": "application/json",
                              },
                              body: JSON.stringify({
                                ids: selectedGroupIds,
                                estimator: "doors",
                              }),
                            });

                            // Reload data from DB after deletions
                            const reloadRes = await apiFetch(
                              `/api/estimator-step11-groups?session_id=${finalBillNo}&estimator=doors`,
                              {
                                headers: {},
                              },
                            );
                            if (reloadRes.ok) {
                              const data = await reloadRes.json();
                              setDbStep11Items(data.items || []);
                            }

                            toast({
                              title: "Success",
                              description:
                                "Step 11 data deleted from database!",
                            });
                          } catch (e) {
                            console.warn("Failed to delete step 11 from DB", e);
                            toast({
                              title: "Error",
                              description:
                                "Failed to delete Step 11 data from database.",
                              variant: "destructive",
                            });
                          }
                        }

                        if (accumulatedProducts.length === 0) {
                          if (currentSavedBoq) {
                            // Delete from saved BOQ
                            console.log("Deleting from saved BOQ");
                            const keysToDelete = selectedGroupIds.map((gid) =>
                              gid.replace("group_", ""),
                            );
                            const currentMaterials = Array.isArray(
                              currentSavedBoq.materials,
                            )
                              ? currentSavedBoq.materials
                              : JSON.parse(currentSavedBoq.materials || "[]");
                            console.log(
                              "Current materials:",
                              currentMaterials.length,
                            );
                            const filteredMaterials = currentMaterials.filter(
                              (m: any) => {
                                const dt =
                                  m.doorType ||
                                  m.door_type ||
                                  savedStep9Meta?.doorType ||
                                  savedStep9Meta?.door_type ||
                                  doorType ||
                                  "door";
                                const pt =
                                  m.panelType ||
                                  m.panel_type ||
                                  savedStep9Meta?.panelType ||
                                  savedStep9Meta?.panel_type ||
                                  panelType ||
                                  "";
                                const so =
                                  m.subOption ||
                                  m.sub_option ||
                                  savedStep9Meta?.subOption ||
                                  savedStep9Meta?.sub_option ||
                                  subOption ||
                                  "";
                                const key = `${dt}||${pt}||${so}`;
                                const match = keysToDelete.includes(key);
                                console.log(
                                  "Checking material:",
                                  m.id || m.name,
                                  key,
                                  "match:",
                                  match,
                                );
                                return !match;
                              },
                            );
                            console.log(
                              "Filtered materials:",
                              filteredMaterials.length,
                            );
                            const updatedBoq = {
                              ...currentSavedBoq,
                              materials: filteredMaterials,
                            };
                            setCurrentSavedBoq(updatedBoq);
                            // Persist to DB
                            apiFetch("/api/boq", {
                              method: "POST",
                              headers: {
                                "Content-Type": "application/json",
                              },
                              body: JSON.stringify(updatedBoq),
                            })
                              .then(() => console.log("Saved updated BOQ"))
                              .catch((e) =>
                                console.error("Error saving BOQ:", e),
                              );
                          } else {
                            // Delete from Step 11 saved materials (direct flow)
                            console.log(
                              "Deleting from Step 11 saved materials",
                            );
                            const keysToDelete = selectedGroupIds.map((gid) =>
                              gid.replace("group_", ""),
                            );
                            const baseMaterials =
                              savedStep9Materials &&
                              savedStep9Materials.length > 0
                                ? savedStep9Materials
                                : materials;
                            const filteredMaterials = (
                              baseMaterials || []
                            ).filter((m: any) => {
                              const dt =
                                m.doorType ||
                                m.door_type ||
                                savedStep9Meta?.doorType ||
                                savedStep9Meta?.door_type ||
                                doorType ||
                                "door";
                              const pt =
                                m.panelType ||
                                m.panel_type ||
                                savedStep9Meta?.panelType ||
                                savedStep9Meta?.panel_type ||
                                panelType ||
                                "";
                              const so =
                                m.subOption ||
                                m.sub_option ||
                                savedStep9Meta?.subOption ||
                                savedStep9Meta?.sub_option ||
                                subOption ||
                                "";
                              const key = `${dt}||${pt}||${so}`;
                              return !keysToDelete.includes(key);
                            });
                            setSavedStep9Materials(filteredMaterials);
                            // Removed browser storage save
                            // browser storage.setItem('doors_saved_step9', JSON.stringify(filteredMaterials));
                          }
                        } else if (accumulatedProducts.length > 0) {
                          // Delete from accumulated products
                          console.log("Deleting from accumulated products");
                          console.log(
                            "Accumulated products before:",
                            accumulatedProducts.length,
                          );
                          let filtered;
                          if (
                            selectedGroupIds.some((id) =>
                              id.startsWith("accumulated_"),
                            )
                          ) {
                            // Delete by index when showing accumulated products
                            const indicesToDelete = selectedGroupIds
                              .filter((id) => id.startsWith("accumulated_"))
                              .map((id) =>
                                parseInt(id.replace("accumulated_", "")),
                              )
                              .sort((a, b) => b - a); // Sort descending to delete from end
                            filtered = [...accumulatedProducts];
                            indicesToDelete.forEach((idx) => {
                              if (idx >= 0 && idx < filtered.length) {
                                filtered.splice(idx, 1);
                              }
                            });
                          } else {
                            // Delete by key when showing grouped materials
                            const keysToDelete = selectedGroupIds.map((gid) =>
                              gid.replace("group_", ""),
                            );
                            filtered = accumulatedProducts.filter((p) => {
                              const pKey = `${p.doorType || "door"}||${p.panelType || ""}||${p.subOption || ""}`;
                              const match = keysToDelete.includes(pKey);
                              console.log(
                                "Checking product:",
                                p.id,
                                pKey,
                                "match:",
                                match,
                              );
                              return !match;
                            });
                          }
                          console.log(
                            "Accumulated products after:",
                            filtered.length,
                          );
                          setAccumulatedProducts(filtered);
                          apiFetch("/api/accumulated-products/doors", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({ data: filtered }),
                          }).catch((e) =>
                            console.error(
                              "Failed to save accumulated products after delete",
                              e,
                            ),
                          );
                        }
                        setSelectedGroupIds([]);
                      }}
                    >
                      Delete Selected
                    </Button>
                    <Button onClick={handleAddProductToAccumulated}>
                      Add Product
                    </Button>
                    <Button
                      onClick={handleSaveAccumulatedBOQ}
                      disabled={savingStep11}
                    >
                      Save
                    </Button>
                    <Button
                      onClick={async () => {
                        setQaSelectedIds(selectedGroupIds);

                        // Get current materials to save
                        const currentItems = (qaMaterials || []).map(
                          (m: any, i: number) => {
                            const supplyRate = Number(
                              step11SupplyRates[m.id] ??
                                m.supplyRate ??
                                m.rate ??
                                0,
                            );
                            const installRate = Number(
                              step11InstallRates[m.id] ?? m.installRate ?? 0,
                            );
                            let qty = Number(
                              materialQtys[m.id] ?? (m.quantity || 0),
                            );

                            return {
                              s_no: i + 1,
                              item: m.name,
                              location:
                                materialLocations[m.id] ?? m.location ?? "",
                              description:
                                materialDescriptions[m.id] ??
                                m.description ??
                                "",
                              unit: materialUnits[m.id] ?? m.unit ?? "",
                              qty: qty,
                              supply_rate: supplyRate,
                              install_rate: installRate,
                              supply_amount: qty * supplyRate,
                              install_amount: qty * installRate,
                            };
                          },
                        );

                        try {
                          // Get already saved items from DB
                          const existingResponse = await apiFetch(
                            `/api/estimator-step12-qa-selection?session_id=${finalBillNo}&estimator=doors`,
                            {
                              headers: {},
                            },
                          );

                          let existingItems = [];
                          if (existingResponse.ok) {
                            const existingData = await existingResponse.json();
                            existingItems = existingData.items || [];
                          }

                          // Find new items that aren't already saved
                          // Use item name + description + unit as unique identifier
                          const newItems = currentItems.filter(
                            (currentItem) => {
                              return !existingItems.some(
                                (existingItem: any) =>
                                  existingItem.item === currentItem.item &&
                                  existingItem.description ===
                                    currentItem.description &&
                                  existingItem.unit === currentItem.unit,
                              );
                            },
                          );

                          if (newItems.length === 0) {
                            // All materials are already saved, just proceed to Step 12
                            setStep(12);
                            return;
                          }

                          // Save only the new items
                          await apiFetch("/api/estimator-step12-qa-selection", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              estimator: "doors",
                              session_id: finalBillNo,
                              items: newItems,
                            }),
                          });

                          // Reload data from DB
                          const response = await apiFetch(
                            `/api/estimator-step12-qa-selection?session_id=${finalBillNo}&estimator=doors`,
                            {
                              headers: {},
                            },
                          );
                          const data = await response.json();
                          setDbStep12Items(data.items || []);

                          toast({
                            title: "Success",
                            description: `${newItems.length} new material(s) saved successfully to database!`,
                          });

                          setStep(12);
                        } catch (e) {
                          console.warn("Failed to save step 12 to DB", e);
                          toast({
                            title: "Error",
                            description:
                              "Failed to save Step 12 data. Please try again.",
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      Create BOQ
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* STEP 4: Sub Option */}
              {step === 4 && doorType && (
                <motion.div
                  key="step-suboption"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-4"
                >
                  <Label className="text-lg font-semibold">
                    Select Sub Option:
                  </Label>
                  <div className="flex flex-col gap-2">
                    {(DOOR_SUB_OPTIONS_LOCAL[doorType] || []).map((opt) => (
                      <Button
                        key={opt}
                        onClick={() => {
                          setSubOption(opt);
                          setVisionPanel(null);
                        }}
                        className={`w-full text-black ${subOption === opt ? "bg-cyan-500" : "bg-white"}`}
                      >
                        {opt}
                      </Button>
                    ))}
                  </div>

                  {doorType === "flush" && (
                    <div className="mt-4">
                      <p className="font-semibold text-white mb-2">
                        Vision Panel Type:
                      </p>
                      <div className="flex flex-col gap-2">
                        {VISION_PANEL_OPTIONS_LOCAL.map((opt) => (
                          <Button
                            key={opt}
                            onClick={() => setVisionPanel(opt)}
                            className={`w-full text-black ${visionPanel === opt ? "bg-cyan-500" : "bg-white"}`}
                          >
                            {opt}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between gap-2 pt-6">
                    <Button variant="outline" onClick={() => setStep(3)}>
                      <ChevronLeft className="mr-2 h-4 w-4" /> Back
                    </Button>
                    <Button
                      onClick={() => setStep(5)}
                      disabled={
                        !subOption ||
                        (doorType === "flush" &&
                          subOption === "With Vision Panel" &&
                          !visionPanel)
                      }
                    >
                      Next <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* STEP 5: Dimensions */}
              {step === 5 && (
                <motion.div
                  key="step4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-4"
                >
                  <Label className="text-lg font-semibold">
                    Door Dimensions (in feet)
                  </Label>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="count">Count</Label>
                      <Input
                        id="count"
                        type="number"
                        placeholder="1"
                        value={count || ""}
                        onChange={(e) =>
                          setCount(
                            e.target.value ? parseFloat(e.target.value) : null,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="height">Height</Label>
                      <Input
                        id="height"
                        type="number"
                        placeholder="7"
                        value={height || ""}
                        onChange={(e) =>
                          setHeight(
                            e.target.value ? parseFloat(e.target.value) : null,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="width">Width</Label>
                      <Input
                        id="width"
                        type="number"
                        placeholder="3"
                        value={width || ""}
                        onChange={(e) =>
                          setWidth(
                            e.target.value ? parseFloat(e.target.value) : null,
                          )
                        }
                      />
                    </div>
                  </div>

                  {getCurrentDoorConfig()?.requiresGlazing && (
                    <div className="mt-6 pt-4 border-t">
                      <Label className="text-lg font-semibold block mb-4">
                        Glass Dimensions (in inches)
                      </Label>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="glassHeight">Glass Height</Label>
                          <Input
                            id="glassHeight"
                            type="number"
                            placeholder="72"
                            value={glassHeight || ""}
                            onChange={(e) =>
                              setGlassHeight(
                                e.target.value
                                  ? parseFloat(e.target.value)
                                  : null,
                              )
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="glassWidth">Glass Width</Label>
                          <Input
                            id="glassWidth"
                            type="number"
                            placeholder="24"
                            value={glassWidth || ""}
                            onChange={(e) =>
                              setGlassWidth(
                                e.target.value
                                  ? parseFloat(e.target.value)
                                  : null,
                              )
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between gap-2 pt-6">
                    <Button
                      variant="outline"
                      onClick={() =>
                        setStep(getCurrentDoorConfig()?.requiresGlazing ? 4 : 3)
                      }
                    >
                      <ChevronLeft className="mr-2 h-4 w-4" /> Back
                    </Button>
                    <Button
                      disabled={
                        !count ||
                        !height ||
                        !width ||
                        (getCurrentDoorConfig()?.requiresGlazing &&
                          (!glassHeight || !glassWidth))
                      }
                      onClick={() => setStep(6)}
                    >
                      Next <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* STEP 6: Material Selection */}
              {step === 6 && (
                <motion.div
                  key="step5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-4"
                >
                  <Label className="text-lg font-semibold">
                    Select Materials & Shops
                  </Label>
                  <p className="text-sm text-muted-foreground mb-4">
                    Available materials for {getCurrentDoorConfig()?.label}.
                    Best price shop is pre-selected.
                  </p>

                  <div className="flex items-center gap-2 mb-4">
                    <Checkbox
                      id="select-all-materials"
                      checked={
                        selectedMaterials.length ===
                          availableMaterials.length &&
                        availableMaterials.length > 0
                      }
                      onCheckedChange={(checked) => {
                        if (checked) {
                          // Select all
                          const allSelections = availableMaterials.map(
                            (mat) => {
                              const variants = storeMaterials
                                .filter(
                                  (m) =>
                                    normText(m.product) ===
                                      normText(mat.product) &&
                                    normText(m.name) === normText(mat.name),
                                )
                                .map((m) => ({
                                  id: m.id,
                                  brand: getBrandOfMaterial(m),
                                  shopId: m.shopId,
                                  rate: m.rate,
                                  unit: m.unit,
                                  shopName:
                                    storeShops.find((s) => s.id === m.shopId)
                                      ?.name || "Unknown",
                                }));
                              const availableBrands = Array.from(
                                new Set(variants.map((v) => v.brand)),
                              ).sort();
                              const selectedBrand =
                                availableBrands[0] || "Generic";
                              const brandShops = variants
                                .filter((v) => v.brand === selectedBrand)
                                .sort((a, b) => (a.rate || 0) - (b.rate || 0));
                              return {
                                materialId: mat.id,
                                selectedBrand,
                                selectedShopId: brandShops[0]?.shopId || "",
                              };
                            },
                          );
                          setSelectedMaterials(allSelections);
                        } else {
                          // Deselect all
                          setSelectedMaterials([]);
                        }
                      }}
                    />
                    <Label htmlFor="select-all-materials">Select All</Label>
                  </div>

                  <div className="space-y-3 max-h-64 overflow-y-auto border rounded-lg p-4">
                    {availableMaterials.length === 0 ? (
                      <div className="p-4 text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded">
                        <div className="font-medium mb-2">
                          No materials found for this door type.
                        </div>
                        <div>
                          Door:{" "}
                          {doorType || selectedDoorProductLabel || "(not set)"}
                        </div>
                        <div>
                          Searching for keywords:{" "}
                          <strong>
                            {(doorType
                              ? doorKeywordsByType[doorType] || [doorType]
                              : [selectedDoorProductLabel || ""]
                            ).join(", ")}
                          </strong>
                        </div>
                        <div>
                          Total materials in store: {storeMaterials.length}
                        </div>
                        <div className="mt-2">
                          Available products in DB:{" "}
                          {Array.from(
                            new Set(
                              storeMaterials
                                .map((m) => m.product)
                                .filter(Boolean),
                            ),
                          )
                            .sort()
                            .join(", ")}
                        </div>
                        <div className="mt-2 text-xs">
                          <div className="font-medium mb-1">
                            Tip: Check that your materials have the correct{" "}
                            <code>product</code> field in the database.
                          </div>
                          <div>
                            Example for Flush Door: "Flush door", "Flush Door",
                            "BWR", etc.
                          </div>
                        </div>
                      </div>
                    ) : (
                      availableMaterials.map((mat) => {
                        const isSelected = selectedMaterials.some(
                          (m) => m.materialId === mat.id,
                        );
                        const currentSelection = selectedMaterials.find(
                          (m) => m.materialId === mat.id,
                        );

                        // ✅ NEW: all variants for this product+material (brands + shops)
                        const variants = storeMaterials
                          .filter(
                            (m) =>
                              normText(m.product) === normText(mat.product) &&
                              normText(m.name) === normText(mat.name),
                          )
                          .map((m) => ({
                            id: m.id,
                            brand: getBrandOfMaterial(m),
                            shopId: m.shopId,
                            rate: m.rate,
                            unit: m.unit,
                            shopName:
                              storeShops.find((s) => s.id === m.shopId)?.name ||
                              "Unknown",
                          }));

                        const availableBrands = Array.from(
                          new Set(variants.map((v) => v.brand)),
                        ).sort();

                        // current selection (if selected)
                        const selected = selectedMaterials.find(
                          (x) => x.materialId === mat.id,
                        );
                        const selectedBrand =
                          selected?.selectedBrand ||
                          availableBrands[0] ||
                          "Generic";

                        // shops for chosen brand
                        const brandShops = variants
                          .filter((v) => v.brand === selectedBrand)
                          .sort((a, b) => (a.rate || 0) - (b.rate || 0));

                        return (
                          <div
                            key={mat.id}
                            className="border rounded-lg p-3 hover:bg-muted/50 transition"
                          >
                            <div className="flex items-start gap-3">
                              <Checkbox
                                id={mat.id}
                                checked={isSelected}
                                onCheckedChange={() =>
                                  handleToggleMaterial(mat.id)
                                }
                              />
                              <div className="flex-1">
                                <label
                                  htmlFor={mat.id}
                                  className="font-medium cursor-pointer"
                                >
                                  {mat.name}
                                </label>
                                <p className="text-xs text-muted-foreground">
                                  {mat.code}
                                </p>

                                {isSelected && availableBrands.length > 0 && (
                                  <div className="mt-3 space-y-2">
                                    <Label className="text-xs">
                                      Select Brand:
                                    </Label>
                                    <Select
                                      value={selectedBrand}
                                      onValueChange={(newBrand) =>
                                        handleChangeBrand(mat.id, newBrand)
                                      }
                                    >
                                      <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {availableBrands.map((b) => (
                                          <SelectItem key={b} value={b}>
                                            {b}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                                {isSelected && brandShops.length > 0 && (
                                  <div className="mt-3 space-y-2">
                                    <Label className="text-xs">
                                      Select Shop:
                                    </Label>
                                    <Select
                                      value={
                                        currentSelection?.selectedShopId ||
                                        brandShops[0].shopId
                                      }
                                      onValueChange={(newShopId) =>
                                        handleChangeShop(mat.id, newShopId)
                                      }
                                    >
                                      <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {brandShops.map((shop) => (
                                          <SelectItem
                                            key={shop.shopId}
                                            value={shop.shopId || ""}
                                          >
                                            {shop.shopName} - ₹{shop.rate}/
                                            {mat.unit}
                                            {shop.rate === brandShops[0].rate &&
                                              " (Best)"}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
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

              {/* STEP 7: Required Materials Check */}
              {/* STEP 7: Required Materials Check */}
              {step === 7 && (
                <motion.div
                  key="step6-selected"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-4"
                >
                  <Label className="text-lg font-semibold">
                    Selected Materials
                  </Label>
                  <p className="text-sm text-muted-foreground mb-4">
                    Edit quantities or rates before generating BOQ.
                  </p>

                  <div className="space-y-2">
                    {getMaterialsWithDetails().length > 0 ? (
                      <>
                        <div className="grid grid-cols-8 gap-2 p-2 text-sm text-muted-foreground">
                          <div className="col-span-2 font-medium">Item</div>
                          <div className="text-center">Brand</div>
                          <div className="text-center">Qty</div>
                          <div className="text-center">Unit</div>
                          <div className="text-center">Shop</div>
                          <div className="text-center">Rate (₹)</div>
                          <div className="text-right">Amount (₹)</div>
                        </div>
                        {getMaterialsWithDetails().map((mat) => {
                          const selection = selectedMaterials.find(
                            (s) => s.materialId === mat.id,
                          );
                          const material = storeMaterials.find(
                            (m) => m.id === mat.id,
                          );
                          return (
                            <div
                              key={mat.id}
                              className={cn(
                                "p-3 border rounded grid grid-cols-8 items-center",
                              )}
                            >
                              <span className="col-span-2 font-medium">
                                {mat.name}
                              </span>
                              <div className="col-span-1 text-center font-semibold">
                                {selection?.selectedBrand ||
                                  material?.brandName ||
                                  "-"}
                              </div>
                              <div className="col-span-1 text-center">
                                <Input
                                  type="number"
                                  value={
                                    editableMaterials[mat.id]?.quantity ??
                                    mat.quantity
                                  }
                                  onChange={(e) =>
                                    setEditableQuantity(
                                      mat.id,
                                      parseInt(e.target.value || "0", 10),
                                    )
                                  }
                                  className="w-20 mx-auto"
                                />
                              </div>
                              <span className="col-span-1 text-center text-muted-foreground">
                                {mat.unit}
                              </span>
                              <div className="col-span-1 text-center font-semibold">
                                {mat.shopName || "-"}
                              </div>
                              <div className="col-span-1 text-center">
                                <Input
                                  type="number"
                                  value={
                                    editableMaterials[mat.id]?.supplyRate ??
                                    mat.rate
                                  }
                                  onChange={(e) =>
                                    setEditableRate(
                                      mat.id,
                                      parseFloat(e.target.value || "0"),
                                    )
                                  }
                                  className="w-20 mx-auto"
                                />
                              </div>
                              <div className="col-span-1 text-right font-semibold">
                                ₹
                                {(
                                  (editableMaterials[mat.id]?.quantity ??
                                    mat.quantity) *
                                  ((editableMaterials[mat.id]?.supplyRate ??
                                    mat.rate) +
                                    (editableMaterials[mat.id]?.installRate ??
                                      0))
                                ).toFixed(2)}
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
                      disabled={getMaterialsWithDetails().length === 0}
                    >
                      Next: Generate BOM{" "}
                      <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* STEP 7: BOQ Review */}
              {/* STEP 7: Final BOQ */}
              {step === 8 && (
                <motion.div
                  key="step7"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-6"
                >
                  {/* Header */}
                  <div className="text-center space-y-2">
                    <div
                      style={{
                        width: "64px",
                        height: "64px",
                        backgroundColor: "rgba(34,197,94,0.1)", // Safe green background
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        margin: "0 auto",
                        color: "#22c55e", // Tailwind green-500
                      }}
                    >
                      <CheckCircle2 style={{ width: "32px", height: "32px" }} />
                    </div>
                    <h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                      Bill of Materials (BOM)
                    </h2>
                    <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                      Generated on {new Date().toLocaleDateString()}
                    </p>
                  </div>

                  {/* BOQ CONTENT (PDF TARGET) */}
                  <div
                    id="boq-pdf"
                    style={{
                      backgroundColor: "#ffffff", // white background
                      color: "#000000", // black text
                      fontFamily: "Arial, sans-serif",
                      padding: "16px",
                    }}
                  >
                    {/* Project / Door Details */}
                    <div
                      style={{
                        border: "1px solid #d1d5db",
                        borderRadius: "8px",
                        marginBottom: "16px",
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(2, 1fr)",
                          gap: "16px",
                          padding: "16px",
                          fontSize: "0.875rem",
                        }}
                      >
                        <div>
                          <p style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                            PRODUCT TYPE
                          </p>
                          <p style={{ fontWeight: 600 }}>
                            {getProductTypeOnly() || "Door"}
                          </p>
                        </div>
                        <div>
                          <p style={{ fontSize: "0.75rem", color: "#6b7280" }}>
                            DIMENSIONS
                          </p>
                          <p style={{ fontWeight: 600 }}>
                            {height} ft × {width} ft (Qty: {count})
                          </p>
                        </div>
                        {glazingType && (
                          <div>
                            <p
                              style={{ fontSize: "0.75rem", color: "#6b7280" }}
                            >
                              GLAZING
                            </p>
                            <p
                              style={{
                                fontWeight: 600,
                                textTransform: "capitalize",
                              }}
                            >
                              {glazingType}
                            </p>
                          </div>
                        )}
                        {getCurrentDoorConfig()?.requiresGlazing && (
                          <div>
                            <p
                              style={{ fontSize: "0.75rem", color: "#6b7280" }}
                            >
                              GLASS SIZE
                            </p>
                            <p style={{ fontWeight: 600 }}>
                              {glassHeight}" × {glassWidth}"
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Materials Table */}
                    <div
                      style={{
                        border: "1px solid #d1d5db",
                        borderRadius: "8px",
                        marginBottom: "16px",
                        overflow: "hidden",
                      }}
                    >
                      <div style={{ padding: "16px" }}>
                        <h3 style={{ fontWeight: 600, marginBottom: "8px" }}>
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
                                    padding: "8px",
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
                            {getMaterialsWithDetails().map((mat, index) => (
                              <tr key={mat.id}>
                                <td
                                  style={{
                                    border: "1px solid #d1d5db",
                                    padding: "8px",
                                  }}
                                >
                                  {index + 1}
                                </td>
                                <td
                                  style={{
                                    border: "1px solid #d1d5db",
                                    padding: "8px",
                                    fontWeight: 500,
                                  }}
                                >
                                  {mat.name}
                                </td>
                                <td
                                  style={{
                                    border: "1px solid #d1d5db",
                                    padding: "8px",
                                    textAlign: "center",
                                  }}
                                >
                                  {mat.unit}
                                </td>
                                <td
                                  style={{
                                    border: "1px solid #d1d5db",
                                    padding: "8px",
                                    textAlign: "center",
                                  }}
                                >
                                  {mat.quantity}
                                </td>
                                <td
                                  style={{
                                    border: "1px solid #d1d5db",
                                    padding: "8px",
                                    textAlign: "right",
                                  }}
                                >
                                  {mat.rate}
                                </td>
                                <td
                                  style={{
                                    border: "1px solid #d1d5db",
                                    padding: "8px",
                                  }}
                                >
                                  {mat.shopName}
                                </td>
                                <td
                                  style={{
                                    border: "1px solid #d1d5db",
                                    padding: "8px",
                                    textAlign: "right",
                                    fontWeight: 600,
                                  }}
                                >
                                  {(mat.quantity * mat.rate).toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Total Summary */}
                    <div
                      style={{
                        border: "1px solid #d1d5db",
                        borderRadius: "8px",
                        padding: "16px",
                        display: "flex",
                        justifyContent: "space-between",
                        backgroundColor: "#eff6ff",
                      }}
                    >
                      <div>
                        <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                          Total Materials
                        </p>
                        <p style={{ fontWeight: 600 }}>
                          {selectedMaterials.length}
                        </p>
                      </div>

                      <div>
                        <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                          Total Quantity
                        </p>
                        <p style={{ fontWeight: 600 }}>
                          {getMaterialsWithDetails().reduce(
                            (s, m) => s + m.quantity,
                            0,
                          )}
                        </p>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>
                          Grand Total
                        </p>
                        <p
                          style={{
                            fontSize: "1.5rem",
                            fontWeight: 700,
                            color: "#1d4ed8",
                          }}
                        >
                          ₹{calculateTotalCost().toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* ACTION BUTTONS */}
                  {/* ACTION BUTTONS */}
                  <div className="flex flex-wrap gap-4 justify-end pt-4">
                    <Button onClick={() => setStep(7)} variant="outline">
                      Back
                    </Button>
                    {/* Export Excel */}
                    <button
                      onClick={handleExportBOQ}
                      className="flex items-center gap-2 bg-green-500 text-white font-semibold px-4 py-2 rounded-lg shadow hover:bg-green-600 transition"
                    >
                      <Download className="w-5 h-5" />
                      Export Excel
                    </button>

                    {/* Export PDF */}
                    <button
                      onClick={handleExportPDF}
                      className="flex items-center gap-2 bg-blue-500 text-white font-semibold px-4 py-2 rounded-lg shadow hover:bg-blue-600 transition"
                    >
                      <Download className="w-5 h-5 rotate-12" />
                      Export PDF
                    </button>

                    {/* Finalize BOQ (open final template for manual fields + export) */}
                    <Button
                      onClick={() => addToCartAndOpenStep9()}
                      disabled={getMaterialsWithDetails().length === 0}
                    >
                      Add to BOM <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>

                    {/* New Estimate */}
                    <button
                      onClick={() => {
                        setStep(1);
                        setSelectedDoorProductId("");
                        setSelectedDoorProductLabel("");
                        setPanelType(null);
                        setDoorType(null);
                        setGlazingType(null);
                        setCount(1);
                        setHeight(7);
                        setWidth(3);
                        setGlassHeight(6);
                        setGlassWidth(2);
                        setSelectedMaterials([]);
                      }}
                      className="flex items-center gap-2 bg-gray-200 text-gray-800 font-semibold px-4 py-2 rounded-lg shadow hover:bg-gray-300 transition"
                    >
                      <ChevronLeft className="w-5 h-5" />
                      New Estimate
                    </button>
                  </div>
                </motion.div>
              )}

              {/* STEP 12: QA BOQ - List all accumulated products */}
              {step === 12 && (
                <motion.div
                  key="step-qa-boq"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-6"
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 16 }}
                  >
                    <img src={ctintLogo} alt="logo" style={{ height: 56 }} />
                    <div style={{ flex: 1, textAlign: "center" }}>
                      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
                        CONCEPT TRUNK INTERIORS
                      </h1>
                      <div style={{ fontSize: 12, color: "#555" }}>
                        QA BILL OF QUANTITIES (BOQ)
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12 }}>{displayBillDate}</div>
                    </div>
                  </div>

                  {!qaMaterials || qaMaterials.length === 0 ? (
                    <div className="text-center py-8">
                      <p>
                        No finalized BOQ lines found. Complete Step 11 first.
                      </p>
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
                            <th className="border px-2 py-1 text-center">
                              Supply
                            </th>
                            <th className="border px-2 py-1 text-center">
                              Installation
                            </th>
                            <th className="border px-2 py-1 text-center">
                              Supply
                            </th>
                            <th className="border px-2 py-1 text-center">
                              Installation
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {(qaMaterials || []).map((m: any, i: number) => {
                            const supplyRate = Number(
                              step11SupplyRates[m.id] ??
                                m.supplyRate ??
                                m.rate ??
                                0,
                            );
                            const installRate = Number(
                              step11InstallRates[m.id] ?? m.installRate ?? 0,
                            );
                            let qty = Number(
                              materialQtys[m.id] ?? (m.quantity || 0),
                            );
                            const supplyAmt = qty * supplyRate;
                            const installAmt = qty * installRate;
                            const locVal =
                              materialLocations[m.id] ?? m.location ?? "";
                            const descVal =
                              materialDescriptions[m.id] ?? m.description ?? "";
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
                                  style={{
                                    maxWidth: 650,
                                    wordBreak: "break-word",
                                  }}
                                >
                                  <div className="text-sm whitespace-pre-wrap">
                                    {descVal || "—"}
                                  </div>
                                </td>
                                <td className="border px-2 py-1 text-center">
                                  {materialUnits[m.id] ?? m.unit}
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
                            <td
                              className="border px-2 py-1 text-right"
                              colSpan={9}
                            >
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

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setStep(11)}>
                      Back
                    </Button>
                    <Button
                      onClick={async () => {
                        // Check if data already exists
                        if (dbStep12Items.length > 0) {
                          toast({
                            title: "Data Already Exists",
                            description:
                              "Step 12 data is already saved. Use update if needed.",
                            variant: "destructive",
                          });
                          return;
                        }

                        // Save Step 12 data to database
                        try {
                          // Save Step 12 data to database (only new items; avoid duplicates)
                          const existingResponse = await apiFetch(
                            `/api/estimator-step12-qa-selection?session_id=${finalBillNo}&estimator=doors`,
                            {
                              headers: {},
                            },
                          );

                          let existingItems: any[] = [];
                          if (existingResponse.ok) {
                            const existingData = await existingResponse.json();
                            existingItems = existingData.items || [];
                          }

                          const currentItems = (qaMaterials || []).map(
                            (m: any, i: number) => {
                              const supplyRate = Number(
                                step11SupplyRates[m.id] ??
                                  m.supplyRate ??
                                  m.rate ??
                                  0,
                              );
                              const installRate = Number(
                                step11InstallRates[m.id] ?? m.installRate ?? 0,
                              );
                              const qty = Number(
                                materialQtys[m.id] ?? (m.quantity || 0),
                              );

                              return {
                                s_no: i + 1,
                                item: m.name,
                                location:
                                  materialLocations[m.id] ?? m.location ?? "",
                                description:
                                  materialDescriptions[m.id] ??
                                  m.description ??
                                  "",
                                unit: materialUnits[m.id] ?? m.unit ?? "",
                                qty: qty,
                                supply_rate: supplyRate,
                                install_rate: installRate,
                                supply_amount: qty * supplyRate,
                                install_amount: qty * installRate,
                              };
                            },
                          );

                          // Use item name + description + unit as unique identifier
                          const newItems = currentItems.filter(
                            (currentItem) => {
                              return !existingItems.some(
                                (existingItem: any) =>
                                  existingItem.item === currentItem.item &&
                                  existingItem.description ===
                                    currentItem.description &&
                                  existingItem.unit === currentItem.unit,
                              );
                            },
                          );

                          if (newItems.length === 0) {
                            toast({
                              title: "No New Items",
                              description:
                                "Step 12 data is already saved. No new items to save.",
                              variant: "destructive",
                            });
                            return;
                          }

                          await apiFetch("/api/estimator-step12-qa-selection", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              estimator: "doors",
                              session_id: finalBillNo,
                              items: newItems,
                            }),
                          });

                          // Reload data from DB
                          const response = await apiFetch(
                            `/api/estimator-step12-qa-selection?session_id=${finalBillNo}&estimator=doors`,
                            {
                              headers: {},
                            },
                          );
                          const data = await response.json();
                          setDbStep12Items(data.items || []);

                          toast({
                            title: "Success",
                            description:
                              "Step 12 QA data saved successfully to database!",
                          });
                        } catch (e) {
                          console.warn("Failed to save step 12 to DB", e);
                          toast({
                            title: "Error",
                            description:
                              "Failed to save Step 12 data. Please try again.",
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      Save Step 12
                    </Button>
                    <Button onClick={() => setStep(1)}>
                      Add More Products
                    </Button>
                    <Button onClick={handleExportExcelStep11}>
                      Export Excel
                    </Button>
                  </div>
                </motion.div>
              )}

              {step === 10 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-6"
                >
                  {/* ================= MANUAL INPUTS ================= */}
                  <div className="grid grid-cols-3 gap-4">
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
                      <Input
                        type="date"
                        value={finalDueDate}
                        onChange={(e) => setFinalDueDate(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Customer Name</Label>
                      <Input
                        value={finalCustomerName}
                        onChange={(e) => setFinalCustomerName(e.target.value)}
                      />
                    </div>

                    <div>
                      <Label>Customer Address</Label>
                      <Input
                        value={finalCustomerAddress}
                        onChange={(e) =>
                          setFinalCustomerAddress(e.target.value)
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Terms & Conditions</Label>
                    <Input
                      value={finalTerms}
                      onChange={(e) => setFinalTerms(e.target.value)}
                    />
                  </div>

                  {/* MATERIAL DESCRIPTION INPUT */}
                  <div className="space-y-4 border p-4 rounded-md bg-slate-50">
                    <Label className="font-semibold">
                      Material Description Entry
                    </Label>
                    <select
                      className="w-full border rounded px-3 py-2"
                      value={selectedMaterialId}
                      onChange={(e) => setSelectedMaterialId(e.target.value)}
                    >
                      <option value="">Select Material</option>
                      {getMaterialsWithDetails().map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    {selectedMaterialId && (
                      <Input
                        placeholder="Enter description for selected material"
                        value={materialDescriptions[selectedMaterialId] || ""}
                        onChange={(e) =>
                          setMaterialDescriptions((prev) => ({
                            ...prev,
                            [selectedMaterialId]: e.target.value,
                          }))
                        }
                      />
                    )}
                  </div>

                  {/* ================= PDF */}
                  <div
                    id="boq-final-pdf"
                    style={{
                      width: "210mm",
                      minHeight: "297mm",
                      padding: "20mm",
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
                        alignItems: "flex-start",
                      }}
                    >
                      <img
                        src={ctintLogo}
                        alt="Concept Trunk Interiors"
                        style={{ height: 60 }}
                      />
                      <div style={{ textAlign: "right" }}>
                        <h2 style={{ margin: 0 }}>BILL</h2>
                        <div>Bill No: {finalBillNo}</div>
                      </div>
                    </div>

                    <hr style={{ margin: "10px 0" }} />

                    {/* COMPANY + META */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginTop: 10,
                      }}
                    >
                      {/* LEFT */}
                      <div style={{ width: "55%", lineHeight: 1.5 }}>
                        <strong>Concept Trunk Interiors</strong>
                        <br />
                        12/36A, Indira Nagar
                        <br />
                        Medavakkam
                        <br />
                        Chennai – 600100
                        <br />
                        GSTIN: 33ASOPS5560M1Z1
                        <br />
                        <br />
                        <strong>Bill From</strong>
                        <br />
                        <pre
                          style={{
                            margin: 0,
                            fontFamily: "Arial",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {finalShopDetails}
                        </pre>
                      </div>

                      {/* RIGHT */}
                      <div style={{ width: "40%", lineHeight: 1.6 }}>
                        <div>
                          <strong>Bill Date</strong> : {finalBillDate}
                        </div>
                        <div>
                          <strong>Due Date</strong> : {finalDueDate}
                        </div>
                        <div style={{ marginTop: 6 }}>
                          <strong>Terms</strong> : {finalTerms}
                        </div>
                        <div style={{ marginTop: 6 }}>
                          <strong>Customer Name</strong> : {finalCustomerName}
                        </div>
                      </div>
                    </div>

                    {/* TABLE */}
                    <table
                      style={{
                        width: "100%",
                        marginTop: 20,
                        borderCollapse: "collapse",
                      }}
                    >
                      <thead>
                        <tr>
                          {[
                            "S.No",
                            "Item",
                            "Description",
                            "HSN",
                            "Qty",
                            "Rate",
                            "Supplier",
                            "Amount",
                          ].map((h) => (
                            <th
                              key={h}
                              style={{
                                border: "1px solid #000",
                                padding: 6,
                                background: "#000",
                                color: "#fff",
                                fontSize: 11,
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>

                      <tbody>
                        {materials.map((m, i) => (
                          <tr key={m.id}>
                            <td
                              style={{ border: "1px solid #000", padding: 6 }}
                            >
                              {i + 1}
                            </td>
                            <td
                              style={{ border: "1px solid #000", padding: 6 }}
                            >
                              {m.name}
                            </td>
                            <td
                              style={{ border: "1px solid #000", padding: 6 }}
                            >
                              {(m.id && materialDescriptions[m.id]) ||
                                m.name ||
                                "-"}
                            </td>
                            <td
                              style={{ border: "1px solid #000", padding: 6 }}
                            >
                              7308
                            </td>
                            <td
                              style={{ border: "1px solid #000", padding: 6 }}
                            >
                              {m.quantity}
                            </td>
                            <td
                              style={{ border: "1px solid #000", padding: 6 }}
                            >
                              {m.rate}
                            </td>
                            <td
                              style={{ border: "1px solid #000", padding: 6 }}
                            >
                              {m.shopName}
                            </td>
                            <td
                              style={{
                                border: "1px solid #000",
                                padding: 6,
                                textAlign: "right",
                              }}
                            >
                              {(
                                Number(m.quantity || 0) * Number(m.rate || 0) ||
                                0
                              ).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* TOTALS */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        marginTop: 16,
                      }}
                    >
                      <table style={{ width: 300 }}>
                        <tbody>
                          <tr>
                            <td>Sub Total</td>
                            <td style={{ textAlign: "right" }}>
                              {subTotal.toFixed(2)}
                            </td>
                          </tr>
                          <tr>
                            <td>SGST 9%</td>
                            <td style={{ textAlign: "right" }}>
                              {sgst.toFixed(2)}
                            </td>
                          </tr>
                          <tr>
                            <td>CGST 9%</td>
                            <td style={{ textAlign: "right" }}>
                              {cgst.toFixed(2)}
                            </td>
                          </tr>
                          <tr>
                            <td>Round Off</td>
                            <td style={{ textAlign: "right" }}>
                              {roundOff.toFixed(2)}
                            </td>
                          </tr>
                          <tr>
                            <td>
                              <strong>Total</strong>
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <strong>₹{grandTotal.toFixed(2)}</strong>
                            </td>
                          </tr>
                          <tr>
                            <td>
                              <strong>Balance Due</strong>
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <strong>₹{grandTotal.toFixed(2)}</strong>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* SIGNATURE */}
                    <div style={{ marginTop: 50 }}>
                      <div
                        style={{ width: 200, borderTop: "1px solid #000" }}
                      />
                      <div>Authorized Signature</div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button onClick={() => setStep(8)} variant="outline">
                      Back
                    </Button>
                    <Button onClick={handleExportFinalBOQ}>Export PDF</Button>
                  </div>
                </motion.div>
              )}

              {/* STEP 9: Add to BOQ (Preview Table) */}
              {/* STEP 9: Add to BOQ (Preview Table) */}
              {step === 9 && (
                <motion.div
                  key="step-add-to-boq"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-6"
                >
                  <div className="space-y-4">
                    <h2 className="text-xl font-semibold">Add to BOQ</h2>
                  </div>

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
                        type="button"
                        onClick={handleSaveStep9}
                        disabled={materials.length === 0}
                      >
                        Save
                      </Button>
                      <Button
                        onClick={async () => {
                          // Filter to only include selected (checked) items, but DON'T clear the cart
                          const allMats = getMaterialsWithDetails(
                            cartSelections,
                            cartEditableMaterials,
                          );
                          const selectedMats =
                            selectedForDelete.length > 0
                              ? allMats.filter((m) =>
                                  selectedForDelete.includes(
                                    (m as any).rowId || `${m.batchId}-${m.id}`,
                                  ),
                                )
                              : allMats;

                          const mats = selectedMats.map((m: any) => {
                            const batchKey =
                              (m as any).rowId || `${m.batchId || ""}-${m.id}`;
                            return {
                              id: m.id,
                              rowId: batchKey,
                              batchId: m.batchId,
                              name: m.name,
                              unit: m.unit,
                              quantity:
                                cartEditableMaterials[batchKey]?.quantity ??
                                cartEditableMaterials[m.id]?.quantity ??
                                m.quantity,
                              supplyRate:
                                cartEditableMaterials[batchKey]?.supplyRate ??
                                cartEditableMaterials[m.id]?.supplyRate ??
                                m.rate,
                              installRate:
                                cartEditableMaterials[batchKey]?.installRate ??
                                cartEditableMaterials[m.id]?.installRate ??
                                (m as any).installRate ??
                                0,
                              shopId: m.shopId,
                              shopName: m.shopName,
                              description:
                                materialDescriptions[batchKey] ||
                                materialDescriptions[m.id] ||
                                "",
                              location:
                                materialLocations[batchKey] ||
                                materialLocations[m.id] ||
                                "",
                              doorType: m.doorType, // Use stored door type from this item's batch
                              panelType: m.panelType,
                              subOption: m.subOption,
                              glazingType: m.glazingType,
                            };
                          });

                          if (mats.length === 0) return;

                          // Use door type from first selected item's batch (since each batch has its own door type)
                          const firstMat = selectedMats[0];
                          const localBoq = {
                            id: `local-${Date.now()}`,
                            estimator: "doors",
                            bill_no: finalBillNo,
                            door_type:
                              firstMat?.doorType ||
                              savedStep9Meta?.doorType ||
                              savedStep9Meta?.door_type ||
                              doorType,
                            panel_type:
                              firstMat?.panelType ||
                              savedStep9Meta?.panelType ||
                              savedStep9Meta?.panel_type ||
                              panelType,
                            sub_option:
                              firstMat?.subOption ||
                              savedStep9Meta?.subOption ||
                              savedStep9Meta?.sub_option ||
                              subOption,
                            glazing_type:
                              firstMat?.glazingType ||
                              savedStep9Meta?.glazingType ||
                              savedStep9Meta?.glazing_type ||
                              glazingType,
                            qty:
                              savedStep9Meta?.count ||
                              savedStep9Meta?.qty ||
                              count,
                            height: savedStep9Meta?.height || height,
                            width: savedStep9Meta?.width || width,
                            glass_height:
                              savedStep9Meta?.glassHeight ||
                              savedStep9Meta?.glass_height ||
                              glassHeight,
                            glass_width:
                              savedStep9Meta?.glassWidth ||
                              savedStep9Meta?.glass_width ||
                              glassWidth,
                            materials: mats,
                            subtotal: mats.reduce(
                              (s, it) =>
                                s +
                                Number(it.quantity || 0) *
                                  (Number(it.supplyRate || 0) +
                                    Number(it.installRate || 0)),
                              0,
                            ),
                            sgst: 0,
                            cgst: 0,
                            round_off: 0,
                            grand_total: 0,
                            created_at: new Date().toISOString(),
                          };

                          setCurrentSavedBoq(localBoq);
                          // DON'T clear the cart - keep all items in savedStep9Materials for future use
                          try {
                            await handleSaveBOQ();
                          } catch (e) {
                            /* swallow */
                          }

                          // NEW: Save to BOQ project and redirect
                          const projectParam =
                            typeof window !== "undefined"
                              ? new URLSearchParams(window.location.search).get(
                                  "project",
                                )
                              : null;
                          if (projectParam) {
                            try {
                              // Prepare table data
                              // Build grouped table data: include group title and computed totals
                              const rows = mats.map((m, idx) => ({
                                s_no: idx + 1,
                                item: m.name,
                                description: m.description,
                                unit: m.unit,
                                qty: m.quantity,
                                supply_rate: Number(m.supplyRate || 0),
                                install_rate: Number(m.installRate || 0),
                              }));

                              // Calculate totals using supply + install rates
                              const subtotal = rows.reduce(
                                (s, r) =>
                                  s +
                                  Number(r.qty || 0) *
                                    (Number(r.supply_rate || 0) +
                                      Number(r.install_rate || 0)),
                                0,
                              );
                              const sgst = +(+subtotal * 0.09).toFixed(2);
                              const cgst = +(+subtotal * 0.09).toFixed(2);
                              const grand_total = +(
                                subtotal +
                                sgst +
                                cgst
                              ).toFixed(2);

                              const groupTitle =
                                `${localBoq.sub_option || ""}${localBoq.sub_option ? " – " : ""}${localBoq.door_type || ""}`.trim();

                              const step9TableData = {
                                groups: [
                                  {
                                    id: `g-${Date.now()}`,
                                    title: groupTitle || "Item Group",
                                    description: "",
                                    unit: "",
                                    qty: 1,
                                    supply_rate: Number(
                                      savedStep9Meta?.grand_total ??
                                        grand_total,
                                    ),
                                    install_rate: 0,
                                    rows,
                                    totals: {
                                      subtotal,
                                      sgst,
                                      cgst,
                                      grand_total,
                                    },
                                  },
                                ],
                              };

                              // Save BOQ item to DB
                              const response = await apiFetch(
                                "/api/boq-items",
                                {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    project_id: projectParam,
                                    estimator: "doors",
                                    table_data: step9TableData,
                                  }),
                                },
                              );

                              if (response.ok) {
                                toast({
                                  title: "Success",
                                  description: "Added to BOQ",
                                });
                                // Redirect back to Create BOQ with the project selected
                                setLocation(
                                  `/create-boq?project=${encodeURIComponent(projectParam)}`,
                                );
                              }
                            } catch (err) {
                              console.error("Failed to save BOQ item:", err);
                              toast({
                                title: "Error",
                                description: "Failed to add to BOQ",
                                variant: "destructive",
                              });
                            }
                          }

                          setSelectedForDelete([]); // Clear selection after finalization
                          // Open Step 11 (Finalize BOQ) so user can review/edit before final add
                          setStep(11);
                        }}
                        disabled={materials.length === 0}
                      >
                        Add to BOQ
                      </Button>
                    </div>
                  </div>

                  {/* Saved BOQs (all estimators) */}
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Saved BOQs</Label>
                    {savedBoqs.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        No saved BOQs
                      </div>
                    ) : (
                      <div className="grid gap-2">
                        {savedBoqs.map((b) => (
                          <div
                            key={b.id}
                            className="p-2 border rounded flex justify-between items-center"
                          >
                            <div>
                              <div className="font-medium">
                                {b.bill_no ||
                                  `${b.estimator} - ${b.door_type || "Door"}`}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {new Date(b.created_at).toLocaleString()}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                onClick={() => handleLoadBoq(b)}
                                size="sm"
                              >
                                Load
                              </Button>
                              <Button
                                variant="destructive"
                                onClick={() => handleDeleteSavedBoq(b.id)}
                                size="sm"
                              >
                                Delete
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* BOQ TABLE (PDF TARGET) */}
                  <div
                    id="boq-pdf"
                    className="overflow-x-auto border rounded-lg"
                  >
                    <table className="min-w-full border-collapse text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="border px-2 py-2">
                            <Checkbox
                              id="select-all"
                              checked={(() => {
                                const ids = (
                                  step === 9
                                    ? getMaterialsWithDetails(
                                        cartSelections,
                                        cartEditableMaterials,
                                      )
                                    : getMaterialsWithDetails()
                                ).map((m) => (m as any).rowId || m.id);
                                return (
                                  selectedForDelete.length === ids.length &&
                                  ids.length > 0
                                );
                              })()}
                              onCheckedChange={toggleSelectAll}
                            />
                          </th>
                          <th className="border px-2 py-2">S.No</th>
                          <th className="border px-2 py-2">Item</th>
                          <th className="border px-2 py-2">Description</th>
                          <th className="border px-2 py-2">Unit</th>
                          <th className="border px-2 py-2">Qty</th>
                          <th className="border px-2 py-2 text-right">Rate</th>
                          <th className="border px-2 py-2 text-right">
                            Amount
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {(() => {
                          const groups = new Map<string, any[]>();
                          const groupMeta = new Map<
                            string,
                            { label: string }
                          >();
                          materials.forEach((m: any) => {
                            const dt =
                              (m as any).doorType ||
                              (m as any).door_type ||
                              savedStep9Meta?.doorType ||
                              savedStep9Meta?.door_type ||
                              doorType ||
                              "door";
                            const pt =
                              (m as any).panelType ||
                              (m as any).panel_type ||
                              savedStep9Meta?.panelType ||
                              savedStep9Meta?.panel_type ||
                              panelType ||
                              "";
                            const so =
                              (m as any).subOption ||
                              (m as any).sub_option ||
                              savedStep9Meta?.subOption ||
                              savedStep9Meta?.sub_option ||
                              "";
                            const key = `${dt}||${pt}||${so}`;
                            if (!groups.has(key)) groups.set(key, []);
                            groups.get(key)!.push(m);
                            if (!groupMeta.has(key)) {
                              // Convert doorType code to full product name
                              const typeEntry = DOOR_TYPES_LOCAL.find(
                                (t) => t.value === dt,
                              );
                              let productName = typeEntry
                                ? typeEntry.label
                                : DOOR_TYPE_TO_PRODUCT[dt] || dt;
                              if (!/door/i.test(productName)) {
                                productName = `${productName} Door`;
                              }
                              const label = `${productName}${so ? " (" + so + ")" : ""}`;
                              groupMeta.set(key, { label });
                            }
                          });

                          const rows: JSX.Element[] = [];
                          let idx = 0;
                          for (const [gk, items] of groups.entries()) {
                            const batchKeys = items.map(
                              (m: any) =>
                                (m as any).rowId ||
                                `${(m as any).batchId || ""}-${m.id}`,
                            );
                            const allSelected = batchKeys.every((k) =>
                              selectedForDelete.includes(k),
                            );

                            const groupId = `group_${gk}`;
                            const groupDesc =
                              materialDescriptions[groupId] || "";
                            const groupQty = Number(
                              groupQtys[groupId] ??
                                savedStep9Meta?.count ??
                                savedStep9Meta?.qty ??
                                count ??
                                1,
                            );

                            rows.push(
                              <tr key={`group-${gk}`} className="bg-gray-50">
                                <td className="border px-2 py-1 text-center">
                                  <Checkbox
                                    id={`group-${gk}`}
                                    checked={allSelected}
                                    onCheckedChange={() => {
                                      if (allSelected)
                                        setSelectedForDelete((prev) =>
                                          prev.filter(
                                            (p) => !batchKeys.includes(p),
                                          ),
                                        );
                                      else
                                        setSelectedForDelete((prev) =>
                                          Array.from(
                                            new Set([...prev, ...batchKeys]),
                                          ),
                                        );
                                    }}
                                  />
                                </td>
                                <td className="border px-2 py-1 text-center"></td>
                                <td className="border px-2 py-1">
                                  <strong>{groupMeta.get(gk)?.label}</strong>
                                </td>
                                <td className="border px-2 py-1">
                                  <Input
                                    placeholder="Group description"
                                    value={
                                      groupDesc?.replace(
                                        /\n?Qty:\s*\d+(?:\.\d+)?\s*$/,
                                        "",
                                      ) || ""
                                    }
                                    onChange={(e) =>
                                      setMaterialDescriptions((prev) => ({
                                        ...prev,
                                        [groupId]: e.target.value,
                                      }))
                                    }
                                    className="w-full"
                                  />
                                </td>
                                <td className="border px-2 py-1 text-center">
                                  pcs
                                </td>
                                <td className="border px-2 py-1 text-center">
                                  <Input
                                    type="number"
                                    className="h-8 text-center"
                                    value={
                                      (groupQtys[groupId] ?? groupQty) as any
                                    }
                                    onChange={(e) => {
                                      const v = e.target.value
                                        ? parseFloat(e.target.value)
                                        : 0;
                                      setGroupQtys((prev) => ({
                                        ...prev,
                                        [groupId]: v,
                                      }));
                                      setMaterialDescriptions((prev) => {
                                        const base = (prev[groupId] || "")
                                          .replace(
                                            /\n?Qty:\s*\d+(?:\.\d+)?\s*$/,
                                            "",
                                          )
                                          .trim();
                                        return {
                                          ...prev,
                                          [groupId]: base
                                            ? base + "\nQty: " + v
                                            : "Qty: " + v,
                                        };
                                      });
                                    }}
                                  />
                                </td>
                                <td className="border px-2 py-1 text-right"></td>
                                <td className="border px-2 py-1 text-right"></td>
                              </tr>,
                            );

                            for (const m of items) {
                              idx += 1;
                              const batchKey =
                                (m as any).rowId ||
                                `${(m as any).batchId}-${m.id}`;
                              const supplyRate = Number(
                                currentEditableBag[batchKey]?.supplyRate ??
                                  currentEditableBag[m.id]?.supplyRate ??
                                  m.rate ??
                                  0,
                              );
                              const installRate = Number(
                                currentEditableBag[batchKey]?.installRate ??
                                  currentEditableBag[m.id]?.installRate ??
                                  (m as any).installRate ??
                                  0,
                              );
                              const combinedRate = supplyRate + installRate;
                              const qty = Number(
                                currentEditableBag[batchKey]?.quantity ??
                                  currentEditableBag[m.id]?.quantity ??
                                  m.quantity ??
                                  0,
                              );
                              const amount = qty * combinedRate;

                              const descRaw =
                                materialDescriptions[batchKey] ??
                                materialDescriptions[m.id] ??
                                m.description ??
                                "";
                              const desc = String(descRaw)
                                .replace(/\n?Qty:\s*\d+(?:\.\d+)?\s*$/, "")
                                .trim();

                              rows.push(
                                <tr key={batchKey}>
                                  <td className="border px-2 py-1 text-center"></td>
                                  <td className="border px-2 py-1 text-center">
                                    {idx}
                                  </td>
                                  <td className="border px-2 py-1">{m.productLabel || m.name}</td>
                                  <td
                                    className="border px-2 py-1"
                                    style={{
                                      maxWidth: 450,
                                      wordBreak: "break-word",
                                    }}
                                  >
                                    <textarea
                                      placeholder={`Description`}
                                      className="h-20 w-full p-2 border rounded"
                                      value={
                                        materialDescriptions[batchKey] ??
                                        materialDescriptions[m.id] ??
                                        desc
                                      }
                                      onChange={(e) =>
                                        setMaterialDescriptions((prev) => ({
                                          ...prev,
                                          [batchKey]: e.target.value,
                                        }))
                                      }
                                    />
                                  </td>
                                  <td className="border px-2 py-1 text-center">
                                    {materialUnits[batchKey] ??
                                      materialUnits[m.id] ??
                                      m.unit}
                                  </td>
                                  <td className="border px-2 py-1 text-center">
                                    <Input
                                      type="number"
                                      className="h-8 text-center"
                                      value={qty as any}
                                      onChange={(e) =>
                                        setEditableQuantity(
                                          batchKey,
                                          e.target.value
                                            ? parseFloat(e.target.value)
                                            : 0,
                                        )
                                      }
                                    />
                                  </td>
                                  <td className="border px-2 py-1 text-right">
                                    <Input
                                      type="number"
                                      value={combinedRate as any}
                                      onChange={(e) => {
                                        const v = parseFloat(
                                          e.target.value || "0",
                                        );
                                        const newSupply = Number(
                                          currentEditableBag[batchKey]
                                            ?.supplyRate ??
                                            currentEditableBag[m.id]
                                              ?.supplyRate ??
                                            supplyRate,
                                        );
                                        const newInstall = Math.max(
                                          0,
                                          v - newSupply,
                                        );
                                        setEditableRate(batchKey, newSupply);
                                        setEditableInstallRate(
                                          batchKey,
                                          newInstall,
                                        );
                                      }}
                                      className="w-28 mx-auto"
                                    />
                                  </td>
                                  <td className="border px-2 py-1 text-right font-medium">
                                    ₹{amount.toFixed(2)}
                                  </td>
                                </tr>,
                              );
                            }
                          }
                          return rows;
                        })()}
                      </tbody>
                    </table>
                  </div>

                  {/* ACTION BUTTONS — RIGHT SIDE */}
                  <div className="flex justify-end gap-3 pt-4">
                    <Button variant="outline" onClick={() => setStep(8)}>
                      <ChevronLeft className="mr-2 h-4 w-4" /> Back
                    </Button>

                    {/* Finalize PO button */}
                    <Button onClick={() => setStep(10)}>Finalize PO</Button>

                    <Button onClick={handleExportPDF}>
                      Export PDF <Download className="ml-2 h-4 w-4" />
                    </Button>
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
