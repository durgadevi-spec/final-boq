import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ChevronRight, 
  ChevronLeft, 
  Droplets, 
  CheckCircle2, 
  RotateCcw 
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

// Logo placeholder
const ctintLogo = "/image.png";

const PLUMBING_CONFIG = {
  hotwater: { label: "Hot Water System", requirements: [1, 2, 3, 4, 5] },
  coldwater: { label: "Cold Water System", requirements: [1, 2, 3] },
  drainage: { label: "Drainage System", requirements: [1, 2, 3, 4] },
  complete: { label: "Complete Setup", requirements: [1, 2, 3, 4, 5, 6, 7, 8] },
};

export default function PlumbingEstimator() {
  const { shops: storeShops, materials: storeMaterials } = useData();
  
  // --- States ---
  const [step, setStep] = useState(1);
  const [systemType, setSystemType] = useState<keyof typeof PLUMBING_CONFIG | null>(null);
  const [pipeLength, setPipeLength] = useState(50);
  const [fixtures, setFixtures] = useState(3);
  
  // Selection States
  const [selectedMaterials, setSelectedMaterials] = useState<{ materialId: string; selectedShopId: string }[]>([]);
  const [editableMaterials, setEditableMaterials] = useState<Record<string, { quantity: number; rate: number }>>({});

  // Final BOQ Manual Inputs (Step 9)
  const [finalBillNo, setFinalBillNo] = useState(`CT-${Math.floor(1000 + Math.random() * 9000)}`);
  const [finalBillDate, setFinalBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [finalDueDate, setFinalDueDate] = useState("");
  const [finalCustomerName, setFinalCustomerName] = useState("");
  const [finalCustomerAddress, setFinalCustomerAddress] = useState("");
  const [finalTerms, setFinalTerms] = useState("50% Advance, 50% on Delivery");
  // Material-wise descriptions
  const [materialDescriptions, setMaterialDescriptions] = useState<Record<string, string>>({});
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [finalShopDetails, setFinalShopDetails] = useState("Primary Warehouse\nChennai District");

  // --- Logic Helpers ---

  const availableMaterials = useMemo(() => {
    return storeMaterials.filter(m => m.category === "Plumbing");
  }, [storeMaterials]);

  const getDefaultQty = (mat: any) => {
    if (mat.code?.includes("PIPE")) return Math.ceil(pipeLength * 1.1);
    if (mat.code?.includes("FIXT")) return fixtures;
    return 1;
  };

  const getMaterialsWithDetails = () => {
    return selectedMaterials.map((sel) => {
      const mat = storeMaterials.find((m) => m.id === sel.materialId);
      const shop = storeShops.find((s) => s.id === sel.selectedShopId);
      const qty = (mat?.id ? editableMaterials[mat.id]?.quantity : undefined) ?? getDefaultQty(mat);
      const rate = (mat?.id ? editableMaterials[mat.id]?.rate : undefined) ?? (mat?.rate || 0);
      return { 
        ...mat, 
        quantity: qty, 
        rate: rate, 
        shopName: shop?.name || "Market", 
        amount: qty * rate 
      };
    });
  };

  const materials = getMaterialsWithDetails();
  const subTotal = materials.reduce((sum, m) => sum + m.amount, 0);
  const sgst = subTotal * 0.09;
  const cgst = subTotal * 0.09;
  const grandTotal = subTotal + sgst + cgst;
  const roundOff = Math.round(grandTotal) - grandTotal;

  // --- Handlers ---

  const handleToggleMaterial = (matId: string) => {
    const isSelected = selectedMaterials.find(s => s.materialId === matId);
    if (isSelected) {
      setSelectedMaterials(prev => prev.filter(s => s.materialId !== matId));
    } else {
      const mat = storeMaterials.find(m => m.id === matId);
      setSelectedMaterials(prev => [...prev, { materialId: matId, selectedShopId: mat?.shopId || "" }]);
    }
  };

  const handleExportFinalBOQ = () => {
    const element = document.getElementById("boq-final-pdf");
    if (!element) return;
    const opt = {
      margin: 0,
      filename: `BOQ_${finalBillNo}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().from(element).set(opt).save();
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto p-4 space-y-8">
        
        <AnimatePresence mode="wait">
          
          {/* STEP 1: SYSTEM SELECTION */}
          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(PLUMBING_CONFIG).map(([key, config]) => (
                <Card key={key} className={cn("cursor-pointer border-2 transition-all", systemType === key ? "border-primary bg-primary/5" : "")} onClick={() => setSystemType(key as any)}>
                  <CardContent className="p-6 flex items-center gap-4">
                    <Droplets className="text-primary" />
                    <div>
                      <p className="font-bold">{config.label}</p>
                      <p className="text-xs text-muted-foreground">{config.requirements.length} Required Items</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Button className="md:col-span-2 mt-4" disabled={!systemType} onClick={() => setStep(2)}>Next <ChevronRight className="ml-2 h-4 w-4" /></Button>
            </motion.div>
          )}

          {/* STEP 2: SPECS */}
          {step === 2 && (
            <motion.div key="s2" className="max-w-md mx-auto space-y-4 bg-white p-6 border rounded-xl shadow-sm">
              <h2 className="font-bold text-lg">System Specs</h2>
              <div className="space-y-2"><Label>Pipe Run (Meters)</Label><Input type="number" value={pipeLength} onChange={e => setPipeLength(Number(e.target.value))} /></div>
              <div className="space-y-2"><Label>Fixtures</Label><Input type="number" value={fixtures} onChange={e => setFixtures(Number(e.target.value))} /></div>
              <div className="flex gap-2 pt-4">
                <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Back</Button>
                <Button className="flex-1" onClick={() => setStep(6)}>Next</Button>
              </div>
            </motion.div>
          )}

          {/* STEP 6: MATERIAL & SHOP SELECTION */}
          {step === 6 && (
            <motion.div key="s6" className="space-y-4">
               <Label className="text-xl font-bold">Select Materials & Shops</Label>
              <div className="grid grid-cols-1 gap-3 max-h-[500px] overflow-y-auto p-2">
                {availableMaterials.map((mat) => {
                  const isSelected = selectedMaterials.some(m => m.materialId === mat.id);
                  const currentSelection = selectedMaterials.find(m => m.materialId === mat.id);
                  const shops = storeMaterials.filter(m => m.code === mat.code);

                  return (
                    <div key={mat.id} className={cn("p-4 border rounded-xl flex items-center gap-4 transition-all", isSelected ? "border-primary bg-primary/5" : "bg-white")}>
                      <Checkbox checked={isSelected} onCheckedChange={() => handleToggleMaterial(mat.id)} />
                      <div className="flex-1">
                        <p className="font-bold">{mat.name}</p>
                        <p className="text-[10px] text-muted-foreground">{mat.code}</p>
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
              <div className="flex justify-between border-t pt-4">
                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                <Button disabled={selectedMaterials.length === 0} onClick={() => setStep(7)}>Review Selection</Button>
              </div>
            </motion.div>
          )}

          {/* STEP 7: EDIT QUANTITIES */}
          {step === 7 && (
            <motion.div key="s7" className="space-y-4">
               <Label className="text-lg font-semibold">Review and Edit Selection</Label>
              <div className="bg-white border rounded-lg overflow-hidden">
                <div className="grid grid-cols-7 gap-2 p-3 bg-slate-900 text-white text-[10px] font-bold uppercase">
                  <div className="col-span-2">Item</div><div>Qty</div><div>Unit</div><div>Shop</div><div>Rate</div><div className="text-right">Total</div>
                </div>
                {materials.map((m) => (
                  <div key={m.id} className="grid grid-cols-7 gap-2 p-3 items-center border-b">
                    <div className="col-span-2 font-bold text-sm">{m.name}</div>
                    <Input type="number" className="h-8 text-center" value={m.quantity} onChange={e => setEditableMaterials(p => ({...p, [m.id!]: {...p[m.id!], quantity: Number(e.target.value)}}))} />
                    <div className="text-center text-xs text-slate-500">{m.unit}</div>
                    <div className="text-center text-[10px] font-bold text-blue-600">{m.shopName}</div>
                    <Input type="number" className="h-8 text-center" value={m.rate} onChange={e => setEditableMaterials(p => ({...p, [m.id!]: {...p[m.id!], rate: Number(e.target.value)}}))} />
                    <div className="text-right font-bold">₹{m.amount.toFixed(2)}</div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(6)}>Back</Button>
                <Button onClick={() => setStep(8)}>Generate BOM</Button>
              </div>
            </motion.div>
          )}

          {/* STEP 8: BOM SUMMARY */}
          {step === 8 && (
            <motion.div key="s8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                          <div className="text-center space-y-2">
                            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto"><CheckCircle2 size={32} /></div>
                            <h2 className="text-2xl font-bold">Bill of Materials (BOM)</h2>
                            <p className="text-sm text-slate-400">Generated on {new Date().toLocaleDateString()}</p>
                          </div>
            
                          <div id="boq-pdf" className="bg-white border rounded-lg p-6 shadow-sm font-sans">
                            <div className="grid grid-cols-2 gap-4 mb-4 border p-4 rounded bg-slate-50 text-sm">
                              <div><p className="text-slate-500 text-[10px] uppercase font-bold">Project</p><p className="font-bold">{systemType} Plumbing</p></div>
                              <div><p className="text-slate-500 text-[10px] uppercase font-bold">Scope</p><p className="font-bold">{pipeLength}m / {fixtures} Fix</p></div>
                            </div>
                            <table className="w-full border-collapse border border-slate-300 text-sm">
                              <thead className="bg-slate-100 font-bold uppercase text-[10px]">
                                <tr>{["S.No", "Description", "Unit", "Qty", "Rate", "Supplier", "Amount"].map(h => <th className="border p-2 text-left" key={h}>{h}</th>)}</tr>
                              </thead>
                              <tbody>
                                {getMaterialsWithDetails().map((m, i) => (
                                  <tr key={i} className="border-b">
                                    <td className="border p-2">{i+1}</td><td className="border p-2 font-medium">{m.name}</td><td className="border p-2">{m.unit}</td><td className="border p-2">{m.quantity}</td><td className="border p-2">{m.rate}</td><td className="border p-2 text-xs">{m.shopName}</td><td className="border p-2 text-right font-bold">{m.amount.toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div className="mt-4 p-4 bg-blue-50 flex justify-between rounded items-center">
                              <p className="font-bold text-blue-700">Total Material Cost</p>
                              <p className="text-2xl font-black text-blue-700">₹{subTotal.toFixed(2)}</p>
                            </div>
                          </div>
            
                          <div className="flex gap-4 justify-end pt-4">
                            <Button onClick={() => setStep(7)} variant="outline">Back</Button>
                            <Button onClick={() => setStep(9)} className="bg-indigo-600">Finalize BOQ</Button>
                          </div>
                        </motion.div>
                      )}
            
                     
          {/* STEP 9: FINALIZE BOQ (User Provided Template) */}
          {step === 9 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
              {/* MANUAL INPUTS */}
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
                  {materials.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
                </select>
                {selectedMaterialId && (<Input placeholder="Enter description for selected material" value={materialDescriptions[selectedMaterialId] || ""} onChange={(e) => setMaterialDescriptions((prev) => ({...prev,[selectedMaterialId]: e.target.value,}))} />)}
              </div>

              {/* PDF VIEW */}
              <div id="boq-final-pdf" style={{ width: "210mm", minHeight: "297mm", padding: "20mm", background: "#fff", color: "#000", fontFamily: "Arial", fontSize: 12 }}>
                
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
                    <div style={{ marginTop: 6 }}><strong>Customer Name</strong> : {finalCustomerName}</div>
                  </div>
                </div>

                {/* TABLE */}
                <table style={{ width: "100%", marginTop: 20, borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["S.No", "Item", "Description", "HSN", "Qty", "Rate", "Supplier", "Amount"].map(h => (
                        <th key={h} style={{ border: "1px solid #000", padding: 6, background: "#000", color: "#fff", fontSize: 11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {materials.map((m, i) => (
                      <tr key={m.id}>
                        <td style={{ border: "1px solid #000", padding: 6 }}>{i + 1}</td>
                        <td style={{ border: "1px solid #000", padding: 6 }}>{m.name}</td>
                        <td style={{ border: "1px solid #000", padding: 6 }}>{m.id ? (materialDescriptions[m.id] || m.name || "-") : (m.name || "-")}</td>
                        <td style={{ border: "1px solid #000", padding: 6 }}>7308</td>
                        <td style={{ border: "1px solid #000", padding: 6 }}>{m.quantity}</td>
                        <td style={{ border: "1px solid #000", padding: 6 }}>{m.rate}</td>
                        <td style={{ border: "1px solid #000", padding: 6 }}>{m.shopName}</td>
                        <td style={{ border: "1px solid #000", padding: 6, textAlign: "right" }}>{(m.quantity * m.rate).toFixed(2)}</td>
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
      </div>
    </Layout>
  );
}