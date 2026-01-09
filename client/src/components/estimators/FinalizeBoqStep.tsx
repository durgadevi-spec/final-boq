import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";

interface MaterialForBOQ {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  rate: number;
  shopName: string;
}

interface FinalizeBoqStepProps {
  materials: MaterialForBOQ[];
  estimatorTitle: string;
  onBack: () => void;
  storeShops?: any[];
  selectedMaterials?: any[];
}

const ctintLogo = "/image.png";

export function FinalizeBoqStep({
  materials,
  estimatorTitle,
  onBack,
  storeShops = [],
  selectedMaterials = [],
}: FinalizeBoqStepProps) {
  const [finalBillNo, setFinalBillNo] = useState<string>("");
  const [finalBillDate, setFinalBillDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [finalDueDate, setFinalDueDate] = useState<string>("");
  const [finalTerms, setFinalTerms] = useState<string>("50% Advance and 50% on Completion");
  const [finalCustomerName, setFinalCustomerName] = useState<string>("");
  const [finalCustomerAddress, setFinalCustomerAddress] = useState<string>("");
  const [finalShopDetails, setFinalShopDetails] = useState<string>("");

  // Auto-fill shop details from first material's shop
  useEffect(() => {
    if (materials.length > 0 && storeShops.length > 0 && selectedMaterials.length > 0) {
      const firstShopId = selectedMaterials[0]?.selectedShopId;
      const shop = storeShops.find((s) => s.id === firstShopId);
      if (shop) {
        const parts = [
          shop.name || "",
          shop.address || "",
          shop.area || "",
          shop.city || "",
          shop.state || "",
          shop.pincode || "",
          shop.gstin ? `GSTIN: ${shop.gstin}` : "",
          shop.phone ? `Ph: ${shop.phone}` : "",
        ].filter(Boolean);
        setFinalShopDetails(parts.join("\n"));
      }
    }
  }, [materials, storeShops, selectedMaterials]);

  // Calculate totals
  const subTotal = materials.reduce((sum, m) => sum + m.quantity * m.rate, 0);
  const sgst = subTotal * 0.09;
  const cgst = subTotal * 0.09;
  const roundOff = Math.round((subTotal + sgst + cgst) * 100) / 100 - (subTotal + sgst + cgst);
  const total = subTotal + sgst + cgst + roundOff;

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

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* ================= MANUAL INPUTS ================= */}
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
          fontSize: 12,
        }}
      >
        {/* HEADER: logo + company block left, Bill info right */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ width: "55%", display: "flex", gap: 12 }}>
            <img src={ctintLogo} alt="Concept Trunk Interiors" style={{ height: 60, flexShrink: 0 }} />
            <div style={{ lineHeight: 1.4 }}>
              <strong>Concept Trunk Interiors</strong>
              <br />
              12/36A, Indira Nagar<br />
              Medavakkam<br />
              Chennai – 600100<br />
              GSTIN: 33ASOPS5560M1Z1
              <br />
              <br />
              <strong>Bill From</strong>
              <br />
              <pre style={{ margin: 0, fontFamily: "Arial", whiteSpace: "pre-wrap", fontSize: 11 }}>
                {finalShopDetails}
              </pre>
            </div>
          </div>

          <div style={{ textAlign: "right", width: "40%" }}>
            <div style={{ fontWeight: "bold", fontSize: 16 }}>BILL</div>
            <div>Bill No: {finalBillNo || "-"}</div>
            <div>Bill Date: {finalBillDate && new Date(finalBillDate).toLocaleDateString("en-GB")}</div>
            <div>Due Date: {finalDueDate && new Date(finalDueDate).toLocaleDateString("en-GB")}</div>
            <div style={{ marginTop: 6 }}>Terms: {finalTerms}</div>
            <div style={{ marginTop: 6 }}>Customer: {finalCustomerName}</div>
          </div>
        </div>

        <hr style={{ margin: "10px 0" }} />

        <div style={{ marginBottom: 12, lineHeight: 1.5 }}>
          <strong style={{ fontSize: 12 }}>Bill To:</strong>
          <div style={{ fontSize: 11, marginTop: 4 }}>
            {finalCustomerName}
            <br />
            {finalCustomerAddress}
          </div>
        </div>

        {/* TABLE */}
        <table style={{ width: "100%", marginTop: 20, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["S.No", "Item", "Unit", "Qty", "Rate", "Supplier", "Amount"].map((h) => (
                <th
                  key={h}
                  style={{
                    border: "1px solid #000",
                    padding: 6,
                    background: "#000",
                    color: "#fff",
                    fontSize: 11,
                    textAlign: h === "Qty" || h === "Rate" || h === "Amount" ? "right" : "left",
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
                <td style={{ border: "1px solid #000", padding: 6, textAlign: "center" }}>{i + 1}</td>
                <td style={{ border: "1px solid #000", padding: 6 }}>{m.name}</td>
                <td style={{ border: "1px solid #000", padding: 6, textAlign: "center" }}>{m.unit}</td>
                <td style={{ border: "1px solid #000", padding: 6, textAlign: "right" }}>
                  {Number(m.quantity || 0).toFixed(0)}
                </td>
                <td style={{ border: "1px solid #000", padding: 6, textAlign: "right" }}>
                  {Number(m.rate || 0).toFixed(2)}
                </td>
                <td style={{ border: "1px solid #000", padding: 6 }}>{m.shopName}</td>
                <td style={{ border: "1px solid #000", padding: 6, textAlign: "right", fontWeight: 600 }}>
                  {(Number(m.quantity || 0) * Number(m.rate || 0)).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* TOTALS */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <table style={{ width: 300, borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ padding: "6px 8px", textAlign: "left", fontSize: 11 }}>Sub Total</td>
                <td style={{ padding: "6px 8px", textAlign: "right", fontSize: 11 }}>
                  {Number(subTotal || 0).toFixed(2)}
                </td>
              </tr>
              <tr>
                <td style={{ padding: "6px 8px", textAlign: "left", fontSize: 11 }}>SGST 9%</td>
                <td style={{ padding: "6px 8px", textAlign: "right", fontSize: 11 }}>
                  {Number(sgst || 0).toFixed(2)}
                </td>
              </tr>
              <tr>
                <td style={{ padding: "6px 8px", textAlign: "left", fontSize: 11 }}>CGST 9%</td>
                <td style={{ padding: "6px 8px", textAlign: "right", fontSize: 11 }}>
                  {Number(cgst || 0).toFixed(2)}
                </td>
              </tr>
              <tr>
                <td style={{ padding: "6px 8px", textAlign: "left", fontSize: 11 }}>Round Off</td>
                <td style={{ padding: "6px 8px", textAlign: "right", fontSize: 11 }}>
                  {Number(roundOff || 0).toFixed(2)}
                </td>
              </tr>
              <tr style={{ borderTop: "2px solid #000", borderBottom: "2px solid #000" }}>
                <td style={{ padding: "6px 8px", textAlign: "left", fontSize: 11, fontWeight: "bold" }}>Total</td>
                <td style={{ padding: "6px 8px", textAlign: "right", fontSize: 12, fontWeight: "bold" }}>
                  ₹{Number(total || 0).toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* SIGNATURE */}
        <div style={{ marginTop: 50 }}>
          <div style={{ width: 200, borderTop: "1px solid #000" }} />
          <div>Authorized Signature</div>
        </div>
      </div>

      {/* BUTTONS */}
      <div className="flex justify-end gap-2">
        <Button onClick={onBack} variant="outline">
          Back
        </Button>
        <Button onClick={handleExportFinalBOQ}>Export PDF</Button>
      </div>
    </motion.div>
  );
}
