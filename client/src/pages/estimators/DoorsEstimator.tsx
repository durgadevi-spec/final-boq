import { useState, useEffect } from "react";
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
import { useData, Material } from "@/lib/store";
import {
  doorFrameLengthLegacyFeet,
  glassAreaLegacySqft,
  glassPerimeterLegacyFeet,
} from "@/lib/estimators/utils";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ChevronLeft, Download, CheckCircle2, Star } from "lucide-react";

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
  glazingType?: string | null
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
    requiredMaterials.push({ type: "Door Frame - Wooden", required: frameRunningFeet, unit: "rft", rate: 280, category: "Frame" });
    requiredMaterials.push({ type: "Frame Screws", required: Math.ceil(frameRunningFeet * 2), unit: "pcs", rate: 2, category: "Frame" });
    requiredMaterials.push({ type: "Wall Plugs / Anchors", required: Math.ceil(frameRunningFeet * 1.5), unit: "pcs", rate: 5, category: "Frame" });
  }

  switch (doorType) {
    case "flush":
    case "flush-door":
      requiredMaterials.push({ type: subOption === "With Vision Panel" ? "Flush Door - BWR (With VP)" : "Flush Door - BWR", required: 1, unit: "pcs", rate: subOption === "With Vision Panel" ? 4500 : 3500, category: "Door Panel" });
      if (subOption === "With Vision Panel") {
        requiredMaterials.push({ type: "Vision Panel Glass", required: 1, unit: "sqft", rate: 280, category: "Door Panel" });
      }
      requiredMaterials.push({ type: "Hinges - SS (Pair)", required: hingesRequired, unit: "pair", rate: 180, category: "Hardware" });
      break;

    case "wpc":
    case "wpc-door":
      requiredMaterials.push({ type: subOption === "Hollow Core" ? "WPC Door - Hollow" : "WPC Door - Solid", required: 1, unit: "pcs", rate: subOption === "Hollow Core" ? 3800 : 5500, category: "Door Panel" });
      requiredMaterials.push({ type: "Hinges - SS (Pair)", required: hingesRequired, unit: "pair", rate: 180, category: "Hardware" });
      break;

    case "glassdoor":
    case "glass-door":
      const glassThickness = subOption === "Frameless" ? "12mm" : "10mm";
      requiredMaterials.push({ type: `Glass - Toughened ${glassThickness}`, required: Math.ceil(doorArea), unit: "sqft", rate: glassThickness === "12mm" ? 420 : 320, category: "Door Panel" });
      requiredMaterials.push({ type: "Patch Fitting - Standard", required: 1, unit: "set", rate: 2800, category: "Hardware" });
      requiredMaterials.push({ type: "Floor Spring - Standard", required: 1, unit: "pcs", rate: 3500, category: "Hardware" });
      if (subOption === "Framed") {
        requiredMaterials.push({ type: "Header Rail", required: 1, unit: "pcs", rate: 1500, category: "Hardware" });
        requiredMaterials.push({ type: "Side Rail", required: 2, unit: "pcs", rate: 1200, category: "Hardware" });
      }
      break;

    case "wooden":
    case "wooden-door":
      requiredMaterials.push({ type: subOption === "Solid Wood" ? "Wooden Door - Teak" : "Wooden Door - Sal", required: 1, unit: "pcs", rate: subOption === "Solid Wood" ? 18000 : 12000, category: "Door Panel" });
      requiredMaterials.push({ type: "Hinges - Brass (Pair)", required: hingesRequired, unit: "pair", rate: 350, category: "Hardware" });
      break;

    case "stile":
    case "stile-door":
      const glassArea = Math.ceil(doorArea * 0.6);
      const frameArea = Math.ceil(doorArea * 0.4);
      const isDoubleGlazing = glazingType === "Double Glazing" || subOption === "Double Glazing";
      requiredMaterials.push({ type: isDoubleGlazing ? "Glass - Toughened 12mm (DGU)" : "Glass - Toughened 10mm", required: glassArea, unit: "sqft", rate: isDoubleGlazing ? 650 : 320, category: "Door Panel" });
      requiredMaterials.push({ type: "Aluminium Stile Frame", required: frameArea, unit: "sqft", rate: 280, category: "Door Panel" });
      requiredMaterials.push({ type: "Patch Fitting - Standard", required: 1, unit: "set", rate: 2800, category: "Hardware" });
      requiredMaterials.push({ type: "Floor Spring - Standard", required: 1, unit: "pcs", rate: 3500, category: "Hardware" });
      break;
  }

  if (doorType !== "glass-door" && doorType !== "stile-door" && doorType !== "glassdoor" && doorType !== "stile") {
    requiredMaterials.push({ type: "Mortise Lock - Standard", required: 1, unit: "pcs", rate: 650, category: "Hardware" });
    requiredMaterials.push({ type: "Door Handle - Standard", required: 1, unit: "pcs", rate: 450, category: "Hardware" });
  } else {
    requiredMaterials.push({ type: "Glass Door Lock", required: 1, unit: "pcs", rate: 1200, category: "Hardware" });
    requiredMaterials.push({ type: "Glass Door Handle - Standard", required: 1, unit: "pair", rate: 850, category: "Hardware" });
  }

  requiredMaterials.push({ type: "Door Stopper - Floor Mount", required: 1, unit: "pcs", rate: 120, category: "Hardware" });

  if (doorType !== "glass-door" && doorType !== "stile-door" && doorType !== "glassdoor" && doorType !== "stile") {
    requiredMaterials.push({ type: "Door Screws", required: hingesRequired * 6, unit: "pcs", rate: 2, category: "Hardware" });
  }

  return { doorArea, framePerimeter, frameRunningFeet, requiredMaterials };
};

