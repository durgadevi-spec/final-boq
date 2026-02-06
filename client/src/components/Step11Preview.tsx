import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import apiFetch from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { X } from "lucide-react";

type Product = {
  id: string;
  name: string;
  code: string;
  category?: string;
  subcategory?: string;
  description?: string;
};

type Step11Item = {
  id?: string;
  s_no?: number;
  bill_no?: string;
  estimator?: string;
  group_id?: string;
  title?: string;
  description?: string;
  unit?: string;
  qty?: number;
  supply_rate?: number;
  install_rate?: number;
  [key: string]: any;
};

type Step11PreviewProps = {
  product: Product;
  onClose: () => void;
  onAddToBoq: (selectedItems: Step11Item[]) => void;
  open: boolean;
};

export default function Step11Preview({
  product,
  onClose,
  onAddToBoq,
  open,
}: Step11PreviewProps) {
  const [step11Items, setStep11Items] = useState<Step11Item[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const { toast } = useToast();

  // Load Step 11 data for this product
  useEffect(() => {
    const loadStep11Data = async () => {
      try {
        setLoading(true);
        // Try to fetch existing step 11 data for this product
        // We'll look in the estimator_step11_finalize_boq table using the product subcategory as estimator type
        const estimatorType = getEstimatorTypeFromProduct(product);

        if (!estimatorType) {
          toast({
            title: "Error",
            description: "Could not determine estimator type for this product",
            variant: "destructive",
          });
          return;
        }

        // Fetch step 11 data - we use product ID as a key to identify stored data
        const response = await apiFetch(
          `/api/step11-by-product?product_id=${encodeURIComponent(product.id)}&estimator=${encodeURIComponent(estimatorType)}`,
          { headers: {} },
        );

        if (response.ok) {
          const data = await response.json();
          const items = data.items || [];
          setStep11Items(items);

          if (items.length === 0) {
            toast({
              title: "Info",
              description: `No Step 11 data found for ${product.name}`,
            });
          }
        } else {
          throw new Error("Failed to load step 11 data");
        }
      } catch (error) {
        console.error("Failed to load Step 11 data:", error);
        toast({
          title: "Error",
          description: "Failed to load product Step 11 data",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    loadStep11Data();
  }, [product, toast]);

  const getEstimatorTypeFromProduct = (prod: Product): string | null => {
    const subcat = (prod.subcategory || prod.subcategory_name || "").toLowerCase();
    const cat = (prod.category || prod.category_name || "").toLowerCase();
    const name = (prod.name || "").toLowerCase();

    if (subcat) {
      if (subcat.includes("door")) return "doors";
      if (subcat.includes("electrical")) return "electrical";
      if (subcat.includes("plumb")) return "plumbing";
      if (subcat.includes("floor")) return "flooring";
      if (subcat.includes("paint")) return "painting";
      if (subcat.includes("ceiling")) return "falseceiling";
      if (subcat.includes("blind")) return "blinds";
      if (subcat.includes("civil") || subcat.includes("wall")) return "civilwall";
      if (subcat.includes("ms")) return "mswork";
      if (subcat.includes("ss")) return "sswork";
      if (subcat.includes("fire")) return "firefighting";
    }

    if (cat) {
      if (cat.includes("door")) return "doors";
      if (cat.includes("electrical")) return "electrical";
      if (cat.includes("plumb")) return "plumbing";
      if (cat.includes("floor")) return "flooring";
      if (cat.includes("paint")) return "painting";
      if (cat.includes("ceiling")) return "falseceiling";
      if (cat.includes("blind")) return "blinds";
      if (cat.includes("civil") || cat.includes("wall")) return "civilwall";
    }

    // fallback: normalize raw values (remove spaces/hyphens) and use that as estimator key
    const candidate = (subcat || cat || name).trim();
    if (candidate) {
      const normalized = candidate.replace(/[-\s]/g, "");
      if (/\w+/.test(normalized)) return normalized;
    }

    return null;
  };

  const toggleItemSelection = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const selectAll = () => {
    if (selectedItems.size === step11Items.length) {
      setSelectedItems(new Set());
    } else {
      const allIds = step11Items.map((item, idx) => String(idx));
      setSelectedItems(new Set(allIds));
    }
  };

  const handleAddToBoq = async () => {
    if (selectedItems.size === 0) {
      toast({
        title: "Error",
        description: "Please select at least one item",
        variant: "destructive",
      });
      return;
    }

    setIsAdding(true);
    try {
      const selected = step11Items.filter((_, idx) =>
        selectedItems.has(String(idx)),
      );

      console.log("Step11Preview calling onAddToBoq with items:", selected);

      // Wait for the parent component's async handler to complete
      await Promise.resolve(onAddToBoq(selected));

      console.log("Step11Preview: onAddToBoq completed successfully");
    } catch (error) {
      console.error("Step11Preview: Error in onAddToBoq:", error);
      toast({
        title: "Error",
        description: "Failed to add items to BOQ",
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product.name} - Step 11 Configuration</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {product.category && product.subcategory && (
            <p className="text-sm text-gray-500">
              {product.category} → {product.subcategory}
            </p>
          )}

          {loading ? (
            <div className="text-center py-8 text-gray-500">
              Loading Step 11 data...
            </div>
          ) : step11Items.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No Step 11 data available for this product
            </div>
          ) : (
            <>
              {/* Selection Controls */}
              <div className="flex justify-between items-center pb-3 border-b">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="select-all"
                    checked={
                      selectedItems.size === step11Items.length &&
                      step11Items.length > 0
                    }
                    onCheckedChange={selectAll}
                  />
                  <label
                    htmlFor="select-all"
                    className="cursor-pointer text-sm font-medium"
                  >
                    Select All ({selectedItems.size}/{step11Items.length})
                  </label>
                </div>
              </div>

              {/* Step 11 Items List */}
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {step11Items.map((item, idx) => {
                  const itemId = String(idx);
                  const isSelected = selectedItems.has(itemId);

                  return (
                    <div
                      key={itemId}
                      onClick={() => toggleItemSelection(itemId)}
                      className={`p-3 border rounded-lg transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-blue-50 border-blue-300"
                          : "bg-gray-50 border-gray-200"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id={`item-${itemId}`}
                          checked={isSelected}
                          onCheckedChange={() => toggleItemSelection(itemId)}
                          className="mt-1"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex-1 pointer-events-none">
                          <div className="font-semibold">
                            {item.title ||
                              item.description ||
                              `Item ${item.s_no || idx + 1}`}
                          </div>
                          {item.description && item.title && (
                            <div className="text-sm text-gray-600 mt-1">
                              {item.description}
                            </div>
                          )}
                          <div className="text-xs text-gray-500 mt-2 grid grid-cols-2 gap-2">
                            {item.qty && (
                              <div>
                                <span className="font-medium">Qty:</span>{" "}
                                {item.qty} {item.unit || "pcs"}
                              </div>
                            )}
                            {item.supply_rate && (
                              <div>
                                <span className="font-medium">Supply:</span> ₹
                                {item.supply_rate}
                              </div>
                            )}
                            {item.install_rate && (
                              <div>
                                <span className="font-medium">Install:</span> ₹
                                {item.install_rate}
                              </div>
                            )}
                            {item.group_id && (
                              <div>
                                <span className="font-medium">Group:</span>{" "}
                                {item.group_id}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="flex-1"
                  disabled={isAdding}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddToBoq}
                  disabled={selectedItems.size === 0 || isAdding}
                  className="flex-1"
                >
                  {isAdding
                    ? "Adding..."
                    : `Add Selected (${selectedItems.size}) to BOQ`}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
