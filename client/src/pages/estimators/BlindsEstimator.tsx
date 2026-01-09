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
  
  const [step, setStep] = useState(1);
  
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
        description: mat?.description || "Window Blinds Component"
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
    const opt = {
      margin: 10,
      filename: `Blinds_BOQ_${Date.now()}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
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
                    <Button disabled={selectedMaterials.length === 0} onClick={() => setStep(3)}>Next: Review</Button>
                  </div>
                </motion.div>
              )}

              {/* STEP 3: REVIEW */}
              {step === 3 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                  <div className="grid grid-cols-4 gap-4 px-4 font-bold text-xs text-muted-foreground border-b pb-2">
                    <span>Item</span><span>Quantity</span><span>Rate (₹)</span><span className="text-right">Total</span>
                  </div>
                  {getMaterialsWithDetails().map(mat => (
                    <div key={mat.id} className="grid grid-cols-4 gap-4 items-center p-3 border rounded-lg bg-card shadow-sm">
                      <span className="text-sm font-medium">{mat.name}</span>
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
                  {/* ... (Manual Inputs for Bill No, Customer Name, etc. same as Doors Estimator) ... */}
                  <div id="boq-final-pdf" style={{ width: "210mm", minHeight: "297mm", padding: "20mm", background: "#fff", color: "#000", fontFamily: "Arial" }}>
                     {/* Invoice Header */}
                     <div className="flex justify-between items-start mb-10">
                        <img src={ctintLogo} style={{ height: 60 }} />
                        <div className="text-right">
                           <h1 className="text-4xl font-bold text-gray-800">INVOICE</h1>
                           <p>Bill No: {finalBillNo}</p>
                        </div>
                     </div>
                     
                     {/* Materials Table */}
                     <table className="w-full border-collapse mt-10">
                        <thead className="bg-black text-white">
                           <tr><th className="p-2 text-left">Item</th><th className="p-2">Qty</th><th className="p-2">Rate</th><th className="p-2 text-right">Total</th></tr>
                        </thead>
                        <tbody>
                           {getMaterialsWithDetails().map((m, i) => (
                              <tr key={i} className="border-b">
                                 <td className="p-2">{m.name}</td>
                                 <td className="p-2 text-center">{m.quantity}</td>
                                 <td className="p-2 text-center">{m.rate}</td>
                                 <td className="p-2 text-right">{(m.quantity * m.rate).toFixed(2)}</td>
                              </tr>
                           ))}
                        </tbody>
                     </table>

                     {/* Grand Total */}
                     <div className="flex justify-end mt-10">
                        <div className="w-64 space-y-2">
                           <div className="flex justify-between"><span>Subtotal:</span><span>₹{subTotal.toFixed(2)}</span></div>
                           <div className="flex justify-between font-bold text-xl border-t pt-2"><span>Total:</span><span>₹{grandTotal.toFixed(2)}</span></div>
                        </div>
                     </div>

                     <div className="mt-20">
                        <div className="w-48 border-t border-black pt-2 text-center">Authorized Signature</div>
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