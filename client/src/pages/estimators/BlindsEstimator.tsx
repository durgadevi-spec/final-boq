import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useData } from "@/lib/store";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Download, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import html2pdf from "html2pdf.js";

const ctintLogo = "/image.png";

export default function BlindsEstimator() {
  // Pulling directly from your global store
  const { shops: storeShops, materials: storeMaterials } = useData();
  // Material-wise descriptions
  const [materialDescriptions, setMaterialDescriptions] = useState<Record<string, string>>({});
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  
  const [step, setStep] = useState(1);
  
  // Final Invoice States
  const [finalCustomerName, setFinalCustomerName] = useState<string>("");
  const [finalTerms, setFinalTerms] = useState<string>("50% Advance and 50% on Completion");
  const [finalBillNo, setFinalBillNo] = useState<string>("");
  const [finalBillDate, setFinalBillDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [finalDueDate, setFinalDueDate] = useState<string>("");
  const [finalShopDetails, setFinalShopDetails] = useState<string>("Primary Warehouse\nChennai District");
  
  // Selection States
  const [blindType, setBlindType] = useState<string>("Roller Blinds");
  const [width, setWidth] = useState<number>(4);
  const [height, setHeight] = useState<number>(5);
  const [count, setCount] = useState<number>(1);
  const [selectedMaterials, setSelectedMaterials] = useState<{materialId: string, selectedShopId: string}[]>([]);
  const [editableMaterials, setEditableMaterials] = useState<Record<string, { quantity: number; rate: number }>>({});

  // 1. FILTER LOGIC: Robust case-insensitive filtering
  const availableBlinds = storeMaterials.filter(m => 
    m.category?.toLowerCase() === "blinds" || 
    m.subCategory?.toLowerCase() === "blinds" ||
    m.name?.toLowerCase().includes("blind")
  );

  // 2. SHOP LOGIC: Find shops that actually sell this specific material
  const getBestShop = (materialName: string) => {
    const variants = storeMaterials.filter((m) => m.name === materialName);
    return variants.length > 0 ? variants.reduce((p, c) => (p.rate < c.rate ? p : c)) : null;
  };

  const calculateTotalCost = () => {
    return getMaterialsWithDetails().reduce((sum, m) => sum + (m.quantity * m.rate), 0);
  };

  const getMaterialsWithDetails = () => {
    const area = (width || 0) * (height || 0) * (count || 1);
    
    return selectedMaterials.map(sel => {
      const mat = storeMaterials.find(m => m.id === sel.materialId);
      const shop = storeShops.find(s => s.id === sel.selectedShopId);
      const override = editableMaterials[mat?.id || ""];
      
      // Logic: Kits are per unit, Fabrics are per sqft
      let calculatedQty = (mat?.unit?.toLowerCase() === "nos" || mat?.name?.toLowerCase().includes("kit")) 
        ? (count || 1) 
        : area;

      return {
        ...mat,
        quantity: override?.quantity ?? Math.ceil(calculatedQty),
        rate: override?.rate ?? mat?.rate ?? 0,
        shopName: shop?.name || "Market Price",
        description: mat?.name || "Window Blinds Component"
      };
    }).filter(m => m.id);
  };

  // Financials
  const subTotal = calculateTotalCost();
  const sgst = subTotal * 0.09;
  const cgst = subTotal * 0.09;
  const grandTotal = subTotal + sgst + cgst;

  const handleExportPDF = (elementId: string) => {
    const element = document.getElementById(elementId);
    if (!element) return;
    const opt = {
      margin: 10,
      filename: `Blinds_BOQ_${Date.now()}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    html2pdf().from(element).set(opt).save();
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8 pb-20">
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Blinds Estimator</h2>
            <p className="text-muted-foreground mt-1">Select materials below to generate BOQ</p>
          </div>
          <div className="text-sm bg-muted px-3 py-1 rounded-full font-medium">
            Step {step} of 5
          </div>
        </div>

        <Card className="shadow-xl border-t-4 border-t-primary">
          <CardContent className="pt-8">
            <AnimatePresence mode="wait">
              
              {/* STEP 1: DIMENSIONS */}
              {step === 1 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <Label>Blind Type</Label>
                        <Select value={blindType} onValueChange={setBlindType}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Roller Blinds">Roller Blinds</SelectItem>
                                <SelectItem value="Venetian Blinds">Venetian Blinds</SelectItem>
                                <SelectItem value="Roman Blinds">Roman Blinds</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2"><Label>Width (ft)</Label><Input type="number" value={width} onChange={e => setWidth(Number(e.target.value))} /></div>
                        <div className="space-y-2"><Label>Height (ft)</Label><Input type="number" value={height} onChange={e => setHeight(Number(e.target.value))} /></div>
                        <div className="space-y-2"><Label>Qty</Label><Input type="number" value={count} onChange={e => setCount(Number(e.target.value))} /></div>
                    </div>
                  </div>
                  <Button className="w-full h-12" onClick={() => setStep(2)}>Next: Select Materials</Button>
                </motion.div>
              )}

              {/* STEP 2: MATERIAL SELECTION (FIXED FILTER) */}
              {step === 2 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                  <Label className="text-lg font-bold">Select Blinds Materials ({availableBlinds.length} found)</Label>
                  <div className="grid gap-3">
                    {availableBlinds.length > 0 ? (
                      availableBlinds.map(mat => (
                        <div key={mat.id} className="flex items-center justify-between p-4 border rounded-xl hover:bg-muted/30 transition-all">
                          <div className="flex items-center gap-4">
                            <Checkbox 
                              checked={selectedMaterials.some(s => s.materialId === mat.id)} 
                              onCheckedChange={(checked) => {
                                if(checked) setSelectedMaterials([...selectedMaterials, { materialId: mat.id, selectedShopId: getBestShop(mat.name)?.shopId || "" }]);
                                else setSelectedMaterials(selectedMaterials.filter(s => s.materialId !== mat.id));
                              }} 
                            />
                            <div>
                              <p className="font-semibold">{mat.name}</p>
                              <p className="text-xs text-primary italic">₹{mat.rate} per {mat.unit}</p>
                            </div>
                          </div>
                          <Select 
                            value={selectedMaterials.find(s => s.materialId === mat.id)?.selectedShopId} 
                            onValueChange={(val) => setSelectedMaterials(selectedMaterials.map(s => s.materialId === mat.id ? {...s, selectedShopId: val} : s))}
                          >
                            <SelectTrigger className="w-48"><SelectValue placeholder="Select Shop" /></SelectTrigger>
                            <SelectContent>
                              {storeShops.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      ))
                    ) : (
                      <div className="p-10 text-center border-2 border-dashed rounded-xl">
                        <p className="text-muted-foreground">No materials found in 'Blinds' category.</p>
                        <p className="text-xs mt-2">Check your Data Manager settings.</p>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between pt-6">
                    <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                    <Button onClick={() => setStep(3)}>Next: Review</Button>
                  </div>
                </motion.div>
              )}

              {/* STEP 3: REVIEW */}
              {step === 3 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                  <div className="grid grid-cols-5 gap-4 px-4 font-bold text-xs text-muted-foreground border-b pb-2">
                    <span>Item</span><span>Description</span><span>Quantity</span><span>Rate (₹)</span><span className="text-right">Total</span>
                  </div>
                  {getMaterialsWithDetails().map(mat => (
                    <div key={mat.id} className="grid grid-cols-5 gap-4 items-center p-3 border rounded-lg bg-card shadow-sm">
                      <span className="text-sm font-medium">{mat.name}</span>
                      <span className="text-xs">{mat.id ? (materialDescriptions[mat.id] || mat.name) : mat.name}</span>
                      <Input type="number" value={mat.quantity} onChange={e => setEditableMaterials({...editableMaterials, [mat.id!]: {...editableMaterials[mat.id!], quantity: Number(e.target.value)}})} />
                      <Input type="number" value={mat.rate} onChange={e => setEditableMaterials({...editableMaterials, [mat.id!]: {...editableMaterials[mat.id!], rate: Number(e.target.value)}})} />
                      <span className="text-right font-bold">{(mat.quantity * mat.rate).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-6"><Button variant="outline" onClick={() => setStep(2)}>Back</Button><Button onClick={() => setStep(4)}>Generate BOM</Button></div>
                </motion.div>
              )}

              {/* STEP 4: BOM SUMMARY */}
              {step === 4 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  <div className="text-center">
                    <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-2" />
                    <h2 className="text-2xl font-bold">BOM Generated</h2>
                  </div>
                  <div id="boq-pdf" className="bg-white text-black p-8 rounded border shadow-inner font-sans">
                     <h3 className="text-xl font-bold border-b-2 border-black mb-4 pb-2">Material Schedule: {blindType}</h3>
                     <table className="w-full border-collapse">
                        <thead className="bg-gray-100">
                           <tr>
                              <th className="border p-2 text-left">Description</th>
                              <th className="border p-2">Qty</th>
                              <th className="border p-2">Supplier</th>
                              <th className="border p-2 text-right">Amount</th>
                           </tr>
                        </thead>
                        <tbody>
                           {getMaterialsWithDetails().map((m, i) => (
                              <tr key={i}>
                                 <td className="border p-2">{m.name}</td>
                                 <td className="border p-2 text-center">{m.quantity}</td>
                                 <td className="border p-2">{m.shopName}</td>
                                 <td className="border p-2 text-right">{(m.quantity * m.rate).toFixed(2)}</td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
                  <div className="flex justify-between border-t pt-4">
                    <Button variant="outline" onClick={() => setStep(3)}>Back</Button>
                    <div className="flex gap-2">
                       <Button onClick={() => handleExportPDF("boq-pdf")} className="bg-blue-600"><Download className="mr-2 h-4 w-4"/> PDF</Button>
                       <Button onClick={() => setStep(5)} className="bg-indigo-600">Finalize BOQ</Button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* STEP 5: FINAL INVOICE */}
              {step === 5 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  {/* Manual Inputs */}
                  <div className="grid grid-cols-3 gap-4">
                    <div><Label>Bill No</Label><Input value={finalBillNo} onChange={e => setFinalBillNo(e.target.value)} /></div>
                    <div><Label>Bill Date</Label><Input type="date" value={finalBillDate} onChange={e => setFinalBillDate(e.target.value)} /></div>
                    <div><Label>Due Date</Label><Input type="date" value={finalDueDate} onChange={e => setFinalDueDate(e.target.value)} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Customer Name</Label><Input value={finalCustomerName} onChange={e => setFinalCustomerName(e.target.value)} /></div>
                    <div><Label>Terms & Conditions</Label><Input value={finalTerms} onChange={e => setFinalTerms(e.target.value)} /></div>
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

                  <div id="boq-final-pdf" style={{ width: "210mm", minHeight: "297mm", padding: "20mm", background: "#fff", color: "#000", fontFamily: "Arial" }}>
                     {/* HEADER */}
                     <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
                       {/* LEFT */}
                       <div style={{ width: "55%", lineHeight: 1.5, display: "flex", gap: 12 }}>
                         <img src={ctintLogo} alt="Logo" style={{ height: 56, flexShrink: 0 }} />
                         <div>
                           <strong>Concept Trunk Interiors</strong><br />
                           12/36A, Indira Nagar<br />
                           Medavakkam<br />
                           Chennai – 600100<br />
                           GSTIN: 33ASOPS5560M1Z1

                           <br /><br />

                           <strong>Bill From</strong><br />
                           <pre style={{ margin: 0, fontFamily: "Arial", whiteSpace: "pre-wrap" }}>
                             {finalShopDetails || "Primary Warehouse\nChennai District"}
                           </pre>
                         </div>
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
                              {["S.No", "Item", "Description", "Qty", "Rate", "Supplier", "Amount"].map(h => (
                                 <th key={h} style={{border: "1px solid #000", padding: 6, background: "#000", color: "#fff", fontSize: 11}}>{h}</th>
                              ))}
                           </tr>
                        </thead>
                        <tbody>
                           {getMaterialsWithDetails().map((m, i) => (
                              <tr key={i}>
                                 <td style={{border: "1px solid #000", padding: 6}}>{i + 1}</td>
                                 <td style={{border: "1px solid #000", padding: 6}}>{m.name}</td>
                                 <td style={{border: "1px solid #000", padding: 6}}>{m.id ? (materialDescriptions[m.id] || m.name) : m.name}</td>
                                 <td style={{border: "1px solid #000", padding: 6}}>{m.quantity}</td>
                                 <td style={{border: "1px solid #000", padding: 6}}>{m.rate}</td>
                                 <td style={{border: "1px solid #000", padding: 6}}>{m.shopName}</td>
                                 <td style={{border: "1px solid #000", padding: 6, textAlign: "right"}}>{(m.quantity * m.rate).toFixed(2)}</td>
                              </tr>
                           ))}
                        </tbody>
                     </table>

                     {/* TOTALS */}
                     <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                        <table style={{ width: 300 }}>
                          <tbody>
                            <tr><td>Sub Total</td><td style={{ textAlign: "right" }}>{subTotal.toFixed(2)}</td></tr>
                            <tr><td>SGST 9%</td><td style={{ textAlign: "right" }}>{(subTotal * 0.09).toFixed(2)}</td></tr>
                            <tr><td>CGST 9%</td><td style={{ textAlign: "right" }}>{(subTotal * 0.09).toFixed(2)}</td></tr>
                            <tr><td>Round Off</td><td style={{ textAlign: "right" }}>{(Math.round(grandTotal) - grandTotal).toFixed(2)}</td></tr>
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
                  <Button onClick={() => handleExportPDF("boq-final-pdf")} className="w-full h-12">Export Final Invoice</Button>
                </motion.div>
              )}

            </AnimatePresence>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}