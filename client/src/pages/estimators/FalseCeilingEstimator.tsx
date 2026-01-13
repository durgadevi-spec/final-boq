import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
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
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Download,
  Printer,
} from "lucide-react";
import { useData } from "@/lib/store";

const ctintLogo = "/image.png";

/* ================= TYPES ================= */

interface SelectedMaterialConfig {
  materialId: string;
  selectedShopId?: string;
}

interface MaterialWithQuantity {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  rate: number;
  shopName: string;
  shopId: string;
  code: string;
}

/* ================= COMPONENT ================= */

export default function FalseCeilingEstimator() {
  const { materials: storeMaterials, shops: storeShops } = useData();

  /* ===== STEPS ===== */
  const [step, setStep] = useState(1);

  /* ===== DIMENSIONS ===== */
  const [length, setLength] = useState<number | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [dropHeight, setDropHeight] = useState<number>(0.5);
  const [ceilingType, setCeilingType] = useState<string | null>(null);

  /* ===== MATERIAL SELECTION ===== */
  const [selectedMaterials, setSelectedMaterials] = useState<
    SelectedMaterialConfig[]
  >([]);

  const [editableMaterials, setEditableMaterials] = useState<
    Record<string, { quantity?: number; rate?: number }>
  >({});

  /* ===== FINAL BOQ INPUTS ===== */
  const [finalBillNo, setFinalBillNo] = useState("");
  const [finalBillDate, setFinalBillDate] = useState("");
  const [finalDueDate, setFinalDueDate] = useState("");
  const [finalCustomerName, setFinalCustomerName] = useState("");
  const [finalCustomerAddress, setFinalCustomerAddress] = useState("");
  const [finalTerms, setFinalTerms] = useState("");
  // Material-wise descriptions
  const [materialDescriptions, setMaterialDescriptions] = useState<Record<string, string>>({});
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [finalShopDetails, setFinalShopDetails] = useState("");

  /* ================= HELPERS ================= */

  const calculateQuantity = (code: string) => {
    const area = (length || 0) * (width || 0);
    switch (code) {
      case "GYPSUM-001":
        return Math.ceil(area / 48);
      case "METAL-001":
        return Math.ceil(area / 10);
      case "HANGER-001":
        return Math.ceil(area / 8);
      default:
        return Math.ceil(area / 10);
    }
  };

  const getAvailableMaterials = () =>
    storeMaterials.filter((m) =>
      m.category?.toLowerCase().includes("ceiling")
    );

  const getMaterialsWithDetails = (): MaterialWithQuantity[] =>
    selectedMaterials
      .map((sel) => {
        const base = storeMaterials.find(
          (m) => m.id === sel.materialId
        );
        if (!base) return null;

        const shopMat = storeMaterials.find(
          (m) =>
            m.code === base.code &&
            m.shopId === sel.selectedShopId
        );

        const shop = storeShops.find(
          (s) => s.id === sel.selectedShopId
        );

        return {
          id: base.id,
          name: base.name,
          unit: base.unit,
          code: base.code,
          quantity: calculateQuantity(base.code),
          rate: shopMat?.rate || base.rate,
          shopName: shop?.name || "Unknown",
          shopId: sel.selectedShopId || "",
        };
      })
      .filter(Boolean) as MaterialWithQuantity[];

  /* ================= TOTALS ================= */

  const subTotal = getMaterialsWithDetails().reduce((s, m) => {
    const q = editableMaterials[m.id]?.quantity ?? m.quantity;
    const r = editableMaterials[m.id]?.rate ?? m.rate;
    return s + q * r;
  }, 0);

  const cgst = subTotal * 0.09;
  const sgst = subTotal * 0.09;
  const roundOff =
    Math.round(subTotal + cgst + sgst) -
    (subTotal + cgst + sgst);
  const grandTotal = subTotal + cgst + sgst + roundOff;

  const materials = getMaterialsWithDetails();

  /* ================= EFFECT ================= */

  useEffect(() => {
    if (step === 9) {
      const first = getMaterialsWithDetails()[0];
      const shop = storeShops.find(
        (s) => s.id === first?.shopId
      );
      if (shop) {
        setFinalShopDetails(
          `${shop.name}\n${shop.address || ""}\nGSTIN: ${
            shop.gstNo || "N/A"
          }`
        );
      }
    }
  }, [step]);

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
        filename: `BOQ-FalseCeiling-${finalBillNo || new Date().getTime()}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, allowTaint: true, backgroundColor: "#ffffff" },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(element)
      .save();
  };

  /* ================= RENDER ================= */

  return (
    <Layout>
      <div className="max-w-6xl mx-auto p-4 space-y-6">
        <h2 className="text-3xl font-bold">
          False Ceiling Estimator
        </h2>

        <Card>
          <CardContent className="pt-8">
            <AnimatePresence mode="wait">

              {/* ================= STEP 1 ================= */}
              {step === 1 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <Label>Select Ceiling Type</Label>
                  <div className="flex gap-4 mt-3">
                    <Button variant={ceilingType === "GYPSUM" ? "default" : "outline"} onClick={() => setCeilingType("GYPSUM")}>Gypsum Ceiling</Button>
                    <Button variant={ceilingType === "POP" ? "default" : "outline"} onClick={() => setCeilingType("POP")}>POP Ceiling</Button>
                    <Button variant={ceilingType === "GRID" ? "default" : "outline"} onClick={() => setCeilingType("GRID")}>Grid Ceiling</Button>
                  </div>
                  <Button className="mt-6" onClick={() => setStep(2)}>Next</Button>
                </motion.div>
              )}

              {/* ================= STEP 2 ================= */}
              {step === 2 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-4"
                >
                  <Label>Select Materials</Label>

                  {getAvailableMaterials().map((m) => {
                    const selected = selectedMaterials.find(
                      (s) => s.materialId === m.id
                    );

                    const shops = storeMaterials
                      .filter((x) => x.code === m.code)
                      .sort((a, b) => a.rate - b.rate);

                    return (
                      <div
                        key={m.id}
                        className="border p-3 rounded"
                      >
                        <Checkbox
                          checked={!!selected}
                          onCheckedChange={() => {
                            if (selected) {
                              setSelectedMaterials((p) =>
                                p.filter(
                                  (x) =>
                                    x.materialId !== m.id
                                )
                              );
                            } else {
                              setSelectedMaterials((p) => [
                                ...p,
                                {
                                  materialId: m.id,
                                  selectedShopId:
                                    shops[0]?.shopId,
                                },
                              ]);
                            }
                          }}
                        />
                        <span className="ml-2 font-medium">
                          {m.name}
                        </span>

                        {selected && (
                          <Select
                            value={selected.selectedShopId}
                            onValueChange={(v) =>
                              setSelectedMaterials((p) =>
                                p.map((x) =>
                                  x.materialId === m.id
                                    ? {
                                        ...x,
                                        selectedShopId: v,
                                      }
                                    : x
                                )
                              )
                            }
                          >
                            <SelectTrigger className="mt-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {shops.map((s, i) => (
                                <SelectItem
                                  key={s.shopId}
                                  value={s.shopId || ""}
                                >
                                  {storeShops.find((sh) => sh.id === s.shopId)?.name} – ₹{s.rate} {i === 0 && "(Best)"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    );
                  })}

                  <Button
                    disabled={!selectedMaterials.length}
                    onClick={() => setStep(4)}
                  >
                    Review Materials
                  </Button>
                </motion.div>
              )}

              {/* ================= STEP 4 – REVIEW & EDIT ================= */}
              {step === 4 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-4"
                >
                  <h3 className="font-semibold">
                    Review & Edit Materials
                  </h3>

                  <div className="grid grid-cols-7 font-semibold text-sm border-b pb-2">
                    <div>S.No</div>
                    <div>Item</div>
                    <div>Unit</div>
                    <div>Qty</div>
                    <div>Rate</div>
                    <div>Supplier</div>
                    <div>Amount</div>
                  </div>

                  {getMaterialsWithDetails().map((m, i) => {
                    const q =
                      editableMaterials[m.id]?.quantity ??
                      m.quantity;
                    const r =
                      editableMaterials[m.id]?.rate ?? m.rate;

                    return (
                      <div
                        key={m.id}
                        className="grid grid-cols-7 gap-2 items-center text-sm border-b py-2"
                      >
                        <div>{i + 1}</div>
                        <div>{m.name}</div>
                        <div>{m.unit}</div>
                        <Input
                          type="number"
                          value={q}
                          onChange={(e) =>
                            setEditableMaterials((p) => ({
                              ...p,
                              [m.id]: {
                                ...p[m.id],
                                quantity: Number(
                                  e.target.value
                                ),
                              },
                            }))
                          }
                        />
                        <Input
                          type="number"
                          value={r}
                          onChange={(e) =>
                            setEditableMaterials((p) => ({
                              ...p,
                              [m.id]: {
                                ...p[m.id],
                                rate: Number(
                                  e.target.value
                                ),
                              },
                            }))
                          }
                        />
                        <div>{m.shopName}</div>
                        <div className="font-bold text-right">
                          ₹{(q * r).toFixed(2)}
                        </div>
                      </div>
                    );
                  })}

                  <div className="flex justify-between pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setStep(2)}
                    >
                      Back
                    </Button>
                    <Button onClick={() => setStep(8)}>
                      Generate BOM
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* ================= STEP 8 – BOM ================= */}
              {step === 8 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-6"
                >
                  <div className="text-center">
                    <CheckCircle2 className="mx-auto text-green-500" size={40} />
                    <h2 className="text-xl font-bold">
                      Bill of Materials (BOM)
                    </h2>
                  </div>

                  <table className="w-full border text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        {[
                          "S.No",
                          "Item",
                          "Description",
                          "Unit",
                          "Qty",
                          "Rate",
                          "Supplier",
                          "Amount",
                        ].map((h) => (
                          <th key={h} className="border p-2">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {getMaterialsWithDetails().map((m, i) => {
                        const q =
                          editableMaterials[m.id]?.quantity ??
                          m.quantity;
                        const r =
                          editableMaterials[m.id]?.rate ??
                          m.rate;
                        return (
                          <tr key={m.id}>
                            <td className="border p-2">{i + 1}</td>
                            <td className="border p-2">{m.name}</td>
                            <td className="border p-2">{materialDescriptions[m.id] || m.name}</td>
                            <td className="border p-2">{m.unit}</td>
                            <td className="border p-2">{q}</td>
                            <td className="border p-2">{r}</td>
                            <td className="border p-2">{m.shopName}</td>
                            <td className="border p-2 font-bold text-right">
                              ₹{(q * r).toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setStep(4)}>
                      Back
                    </Button>
                    <Button onClick={() => setStep(9)}>
                      Finalize BOQ
                    </Button>
                  </div>
                </motion.div>
              )}

              {/* ================= STEP 9 – FINAL BOQ ================= */}
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
        <div style={{ width: "40%", lineHeight: "1.6" }}>
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
              <td style={{ border: "1px solid #000", padding: 6 }}>{materialDescriptions[m.id] || (m as any).description || "-"}</td>
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
