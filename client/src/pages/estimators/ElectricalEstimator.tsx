import React, { useState, useMemo, useEffect } from "react";
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
import { cn } from "@/lib/utils";
import { useData, Material } from "@/lib/store";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ChevronRight, 
  ChevronLeft, 
  Download, 
  CheckCircle2, 
  Zap, 
  Search 
} from "lucide-react";
import html2pdf from "html2pdf.js";

const ctintLogo = "/image.png";

interface SelectedMaterialConfig {
  materialId: string;
  selectedShopId: string;
}

export default function ElectricalEstimator() {
  const { materials: storeMaterials, shops: storeShops } = useData();
  
  // Navigation & Inputs
  const [step, setStep] = useState(1);
  const [phaseType, setPhaseType] = useState<"single" | "three" | null>(null);
  const [rooms, setRooms] = useState<number>(1);
  const [avgRoomSize, setAvgRoomSize] = useState<number>(120);
  const [pointsPerRoom, setPointsPerRoom] = useState<number>(6);
  const [searchTerm, setSearchTerm] = useState("");

  // Material Logic
  const [selectedMaterials, setSelectedMaterials] = useState<SelectedMaterialConfig[]>([]);
  const [editableMaterials, setEditableMaterials] = useState<Record<string, { quantity: number; rate: number }>>({});

  // Final BOQ Fields (Updated to match Step 9 requirements)
  const [finalBillNo, setFinalBillNo] = useState(`ELE-${Date.now().toString().slice(-6)}`);
  const [finalBillDate, setFinalBillDate] = useState(new Date().toISOString().slice(0, 10));
  const [finalDueDate, setFinalDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [finalCustomerName, setFinalCustomerName] = useState("");
  const [finalCustomerAddress, setFinalCustomerAddress] = useState("");
  const [finalShopDetails, setFinalShopDetails] = useState("");
  const [finalTerms, setFinalTerms] = useState("1. Goods once sold will not be taken back.\n2. Interest @18% will be charged if payment is not made within due date.");

  // --- LOGIC: FETCH ELECTRICAL MATERIALS ---
  const availableMaterials = useMemo(() => {
    const keywords = ["WIRE", "SWITCH", "SOCKET", "MCB", "CONDUIT", "PVC", "ELECTRICAL", "DB"];
    const normalize = (s: string) => s.toUpperCase();
    
    const candidates = storeMaterials.filter(m => {
      const text = normalize(`${m.name} ${m.category} ${m.subCategory || ""}`);
      return keywords.some(kw => text.includes(kw));
    });

    const map = new Map<string, Material>();
    candidates.forEach(mat => {
      const key = mat.code?.toUpperCase() || mat.name.toUpperCase();
      const existing = map.get(key);
      if (!existing || mat.rate < existing.rate) map.set(key, mat);
    });
    return Array.from(map.values());
  }, [storeMaterials]);

  const getBestShop = (code: string) => {
    const options = storeMaterials
      .filter(m => m.code?.toUpperCase() === code.toUpperCase())
      .sort((a, b) => a.rate - b.rate);
    return options.length > 0 ? options[0] : null;
  };

  const calculateQty = (mat: Material) => {
    const totalPoints = rooms * pointsPerRoom;
    const name = mat.name.toUpperCase();
    if (name.includes("WIRE")) return Math.ceil((totalPoints * 18) / 90);
    if (name.includes("SWITCH") || name.includes("SOCKET")) return totalPoints;
    if (name.includes("CONDUIT")) return Math.ceil((rooms * avgRoomSize) * 0.25);
    return totalPoints;
  };

  const handleToggleMaterial = (matId: string) => {
    const isSelected = selectedMaterials.find(s => s.materialId === matId);
    if (isSelected) {
      setSelectedMaterials(prev => prev.filter(s => s.materialId !== matId));
    } else {
      const mat = storeMaterials.find(m => m.id === matId);
      const best = getBestShop(mat?.code || "");
      if (best) {
        setSelectedMaterials(prev => [...prev, { materialId: matId, selectedShopId: best.shopId }]);
      }
    }
  };

  useEffect(() => {
    if (step === 4) {
      const map: Record<string, { quantity: number; rate: number }> = {};
      selectedMaterials.forEach(sel => {
        const mat = storeMaterials.find(m => m.id === sel.materialId);
        const shopMat = storeMaterials.find(m => m.code === mat?.code && m.shopId === sel.selectedShopId);
        map[sel.materialId] = {
          quantity: calculateQty(mat!),
          rate: shopMat?.rate || mat?.rate || 0
        };
      });
      setEditableMaterials(map);
    }
  }, [step]);

  const getProcessedItems = () => {
    return selectedMaterials.map(sel => {
      const mat = storeMaterials.find(m => m.id === sel.materialId);
      const shop = storeShops.find(s => s.id === sel.selectedShopId);
      const edit = editableMaterials[sel.materialId] || { quantity: 0, rate: 0 };
      return {
        ...mat,
        quantity: edit.quantity,
        rate: edit.rate,
        shopName: shop?.name || "Unknown",
        amount: edit.quantity * edit.rate
      };
    });
  };

  // Calculations for Step 9 UI
  const materials = getProcessedItems();
  const subTotal = materials.reduce((acc, item) => acc + item.amount, 0);
  const sgst = subTotal * 0.09;
  const cgst = subTotal * 0.09;
  const totalWithTax = subTotal + sgst + cgst;
  const grandTotal = Math.round(totalWithTax);
  const roundOff = grandTotal - totalWithTax;

  const handleExportFinalBOQ = () => {
    const element = document.getElementById("boq-final-pdf");
    html2pdf().set({
      margin: 0,
      filename: `Electrical_Invoice_${finalBillNo}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(element).save();
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8 py-10">
        <div className="flex items-center gap-4">
          <div className="bg-yellow-500 p-3 rounded-full text-white"><Zap size={32} /></div>
          <div>
            <h2 className="text-3xl font-bold">Electrical Estimator</h2>
            <p className="text-muted-foreground">Professional Billing & BOQ Generation</p>
          </div>
        </div>

        <Card className="border-border/50 min-h-[500px]">
          <CardContent className="pt-8">
            <AnimatePresence mode="wait">
              
              {/* STEPS 1-5 remain unchanged as requested */}
              {step === 1 && (
                <motion.div key="s1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  <Label className="text-lg font-semibold">Select Connection Type</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <Button variant={phaseType === 'single' ? "default" : "outline"} className="h-24 text-lg" onClick={() => setPhaseType('single')}>Single Phase</Button>
                    <Button variant={phaseType === 'three' ? "default" : "outline"} className="h-24 text-lg" onClick={() => setPhaseType('three')}>Three Phase</Button>
                  </div>
                  <div className="flex justify-end"><Button disabled={!phaseType} onClick={() => setStep(2)}>Next <ChevronRight /></Button></div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div key="s2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  <div className="grid grid-cols-3 gap-6">
                    <div className="space-y-2"><Label>No. of Rooms</Label><Input type="number" value={rooms} onChange={e => setRooms(Number(e.target.value))} /></div>
                    <div className="space-y-2"><Label>Avg Sqft/Room</Label><Input type="number" value={avgRoomSize} onChange={e => setAvgRoomSize(Number(e.target.value))} /></div>
                    <div className="space-y-2"><Label>Points/Room</Label><Input type="number" value={pointsPerRoom} onChange={e => setPointsPerRoom(Number(e.target.value))} /></div>
                  </div>
                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setStep(1)}><ChevronLeft /> Back</Button>
                    <Button onClick={() => setStep(3)}>Next <ChevronRight /></Button>
                  </div>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div key="s3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                  <Label className="text-lg font-semibold">Select Materials & Shops</Label>
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-3 text-slate-400 w-4 h-4" />
                    <Input className="pl-10" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                  </div>
                  <div className="space-y-3 max-h-96 overflow-y-auto border rounded-lg p-4">
                    {availableMaterials.filter(m => m.name.toUpperCase().includes(searchTerm.toUpperCase())).map(mat => {
                      const isSelected = selectedMaterials.some(s => s.materialId === mat.id);
                      const current = selectedMaterials.find(s => s.materialId === mat.id);
                      const shops = storeMaterials.filter(m => m.code === mat.code).sort((a,b) => a.rate - b.rate);

                      return (
                        <div key={mat.id} className="border rounded-lg p-4 hover:bg-muted/50 flex items-start gap-4">
                          <Checkbox checked={isSelected} onCheckedChange={() => handleToggleMaterial(mat.id)} />
                          <div className="flex-1">
                            <p className="font-bold">{mat.name}</p>
                            <p className="text-xs text-muted-foreground">{mat.code}</p>
                            {isSelected && (
                              <div className="mt-3 space-y-2">
                                <Label className="text-xs">Select Shop:</Label>
                                <Select value={current?.selectedShopId} onValueChange={(val) => setSelectedMaterials(p => p.map(s => s.materialId === mat.id ? {...s, selectedShopId: val} : s))}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {shops.map(s => (
                                      <SelectItem key={s.shopId} value={s.shopId}>
                                        {storeShops.find(sh => sh.id === s.shopId)?.name} - ₹{s.rate} {s.rate === shops[0].rate && "(Best)"}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-6">
                    <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                    <Button disabled={selectedMaterials.length === 0} onClick={() => setStep(4)}>Review Quantities</Button>
                  </div>
                </motion.div>
              )}

              {step === 4 && (
                <motion.div key="s4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                  <Label className="text-lg font-semibold">Selected Materials</Label>
                  <div className="grid grid-cols-7 gap-2 p-2 text-xs font-bold text-muted-foreground border-b">
                    <div className="col-span-2">Item</div>
                    <div className="text-center">Qty</div>
                    <div className="text-center">Unit</div>
                    <div className="text-center">Shop</div>
                    <div className="text-center">Rate</div>
                    <div className="text-right">Total</div>
                  </div>
                  {materials.map(mat => (
                    <div key={mat.id} className="grid grid-cols-7 gap-2 items-center p-2 border-b">
                      <div className="col-span-2 text-sm font-medium">{mat.name}</div>
                      <Input type="number" className="h-8" value={editableMaterials[mat.id!]?.quantity} onChange={e => setEditableMaterials(p => ({...p, [mat.id!]: {...p[mat.id!], quantity: Number(e.target.value)}}))} />
                      <div className="text-center text-xs">{mat.unit}</div>
                      <div className="text-center text-xs">{mat.shopName}</div>
                      <Input type="number" className="h-8" value={editableMaterials[mat.id!]?.rate} onChange={e => setEditableMaterials(p => ({...p, [mat.id!]: {...p[mat.id!], rate: Number(e.target.value)}}))} />
                      <div className="text-right font-bold">₹{(mat.amount || 0).toFixed(2)}</div>
                    </div>
                  ))}
                  <div className="flex justify-between pt-6">
                    <Button variant="outline" onClick={() => setStep(3)}>Back</Button>
                    <Button onClick={() => setStep(5)}>Generate BOM</Button>
                  </div>
                </motion.div>
              )}

              {step === 5 && (
                <motion.div key="s5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                   <div className="text-center space-y-2">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto text-green-600"><CheckCircle2 size={32} /></div>
                    <h2 className="text-2xl font-bold">Bill of Materials (BOM)</h2>
                  </div>

                  <div id="bom-pdf" className="bg-white p-6 border rounded-lg text-black">
                    <table className="w-full border-collapse text-sm">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="border p-2 text-left">S.No</th>
                          <th className="border p-2 text-left">Description</th>
                          <th className="border p-2 text-center">Qty</th>
                          <th className="border p-2 text-right">Rate</th>
                          <th className="border p-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {materials.map((m, i) => (
                          <tr key={m.id} className="border">
                            <td className="p-2 border">{i+1}</td>
                            <td className="p-2 border font-medium">{m.name}</td>
                            <td className="p-2 border text-center">{m.quantity} {m.unit}</td>
                            <td className="p-2 border text-right">₹{m.rate}</td>
                            <td className="p-2 border text-right font-bold">₹{(m.amount || 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setStep(4)}>Back</Button>
                    <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setStep(6)}>Finalize BOQ</Button>
                  </div>
                </motion.div>
              )}

              {/* ================= UPDATED STEP 6 (USING STEP 9 LOGIC) ================= */}
              {step === 6 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  
                  {/* MANUAL INPUTS */}
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
                      <Label>Customer Address</Label>
                      <Input value={finalCustomerAddress} onChange={(e) => setFinalCustomerAddress(e.target.value)} />
                    </div>
                  </div>

                  <div>
                    <Label>Terms & Conditions</Label>
                    <Input value={finalTerms} onChange={(e) => setFinalTerms(e.target.value)} />
                  </div>

                  {/* PDF CONTAINER */}
                  <div id="boq-final-pdf" style={{ width: "210mm", minHeight: "297mm", padding: "20mm", background: "#fff", color: "#000", fontFamily: "Arial", fontSize: 12 }}>
                    
                    {/* HEADER */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <img src={ctintLogo} alt="Logo" style={{ height: 60 }} />
                      <div style={{ textAlign: "right" }}>
                        <h2 style={{ margin: 0, fontWeight: 900 }}>BILL</h2>
                        <div>Bill No: {finalBillNo}</div>
                      </div>
                    </div>

                    <hr style={{ margin: "10px 0", border: "1px solid #000" }} />

                    {/* COMPANY + META */}
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
                      <div style={{ width: "55%", lineHeight: 1.5 }}>
                        <strong>Concept Trunk Interiors</strong><br />
                        12/36A, Indira Nagar, Medavakkam<br />
                        Chennai – 600100<br />
                        GSTIN: 33ASOPS5560M1Z1<br /><br />
                        <strong>Bill From</strong><br />
                        <pre style={{ margin: 0, fontFamily: "Arial", whiteSpace: "pre-wrap" }}>{finalShopDetails || "Concept Trunk Interiors Warehouse"}</pre>
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
                          {["S.No", "Item", "Description", "HSN", "Qty", "Rate", "Supplier", "Customer", "Amount"].map(h => (
                            <th key={h} style={{ border: "1px solid #000", padding: 6, background: "#000", color: "#fff", fontSize: 10 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {materials.map((m, i) => (
                          <tr key={m.id}>
                            <td style={{ border: "1px solid #000", padding: 6 }}>{i + 1}</td>
                            <td style={{ border: "1px solid #000", padding: 6 }}>{m.name}</td>
                            <td style={{ border: "1px solid #000", padding: 6 }}>{m.subCategory || "Electrical"}</td>
                            <td style={{ border: "1px solid #000", padding: 6 }}>8536</td>
                            <td style={{ border: "1px solid #000", padding: 6 }}>{m.quantity}</td>
                            <td style={{ border: "1px solid #000", padding: 6 }}>{Number(m.rate).toFixed(2)}</td>
                            <td style={{ border: "1px solid #000", padding: 6 }}>{m.shopName}</td>
                            <td style={{ border: "1px solid #000", padding: 6 }}>{finalCustomerName}</td>
                            <td style={{ border: "1px solid #000", padding: 6, textAlign: "right" }}>{(m.amount || 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* TOTALS */}
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                      <table style={{ width: 300, borderCollapse: "collapse" }}>
                        <tbody>
                          <tr><td style={{ padding: 4 }}>Sub Total</td><td style={{ textAlign: "right", padding: 4 }}>{subTotal.toFixed(2)}</td></tr>
                          <tr><td style={{ padding: 4 }}>SGST 9%</td><td style={{ textAlign: "right", padding: 4 }}>{sgst.toFixed(2)}</td></tr>
                          <tr><td style={{ padding: 4 }}>CGST 9%</td><td style={{ textAlign: "right", padding: 4 }}>{cgst.toFixed(2)}</td></tr>
                          <tr><td style={{ padding: 4 }}>Round Off</td><td style={{ textAlign: "right", padding: 4 }}>{roundOff.toFixed(2)}</td></tr>
                          <tr style={{ background: "#f8fafc" }}>
                            <td style={{ padding: 8 }}><strong>Total</strong></td>
                            <td style={{ textAlign: "right", padding: 8 }}><strong>₹{grandTotal.toFixed(2)}</strong></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* SIGNATURE */}
                    <div style={{ marginTop: 50 }}>
                      <div style={{ width: 200, borderTop: "1px solid #000" }} />
                      <div style={{ fontWeight: "bold", fontSize: 10, marginTop: 4 }}>Authorized Signature</div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button onClick={() => setStep(5)} variant="outline">Back</Button>
                    <Button onClick={handleExportFinalBOQ} className="bg-green-600 hover:bg-green-700">Export PDF</Button>
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