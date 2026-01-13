import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useData } from "@/lib/store";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Download, ChevronLeft } from "lucide-react";
import html2pdf from "html2pdf.js";

const ctintLogo = "/image.png";

export default function FlooringEstimator() {
  const { shops: storeShops, materials: storeMaterials } = useData();
  const [step, setStep] = useState(1);
  
  // Selection States
  const [areaName, setAreaName] = useState("Living Room");
  const [length, setLength] = useState<number>(10);
  const [width, setWidth] = useState<number>(10);
  const [selectedMaterials, setSelectedMaterials] = useState<{materialId: string, selectedShopId: string}[]>([]);
  const [editableMaterials, setEditableMaterials] = useState<Record<string, { quantity: number; rate: number }>>({});

  // Final BOQ States
  const [finalBillNo, setFinalBillNo] = useState(`INV-${Date.now().toString().slice(-6)}`);
  const [finalBillDate, setFinalBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [finalDueDate, setFinalDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [finalCustomerName, setFinalCustomerName] = useState("");
  const [finalCustomerAddress, setFinalCustomerAddress] = useState("");
  const [finalTerms, setFinalTerms] = useState("Payment due within 15 days");
  const [finalShopDetails, setFinalShopDetails] = useState("");
  // Material-wise descriptions
  const [materialDescriptions, setMaterialDescriptions] = useState<Record<string, string>>({});
  const [selectedMaterialId, setSelectedMaterialId] = useState("");

  const availableFlooring = storeMaterials.filter(m => m.category?.toLowerCase() === "flooring");

  const getBestShop = (materialName: string) => {
    const variants = storeMaterials.filter((m) => m.name === materialName);
    return variants.length > 0 ? variants.reduce((p, c) => (p.rate < c.rate ? p : c)) : null;
  };

  const calculateQty = () => Math.ceil((length * width) * 1.10);

  const getMaterialsWithDetails = () => {
    return selectedMaterials.map(sel => {
      const mat = storeMaterials.find(m => m.id === sel.materialId);
      const shop = storeShops.find(s => s.id === sel.selectedShopId);
      const override = editableMaterials[mat?.id || ""];
      return {
        ...mat,
        quantity: override?.quantity ?? calculateQty(),
        rate: override?.rate ?? mat?.rate ?? 0,
        shopName: shop?.name || "Unknown",
        description: mat?.name || "Flooring Material"
      };
    }).filter(m => m.id);
  };

  const calculateTotalCost = () => getMaterialsWithDetails().reduce((sum, m) => sum + (m.quantity * m.rate), 0);

  // Financials for Step 5
  const subTotal = calculateTotalCost();
  const sgst = subTotal * 0.09;
  const cgst = subTotal * 0.09;
  const grandTotal = subTotal + sgst + cgst;
  const roundOff = Math.round(grandTotal) - grandTotal;

  const handleExportPDF = () => {
    const element = document.getElementById(step === 4 ? "boq-pdf" : "boq-final-pdf");
    if (!element) return;
    html2pdf().from(element as HTMLElement).save(`Flooring_BOQ_${finalCustomerName || 'Estimate'}.pdf`);
  };

  useEffect(() => {
    if (step === 5) {
      const first = getMaterialsWithDetails()[0];
      const shop = storeShops.find((s) => s.id === first?.shopId);
      if (shop) {
        const parts = [shop.name || "", shop.address || "", shop.area || "", shop.city || "", shop.state || "", shop.pincode || "", shop.gstNo ? `GSTIN: ${shop.gstNo}` : "", shop.phone || ""].filter(Boolean);
        setFinalShopDetails(parts.join("\n"));
      }
    }
  }, [step, selectedMaterials, storeShops]);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8 pb-20">
        <h2 className="text-3xl font-bold">Flooring Estimator</h2>

        <Card>
          <CardContent className="pt-8">
            <AnimatePresence mode="wait">
              
              {/* STEP 1: Dimensions */}
              {step === 1 && (
                <div className="space-y-4">
                  <Label className="text-lg font-bold">Step 1: Project Area & Size</Label>
                  <Input placeholder="Area Name" value={areaName} onChange={e => setAreaName(e.target.value)} />
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Length (ft)</Label><Input type="number" value={length} onChange={e => setLength(Number(e.target.value))} /></div>
                    <div><Label>Width (ft)</Label><Input type="number" value={width} onChange={e => setWidth(Number(e.target.value))} /></div>
                  </div>
                  <Button className="w-full" onClick={() => setStep(2)}>Next</Button>
                </div>
              )}

              {/* STEP 2: Selection */}
              {step === 2 && (
                <div className="space-y-4">
                  <Label className="text-lg font-bold">Step 2: Select Materials & Shops</Label>
                  {availableFlooring.map(mat => (
                    <div key={mat.id} className="flex items-center justify-between p-3 border rounded hover:bg-muted/30">
                      <div className="flex items-center gap-3">
                        <Checkbox checked={selectedMaterials.some(s => s.materialId === mat.id)} 
                          onCheckedChange={(checked) => {
                            if(checked) setSelectedMaterials([...selectedMaterials, { materialId: mat.id, selectedShopId: getBestShop(mat.name)?.shopId || "" }]);
                            else setSelectedMaterials(selectedMaterials.filter(s => s.materialId !== mat.id));
                          }} 
                        />
                        <Label>{mat.name}</Label>
                      </div>
                      <Select value={selectedMaterials.find(s => s.materialId === mat.id)?.selectedShopId} onValueChange={(val) => setSelectedMaterials(selectedMaterials.map(s => s.materialId === mat.id ? {...s, selectedShopId: val} : s))}>
                        <SelectTrigger className="w-48"><SelectValue placeholder="Select Shop" /></SelectTrigger>
                        <SelectContent>{storeShops.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  ))}
                  <div className="flex justify-between"><Button variant="outline" onClick={() => setStep(1)}>Back</Button><Button disabled={selectedMaterials.length === 0} onClick={() => setStep(3)}>Next</Button></div>
                </div>
              )}

              {/* STEP 3: Review Materials */}
              {step === 3 && (
                <div className="space-y-4">
                  <Label className="text-lg font-bold">Step 3: Review Quantities & Rates</Label>
                  <div className="grid grid-cols-4 gap-4 px-3 font-bold text-xs uppercase text-muted-foreground border-b pb-2">
                    <span>Material Item</span><span>Quantity (sqft)</span><span>Rate (₹)</span><span className="text-right">Total (₹)</span>
                  </div>
                  {getMaterialsWithDetails().map(mat => (
                    <div key={mat.id} className="grid grid-cols-4 gap-4 items-center p-3 border rounded">
                      <span className="text-sm font-medium">{mat.name}</span>
                      <Input type="number" value={mat.quantity} onChange={e => setEditableMaterials({...editableMaterials, [mat.id!]: {...editableMaterials[mat.id!], quantity: Number(e.target.value)}})} />
                      <Input type="number" value={mat.rate} onChange={e => setEditableMaterials({...editableMaterials, [mat.id!]: {...editableMaterials[mat.id!], rate: Number(e.target.value)}})} />
                      <span className="text-right font-bold">{(mat.quantity * mat.rate).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between"><Button variant="outline" onClick={() => setStep(2)}>Back</Button><Button onClick={() => setStep(4)}>Generate BOM</Button></div>
                </div>
              )}

              {/* STEP 4: GENERATE BOM (Requested Style) */}
              {step === 4 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  <div className="text-center space-y-2">
                    <div style={{ width: "64px", height: "64px", backgroundColor: "rgba(34,197,94,0.1)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", color: "#22c55e" }}>
                      <CheckCircle2 style={{ width: "32px", height: "32px" }} />
                    </div>
                    <h2 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Bill of Materials (BOM)</h2>
                    <p style={{ fontSize: "0.875rem", color: "#6b7280" }}>Generated on {new Date().toLocaleDateString()}</p>
                  </div>

                  <div id="boq-pdf" style={{ backgroundColor: "#ffffff", color: "#000000", fontFamily: "Arial, sans-serif", padding: "16px" }}>
                    <div style={{ border: "1px solid #d1d5db", borderRadius: "8px", marginBottom: "16px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px", padding: "16px", fontSize: "0.875rem" }}>
                        <div><p style={{ fontSize: "0.75rem", color: "#6b7280" }}>PROJECT AREA</p><p style={{ fontWeight: 600 }}>{areaName}</p></div>
                        <div><p style={{ fontSize: "0.75rem", color: "#6b7280" }}>DIMENSIONS</p><p style={{ fontWeight: 600 }}>{length} ft × {width} ft</p></div>
                      </div>
                    </div>

                    <div style={{ border: "1px solid #d1d5db", borderRadius: "8px", marginBottom: "16px", overflow: "hidden" }}>
                      <div style={{ padding: "16px" }}>
                        <h3 style={{ fontWeight: 600, marginBottom: "8px" }}>Materials Schedule</h3>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                          <thead style={{ backgroundColor: "#f3f4f6" }}>
                            <tr>{["S.No","Item","Description","Unit","Qty","Rate (₹)","Supplier","Amount (₹)"].map((h) => (
                              <th key={h} style={{ border: "1px solid #d1d5db", padding: "8px", textAlign: h === "Qty" || h.includes("Rate") || h.includes("Amount") ? "right" : "left" }}>{h}</th>
                            ))}</tr>
                          </thead>
                          <tbody>
                            {getMaterialsWithDetails().map((mat, index) => (
                              <tr key={mat.id}>
                                <td style={{ border: "1px solid #d1d5db", padding: "8px" }}>{index + 1}</td>
                                <td style={{ border: "1px solid #d1d5db", padding: "8px", fontWeight: 500 }}>{mat.name}</td>
                                <td style={{ border: "1px solid #d1d5db", padding: "8px" }}>{mat.id ? (materialDescriptions[mat.id] || mat.name) : mat.name}</td>
                                <td style={{ border: "1px solid #d1d5db", padding: "8px", textAlign: "center" }}>{mat.unit || 'sqft'}</td>
                                <td style={{ border: "1px solid #d1d5db", padding: "8px", textAlign: "center" }}>{mat.quantity}</td>
                                <td style={{ border: "1px solid #d1d5db", padding: "8px", textAlign: "right" }}>{mat.rate}</td>
                                <td style={{ border: "1px solid #d1d5db", padding: "8px" }}>{mat.shopName}</td>
                                <td style={{ border: "1px solid #d1d5db", padding: "8px", textAlign: "right", fontWeight: 600 }}>{(mat.quantity * mat.rate).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div style={{ border: "1px solid #d1d5db", borderRadius: "8px", padding: "16px", display: "flex", justifyContent: "space-between", backgroundColor: "#eff6ff" }}>
                      <div><p style={{ fontSize: "0.875rem", color: "#6b7280" }}>Items</p><p style={{ fontWeight: 600 }}>{selectedMaterials.length}</p></div>
                      <div style={{ textAlign: "right" }}><p style={{ fontSize: "0.875rem", color: "#6b7280" }}>Grand Total</p><p style={{ fontSize: "1.5rem", fontWeight: 700, color: "#1d4ed8" }}>₹{calculateTotalCost().toFixed(2)}</p></div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 justify-end pt-4">
                    <Button onClick={() => setStep(3)} variant="outline">Back</Button>
                    <button onClick={handleExportPDF} className="flex items-center gap-2 bg-blue-500 text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue-600 transition"><Download className="w-5 h-5" />Export PDF</button>
                    <button onClick={() => setStep(5)} className="flex items-center gap-2 bg-indigo-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-indigo-700 transition">Finalize BOQ</button>
                    <button onClick={() => setStep(1)} className="flex items-center gap-2 bg-gray-200 text-gray-800 font-semibold px-4 py-2 rounded-lg hover:bg-gray-300 transition"><ChevronLeft className="w-5 h-5" />New Estimate</button>
                  </div>
                </motion.div>
              )}

              {/* STEP 5: FINAL INVOICE (Doors-style Final BOQ) */}
              {step === 5 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div><Label>Bill No</Label><Input value={finalBillNo} onChange={e => setFinalBillNo(e.target.value)} /></div>
                    <div><Label>Bill Date</Label><Input type="date" value={finalBillDate} onChange={e => setFinalBillDate(e.target.value)} /></div>
                    <div><Label>Due Date</Label><Input type="date" value={finalDueDate} onChange={e => setFinalDueDate(e.target.value)} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Customer Name</Label><Input value={finalCustomerName} onChange={e => setFinalCustomerName(e.target.value)} /></div>
                    <div><Label>Customer Address</Label><Input value={finalCustomerAddress} onChange={e => setFinalCustomerAddress(e.target.value)} /></div>
                  </div>
                  <div><Label>Terms & Conditions</Label><Input value={finalTerms} onChange={e => setFinalTerms(e.target.value)} /></div>

                  {/* MATERIAL DESCRIPTION INPUT */}
                  <div className="space-y-4 border p-4 rounded-md bg-slate-50">
                    <Label className="font-semibold">Material Description Entry</Label>
                    <select className="w-full border rounded px-3 py-2" value={selectedMaterialId} onChange={(e) => setSelectedMaterialId(e.target.value)}>
                      <option value="">Select Material</option>
                      {getMaterialsWithDetails().map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
                    </select>
                    {selectedMaterialId && (<Input placeholder="Enter description for selected material" value={materialDescriptions[selectedMaterialId] || ""} onChange={(e) => setMaterialDescriptions((prev) => ({...prev,[selectedMaterialId]: e.target.value,}))} />)}
                  </div>

                  <div id="boq-final-pdf" style={{ width: "210mm", minHeight: "297mm", padding: "20mm", background: "#fff", color: "#000", fontFamily: "Helvetica, Arial, sans-serif", fontSize: 12 }}>
                    
                    {/* HEADER */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                      <div style={{ width: "55%", lineHeight: 1.5, display: "flex", gap: 12 }}>
                        <img src={ctintLogo} alt="Logo" style={{ height: 56, flexShrink: 0 }} />
                        <div>
                          <strong style={{ fontSize: 14 }}>Concept Trunk Interiors</strong><br />
                          12/36A, Indira Nagar<br />
                          Medavakkam<br />
                          Chennai – 600100<br />
                          GSTIN: 33ASOPS5560M1Z1

                          <br /><br />

                          <strong>Bill From</strong><br />
                          <pre style={{ margin: 0, fontFamily: "Arial", whiteSpace: "pre-wrap", fontSize: 11 }}>
                            {finalShopDetails}
                          </pre>
                        </div>
                      </div>

                      <div style={{ width: "40%", lineHeight: 1.6, textAlign: "right" }}>
                        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>FINAL BOQ</div>
                        <div><strong>Bill No</strong> : {finalBillNo}</div>
                        <div><strong>Bill Date</strong> : {finalBillDate}</div>
                        <div><strong>Due Date</strong> : {finalDueDate}</div>
                        <div style={{ marginTop: 6 }}>
                          <strong>Terms</strong> : {finalTerms}
                        </div>
                        <div style={{ marginTop: 6 }}>
                          <strong>Customer</strong> : {finalCustomerName || "Customer"}
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 16, border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead style={{ background: '#f8fafc' }}>
                          <tr>
                            {['S.No', 'Item', 'Description', 'Unit', 'Qty', 'Rate (₹)', 'Supplier', 'Amount (₹)'].map(h => (
                              <th key={h} style={{ textAlign: h === 'Qty' || h.includes('Rate') || h.includes('Amount') ? 'right' : 'left', padding: 10, borderBottom: '1px solid #e6e6e6', fontSize: 12 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {getMaterialsWithDetails().map((m, i) => (
                            <tr key={m.id}>
                              <td style={{ padding: 10, borderBottom: '1px solid #f1f5f9', width: 40 }}>{i + 1}</td>
                              <td style={{ padding: 10, borderBottom: '1px solid #f1f5f9' }}>{m.name}</td>
                              <td style={{ padding: 10, borderBottom: '1px solid #f1f5f9' }}>{m.id ? (materialDescriptions[m.id] || m.name) : m.name}</td>
                              <td style={{ padding: 10, borderBottom: '1px solid #f1f5f9', width: 80 }}>{m.unit || 'sqft'}</td>
                              <td style={{ padding: 10, borderBottom: '1px solid #f1f5f9', textAlign: 'right', width: 80 }}>{m.quantity}</td>
                              <td style={{ padding: 10, borderBottom: '1px solid #f1f5f9', textAlign: 'right', width: 100 }}>{(Number(m.rate) || 0).toFixed(2)}</td>
                              <td style={{ padding: 10, borderBottom: '1px solid #f1f5f9' }}>{m.shopName}</td>
                              <td style={{ padding: 10, borderBottom: '1px solid #f1f5f9', textAlign: 'right', width: 120 }}>{(m.quantity * (Number(m.rate) || 0)).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                      <table style={{ width: 300 }}>
                        <tbody>
                          <tr><td>Sub Total</td><td style={{ textAlign: "right" }}>{subTotal.toFixed(2)}</td></tr>
                          <tr><td>SGST 9%</td><td style={{ textAlign: "right" }}>{sgst.toFixed(2)}</td></tr>
                          <tr><td>CGST 9%</td><td style={{ textAlign: "right" }}>{cgst.toFixed(2)}</td></tr>
                          <tr><td>Round Off</td><td style={{ textAlign: "right" }}>{roundOff.toFixed(2)}</td></tr>
                          <tr><td><strong>Total</strong></td><td style={{ textAlign: "right" }}><strong>₹{grandTotal.toFixed(2)}</strong></td></tr>
                        </tbody>
                      </table>
                    </div>

                    {/* SIGNATURE */}
                    <div style={{ marginTop: 50 }}>
                      <div style={{ width: 200, borderTop: "1px solid #000" }} />
                      <div>Authorized Signature</div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2"><Button onClick={() => setStep(4)} variant="outline">Back</Button><Button onClick={handleExportPDF}>Export Final PDF</Button></div>
                </motion.div>
              )}

            </AnimatePresence>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}