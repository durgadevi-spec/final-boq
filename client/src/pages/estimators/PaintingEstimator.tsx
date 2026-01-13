import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ChevronRight, 
  ChevronLeft, 
  Paintbrush, 
  CheckCircle2, 
  Droplets,
  Layers
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
import html2pdf from "html2pdf.js";

const ctintLogo = "/image.png";

const PAINT_CONFIG = {
  interior: { label: "Interior Painting", requirements: ["Primer", "Putty", "Interior Emulsion", "Sandpaper"] },
  exterior: { label: "Exterior Painting", requirements: ["External Primer", "Exterior Emulsion", "Crack Filler"] },
};

export default function PaintingEstimator() {
  const { shops: storeShops, materials: storeMaterials } = useData();
  
  // --- Core States ---
  const [step, setStep] = useState(1);
  const [paintType, setPaintType] = useState<keyof typeof PAINT_CONFIG | null>(null);
  const [length, setLength] = useState(20);
  const [height, setHeight] = useState(10);
  
  // --- Selection States ---
  const [selectedMaterials, setSelectedMaterials] = useState<{ materialId: string; selectedShopId: string }[]>([]);
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

  // --- Logic Helpers ---
  const availableMaterials = useMemo(() => {
    return storeMaterials.filter(m => m.category === "Painting");
  }, [storeMaterials]);

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

  const handleExportFinalBOQ = () => {
    const element = document.getElementById("boq-final-pdf");
    if (element) {
      html2pdf().from(element).set({ margin: 0, filename: `Painting_Invoice_${finalBillNo}.pdf` }).save();
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8 pb-20">
        <AnimatePresence mode="wait">
          
          {/* STEP 1: SYSTEM SELECTION */}
          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Label className="text-lg font-semibold">Select Type</Label>
              {Object.entries(PAINT_CONFIG).map(([key, config]) => (
                <Card key={key} className={cn("cursor-pointer border-2 transition-all", paintType === key ? "border-primary bg-primary/5" : "")} onClick={() => setPaintType(key as any)}>
                  <CardContent className="p-6 flex items-center gap-4">
                    <Paintbrush className="text-primary" />
                    <div>
                      <p className="font-bold">{config.label}</p>
                      <p className="text-xs text-muted-foreground">{config.requirements.length} Required Items</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Button className="md:col-span-2 mt-4" disabled={!paintType} onClick={() => setStep(2)}>Next <ChevronRight className="ml-2 h-4 w-4" /></Button>
            </motion.div>
          )}

          {/* STEP 2: DIMENSIONS */}
          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-xl mx-auto">
               <Label className="text-lg font-semibold">Enter Dimensions</Label>
              <div className="bg-white p-8 rounded-xl border space-y-4">
                <div className="space-y-2"><Label>Wall Length (ft)</Label><Input type="number" value={length} onChange={e => setLength(Number(e.target.value))} /></div>
                <div className="space-y-2"><Label>Wall Height (ft)</Label><Input type="number" value={height} onChange={e => setHeight(Number(e.target.value))} /></div>
                <div className="flex gap-4 pt-4">
                  <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Back</Button>
                  <Button className="flex-1" onClick={() => setStep(6)}>Next</Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 6: MATERIAL & SHOP SELECTION */}
          {step === 6 && (
            <motion.div key="s6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <Label className="text-xl font-bold">Select Materials & Preferred Shops</Label>
              <div className="space-y-3 max-h-[500px] overflow-y-auto border rounded-lg p-4 bg-white">
                {availableMaterials.map((mat) => {
                  const isSelected = selectedMaterials.some(m => m.materialId === mat.id);
                  const currentSelection = selectedMaterials.find(m => m.materialId === mat.id);
                  const shops = storeMaterials.filter(m => m.code === mat.code);

                  return (
                    <div key={mat.id} className={cn("border rounded-xl p-4 flex items-center gap-4", isSelected ? "border-primary bg-primary/5" : "bg-slate-50")}>
                      <Checkbox checked={isSelected} onCheckedChange={() => {
                         if(isSelected) setSelectedMaterials(p => p.filter(x => x.materialId !== mat.id));
                         else setSelectedMaterials(p => [...p, { materialId: mat.id, selectedShopId: mat.shopId || "" }]);
                      }} />
                      <div className="flex-1">
                        <p className="font-bold">{mat.name}</p>
                        <p className="text-xs text-muted-foreground">{mat.code} — {mat.unit}</p>
                      </div>
                      {isSelected && (
                        <Select value={currentSelection?.selectedShopId} onValueChange={(val) => setSelectedMaterials(prev => prev.map(s => s.materialId === mat.id ? {...s, selectedShopId: val} : s))}>
                          <SelectTrigger className="w-48 bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {shops.map(s => (
                              <SelectItem key={s.shopId} value={s.shopId || ""}>
                                {storeShops.find(sh => sh.id === s.shopId)?.name} — ₹{s.rate}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                <Button onClick={() => setStep(7)}>Next <ChevronRight className="ml-2 h-4 w-4" /></Button>
              </div>
            </motion.div>
          )}

          {/* STEP 7: EDIT QUANTITIES & RATES */}
          {step === 7 && (
            <motion.div key="s7" className="space-y-4">
              <div className="border rounded-lg bg-white overflow-hidden shadow-sm">
                <div className="grid grid-cols-6 gap-2 p-3 bg-slate-900 text-white text-[10px] font-bold uppercase tracking-widest">
                  <div className="col-span-2">Material</div><div>Qty</div><div>Unit</div><div>Rate (₹)</div><div className="text-right">Total</div>
                </div>
                {currentMaterials.map((m) => (
                  <div key={m.id} className="grid grid-cols-6 gap-2 p-3 items-center border-b">
                    <span className="col-span-2 font-bold text-sm">{m.name}</span>
                    <Input type="number" className="h-8 text-center" value={m.quantity} onChange={e => setEditableMaterials(p => ({...p, [m.id!]: {...p[m.id!], quantity: Number(e.target.value)}}))} />
                    <span className="text-center text-xs text-slate-500">{m.unit}</span>
                    <Input type="number" className="h-8 text-center" value={m.rate} onChange={e => setEditableMaterials(p => ({...p, [m.id!]: {...p[m.id!], rate: Number(e.target.value)}}))} />
                    <span className="text-right font-black text-sm">₹{m.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(6)}>Back</Button>
                <Button onClick={() => setStep(8)}>Generate BOM</Button>
              </div>
            </motion.div>
          )}

          {/* STEP 8: INTERNAL BOM */}
          {step === 8 && (
            <motion.div key="s8" className="space-y-6">
              <div id="boq-pdf" className="bg-white border rounded-lg p-6 shadow-sm">
                 <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold">Material Breakdown</h2>
                    <div className="text-right text-xs text-slate-400">Area: {length*height} sqft</div>
                 </div>
                 <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                        <tr><th className="p-2 text-left">Item</th><th className="p-2 text-left">Description</th><th className="p-2">Qty</th><th className="p-2">Shop</th><th className="p-2 text-right">Amount</th></tr>
                    </thead>
                    <tbody>
                        {currentMaterials.map((m, i) => (
                            <tr key={i} className="border-b">
                                <td className="p-2">{m.name}</td><td className="p-2 text-sm">{m.id ? (materialDescriptions[m.id] || m.name) : m.name}</td><td className="p-2 text-center">{m.quantity} {m.unit}</td><td className="p-2 text-center">{m.shopName}</td><td className="p-2 text-right">₹{m.amount.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                 </table>
                 <div className="mt-4 text-right font-bold text-lg">Sub-Total: ₹{subTotal.toFixed(2)}</div>
              </div>
              <div className="flex justify-end gap-2">
                 <Button variant="outline" onClick={() => setStep(7)}>Back</Button>
                 <Button onClick={() => setStep(9)}>Finalize BOQ</Button>
              </div>
            </motion.div>
          )}

          {/* STEP 9: FINALIZE BOQ (Your exact Template) */}
          {step === 9 && (
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
                {selectedMaterialId && (<Input placeholder="Enter description for selected material" value={materialDescriptions[selectedMaterialId] || ""} onChange={(e) => setMaterialDescriptions((prev) => ({...prev,[selectedMaterialId]: e.target.value,}))} />)}
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
                      <tr style={{borderTop: "1px solid #000"}}><td><strong>Total</strong></td><td style={{ textAlign: "right" }}><strong>₹{Math.round(grandTotal).toFixed(2)}</strong></td></tr>
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