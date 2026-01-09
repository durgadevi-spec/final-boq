import { useState, useEffect } from "react";
import { Layout } from "@/components/layout/Layout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { cn } from "@/lib/utils";
import { useData, Material, Shop, ShopApprovalRequest } from "@/lib/store";
import {
  Plus,
  Trash2,
  Building2,
  Package,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MapPin,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { postJSON, apiFetch } from "@/lib/api";
import { Link, useLocation } from "wouter";

/* 🔴 REQUIRED ASTERISK */
const Required = () => <span className="text-red-500 ml-1">*</span>;

const UNIT_OPTIONS = [
  "pcs",
  "kg",
  "meter",
  "sqft",
  "cum",
  "litre",
  "set",
  "nos",
];

// Removed hardcoded CATEGORY_OPTIONS - will be dynamic now

const COUNTRY_CODES = [
  { code: "+91", country: "India" },
  { code: "+1", country: "USA" },
  { code: "+44", country: "UK" },
  { code: "+61", country: "Australia" },
  { code: "+971", country: "UAE" },
  { code: "+81", country: "Japan" },
  { code: "+49", country: "Germany" },
];

export default function AdminDashboard() {
  const { toast } = useToast();
  const {
    shops,
    materials,
    addShop,
    addMaterial,
    user,
    approvalRequests,
    supportMessages,
    submitShopForApproval,
    submitMaterialForApproval,
    approveShop,
    rejectShop,
    deleteShop,
    deleteMaterial,
    addSupportMessage,
    deleteMessage,
  } = useData();

  const {
    materialApprovalRequests,
    approveMaterial,
    rejectMaterial,
  } = useData();
  
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  // ==== CATEGORIES & SUBCATEGORIES (Admin/Software Team Created) ====
  const [categories, setCategories] = useState<string[]>([]);
  const [disabledCategories, setDisabledCategories] = useState<string[]>([]);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingCategoryValue, setEditingCategoryValue] = useState("");
  const [subCategories, setSubCategories] = useState<any[]>([]);

  // Load categories from API on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/categories');
        if (res.ok) {
          const data = await res.json();
          if (data?.categories) setCategories(data.categories);
        }
      } catch (e) {
        console.warn('load categories failed', e);
      }
    })();
  }, []);

  // Load subcategories from API on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/subcategories-admin');
        if (res.ok) {
          const data = await res.json();
          if (data?.subcategories) setSubCategories(data.subcategories);
        }
      } catch (e) {
        console.warn('load subcategories failed', e);
      }
    })();
  }, []);

  // NEW CATEGORY/SUBCATEGORY INPUT
  const [newCategory, setNewCategory] = useState("");
  const [newSubCategory, setNewSubCategory] = useState("");
  const [selectedCategoryForSubCategory, setSelectedCategoryForSubCategory] = useState("");

  // Handle Add Category
  const handleAddCategory = async () => {
    if (!newCategory.trim()) {
      toast({
        title: "Error",
        description: "Category name is required",
        variant: "destructive",
      });
      return;
    }

    if (categories.includes(newCategory)) {
      toast({
        title: "Error",
        description: "This category already exists",
        variant: "destructive",
      });
      return;
    }

    try {
      const res = await postJSON('/categories', { name: newCategory });
      setCategories((prev: string[]) => [...prev, newCategory]);
      toast({
        title: "Success",
        description: `Category "${newCategory}" created`,
      });
      setNewCategory("");
    } catch (err: any) {
      console.error('add category error', err);
      toast({
        title: "Error",
        description: err?.message || 'Failed to create category',
        variant: "destructive",
      });
    }
  };

  // Handle Add SubCategory
  const handleAddSubCategory = async () => {
    if (!newSubCategory.trim()) {
      toast({
        title: "Error",
        description: "Sub-category name is required",
        variant: "destructive",
      });
      return;
    }

    if (!selectedCategoryForSubCategory) {
      toast({
        title: "Error",
        description: "Please select a category first",
        variant: "destructive",
      });
      return;
    }

    try {
      const res = await postJSON('/subcategories', { 
        name: newSubCategory, 
        category: selectedCategoryForSubCategory 
      });

      const newSub = {
        id: Math.random().toString(),
        name: newSubCategory,
        category: selectedCategoryForSubCategory,
        createdAt: new Date().toISOString(),
      };

      setSubCategories((prev: any[]) => [...prev, newSub]);
      toast({
        title: "Success",
        description: `Sub-category "${newSubCategory}" created under ${selectedCategoryForSubCategory}`,
      });
      setNewSubCategory("");
    } catch (err: any) {
      console.error('add subcategory error', err);
      toast({
        title: "Error",
        description: err?.message || 'Failed to create subcategory',
        variant: "destructive",
      });
    }
  };

  // Get SubCategories for selected Category
  const getSubCategoriesForCategory = (category: string) => {
    return subCategories.filter((sc: any) => sc.category === category);
  };

  // ==== MASTER MATERIALS STATE (created by Admin/Software Team with just name + code) ====
  const [masterMaterials, setMasterMaterials] = useState<any[]>([]);

  // Load master materials from API
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/material-templates');
        if (res.ok) {
          const data = await res.json();
          setMasterMaterials(data?.templates || []);
        }
      } catch (e) {
        console.warn('load master materials failed', e);
        setMasterMaterials([]);
      }
    })();
  }, []);
  
  // Local managed copies so admin can edit/delete/disable items in UI
  const [localMaterials, setLocalMaterials] = useState(() => [] as Array<any>);
  const [localShops, setLocalShops] = useState(() => [] as Array<any>);
  const [masterSearch, setMasterSearch] = useState("");
  const [masterView, setMasterView] = useState<'grid'|'list'>('grid');

  // Search inputs for dashboard lists
  const [shopSearch, setShopSearch] = useState<string>("");
  const [materialSearch, setMaterialSearch] = useState<string>("");

  const filteredShops = localShops.filter((s: any) => {
    if (!shopSearch) return true;
    const q = shopSearch.toLowerCase();
    return (
      (s.name || "").toLowerCase().includes(q) ||
      (s.location || "").toLowerCase().includes(q) ||
      (s.city || "").toLowerCase().includes(q)
    );
  });

  const filteredMaterials = localMaterials.filter((m: any) => {
    if (!materialSearch) return true;
    const q = materialSearch.toLowerCase();
    return (
      (m.name || "").toLowerCase().includes(q) ||
      (m.code || "").toLowerCase().includes(q)
    );
  });

  const [materialRequests, setMaterialRequests] = useState<any[]>([]);
  const [shopRequests, setShopRequests] = useState<any[]>([]);
  const [supportMsgs, setSupportMsgs] = useState<any[]>([]);
  const [supplierMaterialSubmissions, setSupplierMaterialSubmissions] = useState<any[]>([]);

  // Load supplier material submissions (from material_submissions table)
  useEffect(() => {
    const loadSupplierSubmissions = async () => {
      try {
        const token = localStorage.getItem("authToken");
        const response = await fetch("/api/material-submissions-pending-approval", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (response.ok) {
          const data = await response.json();
          // Transform the response to match material request format
          const submissions = (data.submissions || []).map((s: any) => ({
            id: s.submission.id,
            status: "pending",
            source: 'submission',
            material: {
              id: s.submission.id,
              name: s.submission.template_name || "Supplier Material",
              code: s.submission.template_code || "",
              rate: s.submission.rate,
              unit: s.submission.unit,
              category: "",
              subCategory: s.submission.subcategory,
              brandName: s.submission.brandname,
              modelNumber: s.submission.modelnumber,
              technicalSpecification: s.submission.technicalspecification,
            },
            submittedBy: s.submission.shop_name || "Supplier",
            submittedAt: s.submission.created_at,
            templateId: s.submission.template_id,
            shopId: s.submission.shop_id,
          }));
          setSupplierMaterialSubmissions(submissions);
        }
      } catch (e) {
        console.warn("Failed to load supplier material submissions", e);
      }
    };
    loadSupplierSubmissions();
  }, []);

  // initialize local request lists from central store's approval lists
  useEffect(() => {
    setShopRequests(approvalRequests || []);
  }, [approvalRequests]);

  // Load shop approval requests directly from API (for purchase_team and admin)
  useEffect(() => {
    const loadShopApprovals = async () => {
      try {
        const res = await fetch('/api/shops-pending-approval');
        if (res.ok) {
          const data = await res.json();
          if (data?.shops) {
            // Transform API response to match shopRequest format
            const transformed = data.shops.map((r: any) => ({
              id: r.id,
              shop: r.shop || r,
              status: r.status || 'pending',
              submittedBy: r.submittedBy || 'Unknown',
              submittedAt: r.submittedAt || new Date().toISOString(),
            }));
            setShopRequests(transformed);
          }
        }
      } catch (e) {
        console.warn('Failed to load shop approvals from API', e);
      }
    };
    loadShopApprovals();
  }, []);

  useEffect(() => {
    // Combine manually created materials + supplier submissions
    const combined = [...(materialApprovalRequests || []), ...supplierMaterialSubmissions];
    setMaterialRequests(combined);
  }, [materialApprovalRequests, supplierMaterialSubmissions]);

  // Load material approval requests directly from API (for purchase_team and admin)
  useEffect(() => {
    const loadMaterialApprovals = async () => {
      try {
        const res = await fetch('/api/materials-pending-approval');
        if (res.ok) {
          const data = await res.json();
          if (data?.materials) {
            // Transform API response to match materialRequest format
            const transformed = data.materials.map((r: any) => ({
              id: r.id,
              material: r.material || r,
              status: r.status || 'pending',
              submittedBy: r.submittedBy || 'Unknown',
              submittedAt: r.submittedAt || new Date().toISOString(),
            }));
            setMaterialRequests(prev => [...prev, ...transformed]);
          }
        }
      } catch (e) {
        console.warn('Failed to load material approvals from API', e);
      }
    };
    loadMaterialApprovals();
  }, []);

  useEffect(() => {
    // initialize local copies from store
    setLocalMaterials(materials || []);
  }, [materials]);

  useEffect(() => {
    setLocalShops(shops || []);
  }, [shops]);

  // ===== ADMIN/SOFTWARE TEAM: Master Material (Name + Code only) =====
  const [newMasterMaterial, setNewMasterMaterial] = useState<{
    name: string;
    code: string;
  }>({
    name: "",
    code: "",
  });

  // Auto-generate code when admin enters material name
  useEffect(() => {
    if (newMasterMaterial.name) {
      const code =
        newMasterMaterial.name.substring(0, 3).toUpperCase() +
        "-" +
        Math.floor(1000 + Math.random() * 9000);
      setNewMasterMaterial((prev) => ({ ...prev, code }));
    }
  }, [newMasterMaterial.name]);

  const handleAddMasterMaterial = async () => {
    if (!newMasterMaterial.name.trim()) {
      toast({
        title: "Error",
        description: "Material Name is required",
        variant: "destructive",
      });
      return;
    }

    try {
      // Persist the master material as a template so suppliers can pick it
      const payload: any = {
        name: newMasterMaterial.name.trim(),
        code: newMasterMaterial.code,
      };

      const res = await postJSON('/material-templates', payload);
      const created = res.template || res;

      setMasterMaterials((prev: any[]) => [...prev, created]);

      toast({
        title: "Success",
        description: "Master material created. Suppliers can now use this.",
      });

      setNewMasterMaterial({ name: "", code: "" });
    } catch (err: any) {
      console.error('create master material error', err);
      toast({
        title: "Error",
        description: err?.message || 'Failed to create master material',
        variant: "destructive",
      });
    }
  };

  // ===== SUPPLIER: Detailed Material (Select from Master + Fill Details) =====
  const [selectedMasterId, setSelectedMasterId] = useState<string>("");
  
  const [newMaterial, setNewMaterial] = useState<Partial<Material>>({
    name: "",
    code: "",
    rate: 0,
    unit: "pcs",
    category: "",
    subCategory: "",
    brandName: "",
    modelNumber: "",
    technicalSpecification: "",
    dimensions: "",
    finish: "",
    metalType: "",
  });

  const handleSelectMasterMaterial = (masterId: string) => {
    const selected = masterMaterials.find((m: any) => m.id === masterId);
    if (selected) {
      setSelectedMasterId(masterId);
      setNewMaterial({
        ...newMaterial,
        name: selected.name,
        code: selected.code,
      });
    }
  };

  const handleAddMaterial = () => {
    if (!newMaterial.name || !newMaterial.rate) {
      toast({
        title: "Error",
        description: "Name, Rate, and Unit are required",
        variant: "destructive",
      });
      return;
    }

    // Determine Shop ID based on role
    let shopId = "1";
    if (user?.role === "supplier" && user.shopId) {
      shopId = user.shopId;
    } else if (user?.role === "purchase_team" && newMaterial.shopId) {
      shopId = newMaterial.shopId;
    }

    // Mock validation
    if (
      newMaterial.name.toLowerCase().includes("toy") ||
      newMaterial.name.toLowerCase().includes("game")
    ) {
      toast({
        title: "Warning Sent to Admin",
        description: "Irrelevant material detected. Flagged for review.",
        variant: "destructive",
      });
      return;
    }

    const newRequest = {
      id: Math.random().toString(),
      material: { ...newMaterial, shopId },
      submittedBy: user?.name,
      submittedAt: new Date().toISOString(),
      status: "pending",
    };

    setMaterialRequests((prev: any[]) => [...prev, newRequest]);

    toast({
      title: "Success",
      description:
        "Material submitted for approval. Software team will review and approve/reject.",
    });

    // Reset form
    setNewMaterial({
      name: "",
      code: "",
      rate: 0,
      unit: "pcs",
      category: "",
      subCategory: "",
      brandName: "",
      modelNumber: "",
      technicalSpecification: "",
      dimensions: "",
      finish: "",
      metalType: "",
    });
    setSelectedMasterId("");
  };

  const handleEditMaterial = (mat: any) => {
    setEditingMaterialId(mat.id);
    setNewMaterial({
      name: mat.name,
      code: mat.code,
      rate: mat.rate,
      unit: mat.unit,
      category: mat.category || "",
      subCategory: mat.subCategory || "",
      brandName: mat.brandName || "",
      modelNumber: mat.modelNumber || "",
      technicalSpecification: mat.technicalSpecification || "",
      dimensions: mat.dimensions || "",
      finish: mat.finish || "",
      metalType: mat.metalType || "",
    });
    // stay on the dashboard and allow inline editing
  };

  const handleUpdateMaterial = async () => {
    if (!editingMaterialId) return;
    try {
      // try server update using PUT (server expects PUT /api/materials/:id)
      try {
        const res = await apiFetch(`/materials/${editingMaterialId}`, { method: 'PUT', body: JSON.stringify(newMaterial) });
        if (res.ok) {
          const data = await res.json();
          const updated = data?.material || data;
          // update local UI state with server response (prefer server fields)
          setLocalMaterials((prev: any[]) => prev.map((m: any) => (m.id === editingMaterialId ? { ...m, ...updated } : m)));
        } else {
          // log server error body
          try { const txt = await res.text(); console.warn('[handleUpdateMaterial] server responded non-ok', res.status, txt); } catch { console.warn('[handleUpdateMaterial] server responded non-ok', res.status); }
          // fallback to applying locally
          setLocalMaterials((prev: any[]) => prev.map((m: any) => (m.id === editingMaterialId ? { ...m, ...newMaterial } : m)));
        }
      } catch (e) {
        console.warn('[handleUpdateMaterial] server update failed, applying locally', e);
        setLocalMaterials((prev: any[]) => prev.map((m: any) => (m.id === editingMaterialId ? { ...m, ...newMaterial } : m)));
      }

      toast({ title: 'Updated', description: 'Material details updated' });
      setEditingMaterialId(null);
      setNewMaterial({ name: '', code: '', rate: 0, unit: 'pcs', category: '', subCategory: '', brandName: '', modelNumber: '', technicalSpecification: '', dimensions: '', finish: '', metalType: '' });
    } catch (err: any) {
      toast({ title: 'Error', description: 'Failed to update material', variant: 'destructive' });
    }
  };

  // State for new shop
  const [newShop, setNewShop] = useState<Partial<Shop>>({
    name: "",
    location: "",
    city: "",
    state: "",
    country: "",
    pincode: "",
    phoneCountryCode: "+91",
    gstNo: "",
    rating: 5,
  });

  // Editing states
  const [editingShopId, setEditingShopId] = useState<string | null>(null);
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);

  // State for support message
  const [supportMsg, setSupportMsg] = useState("");
  const [supportSenderName, setSupportSenderName] = useState("");
  const [supportSenderInfo, setSupportSenderInfo] = useState("");

  const handleAddShop = () => {
    if (
      !newShop.name ||
      !newShop.phoneCountryCode ||
      !newShop.city ||
      !newShop.state ||
      !newShop.country ||
      !newShop.pincode
    ) {
      toast({
        title: "Error",
        description: "All fields are required (GST is optional)",
        variant: "destructive",
      });
      return;
    }

    (async () => {
      try {
        // Try to submit to server (requires auth). If it succeeds, use server id.
        let created: any = null;
        if (typeof submitShopForApproval === 'function') {
          created = await submitShopForApproval({ ...newShop });
        } else {
          console.warn('[handleAddShop] submitShopForApproval missing from useData; falling back to local save');
        }
        if (created && created.id) {
          const serverRequest = {
            id: created.id,
            shop: created,
            submittedBy: user?.name,
            submittedAt: new Date().toISOString(),
            status: "pending",
          };
          setShopRequests((prev: any[]) => [serverRequest, ...prev]);
          setActiveTab('approvals');
          toast({ title: "Success", description: "Shop submitted for approval (server)" });
        } else {
          // fallback to local pending request
          const newRequest = {
            id: Math.random().toString(),
            shop: { ...newShop },
            submittedBy: user?.name,
            submittedAt: new Date().toISOString(),
            status: "pending",
          };
          setShopRequests((prev: any[]) => [newRequest, ...prev]);
          setActiveTab('approvals');
          toast({ title: "Saved Locally", description: "Shop saved locally; will sync when server is available" });
        }
      } catch (err: any) {
        console.warn('submit shop failed', err);
        const msg = err?.message || String(err);
        const newRequest = {
          id: Math.random().toString(),
          shop: { ...newShop },
          submittedBy: user?.name,
          submittedAt: new Date().toISOString(),
          status: "pending",
        };
        setShopRequests((prev: any[]) => [newRequest, ...prev]);
        setActiveTab('approvals');
        if (msg.includes('401') || /unauthori/i.test(msg)) {
          toast({ title: "Saved Locally (Unauthorized)", description: "You are not logged in as admin — please log in to submit to server.", variant: 'destructive' });
        } else {
          toast({ title: "Saved Locally", description: `Shop saved locally; server submit failed: ${msg}`, variant: 'destructive' });
        }
      } finally {
        setNewShop({
          name: "",
          location: "",
          city: "",
          phoneCountryCode: "+91",
          state: "",
          country: "",
          pincode: "",
          gstNo: "",
        });
        setEditingShopId(null);
      }
    })();
  };

  const handleEditShop = (shop: any) => {
    setEditingShopId(shop.id);
    setNewShop({
      name: shop.name,
      location: shop.location,
      city: shop.city,
      state: shop.state,
      country: shop.country,
      pincode: shop.pincode,
      phoneCountryCode: shop.phoneCountryCode || "+91",
      gstNo: shop.gstNo || "",
      rating: shop.rating || 5,
    });
    // open shops tab
    setActiveTab("shops");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", "shops");
      window.history.replaceState({}, "", url.toString());
    }
  };

  const handleUpdateShop = async () => {
    if (!editingShopId) return;
    try {
      // try server update
      try {
        await postJSON(`/shops/${editingShopId}`, newShop);
      } catch (e) {
        console.warn('[handleUpdateShop] server update failed, applying locally', e);
      }
      // update local UI state
      setLocalShops((prev: any[]) => prev.map((s: any) => (s.id === editingShopId ? { ...s, ...newShop } : s)));
      toast({ title: 'Updated', description: 'Shop details updated' });
      setEditingShopId(null);
      setNewShop({ name: '', location: '', city: '', phoneCountryCode: '+91', state: '', country: '', pincode: '', gstNo: '' });
    } catch (err: any) {
      toast({ title: 'Error', description: 'Failed to update shop', variant: 'destructive' });
    }
  };


  const handleApproveShop = (request: any) => {
    (async () => {
      try {
        const shopId = request?.shop?.id;
        if (!shopId) {
          toast({ title: "Cannot Approve", description: "This shop is saved locally and has not been submitted to the server.", variant: 'destructive' });
          return;
        }
        await approveShop?.(shopId);
        setShopRequests((prev: any[]) => prev.filter((r: any) => r.id !== request.id));
        toast({ title: "Approved", description: "Shop has been approved and added to the system" });
      } catch (e) {
        toast({ title: "Error", description: "Failed to approve shop", variant: "destructive" });
      }
    })();
  };

  const handleRejectShop = (request: any) => {
    if (!rejectReason.trim()) {
      toast({
        title: "Error",
        description: "Please provide a rejection reason",
        variant: "destructive",
      });
      return;
    }
    (async () => {
      try {
        const shopId = request?.shop?.id;
        if (!shopId) {
          // If there's no server id, just remove the local request
          setShopRequests((prev: any[]) => prev.filter((r: any) => r.id !== request.id));
          setRejectingId(null);
          setRejectReason("");
          toast({ title: "Removed", description: "Local shop request removed" });
          return;
        }
        await rejectShop?.(shopId, rejectReason);
        setShopRequests((prev: any[]) => prev.filter((r: any) => r.id !== request.id));
        setRejectingId(null);
        setRejectReason("");
        toast({ title: "Rejected", description: "Shop has been rejected" });
      } catch (e) {
        toast({ title: "Error", description: "Failed to reject shop", variant: "destructive" });
      }
    })();
  };

  const handleApproveMaterial = (requestId: string) => {
    (async () => {
      try {
        // find the request to determine source
        const req = materialRequests.find((r: any) => r.id === requestId) || supplierMaterialSubmissions.find((r: any) => r.id === requestId);
        if (req && req.source === 'submission') {
          // approve supplier submission
          await postJSON(`/material-submissions/${requestId}/approve`, {});
          // refresh supplier submissions list
          setSupplierMaterialSubmissions((prev: any[]) => prev.filter((r: any) => r.id !== requestId));
          setMaterialRequests((prev: any[]) => prev.filter((r: any) => r.id !== requestId));
          toast({ title: "Approved", description: "Supplier submission approved and material added" });
        } else {
          await approveMaterial?.(requestId);
          setMaterialRequests((prev: any[]) => prev.filter((r: any) => r.id !== requestId));
          toast({ title: "Approved", description: "Material has been approved and added to the system" });
        }
      } catch (e) {
        toast({ title: "Error", description: "Failed to approve material", variant: "destructive" });
      }
    })();
  };

  const handleRejectMaterial = (requestId: string) => {
    (async () => {
      try {
        const req = materialRequests.find((r: any) => r.id === requestId) || supplierMaterialSubmissions.find((r: any) => r.id === requestId);
        if (req && req.source === 'submission') {
          await postJSON(`/material-submissions/${requestId}/reject`, { reason: rejectReason || 'Rejected by admin' });
          setSupplierMaterialSubmissions((prev: any[]) => prev.filter((r: any) => r.id !== requestId));
          setMaterialRequests((prev: any[]) => prev.filter((r: any) => r.id !== requestId));
          setRejectingId(null);
          setRejectReason("");
          toast({ title: "Rejected", description: "Supplier submission rejected" });
        } else {
          await rejectMaterial?.(requestId, "Rejected by admin");
          setMaterialRequests((prev: any[]) => prev.filter((r: any) => r.id !== requestId));
          toast({ title: "Rejected", description: "Material has been rejected" });
        }
      } catch (e) {
        toast({ title: "Error", description: "Failed to reject material", variant: "destructive" });
      }
    })();
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

  const canViewSupportMessages =
    user?.role === "admin" || user?.role === "software_team" || user?.role === "purchase_team";

  const canManageShops =
    user?.role === "admin" ||
    user?.role === "software_team" ||
    user?.role === "supplier" ||
    user?.role === "purchase_team";
  
  const canAddMaterials =
    user?.role === "admin" ||
    user?.role === "supplier" ||
    user?.role === "purchase_team";
  
  const canAccessSupport = user?.role === "supplier" || user?.role === "user";

  const isAdminOrSoftwareTeam =
    user?.role === "admin" || user?.role === "software_team";

  const canViewCategories =
    user?.role === "admin" || user?.role === "software_team" || user?.role === "purchase_team";

  const canManageCategories =
    user?.role === "admin" || user?.role === "software_team";

  // Permission for viewing all tabs but no edit/delete for purchase_team
  const canEditDelete =
    user?.role === "admin" || user?.role === "software_team";

  // Permission for approve/reject - Admin, Software Team, and Purchase Team
  const canApproveReject =
    user?.role === "admin" || user?.role === "software_team" || user?.role === "purchase_team";

  // Controlled tab state based on URL ?tab= and location changes
  const [, loc] = useLocation();

  const computeTab = () => {
    if (typeof window !== "undefined") {
      const t = new URLSearchParams(window.location.search).get("tab");
      if (t) return t;
    }
    // default to dashboard view
    return "dashboard";
  };

  const [activeTab, setActiveTab] = useState<string>(computeTab());

  // update activeTab when location changes (sidebar link navigation)
  useEffect(() => {
    setActiveTab(computeTab());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc]);

  // Also listen to history changes (pushState/replaceState/popstate) so query updates update the tab
  useEffect(() => {
    const update = () => setActiveTab(computeTab());

    // popstate covers browser navigation
    window.addEventListener("popstate", update);

    // monkey-patch pushState/replaceState to emit popstate so client-side navigations (wouter) are caught
    const origPush = history.pushState;
    const origReplace = history.replaceState;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (history as any).pushState = function (...args: any[]) {
      const res = origPush.apply(this, args);
      window.dispatchEvent(new PopStateEvent("popstate"));
      return res;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (history as any).replaceState = function (...args: any[]) {
      const res = origReplace.apply(this, args);
      window.dispatchEvent(new PopStateEvent("popstate"));
      return res;
    };

    // run once to sync
    update();

    return () => {
      window.removeEventListener("popstate", update);
      (history as any).pushState = origPush;
      (history as any).replaceState = origReplace;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight font-heading">
            {user?.role === "supplier"
              ? "Supplier Portal"
              : user?.role === "purchase_team"
              ? "Purchase Team Dashboard"
              : "Admin Dashboard"}
          </h2>
          <p className="text-muted-foreground">
            Manage your inventory and settings
          </p>
        </div>

        {/* Stats Overview (shown only on Dashboard tab) */}
        {activeTab === "dashboard" && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Shops
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{shops.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Materials
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{materials.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-600 flex items-center gap-2">
                <AlertTriangle className="h-6 w-6" /> 2
              </div>
            </CardContent>
          </Card>
        </div>

          {(isAdminOrSoftwareTeam || user?.role === "purchase_team") && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>All Shops</CardTitle>
                  <CardDescription className="text-sm">List of shops (compact)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="mb-2">
                    <Input
                      value={shopSearch}
                      onChange={(e) => setShopSearch(e.target.value)}
                      placeholder="Search shops..."
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {filteredShops.length === 0 ? (
                      <p className="text-muted-foreground">No shops available</p>
                    ) : (
                      filteredShops.map((shop: any) => (
                        <div key={shop.id} className="flex items-center justify-between p-2 border-b">
                          <div>
                            <div className="font-medium text-sm">{shop.name}</div>
                            <div className="text-xs text-muted-foreground">{shop.location}, {shop.city}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            {canEditDelete && (
                              <>
                                <Button size="sm" onClick={() => handleEditShop(shop)}>Edit</Button>
                                <Button size="sm" onClick={() => setLocalShops((prev: any[]) => prev.map((s: any) => s.id === shop.id ? { ...s, disabled: !s.disabled } : s))}>
                                  {shop.disabled ? 'Enable' : 'Disable'}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive"
                                  onClick={() => {
                                    // permanent delete via API
                                    deleteShop(shop.id).then(() => {
                                      setLocalShops((prev: any[]) => prev.filter((p: any) => p.id !== shop.id));
                                      toast({ title: 'Deleted', description: `${shop.name} removed` });
                                    }).catch(() => {
                                      setLocalShops((prev: any[]) => prev.filter((p: any) => p.id !== shop.id));
                                      toast({ title: 'Deleted', description: `${shop.name} removed` });
                                    });
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>All Materials</CardTitle>
                  <CardDescription className="text-sm">List of materials (compact)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="mb-2">
                    <Input
                      value={materialSearch}
                      onChange={(e) => setMaterialSearch(e.target.value)}
                      placeholder="Search materials..."
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {filteredMaterials.length === 0 ? (
                      <p className="text-muted-foreground">No materials available</p>
                    ) : (
                      filteredMaterials.map((mat: any) => (
                        <div key={mat.id} className="p-2 border-b">
                          {editingMaterialId === mat.id ? (
                            <div className="space-y-2">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <div>
                                  <Label>Name</Label>
                                  <Input value={newMaterial.name || ''} onChange={(e) => setNewMaterial({ ...newMaterial, name: e.target.value })} />
                                </div>
                                <div>
                                  <Label>Code</Label>
                                  <Input value={newMaterial.code || ''} onChange={(e) => setNewMaterial({ ...newMaterial, code: e.target.value })} />
                                </div>
                                <div>
                                  <Label>Rate</Label>
                                  <Input type="number" value={newMaterial.rate || ''} onChange={(e) => setNewMaterial({ ...newMaterial, rate: parseFloat(e.target.value) || 0 })} />
                                </div>
                                <div>
                                  <Label>Unit</Label>
                                  <Select value={newMaterial.unit || ''} onValueChange={(v) => setNewMaterial({ ...newMaterial, unit: v })}>
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {UNIT_OPTIONS.map((c) => (
                                        <SelectItem key={c} value={c}>{c}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label>Category</Label>
                                  <Select value={newMaterial.category || ''} onValueChange={(v) => setNewMaterial({ ...newMaterial, category: v, subCategory: '' })}>
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {categories.map((c: string) => (
                                        <SelectItem key={c} value={c}>{c}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label>Sub Category</Label>
                                  <Select value={newMaterial.subCategory || ''} onValueChange={(v) => setNewMaterial({ ...newMaterial, subCategory: v })}>
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {getSubCategoriesForCategory(newMaterial.category || '').map((sc: any) => (
                                        <SelectItem key={sc.id} value={sc.name}>{sc.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label>Brand Name</Label>
                                  <Input value={newMaterial.brandName || ''} onChange={(e) => setNewMaterial({ ...newMaterial, brandName: e.target.value })} />
                                </div>
                                <div>
                                  <Label>Model Number</Label>
                                  <Input value={newMaterial.modelNumber || ''} onChange={(e) => setNewMaterial({ ...newMaterial, modelNumber: e.target.value })} />
                                </div>
                              </div>
                              <div>
                                <Label>Technical Specification</Label>
                                <Textarea value={newMaterial.technicalSpecification || ''} onChange={(e) => setNewMaterial({ ...newMaterial, technicalSpecification: e.target.value })} />
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" onClick={handleUpdateMaterial}>Save Changes</Button>
                                <Button size="sm" variant="ghost" onClick={() => { setEditingMaterialId(null); setNewMaterial({ name: '', code: '', rate: 0, unit: 'pcs', category: '', subCategory: '', brandName: '', modelNumber: '', technicalSpecification: '', dimensions: '', finish: '', metalType: '' }); }}>Cancel</Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium text-sm">{mat.name}</div>
                                <div className="text-xs text-muted-foreground">{mat.code} • ₹{mat.rate}/{mat.unit}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button size="sm" onClick={() => setLocalMaterials((prev: any[]) => prev.map((m: any) => m.id === mat.id ? { ...m, disabled: !m.disabled } : m))}>
                                  {mat.disabled ? 'Enable' : 'Disable'}
                                </Button>
                                <Button size="sm" onClick={() => handleEditMaterial(mat)}>Edit</Button>
                                {canEditDelete && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive"
                                    onClick={() => {
                                      deleteMaterial(mat.id).then(() => {
                                        setLocalMaterials((prev: any[]) => prev.filter((p: any) => p.id !== mat.id));
                                        toast({ title: 'Deleted', description: `${mat.name} removed` });
                                      }).catch(() => {
                                        setLocalMaterials((prev: any[]) => prev.filter((p: any) => p.id !== mat.id));
                                        toast({ title: 'Deleted', description: `${mat.name} removed` });
                                      });
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {user?.role === 'supplier' && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Available  Materials</CardTitle>
                  <CardDescription className="text-sm">Select a material </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Input value={(typeof masterSearch !== 'undefined') ? masterSearch : ''} onChange={(e) => setMasterSearch(e.target.value)} placeholder="Search templates..." />
                      <div className="inline-flex rounded-md shadow-sm" role="group">
                        <Button size="sm" variant={masterView==='grid' ? undefined : 'ghost'} onClick={() => setMasterView('grid')}>Grid</Button>
                        <Button size="sm" variant={masterView==='list' ? undefined : 'ghost'} onClick={() => setMasterView('list')}>List</Button>
                      </div>
                    </div>
                    <div />
                  </div>
                  
                  {masterMaterials.length === 0 ? (
                    <p className="text-muted-foreground">No master materials yet</p>
                  ) : (
                    <div className="space-y-2">
                      {masterMaterials.map((mm: any) => (
                        <div key={mm.id} className="p-2 border-b flex items-center justify-between">
                          <div className="text-sm">{mm.name} <span className="text-xs text-muted-foreground ml-2">{mm.code}</span></div>
                          <Link href={`/admin/dashboard?tab=materials`}>
                            <span className="text-sm text-sidebar-primary">Use</span>
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Add Shop</CardTitle>
                  <CardDescription className="text-sm">Suppliers can add their shop</CardDescription>
                </CardHeader>
                <CardContent>
                  <Link href="/admin/dashboard?tab=shops"><span className="text-sm text-sidebar-primary">Open Add Shop</span></Link>
                </CardContent>
              </Card>
            </div>
          )}
          </div>
        )}

        <Tabs
          value={activeTab}
          onValueChange={(val) => {
            setActiveTab(val);
            if (typeof window !== "undefined") {
              const url = new URL(window.location.href);
              url.searchParams.set("tab", val);
              window.history.replaceState({}, "", url.toString());
            }
          }}
          className="w-full"
        >
          {/* Tabs Navigation Hidden - Navigation through sidebar only */}

          {/* === CATEGORIES TAB (Admin/Software Team can manage, Purchase Team can view) === */}
          {canViewCategories && (
            <TabsContent value="categories" className="space-y-4 mt-4">
              {/* Add New Category - Only for Admin/Software Team */}
              {canManageCategories && (
                <Card className="border-purple-200 bg-purple-50">
                  <CardHeader>
                    <CardTitle className="text-purple-900">
                      ➕ Add New Category
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex gap-2">
                      <Input
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        placeholder="e.g. Flooring, Roofing"
                        className="flex-1"
                      />
                      <Button
                        onClick={handleAddCategory}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        <Plus className="h-4 w-4 mr-2" /> Add
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Categories List */}
              {categories.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Categories ({categories.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {editingCategory && (
                      <div className="p-3 mb-3 bg-white rounded border">
                        <div className="flex gap-2">
                          <Input value={editingCategoryValue} onChange={(e) => setEditingCategoryValue(e.target.value)} />
                          <Button onClick={() => {
                            // save edit
                            const old = editingCategory;
                            const updated = editingCategoryValue.trim();
                            if (!updated) return;
                            setCategories((prev: string[]) => prev.map((c: string) => c === old ? updated : c));
                            setSubCategories((prev: any[]) => prev.map((s: any) => s.category === old ? { ...s, category: updated } : s));
                            setEditingCategory(null);
                            setEditingCategoryValue("");
                            toast({ title: 'Updated', description: `Category updated to ${updated}` });
                          }}>Save</Button>
                          <Button variant="ghost" onClick={() => { setEditingCategory(null); setEditingCategoryValue(""); }}>Cancel</Button>
                        </div>
                      </div>
                    )}
                    <div className="space-y-3">
                      {categories.map((cat: string, idx: number) => {
                        const subCats = getSubCategoriesForCategory(cat);
                        return (
                          <div key={idx} className="p-3 border rounded bg-purple-50 hover:bg-purple-100 transition">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Package className="h-4 w-4 text-purple-600" />
                                <span className="font-medium text-sm">{cat}</span>
                                {disabledCategories.includes(cat) && (
                                  <span className="text-xs text-muted-foreground">(disabled)</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Button size="sm" onClick={() => { setEditingCategory(cat); setEditingCategoryValue(cat); }}>Edit</Button>
                                <Button size="sm" onClick={() => setDisabledCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])}>
                                  {disabledCategories.includes(cat) ? 'Enable' : 'Disable'}
                                </Button>
                                <Button size="sm" variant="destructive" onClick={async () => {
                                  if (!window.confirm(`Delete category "${cat}" and its subcategories? This cannot be undone.`)) return;
                                  try {
                                    const token = localStorage.getItem('authToken');
                                    const res = await fetch(`/api/categories/${encodeURIComponent(cat)}`, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {} });
                                    if (!res.ok) {
                                      const txt = await res.text();
                                      throw new Error(txt || `delete failed ${res.status}`);
                                    }
                                    // remove locally
                                    setCategories(prev => prev.filter(c => c !== cat));
                                    setSubCategories(prev => prev.filter(s => s.category !== cat));
                                    toast({ title: 'Deleted', description: `Category ${cat} removed` });
                                  } catch (err) {
                                    console.error('delete category error', err);
                                    toast({ title: 'Error', description: 'Failed to delete category', variant: 'destructive' });
                                  }
                                }}>Delete</Button>
                              </div>
                            </div>
                            {subCats.length > 0 && (
                              <div className="ml-6 text-xs text-muted-foreground space-y-1">
                                {subCats.map((sub: any) => (
                                  <div key={sub.id} className="flex items-center gap-2">
                                    <span className="inline-block w-1 h-1 rounded-full bg-gray-400"></span>
                                    {sub.name}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Add SubCategory - Only for Admin/Software Team */}
              {canManageCategories && (
                <Card className="border-green-200 bg-green-50">
                  <CardHeader>
                    <CardTitle className="text-green-900">
                      ➕ Add Sub-Category
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Select Category <span className="text-red-500">*</span></Label>
                      <Select
                        value={selectedCategoryForSubCategory}
                        onValueChange={setSelectedCategoryForSubCategory}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a category..." />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((cat: string) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Sub-Category Name <span className="text-red-500">*</span></Label>
                      <div className="flex gap-2">
                        <Input
                          value={newSubCategory}
                          onChange={(e) => setNewSubCategory(e.target.value)}
                          placeholder="e.g. Commercial, Residential"
                          className="flex-1"
                        />
                        <Button
                          onClick={handleAddSubCategory}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <Plus className="h-4 w-4 mr-2" /> Add
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Shops list moved to Shops tab */}
            
            </TabsContent>
          )}

          {/* === MATERIALS TAB === */}
          <TabsContent value="materials" className="space-y-4 mt-4">
            {/* ADMIN/SOFTWARE/PURCHASE_TEAM: Create Master Material */}
            {(isAdminOrSoftwareTeam || user?.role === "purchase_team") && (
              <Card className="border-blue-200 bg-blue-50">
                  <CardHeader>
                    <CardTitle className="text-blue-900">
                      <Package className="inline-block mr-2 h-4 w-4 text-blue-900" /> Create Material
                    </CardTitle>
                    <CardDescription className="text-blue-800">
                       Add new material templates for suppliers to use
                    </CardDescription>
                  </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>
                        Material Name <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        value={newMasterMaterial.name}
                        onChange={(e) =>
                          setNewMasterMaterial({
                            ...newMasterMaterial,
                            name: e.target.value,
                          })
                        }
                        placeholder="Enter material name"
                      />
                      {newMasterMaterial.name && 
                        masterMaterials.some((m: any) => m.name.toLowerCase().trim() === newMasterMaterial.name.toLowerCase().trim()) && (
                        <p className="text-xs text-red-600 mt-1">
                          ⚠️ This material name already exists
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Item Code (Auto)</Label>
                      <Input
                        value={newMasterMaterial.code}
                        disabled
                        className="bg-muted"
                      />
                      {newMasterMaterial.code && 
                        masterMaterials.some((m: any) => m.code === newMasterMaterial.code) && (
                        <p className="text-xs text-red-600 mt-1">
                          ⚠️ This item code already exists
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    onClick={handleAddMasterMaterial}
                    disabled={
                      !newMasterMaterial.name.trim() ||
                      masterMaterials.some((m: any) => m.name.toLowerCase().trim() === newMasterMaterial.name.toLowerCase().trim()) ||
                      masterMaterials.some((m: any) => m.code === newMasterMaterial.code)
                    }
                    className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Create Material
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* SUPPLIER: Add Detailed Material from Master */}
            {user?.role === "supplier" && (
              <Card>
                <CardHeader>
                  <CardTitle>Add Material to Inventory</CardTitle>
                  <CardDescription>
                    Select a master material and fill in additional details
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-end">
                    <Button size="sm" onClick={async () => {
                      try {
                        const res = await fetch('/api/categories');
                        if (res.ok) {
                          const data = await res.json();
                          if (data?.categories) setCategories(data.categories);
                        }
                      } catch (e) { console.warn('refresh categories failed', e); }
                      try {
                        const res2 = await fetch('/api/subcategories-admin');
                        if (res2.ok) {
                          const data2 = await res2.json();
                          if (data2?.subcategories) setSubCategories(data2.subcategories);
                        }
                      } catch (e) { console.warn('refresh subcategories failed', e); }
                      toast({ title: 'Refreshed', description: 'Categories and subcategories reloaded' });
                    }}>Refresh categories</Button>
                  </div>
                  {masterMaterials.length === 0 ? (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded text-yellow-800">
                      ⚠️ No master materials available yet. Admin/Software Team will add them soon.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Master Material Selection */}
                      <div className="space-y-2">
                        <Label>Select Master Material <span className="text-red-500">*</span></Label>
                        <Select
                          value={newMaterial.masterMaterialId || ""}
                          onValueChange={(v) => {
                            const mm = masterMaterials.find((m: any) => m.id === v);
                            if (mm) {
                              setNewMaterial({
                                ...newMaterial,
                                masterMaterialId: v,
                                name: mm.name,
                                code: mm.code,
                              });
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a master material..." />
                          </SelectTrigger>
                          <SelectContent>
                            {masterMaterials.map((mm: any) => (
                              <SelectItem key={mm.id} value={mm.id}>
                                {mm.name} ({mm.code})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {newMaterial.masterMaterialId && (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Rate <span className="text-red-500">*</span></Label>
                              <Input
                                type="number"
                                value={newMaterial.rate || ""}
                                onChange={(e) =>
                                  setNewMaterial({
                                    ...newMaterial,
                                    rate: parseFloat(e.target.value) || 0,
                                  })
                                }
                              />
                            </div>

                            <div className="space-y-2">
                              <Label>Unit  <span className="text-red-500">*</span></Label>
                              <Select
                                value={newMaterial.unit || ""}
                                onValueChange={(v) =>
                                  setNewMaterial({ ...newMaterial, unit: v })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {UNIT_OPTIONS.map((c) => (
                                    <SelectItem key={c} value={c}>
                                      {c}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label>Category  <span className="text-red-500">*</span></Label>
                              <Select
                                value={newMaterial.category || ""}
                                onValueChange={(v) =>
                                  setNewMaterial({ ...newMaterial, category: v, subCategory: "" })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select" />
                                </SelectTrigger>
                                <SelectContent>
                                  {categories.map((c: string) => (
                                    <SelectItem key={c} value={c}>
                                      {c}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label>Sub Category  <span className="text-red-500">*</span></Label>
                              <Select
                                value={newMaterial.subCategory || ""}
                                onValueChange={(v) =>
                                  setNewMaterial({
                                    ...newMaterial,
                                    subCategory: v,
                                  })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select" />
                                </SelectTrigger>
                                <SelectContent>
                                  {getSubCategoriesForCategory(newMaterial.category || "").map((sc: any) => (
                                    <SelectItem key={sc.id} value={sc.name}>
                                      {sc.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label>Brand Name  <span className="text-red-500">*</span></Label>
                              <Input
                                value={newMaterial.brandName || ""}
                                onChange={(e) =>
                                  setNewMaterial({
                                    ...newMaterial,
                                    brandName: e.target.value,
                                  })
                                }
                              />
                            </div>

                            <div className="space-y-2">
                              <Label>Model Number</Label>
                              <Input
                                value={newMaterial.modelNumber || ""}
                                onChange={(e) =>
                                  setNewMaterial({
                                    ...newMaterial,
                                    modelNumber: e.target.value,
                                  })
                                }
                              />
                            </div>

                            <div className="space-y-2">
                              <Label>Dimensions</Label>
                              <Input
                                value={newMaterial.dimensions || ""}
                                onChange={(e) =>
                                  setNewMaterial({
                                    ...newMaterial,
                                    dimensions: e.target.value,
                                  })
                                }
                                placeholder="L x W x H"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label>Finish</Label>
                              <Input
                                value={newMaterial.finish || ""}
                                onChange={(e) =>
                                  setNewMaterial({
                                    ...newMaterial,
                                    finish: e.target.value,
                                  })
                                }
                                placeholder="e.g. Matte, Glossy"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label>Grade Type</Label>
                              <Input
                                value={newMaterial.metalType || ""}
                                onChange={(e) =>
                                  setNewMaterial({
                                    ...newMaterial,
                                    metalType: e.target.value,
                                  })
                                }
                                placeholder="e.g. SS 304, Aluminum"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Technical Specification</Label>
                            <Textarea
                              value={newMaterial.technicalSpecification || ""}
                              onChange={(e) =>
                                setNewMaterial({
                                  ...newMaterial,
                                  technicalSpecification: e.target.value,
                                })
                              }
                              placeholder="Enter technical details..."
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Product Image</Label>
                            <Input type="file" className="cursor-pointer" />
                          </div>

                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              onClick={() => {
                                setActiveTab("dashboard");
                                if (typeof window !== "undefined") {
                                  const url = new URL(window.location.href);
                                  url.searchParams.set("tab", "dashboard");
                                  window.history.replaceState({}, "", url.toString());
                                }
                              }}
                              className="w-full md:w-auto"
                            >
                              Back
                            </Button>

                            <Button
                              onClick={editingMaterialId ? handleUpdateMaterial : handleAddMaterial}
                              className="w-full md:w-auto"
                            >
                              {editingMaterialId ? (
                                <>Save Changes</>
                              ) : (
                                <><Plus className="mr-2 h-4 w-4" /> Add Material</>
                              )}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Created Material Templates List - Admin/Software/Purchase Team */}
            {(isAdminOrSoftwareTeam || user?.role === "purchase_team") && (
              <Card>
                <CardHeader>
                  <CardTitle>Created Material Templates</CardTitle>
                  <CardDescription>
                    Manage all material templates created for suppliers
                  </CardDescription>
                  <div className="mt-4">
                    <Input
                      placeholder="Search materials..."
                      value={masterSearch}
                      onChange={(e) => setMasterSearch(e.target.value)}
                      className="max-w-sm"
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  {masterMaterials.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                      No material templates created yet. Create one above.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {masterMaterials.filter((t: any) => (t.name + ' ' + t.code + ' ' + (t.category || '')).toLowerCase().includes(masterSearch.toLowerCase())).slice(0,12).map((template: any) => (
                        <div key={template.id} className="p-2 border rounded flex items-center justify-between">
                          <div className="flex-1">
                            {editingMaterialId === template.id ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={newMaterial.name}
                                  onChange={(e) => setNewMaterial({ ...newMaterial, name: e.target.value })}
                                  placeholder="Enter material name"
                                  className="max-w-xs"
                                />
                                <Button size="sm" onClick={async () => {
                                  if (!newMaterial.name.trim()) {
                                    toast({ title: 'Error', description: 'Material name is required', variant: 'destructive' });
                                    return;
                                  }
                                  try {
                                    const token = localStorage.getItem('authToken');
                                    const res = await fetch(`/api/material-templates/${template.id}`, {
                                      method: 'PUT',
                                      headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
                                      body: JSON.stringify({ name: newMaterial.name })
                                    });
                                    if (!res.ok) throw new Error('update failed');
                                    setMasterMaterials(prev => prev.map(m => m.id === template.id ? { ...m, name: newMaterial.name } : m));
                                    setEditingMaterialId(null);
                                    toast({ title: 'Success', description: 'Material name updated' });
                                  } catch (err) {
                                    console.error('update error', err);
                                    toast({ title: 'Error', description: 'Failed to update material', variant: 'destructive' });
                                  }
                                }}>Save</Button>
                                <Button size="sm" variant="ghost" onClick={() => setEditingMaterialId(null)}>Cancel</Button>
                              </div>
                            ) : (
                              <div>
                                <div className="font-medium text-sm">{template.name}</div>
                                <div className="text-xs text-muted-foreground">{template.code} {template.category && (<span className="ml-2 text-[11px] text-gray-500">• {template.category}</span>)}</div>
                              </div>
                            )}
                          </div>
                          {editingMaterialId !== template.id && (
                            <div className="flex items-center gap-2">
                              <Button size="sm" onClick={() => {
                                setEditingMaterialId(template.id);
                                setNewMaterial({ ...newMaterial, name: template.name });
                              }}>Edit</Button>
                              <Button size="sm" variant="destructive" onClick={async () => {
                                if (!window.confirm(`Delete "${template.name}"? This cannot be undone.`)) return;
                                try {
                                  const token = localStorage.getItem('authToken');
                                  const res = await fetch(`/api/material-templates/${template.id}`, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {} });
                                  if (!res.ok) throw new Error('delete failed');
                                  setMasterMaterials(prev => prev.filter(m => m.id !== template.id));
                                  toast({ title: 'Success', description: 'Material deleted' });
                                } catch (err) {
                                  console.error('delete error', err);
                                  toast({ title: 'Error', description: 'Failed to delete material', variant: 'destructive' });
                                }
                              }}>Delete</Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Materials list moved to Dashboard */}
          </TabsContent>

          {/* === SHOPS TAB === */}
          <TabsContent value="shops" className="space-y-4 mt-4">
            {(isAdminOrSoftwareTeam || user?.role === "purchase_team") && (
            <Card>
              <CardHeader>
                <CardTitle>Add New Shop</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Shop Name <span className="text-red-500">*</span></Label>
                    <Input
                      value={newShop.name}
                      onChange={(e) =>
                        setNewShop({ ...newShop, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Location <span className="text-red-500">*</span></Label>
                    <Input
                      value={newShop.location}
                      onChange={(e) =>
                        setNewShop({ ...newShop, location: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>City <span className="text-red-500">*</span></Label>
                    <Input
                      value={newShop.city}
                      onChange={(e) =>
                        setNewShop({ ...newShop, city: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Phone Number <span className="text-red-500">*</span></Label>
                    <div className="flex gap-2">
                      <Select
                        value={newShop.phoneCountryCode || "+91"}
                        onValueChange={(value) =>
                          setNewShop({ ...newShop, phoneCountryCode: value })
                        }
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue placeholder="+91" />
                        </SelectTrigger>
                        <SelectContent>
                          {COUNTRY_CODES.map((c) => (
                            <SelectItem key={c.code} value={c.code}>
                              {c.code}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Input
                        value={newShop.contactNumber || ""}
                        onChange={(e) =>
                          setNewShop({
                            ...newShop,
                            contactNumber: e.target.value,
                          })
                        }
                        placeholder="Enter phone number"
                        type="tel"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>State <span className="text-red-500">*</span></Label>
                    <Input
                      value={newShop.state}
                      onChange={(e) =>
                        setNewShop({ ...newShop, state: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Country <span className="text-red-500">*</span></Label>
                    <Input
                      value={newShop.country}
                      onChange={(e) =>
                        setNewShop({ ...newShop, country: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Pincode / Zipcode <span className="text-red-500">*</span></Label>
                    <Input
                      value={newShop.pincode}
                      onChange={(e) =>
                        setNewShop({ ...newShop, pincode: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>GST No (Optional)</Label>
                    <Input
                      value={newShop.gstNo}
                      onChange={(e) =>
                        setNewShop({ ...newShop, gstNo: e.target.value })
                      }
                      placeholder="29ABCDE1234F1Z5"
                    />
                  </div>
                </div>
                <Button onClick={editingShopId ? handleUpdateShop : handleAddShop}>{editingShopId ? 'Save Changes' : 'Add Shop'}</Button>
              </CardContent>
            </Card>
            )}
            {/* Shops list moved to Dashboard */}
          </TabsContent>

          {/* === APPROVALS TAB === */}
          {canManageShops && (
            <TabsContent value="approvals" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Shop Approval Requests</CardTitle>
                  <CardDescription>
                    Review and approve/reject new shop submissions
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {shopRequests.filter((r: any) => r.status === "pending").length ===
                  0 ? (
                    <p className="text-muted-foreground">
                      No pending approval requests
                    </p>
                  ) : (
                    shopRequests
                      .filter((r: any) => r.status === "pending")
                      .map((request: any) => (
                        <Card key={request.id} className="border-border/50">
                          <CardContent className="pt-6 space-y-4">
                            <div>
                              <h3 className="text-lg font-bold">
                                {request.shop.name}
                              </h3>
                              <p className="text-sm text-muted-foreground">
                                Submitted by: {request.submittedBy} at{" "}
                                {new Date(
                                  request.submittedAt
                                ).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div>
                                <p className="font-semibold">Location</p>
                                <p>{request.shop.location}</p>
                              </div>
                              <div>
                                <p className="font-semibold">City</p>
                                <p>{request.shop.city}</p>
                              </div>
                              <div>
                                <p className="font-semibold">State</p>
                                <p>{request.shop.state}</p>
                              </div>
                              <div>
                                <p className="font-semibold">Country</p>
                                <p>{request.shop.country}</p>
                              </div>
                              <div>
                                <p className="font-semibold">Pincode</p>
                                <p>{request.shop.pincode}</p>
                              </div>
                              <div>
                                <p className="font-semibold">Phone</p>
                                <p>
                                  {request.shop.phoneCountryCode}
                                  {request.shop.contactNumber}
                                </p>
                              </div>
                              {request.shop.gstNo && (
                                <div>
                                  <p className="font-semibold">GST No</p>
                                  <p>{request.shop.gstNo}</p>
                                </div>
                              )}
                            </div>

                            {/* Approve / Reject Buttons - Admin/Software Team/Purchase Team */}
                            {canApproveReject && (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleApproveShop(request)}
                                  className="gap-2"
                                  disabled={!request?.shop?.id}
                                >
                                  <CheckCircle2 className="h-4 w-4" /> Approve
                                </Button>

                                {rejectingId === request.id ? (
                                  <div className="flex gap-2 flex-1">
                                    <Input
                                      placeholder="Reason..."
                                      value={rejectReason}
                                      onChange={(e) =>
                                        setRejectReason(e.target.value)
                                      }
                                      className="text-sm"
                                    />
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        handleRejectShop(request.id)
                                      }
                                    >
                                      Confirm
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setRejectingId(null)}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setRejectingId(request.id)}
                                    className="gap-2"
                                  >
                                    <XCircle className="h-4 w-4" /> Reject
                                  </Button>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))
                  )}
                </CardContent>

                {/* Processed Requests */}
                {shopRequests.filter((r: any) => r.status !== "pending").length >
                  0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        Processed Requests
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {shopRequests
                        .filter((r: any) => r.status !== "pending")
                        .map((request: any) => (
                          <div
                            key={request.id}
                            className="flex justify-between items-start p-3 bg-muted/50 rounded"
                          >
                            <div>
                              <p className="font-semibold">
                                {request.shop.name}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {request.submittedBy}
                              </p>
                            </div>
                            <div className="text-right">
                              <Badge
                                variant={
                                  request.status === "approved"
                                    ? "default"
                                    : "destructive"
                                }
                              >
                                {request.status === "approved"
                                  ? "LA"
                                  : request.status.charAt(0).toUpperCase() +
                                    request.status.slice(1)}
                              </Badge>
                            </div>
                          </div>
                        ))}
                    </CardContent>
                  </Card>
                )}
              </Card>
            </TabsContent>
          )}

          {/* === MATERIAL APPROVALS TAB === */}
          {(isAdminOrSoftwareTeam || user?.role === "purchase_team") && (
            <TabsContent value="material-approvals" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Material Approval Requests</CardTitle>
                <CardDescription>
                  Review and approve/reject new material submissions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {materialRequests.filter((r: any) => r.status === "pending")
                  .length === 0 ? (
                  <p className="text-muted-foreground">
                    No pending material approvals
                  </p>
                ) : (
                  materialRequests
                    .filter((r: any) => r.status === "pending")
                    .map((request: any) => (
                      <Card key={request.id} className="border-border/50">
                        <CardContent className="pt-6 space-y-4">
                          <div>
                            <h3 className="text-lg font-bold">
                              {request.material.name}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              Submitted by: {request.submittedBy} at{" "}
                              {new Date(
                                request.submittedAt
                              ).toLocaleDateString()}
                            </p>
                            <div className="grid grid-cols-2 gap-3 text-sm mt-2">
                              <div>
                                <p className="font-semibold">Code</p>
                                <p>{request.material.code}</p>
                              </div>
                              <div>
                                <p className="font-semibold">Rate</p>
                                <p>₹{request.material.rate}</p>
                              </div>
                              <div>
                                <p className="font-semibold">Unit</p>
                                <p>{request.material.unit}</p>
                              </div>
                              <div>
                                <p className="font-semibold">Category</p>
                                <p>{request.material.category}</p>
                              </div>
                              <div>
                                <p className="font-semibold">Sub Category</p>
                                <p>{request.material.subCategory}</p>
                              </div>
                              <div>
                                <p className="font-semibold">Brand</p>
                                <p>{request.material.brandName}</p>
                              </div>
                            </div>
                          </div>

                          {/* Approve / Reject Buttons - Admin/Software Team/Purchase Team */}
                          {canApproveReject && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleApproveMaterial(request.id)}
                                className="gap-2"
                                disabled={!request?.material?.id}
                              >
                                <CheckCircle2 className="h-4 w-4" /> Approve
                              </Button>

                              {rejectingId === request.id ? (
                                <div className="flex gap-2 flex-1">
                                  <Input
                                    placeholder="Reason..."
                                    value={rejectReason}
                                    onChange={(e) =>
                                      setRejectReason(e.target.value)
                                    }
                                    className="text-sm"
                                  />
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      handleRejectMaterial(request.id)
                                    }
                                  >
                                    Confirm
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setRejectingId(null)}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setRejectingId(request.id)}
                                  className="gap-2"
                                >
                                  <XCircle className="h-4 w-4" /> Reject
                                </Button>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))
                )}
              </CardContent>

              {/* Processed Requests */}
              {materialRequests.filter((r: any) => r.status !== "pending").length >
                0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Processed Requests
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {materialRequests
                      .filter((r: any) => r.status !== "pending")
                      .map((request: any) => (
                        <div
                          key={request.id}
                          className="flex justify-between items-start p-3 bg-muted/50 rounded"
                        >
                          <div>
                            <p className="font-semibold">
                              {request.material.name}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {request.submittedBy}
                            </p>
                          </div>
                          <div className="text-right">
                            <Badge
                              variant={
                                request.status === "approved"
                                  ? "default"
                                  : "destructive"
                              }
                            >
                              {request.status === "approved"
                                ? "LA"
                                : request.status.charAt(0).toUpperCase() +
                                  request.status.slice(1)}
                            </Badge>
                          </div>
                        </div>
                      ))}
                  </CardContent>
                </Card>
              )}
            </Card>
          </TabsContent>
          )}

          {/* === MESSAGES TAB === */}
          {canViewSupportMessages && (
            <TabsContent value="messages" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Support Messages</CardTitle>
                  <CardDescription>
                    Messages from suppliers and users sent to Admin & Software
                    Team
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(supportMessages || []).length === 0 ? (
                    <p className="text-muted-foreground">No messages yet</p>
                  ) : (
                    (supportMessages || []).map((msg) => (
                      <Card key={msg.id} className="border-border/50">
                        <CardContent className="pt-6 space-y-3">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <p className="font-semibold">{msg.sender_name || msg.sentBy}</p>
                              <p className="text-sm text-muted-foreground">
                                {new Date(msg.sent_at || msg.sentAt).toLocaleString()}
                              </p>
                              {msg.info && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  <span className="font-semibold">Info: </span>{msg.info}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-2 items-start">
                              {!msg.is_read && (
                                <Badge variant="default">New</Badge>
                              )}
                              {canEditDelete && (
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
                          </div>
                          <p className="text-sm leading-relaxed bg-muted/50 p-3 rounded">
                            {msg.message}
                          </p>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* === SUPPORT TAB === */}
          <TabsContent value="support" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Technical Support</CardTitle>
                <CardDescription>
                  Request new categories or report issues to the software team.
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
                    data-testid="textarea-support-message"
                  />
                </div>

                <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded text-sm text-blue-700 dark:text-blue-300">
                  ✓ This message will be sent to Admin & Software Team
                </div>

                <Button
                  onClick={handleSupportSubmit}
                  data-testid="button-send-support"
                >
                  <MessageSquare className="mr-2 h-4 w-4" /> Send Request
                </Button>

                {/* Display list of messages */}
                {supportMsgs.length === 0 ? (
                  <p className="text-muted-foreground">No messages yet</p>
                ) : (
                  supportMsgs.map((msg: any) => (
                    <Card key={msg.id} className="border-border/50">
                      <CardContent className="pt-6 space-y-3">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-semibold">You ({supportSenderName})</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(msg.sent_at || msg.sentAt).toLocaleString()}
                            </p>
                            {msg.info && (
                              <p className="text-xs text-muted-foreground mt-1">
                                <span className="font-semibold">Info: </span>{msg.info}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2 items-start">
                            {!msg.is_read && (
                              <Badge variant="default">Unread</Badge>
                            )}
                            {canEditDelete && (
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
                        </div>
                        <p className="text-sm leading-relaxed bg-muted/50 p-3 rounded">
                          {msg.message}
                        </p>
                      </CardContent>
                    </Card>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}