export type DoorTypeLocal = "flush-door" | "wpc-door" | "glass-door" | "wooden-door" | "stile-door";

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
}

// Door configuration with material requirements
const DOOR_CONFIG = {
  panel: {
    label: "Door with Panel",
    types: {
      flush: {
        label: "Flush Door",
        requiresGlazing: false,
        materialRequirements: [
          { code: "DOOR-002", label: "Flush Door Shutter" },
          { code: "DOOR-001", label: "Door Frame" },
          { code: "DOOR-005", label: "Door Hinges (SS)" },
          { code: "DOOR-006", label: "Door Lock" },
        ],
      },
      teak: {
        label: "Teak Wood Door",
        requiresGlazing: false,
        materialRequirements: [
          { code: "DOOR-003", label: "Wooden Panel Door" },
          { code: "DOOR-001", label: "Door Frame" },
          { code: "DOOR-005", label: "Door Hinges (SS)" },
          { code: "DOOR-006", label: "Door Lock" },
        ],
      },
      wpc: {
        label: "WPC Door",
        requiresGlazing: false,
        materialRequirements: [
          { code: "DOOR-004", label: "UPVC Door" },
          { code: "DOOR-001", label: "Door Frame" },
          { code: "DOOR-005", label: "Door Hinges (SS)" },
        ],
      },
      stile: {
        label: "Stile Door",
        requiresGlazing: true,
        materialRequirements: [
          { code: "GLASS-001", label: "Clear Tempered Glass" },
          { code: "DOOR-001", label: "Door Frame" },
          { code: "DOOR-005", label: "Door Hinges (SS)" },
        ],
      },
    },
  },
  nopanel: {
    label: "Door without Panel (Glass)",
    types: {
      glassdoor: {
        label: "Glass Door",
        requiresGlazing: true,
        materialRequirements: [
          { code: "GLASS-001", label: "Clear Tempered Glass" },
          { code: "DOOR-001", label: "Door Frame" },
          { code: "FRAME-001", label: "Aluminum Frame" },
          { code: "DOOR-005", label: "Door Hinges (SS)" },
        ],
      },
      glasspanel: {
        label: "Glass Panel Door",
        requiresGlazing: true,
        materialRequirements: [
          { code: "GLASS-002", label: "Frosted Tempered Glass" },
          { code: "DOOR-001", label: "Door Frame" },
          { code: "FRAME-001", label: "Aluminum Frame" },
          { code: "DOOR-005", label: "Door Hinges (SS)" },
        ],
      },
    },
  },
};

