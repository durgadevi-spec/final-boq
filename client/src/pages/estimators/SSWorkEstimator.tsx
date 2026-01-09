import { useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import { Calculator, ChevronRight } from "lucide-react";
import { useData } from "@/lib/store";
import { FinalizeBoqStep } from "@/components/estimators/FinalizeBoqStep";

export default function SSWorkEstimator() {
  const [step, setStep] = useState(1);
  const [length, setLength] = useState("");
  const [materials, setMaterials] = useState<any[]>([]);
  const { shops: storeShops } = useData();

  const calculate = () => {
    const l = parseFloat(length) || 0;
    
    let mats = [];
    mats.push({ item: "SS 304 Pipe / Tube", description: "Railing / Balustrade", quantity: l, unit: "rft" });
    mats.push({ item: "SS Base Plates", description: "Mounting", quantity: Math.ceil(l / 4), unit: "nos" });
    mats.push({ item: "SS Fasteners", description: "Fixing", quantity: Math.ceil(l / 4) * 4, unit: "nos" });
    mats.push({ item: "Polishing", description: "Finishing", quantity: Math.ceil(l / 20), unit: "set" });

    setMaterials(mats);
    setStep(2);
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight font-heading text-primary">SS Work Estimator</h2>
          <p className="text-muted-foreground">Calculate Stainless Steel work requirements.</p>
        </div>

        <Card className="border-border/50 shadow-lg">
          <CardContent className="p-6">
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                  <h3 className="text-xl font-semibold">Step 1: Dimensions</h3>
                  <div className="grid grid-cols-1 gap-6">
                    <div className="space-y-2">
                        <Label>Total Running Feet of Railing</Label>
                        <Input type="number" value={length} onChange={(e) => setLength(e.target.value)} placeholder="e.g. 50" />
                    </div>
                  </div>
                   <div className="flex justify-end pt-4"><Button onClick={calculate} className="w-40 bg-green-600 hover:bg-green-700 text-white"><Calculator className="mr-2 h-4 w-4" /> Calculate</Button></div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div key="s2" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
                   <div className="text-center space-y-2">
                    <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto text-blue-500"><Calculator className="h-8 w-8" /></div>
                    <h3 className="text-2xl font-bold">Material Requirements</h3>
                  </div>
                  <div className="bg-muted/30 rounded-lg border border-border overflow-hidden">
                    <div className="grid grid-cols-12 bg-muted p-3 text-sm font-medium">
                        <div className="col-span-8">Item Description</div>
                        <div className="col-span-4 text-right">Qty</div>
                    </div>
                    {materials.map((mat, idx) => (
                         <div key={idx} className="grid grid-cols-12 p-4 border-b border-border/50 text-sm items-center">
                            <div className="col-span-8">
                                <div className="font-medium text-foreground">{mat.item}</div>
                                <div className="text-xs text-muted-foreground">{mat.description}</div>
                            </div>
                            <div className="col-span-4 text-right font-mono text-lg">{mat.quantity.toFixed(1)} <span className="text-xs text-muted-foreground">{mat.unit}</span></div>
                        </div>
                    ))}
                  </div>
                   <div className="flex justify-between pt-6">
                    <Button variant="outline" onClick={() => setStep(1)} className="w-32">Start Over</Button>
                    <div className="flex gap-2">
                      <Link href="/item-master"><Button className="w-48 bg-primary text-primary-foreground">Select Materials <ChevronRight className="ml-2 h-4 w-4" /></Button></Link>
                      <Button onClick={() => setStep(3)} className="w-40">Generate BOQ</Button>
                    </div>
                  </div>
                </motion.div>
              )}
              {step === 3 && (
                <FinalizeBoqStep
                  materials={materials.map((m, i) => ({ id: String(i), name: m.item, quantity: m.quantity, unit: m.unit, rate: 0, shopName: "Computed" }))}
                  estimatorTitle="SS Work Estimator"
                  onBack={() => setStep(2)}
                  storeShops={storeShops}
                  selectedMaterials={[]}
                />
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
