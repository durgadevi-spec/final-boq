import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useData } from "@/lib/store";
import {
  AlertCircle,
  CheckCircle2,
  Package,
  Plus,
  Loader2,
  MessageSquare,
  Trash2,
} from "lucide-react";

interface MaterialTemplate {
  id: string;
  name: string;
  code: string;
  category?: string;
  created_at: string;
}

interface Shop {
  id: string;
  name: string;
}

const UNIT_OPTIONS = ["pcs", "kg", "meter", "sqft", "cum", "litre", "set", "nos"];
const Required = () => <span className="text-red-500 ml-1">*</span>;

export default function SupplierMaterials() {
  const { toast } = useToast();
  const { user, addSupportMessage, deleteMessage, supportMessages } = useData();
  const [activeTab, setActiveTab] = useState<"templates" | "submissions" | "support">("templates");
  
  // Support Message State
  const [supportSenderName, setSupportSenderName] = useState("");
  const [supportSenderInfo, setSupportSenderInfo] = useState("");
  const [supportMsg, setSupportMsg] = useState("");
  
  // Material Templates State
  const [templates, setTemplates] = useState<MaterialTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [templatesSearch, setTemplatesSearch] = useState("");
  // list-only view: show a limited set of templates; use search to find others

  // Categories State
  const [categories, setCategories] = useState<string[]>([]);
  const [subcategories, setSubcategories] = useState<string[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);

  // Form State
  const [selectedTemplate, setSelectedTemplate] = useState<MaterialTemplate | null>(null);
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Multiple entries support: allow adding product entries before a bulk submit
  const [entriesList, setEntriesList] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    rate: "",
    unit: "",
    brandname: "",
    modelnumber: "",
    category: "",
    subcategory: "",
    product: "",
    technicalspecification: "",
    dimensions: "",
    finishtype: "",
    metaltype: "",
  });

  // Load material templates on mount
  useEffect(() => {
    loadMaterialTemplates();
    loadShops();
    loadCategories();
    loadProducts();
  }, []);

  const loadMaterialTemplates = async () => {
    try {
      const token = localStorage.getItem("authToken");
      console.log('[SupplierMaterials] loadMaterialTemplates token?', !!token);
      const response = await fetch("/api/material-templates", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await response.json();
      setTemplates(data.templates || []);
    } catch (error) {
      console.error("Error loading templates:", error);
      toast({
        title: "Error",
        description: "Failed to load material templates",
        variant: "destructive",
      });
    } finally {
      setLoadingTemplates(false);
    }
  };

  const loadShops = async () => {
    try {
      const response = await fetch("/api/shops");
      const data = await response.json();
      setShops(data.shops || []);
    } catch (error) {
      console.error("Error loading shops:", error);
      toast({
        title: "Error",
        description: "Failed to load shops",
        variant: "destructive",
      });
    }
  };

  const loadCategories = async () => {
    try {
      setLoadingCategories(true);
      const response = await fetch("/api/material-categories");
      const data = await response.json();
      setCategories(data.categories || []);
    } catch (error) {
      console.error("Error loading categories:", error);
      // Non-critical, don't show error toast
    } finally {
      setLoadingCategories(false);
    }
  };

  const loadSubcategories = async (category: string) => {
    if (!category) {
      setSubcategories([]);
      return;
    }
    try {
      const response = await fetch(`/api/material-subcategories/${encodeURIComponent(category)}`);
      const data = await response.json();
      setSubcategories(data.subcategories || []);
    } catch (error) {
      console.error("Error loading subcategories:", error);
      setSubcategories([]);
    }
  };

  const loadProducts = async () => {
    try {
      const response = await fetch("/api/products");
      const data = await response.json();
      setProducts(data.products || []);
    } catch (error) {
      console.error("Error loading products:", error);
      setProducts([]);
    }
  };

  const handleSelectTemplate = (template: MaterialTemplate) => {
    setSelectedTemplate(template);
    setFormData({
      rate: "",
      unit: "",
      brandname: "",
      modelnumber: "",
      category: template.category || "",
      subcategory: "",
      product: "",
      technicalspecification: "",
      dimensions: "",
      finishtype: "",
      metaltype: "",
    });
    setSelectedShop("");
    // Load subcategories if template has a category
    if (template.category) {
      loadSubcategories(template.category);
    }
    // Scroll to form after a brief delay to ensure state is updated
    setTimeout(() => {
      const formElement = document.getElementById("material-form");
      if (formElement) {
        formElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);
  };

  // When both shop and template are selected, try to prefill form from existing approved materials
  useEffect(() => {
    const tryPrefill = async () => {
      if (!selectedTemplate || !selectedShop) return;
      try {
        const res = await fetch('/api/materials');
        if (!res.ok) return;
        const data = await res.json();
        const materials = data.materials || [];
        // find material by template_id and shop_id
        const found = materials.find((m: any) => String(m.template_id) === String(selectedTemplate.id) && String(m.shop_id) === String(selectedShop));
        if (found) {
          // Prefill form fields with the existing material's values (set empty string when not provided)
          setFormData(() => ({
            rate: found.rate != null ? String(found.rate) : "",
            unit: found.unit || "",
            brandname: found.brandname || "",
            modelnumber: found.modelnumber || "",
            category: found.category || "",
            subcategory: found.subcategory || "",
            product: found.product || "",
            technicalspecification: found.technicalspecification || "",
            dimensions: found.dimensions || "",
            finishtype: found.finishtype || "",
            metaltype: found.metaltype || "",
          }));
          // if category present, ensure subcategories loaded
          if (found.category) {
            await loadSubcategories(found.category);
          }
        } else {
          // No material found for this shop+template: clear shop-specific fields
          setFormData((prev) => ({
            ...prev,
            rate: "",
            unit: "",
            brandname: "",
            modelnumber: "",
            subcategory: "",
            product: "",
            technicalspecification: "",
            dimensions: "",
            finishtype: "",
            metaltype: "",
          }));
        }
      } catch (err) {
        console.warn('prefill material failed', err);
      }
    };

    tryPrefill();
  }, [selectedShop, selectedTemplate]);

  const handleSubmitMaterial = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedTemplate || !selectedShop) {
      toast({
        title: "Error",
        description: "Please select a template and shop",
        variant: "destructive",
      });
      return;
    }

    if (!formData.rate || !formData.unit || !formData.category) {
      toast({
        title: "Error",
        description: "Rate, unit, and category are required",
        variant: "destructive",
      });
      return;
    }

    // We support submitting multiple entries at once. If user added entries via "Add Entry",
    // submit those; otherwise submit the current filled form as a single submission.
    const toSubmit: any[] = entriesList.length > 0 ? entriesList : [{
      template_id: selectedTemplate.id,
      shop_id: selectedShop,
      ...formData,
    }];

    setSubmitting(true);
    try {
      const token = localStorage.getItem("authToken");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      // Submit sequentially to keep server load predictable
      for (const payload of toSubmit) {
        const body = {
          template_id: payload.template_id,
          shop_id: payload.shop_id,
          rate: payload.rate,
          unit: payload.unit,
          brandname: payload.brandname,
          modelnumber: payload.modelnumber,
          subcategory: payload.subcategory,
          product: payload.product,
          technicalspecification: payload.technicalspecification,
          dimensions: payload.dimensions,
          finishtype: payload.finishtype,
          metaltype: payload.metaltype,
        };
        const response = await fetch("/api/material-submissions", {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Failed to submit material (${response.status}): ${text}`);
        }
      }

      toast({ title: "Success", description: "Material(s) submitted for approval" });

      // Reset form and entries
      setSelectedTemplate(null);
      setFormData({
        rate: "",
        unit: "",
        brandname: "",
        modelnumber: "",
        category: "",
        subcategory: "",
        product: "",
        technicalspecification: "",
        dimensions: "",
        finishtype: "",
        metaltype: "",
      });
      setSelectedShop("");
      setEntriesList([]);
    } catch (error) {
      console.error("Error submitting material:", error);
      toast({ title: "Error", description: "Failed to submit material", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddEntry = () => {
    if (!selectedTemplate || !selectedShop) {
      toast({ title: "Error", description: "Please select a template and shop", variant: "destructive" });
      return;
    }
    if (!formData.rate || !formData.unit || !formData.category) {
      toast({ title: "Error", description: "Rate, unit, and category are required to add entry", variant: "destructive" });
      return;
    }

    const entry = {
      template_id: selectedTemplate.id,
      shop_id: selectedShop,
      ...formData,
    };
    setEntriesList((s) => [...s, entry]);

    // Clear product-specific fields but keep template and shop selected for adding more
    setFormData((prev) => ({ ...prev, rate: "", unit: "", brandname: "", modelnumber: "", subcategory: "", product: "", technicalspecification: "", dimensions: "", finishtype: "", metaltype: "" }));
  };

  const handleRemoveEntry = (index: number) => {
    setEntriesList((s) => s.filter((_, i) => i !== index));
  };

  const handleSupportSubmit = () => {
    if (!supportMsg || !supportSenderName) {
      toast({
        title: "Error",
        description: "Sender name and message are required",
        variant: "destructive",
      });
      return;
    }
    (async () => {
      try {
        await addSupportMessage?.(supportSenderName, supportMsg, supportSenderInfo);
        toast({
          title: "Request Sent",
          description: "Message sent to Admin & Software Team.",
        });
        setSupportMsg("");
        setSupportSenderName("");
        setSupportSenderInfo("");
      } catch (err) {
        toast({
          title: "Error",
          description: "Failed to send message",
          variant: "destructive",
        });
      }
    })();
  };

  return (
    <Layout>
      <div className="container mx-auto py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Material Management</h1>
          <p className="text-gray-600">
            Select from available material templates and add your details
          </p>
        </div>

        <div className="grid gap-8">
          {/* Available Templates Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Package className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-xl font-semibold">Available Material Templates</h2>
            </div>

            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Input value={templatesSearch} onChange={(e) => setTemplatesSearch(e.target.value)} placeholder="Search templates..." />
                
              </div>
              <div />
            </div>

            {loadingTemplates ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : templates.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center text-gray-500">
                    No material templates available yet
                  </div>
                </CardContent>
              </Card>
            ) : (
                <div className="space-y-2">
                  {templates.filter(t => (t.name + ' ' + t.code + ' ' + (t.category||'')).toLowerCase().includes(templatesSearch.toLowerCase())).slice(0,12).map((template) => (
                    <div key={template.id} className="p-2 border rounded flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">{template.name}</div>
                        <div className="text-xs text-muted-foreground">{template.code} {template.category && (<span className="ml-2 text-[11px] text-gray-500">• {template.category}</span>)}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" onClick={() => handleSelectTemplate(template)}>Select</Button>
                      </div>
                    </div>
                  ))}
                  
                </div>
              )
            }
          </div>

          {/* Submission Form Section */}
          {selectedTemplate && (
            <Card id="material-form" className="bg-blue-50 border-blue-200 scroll-mt-20">
              <CardHeader>
                <CardTitle>Submit Material Details</CardTitle>
                <CardDescription>
                  Completing submission for: <strong>{selectedTemplate.name}</strong> (
                  {selectedTemplate.code})
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmitMaterial} className="space-y-6">
                  {/* Shop Selection */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>
                        Shop <Required />
                      </Label>
                      <Select value={selectedShop} onValueChange={setSelectedShop}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a shop" />
                        </SelectTrigger>
                        <SelectContent>
                          {shops.map((shop) => (
                            <SelectItem key={shop.id} value={shop.id}>
                              {shop.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>
                        Rate <Required />
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Enter rate"
                        value={formData.rate}
                        onChange={(e) =>
                          setFormData({ ...formData, rate: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  {/* Unit and Brand Name */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>
                        Unit <Required />
                      </Label>
                      <Select
                        value={formData.unit}
                        onValueChange={(value) =>
                          setFormData({ ...formData, unit: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select unit" />
                        </SelectTrigger>
                        <SelectContent>
                          {UNIT_OPTIONS.map((unit) => (
                            <SelectItem key={unit} value={unit}>
                              {unit}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Brand Name</Label>
                      <Input
                        placeholder="Enter brand name"
                        value={formData.brandname}
                        onChange={(e) =>
                          setFormData({ ...formData, brandname: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  {/* Model Number and Category */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Model Number</Label>
                      <Input
                        placeholder="Enter model number"
                        value={formData.modelnumber}
                        onChange={(e) =>
                          setFormData({ ...formData, modelnumber: e.target.value })
                        }
                      />
                    </div>

                    <div>
                      <Label>
                        Category <Required />
                      </Label>
                      <Select
                        value={formData.category}
                        onValueChange={(value) => {
                          setFormData({ ...formData, category: value, subcategory: "" });
                          loadSubcategories(value);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Subcategory */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Subcategory</Label>
                      <Select
                        value={formData.subcategory}
                        onValueChange={(value) =>
                          setFormData({ ...formData, subcategory: value, product: "" })
                        }
                        disabled={!formData.category || subcategories.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={subcategories.length === 0 ? "No subcategories available" : "Select subcategory"} />
                        </SelectTrigger>
                        <SelectContent>
                          {subcategories.map((subcat) => (
                            <SelectItem key={subcat} value={subcat}>
                              {subcat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Product</Label>
                      <Select
                        value={formData.product}
                        onValueChange={(value) =>
                          setFormData({ ...formData, product: value })
                        }
                        disabled={!formData.subcategory || products.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={products.length === 0 ? "No products available" : "Select product"} />
                        </SelectTrigger>
                        <SelectContent>
                          {products
                            .filter((product: any) => product.subcategory === formData.subcategory)
                            .map((product: any) => (
                              <SelectItem key={product.id} value={product.name}>
                                {product.name} {"(Subcategory: "}{product.subcategory_name}{")"}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Technical Specification */}
                  <div>
                    <Label>Technical Specification</Label>
                    <Textarea
                      placeholder="Enter technical specifications"
                      value={formData.technicalspecification}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          technicalspecification: e.target.value,
                        })
                      }
                      rows={4}
                    />
                  </div>

                  {/* Dimensions, Finish Type, Metal Type */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Dimensions</Label>
                      <Input
                        placeholder="Enter dimensions"
                        value={formData.dimensions}
                        onChange={(e) =>
                          setFormData({ ...formData, dimensions: e.target.value })
                        }
                      />
                    </div>

                    <div>
                      <Label>Finish Type</Label>
                      <Input
                        placeholder="e.g., matte, glossy, satin"
                        value={formData.finishtype}
                        onChange={(e) =>
                          setFormData({ ...formData, finishtype: e.target.value })
                        }
                      />
                    </div>

                    <div>
                      <Label>Metal Type</Label>
                      <Input
                        placeholder="e.g., steel, copper, aluminum"
                        value={formData.metaltype}
                        onChange={(e) =>
                          setFormData({ ...formData, metaltype: e.target.value })
                        }
                      />
                    </div>
                  </div>

                  {/* Entries List (if any) */}
                  {entriesList.length > 0 && (
                    <div className="space-y-2">
                      <div className="font-medium">Entries to submit ({entriesList.length})</div>
                      <div className="space-y-1">
                        {entriesList.map((entry, idx) => (
                          <div key={idx} className="flex items-center justify-between border rounded px-3 py-2 bg-white">
                            <div className="text-sm">
                              <div className="font-semibold">Rate: {entry.rate} • Unit: {entry.unit}</div>
                              <div className="text-xs text-muted-foreground">Category: {entry.category} {entry.subcategory ? `• ${entry.subcategory}` : ''} {entry.product ? `• ${entry.product}` : ''}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="ghost" onClick={() => {
                                // populate entry into form for quick edit
                                setFormData({
                                  rate: entry.rate,
                                  unit: entry.unit,
                                  brandname: entry.brandname || "",
                                  modelnumber: entry.modelnumber || "",
                                  category: entry.category || "",
                                  subcategory: entry.subcategory || "",
                                  product: entry.product || "",
                                  technicalspecification: entry.technicalspecification || "",
                                  dimensions: entry.dimensions || "",
                                  finishtype: entry.finishtype || "",
                                  metaltype: entry.metaltype || "",
                                });
                              }}>Edit</Button>
                              <Button size="sm" variant="ghost" onClick={() => handleRemoveEntry(idx)}>Remove</Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Submit / Add Entry Buttons */}
                  <div className="flex gap-2">
                    <Button type="button" onClick={handleAddEntry} className="gap-2">
                      <Plus className="w-4 h-4" /> Add Entry
                    </Button>

                    <Button
                      type="submit"
                      disabled={submitting}
                      className="gap-2"
                    >
                      {submitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      Submit for Approval
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSelectedTemplate(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Technical Support Section */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="w-5 h-5" />
              <h2 className="text-2xl font-semibold">Technical Support</h2>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Send Message to Admin & Software Team</CardTitle>
                <CardDescription>
                  Request new categories or report issues
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Sender Name Input */}
                <div className="space-y-2">
                  <Label>Your Name <Required /></Label>
                  <Input
                    placeholder="Enter your name..."
                    value={supportSenderName}
                    onChange={(e) => setSupportSenderName(e.target.value)}
                  />
                </div>

                {/* Additional Info Input */}
                <div className="space-y-2">
                  <Label>Additional Information (Optional)</Label>
                  <Textarea
                    placeholder="Any additional context or details..."
                    className="min-h-[80px]"
                    value={supportSenderInfo}
                    onChange={(e) => setSupportSenderInfo(e.target.value)}
                  />
                </div>

                {/* Message Input */}
                <div className="space-y-2">
                  <Label>Message / Request <Required /></Label>
                  <Textarea
                    placeholder="I need a new category for 'Smart Home Devices'..."
                    className="min-h-[150px]"
                    value={supportMsg}
                    onChange={(e) => setSupportMsg(e.target.value)}
                  />
                </div>

                <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded text-sm text-blue-700 dark:text-blue-300">
                  ✓ This message will be sent to Admin & Software Team
                </div>

                <Button
                  onClick={handleSupportSubmit}
                >
                  <MessageSquare className="mr-2 h-4 w-4" /> Send Request
                </Button>

                {/* Display list of sent messages */}
                {((supportMessages || []).filter((msg: any) => msg.sender_name === supportSenderName)).length === 0 ? (
                  <p className="text-muted-foreground text-sm mt-4">No messages sent yet</p>
                ) : (
                  <div className="mt-6 space-y-3">
                    <p className="font-semibold text-sm">Your Sent Messages:</p>
                    {(supportMessages || []).filter((msg: any) => msg.sender_name === supportSenderName).map((msg: any) => (
                      <Card key={msg.id} className="border-border/50">
                        <CardContent className="pt-6 space-y-3">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <p className="text-sm text-muted-foreground">
                                Sent: {new Date(msg.sent_at || msg.sentAt).toLocaleString()}
                              </p>
                              {msg.info && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  <span className="font-semibold">Info: </span>{msg.info}
                                </p>
                              )}
                            </div>
                            {user?.role === 'supplier' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  (async () => {
                                    try {
                                      await deleteMessage?.(msg.id);
                                      toast({
                                        title: "Success",
                                        description: "Message deleted",
                                      });
                                    } catch (err) {
                                      toast({
                                        title: "Error",
                                        description: "Failed to delete message",
                                        variant: "destructive",
                                      });
                                    }
                                  })();
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            )}
                          </div>
                          <p className="text-sm leading-relaxed bg-muted/50 p-3 rounded">
                            {msg.message}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