export default function DoorsEstimator() {
  const { shops: storeShops, materials: storeMaterials } = useData();

  const [step, setStep] = useState(1);
  const [frameChoice, setFrameChoice] = useState<"with-frame" | "without-frame" | null>(null);
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
  const [selectedMaterials, setSelectedMaterials] = useState<SelectedMaterialConfig[]>([]);

  // Get available door types based on panel type
  const getAvailableDoorTypes = () => {
    if (!panelType) return [];
    const config = DOOR_CONFIG[panelType];
    return Object.entries(config.types).map(([key, value]) => ({
      value: key,
      label: value.label,
    }));
  };

  // Get current door config
  const getCurrentDoorConfig = () => {
    if (!panelType || !doorType) return null;
    return (DOOR_CONFIG[panelType] as any).types[doorType as any];
  };

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

  // Get materials for the selected door type (deduplicated by code)
  const getAvailableMaterials = () => {
    const doorConfig = getCurrentDoorConfig();
    if (!doorConfig) return [];
    const requiredCodes = doorConfig.materialRequirements.map((r: any) => r.code);
    const normalize = (c: string | undefined) => (c || "").toString().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const requiredNorm = requiredCodes.map(normalize);
    const allMaterials = storeMaterials.filter((m) => requiredNorm.includes(normalize(m.code)));
    
    // Deduplicate by code - keep only one instance per material code (cheapest option)
    const uniqueMaterialsMap = new Map<string, typeof allMaterials[0]>();
    
    for (const material of allMaterials) {
      const codeKey = normalize(material.code);
      const existing = uniqueMaterialsMap.get(codeKey);
      if (!existing || material.rate < existing.rate) {
        uniqueMaterialsMap.set(codeKey, material);
      }
    }
    
    const result = Array.from(uniqueMaterialsMap.values());
    if (result.length > 0) return result;

    // fallback
    return getAvailableMaterialsFallback();
  };

  // If no materials matched DOOR codes, fallback to category/name-based selection
  // to include all materials that belong to doors-related categories or names.
  const getAvailableMaterialsFallback = () => {
    const keywords = ["DOOR", "DOOR PANEL", "FRAME", "GLASS", "HINGE", "LOCK", "HARDWARE"];
    const normalizeText = (s: string | undefined) => (s || "").toString().toUpperCase();

    // pick materials whose category/subCategory/name contain keywords
    const candidates = storeMaterials.filter((m) => {
      const cat = normalizeText(m.category);
      const sub = normalizeText(m.subCategory as string);
      const name = normalizeText(m.name);
      const code = normalizeText(m.code);
      return (
        keywords.some((kw) => cat.includes(kw) || sub.includes(kw) || name.includes(kw) || code.includes(kw))
      );
    });

    // Deduplicate by code if present, otherwise by name
    const map = new Map<string, typeof candidates[0]>();
    for (const mat of candidates) {
      const key = (mat.code && mat.code.trim()) ? mat.code.trim().toUpperCase() : mat.name.trim().toUpperCase();
      const existing = map.get(key);
      if (!existing || (mat.rate || 0) < (existing.rate || 0)) {
        map.set(key, mat);
      }
    }
    return Array.from(map.values());
  };

  // Find best (cheapest) shop for each material
  const getBestShop = (materialCode: string): { shopId: string; shopName: string; rate: number } | null => {
    const normalize = (c: string | undefined) => (c || "").toString().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const target = normalize(materialCode);
    const materialsByCode = storeMaterials.filter((m) => normalize(m.code) === target);
    if (materialsByCode.length === 0) return null;

    let bestOption = materialsByCode[0];
    for (const mat of materialsByCode) {
      if (mat.rate < bestOption.rate) {
        bestOption = mat;
      }
    }

    const shop = storeShops.find((s) => s.id === bestOption.shopId);
    return {
      shopId: bestOption.shopId || "",
      shopName: shop?.name || "Unknown",
      rate: bestOption.rate,
    };
  };

  // Calculate quantities based on dimensions and door type
  const calculateQuantity = (materialCode: string, materialUnit: string): number => {
    const c = count || 1;
    const h = height || 7;
    const w = width || 3;
    const gh = glassHeight || 6;
    const gw = glassWidth || 2;

    // Frame length using legacy estimator formula
    const frameLength = doorFrameLengthLegacyFeet(h, w);

    let quantity = 0;

    if (materialCode === "DOOR-001") {
      // Door Frame - based on perimeter
      quantity = frameLength * c;
    } else if (
      materialCode === "DOOR-002" ||
      materialCode === "DOOR-003" ||
      materialCode === "DOOR-004"
    ) {
      // Door shutters - one per door
      quantity = c;
    } else if (materialCode === "DOOR-005") {
      // Hinges - 3 per door
      quantity = c * 3;
    } else if (materialCode === "DOOR-006" || materialCode === "DOOR-007" || materialCode === "DOOR-008") {
      // Door hardware - one per door
      quantity = c;
    } else if (materialCode === "GLASS-001" || materialCode === "GLASS-002") {
      // Glass - based on glass area (legacy estimator formula)
      const glassArea = glassAreaLegacySqft(gh, gw);
      quantity = glassArea * c;
    } else if (materialCode === "FRAME-001") {
      // Aluminum frame - based on glass perimeter (legacy formula)
      const glassPerimeter = glassPerimeterLegacyFeet(gh, gw);
      quantity = glassPerimeter * c;
    } else {
      quantity = c;
    }

    return Math.max(1, Math.ceil(quantity));
  };

  // Get materials with quantities and shop info
  const getMaterialsWithDetails = (): MaterialWithQuantity[] => {
    // Use availableMaterials which includes both code-matched and fallback materials
    return selectedMaterials
      .map((selection) => {
        // Find material from availableMaterials (already filtered for this door type)
        const material = availableMaterials.find((m) => m.id === selection.materialId);
        if (!material) return null;

        const shop = storeShops.find((s) => s.id === selection.selectedShopId);

        // allow editable overrides
        const override = editableMaterials[material.id];
        const computedQty = calculateQuantity(material.code || "", material.unit);
        const quantity = override?.quantity ?? computedQty;
        const rate = override?.rate ?? material.rate ?? 0;

        return {
          id: material.id,
          name: material.name,
          quantity,
          unit: material.unit, 
          rate,
          shopId: selection.selectedShopId,
          shopName: shop?.name || "Unknown",
        };
      })
      .filter((m): m is MaterialWithQuantity => m !== null);
  };

  const calculateTotalCost = (): number => {
    return getMaterialsWithDetails().reduce((sum, m) => sum + m.quantity * m.rate, 0);
  };

  // materials available for current door (used in Step 6 render)
  const availableMaterials = getAvailableMaterials();

  // Editable materials for Step 7 (allow user to tweak qty/rate before BOQ)
  const [editableMaterials, setEditableMaterials] = useState<Record<string, { quantity: number; rate: number }>>({});

  // Final BOQ manual fields (Step 9)
  const [finalCompanyName, setFinalCompanyName] = useState<string>("Concept Trunk Interiors");
  const [finalCompanyAddress, setFinalCompanyAddress] = useState<string>(
    "12/36A, Indira Nagar\nMedavakkam\nChennai Tamil Nadu 600100\nIndia"
  );
  const [finalCompanyGST, setFinalCompanyGST] = useState<string>("33ASOPS5560M1Z1");

  const [finalBillNo, setFinalBillNo] = useState<string>("");
  const [finalBillDate, setFinalBillDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [finalDueDate, setFinalDueDate] = useState<string>("");
  const [finalTerms, setFinalTerms] = useState<string>("50% Advance and 50% on Completion");
  const [finalCustomerName, setFinalCustomerName] = useState<string>("");
  const [finalCustomerAddress, setFinalCustomerAddress] = useState<string>("");

  const [finalShopDetails, setFinalShopDetails] = useState<string>("");
  // Material-wise descriptions
  const [materialDescriptions, setMaterialDescriptions] = useState<Record<string, string>>({});
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  useEffect(() => {
    if (step === 7) {
      const details = getMaterialsWithDetails();
      const map: Record<string, { quantity: number; rate: number }> = {};
      details.forEach((d) => {
        map[d.id] = { quantity: d.quantity || 0, rate: d.rate || 0 };
      });
      setEditableMaterials(map);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedMaterials]);

  // Prefill final shop/company details when opening final BOQ step
  useEffect(() => {
    if (step === 9) {
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
            shop.gstNo ? `GSTIN: ${shop.gstNo}` : "",
            shop.phone || "",
          ].filter(Boolean);
          setFinalShopDetails(parts.join("\n"));
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedMaterials, storeShops]);

  const handleToggleMaterial = (materialId: string) => {
    const existingSelection = selectedMaterials.find((m) => m.materialId === materialId);

    if (existingSelection) {
      setSelectedMaterials((prev) => prev.filter((m) => m.materialId !== materialId));
    } else {
      const bestShop = getBestShop(storeMaterials.find((m) => m.id === materialId)?.code || "");
      if (bestShop) {
        setSelectedMaterials((prev) => [
          ...prev,
          { materialId, selectedShopId: bestShop.shopId },
        ]);
      }
    }
  };

  const handleChangeShop = (materialId: string, newShopId: string) => {
    setSelectedMaterials((prev) =>
      prev.map((m) =>
        m.materialId === materialId ? { ...m, selectedShopId: newShopId } : m
      )
    );
  };
  const setEditableQuantity = (materialId: string, quantity: number) => {
    setEditableMaterials((prev) => ({
      ...prev,
      [materialId]: { ...(prev[materialId] || { rate: 0 }), quantity: Math.max(0, Math.ceil(quantity)) },
    }));
  };

  const setEditableRate = (materialId: string, rate: number) => {
    setEditableMaterials((prev) => ({
      ...prev,
      [materialId]: { ...(prev[materialId] || { quantity: 0 }), rate: Math.max(0, Number(rate)) },
    }));
  };
const handleExportPDF = async () => {
  const element = document.getElementById("boq-pdf");

  if (!element) {
    alert("BOQ content not found");
    return;
  }

  const html2pdf = (await import("html2pdf.js")).default;

  html2pdf()
    .set({
      margin: 10,
      filename: "Door_BOQ.pdf",
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff", // must be a simple color
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    })
    .from(element)
    .save();
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
        `${idx + 1},"${mat.name}","${mat.unit}",${mat.quantity},${mat.rate},"${mat.shopName}",${total}`
      );
    });

    csvLines.push("", `TOTAL COST,,,,,${calculateTotalCost().toFixed(2)}`);

    const csv = csvLines.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BOQ-Doors-${new Date().getTime()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

    // ===== FINAL BOQ DATA (USED IN STEP 9) =====
  const materials = getMaterialsWithDetails();

  const subTotal = materials.reduce(
    (sum, m) => sum + m.quantity * m.rate,
    0
  );

  const sgst = subTotal * 0.09;
  const cgst = subTotal * 0.09;

  const roundOff =
    Math.round(subTotal + sgst + cgst) - (subTotal + sgst + cgst);

  const grandTotal = subTotal + sgst + cgst + roundOff;


  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Door Estimator</h2>
          <p className="text-muted-foreground mt-1">
            Complete the process to generate your Bill of Quantities with precise calculations
          </p>
        </div>

        <Card className="border-border/50">
          <CardContent className="pt-8 min-h-96">
            <AnimatePresence mode="wait">
              {/* STEP 1: Frame Choice (added) */}
              {step === 1 && (
                <motion.div
                  key="step-frame"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-4"
                >
                  <Label className="text-lg font-semibold">Door with Frame or Without Frame?</Label>
                  <div className="flex flex-col gap-3">
                    <Button
                      variant={frameChoice === "with-frame" ? "default" : "outline"}
                      onClick={() => setFrameChoice("with-frame")}
                      className="justify-start h-auto py-4 text-left"
                    >
                      <div>
                        <div className="font-semibold">Door with Frame</div>
                        <div className="text-xs text-muted-foreground">Recommended for traditional doors</div>
                      </div>
                    </Button>
                    <Button
                      variant={frameChoice === "without-frame" ? "default" : "outline"}
                      onClick={() => setFrameChoice("without-frame")}
                      className="justify-start h-auto py-4 text-left"
                    >
                      <div>
                        <div className="font-semibold">Door without Frame (Glass)</div>
                        <div className="text-xs text-muted-foreground">Used for frameless or glass doors</div>
                      </div>
                    </Button>
                  </div>
                  <div className="flex justify-end gap-2 pt-6">
                    <Button disabled={!frameChoice} onClick={() => setStep(2)}>
                      Next <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* STEP 2: Door Type (flat list) */}
              {step === 2 && (
                <motion.div
                  key="step-door-types"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-4"
                >
                  <Label className="text-lg font-semibold">Select Door Type</Label>
                  <p className="text-sm text-gray-400">Frame: {frameChoice === "with-frame" ? "With Frame" : "Without Frame"}</p>
                  <div className="grid gap-3">
                    {DOOR_TYPES_LOCAL.map((type) => (
                      <Button
                        key={type.value}
                        onClick={() => {
                          setDoorType(type.value);
                          // ensure panelType aligns with selected type
                          if (["glassdoor", "glasspanel"].includes(type.value)) setPanelType("nopanel");
                          else setPanelType("panel");
                          setSubOption(null);
                          setVisionPanel(null);
                          setGlazingType(null);
                        }}
                        className={`w-full text-black ${doorType === type.value ? "bg-cyan-500" : "bg-white"}`}
                      >
                        {type.label}
                      </Button>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button onClick={() => setStep(1)} className="bg-gray-500 text-black w-1/2">
                      Back
                    </Button>
                    <Button
                      onClick={() => setStep(3)}
                      disabled={!doorType}
                      className={`bg-cyan-500 text-black w-1/2 ${!doorType ? "opacity-50" : ""}`}
                    >
                      Next
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* STEP 3: Sub Option */}
              {step === 3 && doorType && (
                <motion.div
                  key="step-suboption"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-4"
                >
                  <Label className="text-lg font-semibold">Select Sub Option:</Label>
                  <div className="flex flex-col gap-2">
                    {(DOOR_SUB_OPTIONS_LOCAL[doorType] || []).map((opt) => (
                      <Button
                        key={opt}
                        onClick={() => {
                          setSubOption(opt);
                          setVisionPanel(null);
                          if (doorType === "stile") setGlazingType(opt === "Double Glazing" ? "double" : "single");
                        }}
                        className={`w-full text-black ${subOption === opt ? "bg-cyan-500" : "bg-white"}`}
                      >
                        {opt}
                      </Button>
                    ))}
                  </div>

                  {doorType === "flush" && (
                    <div className="mt-4">
                      <p className="font-semibold text-white mb-2">Vision Panel Type:</p>
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
                    <Button variant="outline" onClick={() => setStep(2)}>
                      <ChevronLeft className="mr-2 h-4 w-4" /> Back
                    </Button>
                    <Button
                      onClick={() => setStep(5)}
                      disabled={!subOption || (doorType === "flush" && subOption === "With Vision Panel" && !visionPanel)}
                    >
                      Next <ChevronRight className="ml-2 h-4 w-4" />
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
                  <Label className="text-lg font-semibold">Select Sub Option:</Label>
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
                      <p className="font-semibold text-white mb-2">Vision Panel Type:</p>
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
                      disabled={!subOption || (doorType === "flush" && subOption === "With Vision Panel" && !visionPanel)}
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
                  <Label className="text-lg font-semibold">Door Dimensions (in feet)</Label>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="count">Count</Label>
                      <Input
                        id="count"
                        type="number"
                        placeholder="1"
                        value={count || ""}
                        onChange={(e) =>
                          setCount(e.target.value ? parseFloat(e.target.value) : null)
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
                          setHeight(e.target.value ? parseFloat(e.target.value) : null)
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
                          setWidth(e.target.value ? parseFloat(e.target.value) : null)
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
                              setGlassHeight(e.target.value ? parseFloat(e.target.value) : null)
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
                              setGlassWidth(e.target.value ? parseFloat(e.target.value) : null)
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between gap-2 pt-6">
                    <Button variant="outline" onClick={() => setStep(getCurrentDoorConfig()?.requiresGlazing ? 4 : 3)}>
                      <ChevronLeft className="mr-2 h-4 w-4" /> Back
                    </Button>
                    <Button
                      disabled={!count || !height || !width || (getCurrentDoorConfig()?.requiresGlazing && (!glassHeight || !glassWidth))}
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
                  <Label className="text-lg font-semibold">Select Materials & Shops</Label>
                  <p className="text-sm text-muted-foreground mb-4">
                    Available materials for {getCurrentDoorConfig()?.label}. Best price shop is pre-selected.
                  </p>

                  <div className="space-y-3 max-h-64 overflow-y-auto border rounded-lg p-4">
                    {availableMaterials.length === 0 ? (
                      (() => {
                        const doorCfg = getCurrentDoorConfig();
                        const requiredCodes = doorCfg?.materialRequirements.map((r: any) => r.code) || [];
                        const sampleCodes = storeMaterials.slice(0, 8).map((m) => m.code || m.id);
                        return (
                          <div className="p-4 text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded">
                            <div className="font-medium mb-2">No materials found for this door type.</div>
                            <div>Required codes: {requiredCodes.join(", ") || "(none)"}</div>
                            <div>Materials in store: {storeMaterials.length}</div>
                            <div className="mt-2 text-xs text-muted-foreground">Sample store codes: {sampleCodes.join(", ")}</div>
                            <div className="mt-2">Tip: ensure material code values in the database match the DOOR codes (case-insensitive, alphanumeric).</div>
                          </div>
                        );
                      })()
                    ) : (
                      availableMaterials.map((mat) => {
                        const isSelected = selectedMaterials.some((m) => m.materialId === mat.id);
                        const currentSelection = selectedMaterials.find((m) => m.materialId === mat.id);
                        const normalize = (c: string | undefined) => (c || "").toString().toUpperCase().replace(/[^A-Z0-9]/g, "");
                        const availableShops = storeMaterials
                          .filter((m) => normalize(m.code) === normalize(mat.code))
                          .map((m) => ({
                            shopId: m.shopId,
                            rate: m.rate,
                            shopName: storeShops.find((s) => s.id === m.shopId)?.name || "Unknown",
                          }))
                          .sort((a, b) => a.rate - b.rate);

                        return (
                          <div key={mat.id} className="border rounded-lg p-3 hover:bg-muted/50 transition">
                            <div className="flex items-start gap-3">
                              <Checkbox id={mat.id} checked={isSelected} onCheckedChange={() => handleToggleMaterial(mat.id)} />
                              <div className="flex-1">
                                <label htmlFor={mat.id} className="font-medium cursor-pointer">{mat.name}</label>
                                <p className="text-xs text-muted-foreground">{mat.code}</p>

                                {isSelected && availableShops.length > 0 && (
                                  <div className="mt-3 space-y-2">
                                    <Label className="text-xs">Select Shop:</Label>
                                    <Select value={currentSelection?.selectedShopId || availableShops[0].shopId} onValueChange={(newShopId) => handleChangeShop(mat.id, newShopId)}>
                                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        {availableShops.map((shop) => (
                                          <SelectItem key={shop.shopId} value={shop.shopId || ""}>
                                            {shop.shopName} - ₹{shop.rate}/{mat.unit}
                                            {shop.rate === availableShops[0].rate && " (Best)"}
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
                      <Button variant="outline" onClick={() => setStep(5)}>
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
  <motion.div key="step6-selected" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
    <Label className="text-lg font-semibold">Selected Materials</Label>
    <p className="text-sm text-muted-foreground mb-4">Edit quantities or rates before generating BOQ.</p>

    <div className="space-y-2">
      {getMaterialsWithDetails().length > 0 ? (
        <>
          <div className="grid grid-cols-8 gap-2 p-2 text-sm text-muted-foreground">
            <div className="col-span-2 font-medium">Item</div>
            <div>Description</div>
            <div className="text-center">Qty</div>
            <div className="text-center">Unit</div>
            <div className="text-center">Shop</div>
            <div className="text-center">Rate (₹)</div>
            <div className="text-right">Amount (₹)</div>
          </div>
          {getMaterialsWithDetails().map((mat) => (
            <div key={mat.id} className={cn("p-3 border rounded grid grid-cols-8 items-center")}>
              <span className="col-span-2 font-medium">{mat.name}</span>
              <span className="text-sm">{materialDescriptions[mat.id] || mat.name}</span>
              <div className="col-span-1 text-center">
                <Input type="number" value={editableMaterials[mat.id]?.quantity ?? mat.quantity} onChange={(e) => setEditableQuantity(mat.id, parseInt(e.target.value || "0", 10))} className="w-20 mx-auto" />
              </div>
              <span className="col-span-1 text-center text-muted-foreground">{mat.unit}</span>
              <div className="col-span-1 text-center font-semibold">{mat.shopName || "-"}</div>
              <div className="col-span-1 text-center">
                <Input type="number" value={editableMaterials[mat.id]?.rate ?? mat.rate} onChange={(e) => setEditableRate(mat.id, parseFloat(e.target.value || "0"))} className="w-20 mx-auto" />
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
      <Button variant="outline" onClick={() => setStep(6)}>
        <ChevronLeft className="mr-2 h-4 w-4" /> Back
      </Button>
      <Button onClick={() => setStep(8)} disabled={getMaterialsWithDetails().length === 0}>
        Next: Generate BOM <ChevronRight className="ml-2 h-4 w-4" />
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
      <h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Bill of Materials (BOM)</h2>
      <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>
        Generated on {new Date().toLocaleDateString()}
      </p>
    </div>

    {/* BOQ CONTENT (PDF TARGET) */}
    <div
      id="boq-pdf"
      style={{
        backgroundColor: "#ffffff", // white background
        color: "#000000",           // black text
        fontFamily: "Arial, sans-serif",
        padding: "16px",
      }}
    >
      {/* Project / Door Details */}
      <div style={{ border: "1px solid #d1d5db", borderRadius: "8px", marginBottom: "16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px", padding: "16px", fontSize: "0.875rem" }}>
          <div>
            <p style={{ fontSize: "0.75rem", color: "#6b7280" }}>DOOR TYPE</p>
            <p style={{ fontWeight: 600 }}>
              {panelType === "panel" ? "With Panel" : "Without Panel"} – {getCurrentDoorConfig()?.label}
            </p>
          </div>
          <div>
            <p style={{ fontSize: "0.75rem", color: "#6b7280" }}>DIMENSIONS</p>
            <p style={{ fontWeight: 600 }}>
              {height} ft × {width} ft (Qty: {count})
            </p>
          </div>
          {glazingType && (
            <div>
              <p style={{ fontSize: "0.75rem", color: "#6b7280" }}>GLAZING</p>
              <p style={{ fontWeight: 600, textTransform: "capitalize" }}>{glazingType}</p>
            </div>
          )}
          {getCurrentDoorConfig()?.requiresGlazing && (
            <div>
              <p style={{ fontSize: "0.75rem", color: "#6b7280" }}>GLASS SIZE</p>
              <p style={{ fontWeight: 600 }}>
                {glassHeight}" × {glassWidth}"
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Materials Table */}
      <div style={{ border: "1px solid #d1d5db", borderRadius: "8px", marginBottom: "16px", overflow: "hidden" }}>
        <div style={{ padding: "16px" }}>
          <h3 style={{ fontWeight: 600, marginBottom: "8px" }}>Materials Schedule</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead style={{ backgroundColor: "#f3f4f6" }}>
              <tr>
                {["S.No","Description","Unit","Qty","Rate (₹)","Supplier","Amount (₹)"].map((h) => (
                  <th key={h} style={{ border: "1px solid #d1d5db", padding: "8px", textAlign: h === "Qty" || h.includes("Rate") || h.includes("Amount") ? "right" : "left" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {getMaterialsWithDetails().map((mat, index) => (
                <tr key={mat.id}>
                  <td style={{ border: "1px solid #d1d5db", padding: "8px" }}>{index + 1}</td>
                  <td style={{ border: "1px solid #d1d5db", padding: "8px", fontWeight: 500 }}>{mat.name}</td>
                  <td style={{ border: "1px solid #d1d5db", padding: "8px", textAlign: "center" }}>{mat.unit}</td>
                  <td style={{ border: "1px solid #d1d5db", padding: "8px", textAlign: "center" }}>{mat.quantity}</td>
                  <td style={{ border: "1px solid #d1d5db", padding: "8px", textAlign: "right" }}>{mat.rate}</td>
                  <td style={{ border: "1px solid #d1d5db", padding: "8px" }}>{mat.shopName}</td>
                  <td style={{ border: "1px solid #d1d5db", padding: "8px", textAlign: "right", fontWeight: 600 }}>
                    {(mat.quantity * mat.rate).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Total Summary */}
      <div style={{ border: "1px solid #d1d5db", borderRadius: "8px", padding: "16px", display: "flex", justifyContent: "space-between", backgroundColor: "#eff6ff" }}>
        <div>
          <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>Total Materials</p>
          <p style={{ fontWeight: 600 }}>{selectedMaterials.length}</p>
        </div>

        <div>
          <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>Total Quantity</p>
          <p style={{ fontWeight: 600 }}>{getMaterialsWithDetails().reduce((s, m) => s + m.quantity, 0)}</p>
        </div>

        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>Grand Total</p>
          <p style={{ fontSize: "1.5rem", fontWeight: 700, color: "#1d4ed8" }}>
            ₹{calculateTotalCost().toFixed(2)}
          </p>
        </div>
      </div>
    </div>

    {/* ACTION BUTTONS */}
    {/* ACTION BUTTONS */}
<div className="flex flex-wrap gap-4 justify-end pt-4">

  <Button onClick={() => setStep(7)} variant="outline">Back</Button>
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
  <button
    onClick={() => setStep(9)}
    className="flex items-center gap-2 bg-indigo-600 text-white font-semibold px-4 py-2 rounded-lg shadow hover:bg-indigo-700 transition"
  >
    Finalize BOQ
  </button>

  {/* New Estimate */}
  <button
    onClick={() => {
      setStep(1);
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


             {step === 9 && (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

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
          onChange={(e) => setFinalCustomerAddress(e.target.value)}
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
      <Label className="font-semibold">Material Description Entry</Label>
      <select className="w-full border rounded px-3 py-2" value={selectedMaterialId} onChange={(e) => setSelectedMaterialId(e.target.value)}>
        <option value="">Select Material</option>
        {getMaterialsWithDetails().map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
      </select>
      {selectedMaterialId && (<Input placeholder="Enter description for selected material" value={materialDescriptions[selectedMaterialId] || ""} onChange={(e) => setMaterialDescriptions((prev) => ({...prev,[selectedMaterialId]: e.target.value,}))} />)}
    </div>

    {/* ================= PDF ================= */}
    <div
      id="boq-final-pdf"
      style={{
        width: "210mm",
        minHeight: "297mm",
        padding: "20mm",
        background: "#fff",
        color: "#000",
        fontFamily: "Arial",
        fontSize: 12
      }}
    >

      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <img src={ctintLogo} alt="Concept Trunk Interiors" style={{ height: 60 }} />
        <div style={{ textAlign: "right" }}>
          <h2 style={{ margin: 0 }}>BILL</h2>
          <div>Bill No: {finalBillNo}</div>
        </div>
      </div>

      <hr style={{ margin: "10px 0" }} />

      {/* COMPANY + META */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>

        {/* LEFT */}
        <div style={{ width: "55%", lineHeight: 1.5 }}>
          <strong>Concept Trunk Interiors</strong><br />
          12/36A, Indira Nagar<br />
          Medavakkam<br />
          Chennai – 600100<br />
          GSTIN: 33ASOPS5560M1Z1

          <br /><br />

          <strong>Bill From</strong><br />
          <pre style={{ margin: 0, fontFamily: "Arial", whiteSpace: "pre-wrap" }}>
            {finalShopDetails}
          </pre>
        </div>

        {/* RIGHT */}
        <div style={{ width: "40%", lineHeight: 1.6 }}>
          <div><strong>Bill Date</strong> : {finalBillDate}</div>
          <div><strong>Due Date</strong> : {finalDueDate}</div>
          <div style={{ marginTop: 6 }}>
            <strong>Terms</strong> : {finalTerms}
          </div>
          <div style={{ marginTop: 6 }}>
            <strong>Customer Name</strong> : {finalCustomerName}
          </div>
        </div>
      </div>

      {/* TABLE */}
      <table style={{ width: "100%", marginTop: 20, borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["S.No", "Item", "Description", "HSN", "Qty", "Rate", "Supplier", "Amount"].map(h => (
              <th
                key={h}
                style={{
                  border: "1px solid #000",
                  padding: 6,
                  background: "#000",
                  color: "#fff",
                  fontSize: 11
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
              <td style={{ border: "1px solid #000", padding: 6 }}>{i + 1}</td>
              <td style={{ border: "1px solid #000", padding: 6 }}>{m.name}</td>
              <td style={{ border: "1px solid #000", padding: 6 }}>{(m.id && materialDescriptions[m.id]) || m.name || "-"}</td>
              <td style={{ border: "1px solid #000", padding: 6 }}>7308</td>
              <td style={{ border: "1px solid #000", padding: 6 }}>{m.quantity}</td>
              <td style={{ border: "1px solid #000", padding: 6 }}>{m.rate}</td>
              <td style={{ border: "1px solid #000", padding: 6 }}>{m.shopName}</td>
              <td style={{ border: "1px solid #000", padding: 6, textAlign: "right" }}>
                {(m.quantity * m.rate).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* TOTALS */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <table style={{ width: 300 }}>
          <tbody>
            <tr><td>Sub Total</td><td style={{ textAlign: "right" }}>{subTotal.toFixed(2)}</td></tr>
            <tr><td>SGST 9%</td><td style={{ textAlign: "right" }}>{sgst.toFixed(2)}</td></tr>
            <tr><td>CGST 9%</td><td style={{ textAlign: "right" }}>{cgst.toFixed(2)}</td></tr>
            <tr><td>Round Off</td><td style={{ textAlign: "right" }}>{roundOff.toFixed(2)}</td></tr>
            <tr><td><strong>Total</strong></td><td style={{ textAlign: "right" }}><strong>₹{grandTotal.toFixed(2)}</strong></td></tr>
            <tr><td><strong>Balance Due</strong></td><td style={{ textAlign: "right" }}><strong>₹{grandTotal.toFixed(2)}</strong></td></tr>
          </tbody>
        </table>
      </div>

      {/* SIGNATURE */}
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
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}