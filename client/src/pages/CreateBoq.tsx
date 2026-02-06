import { useEffect, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import apiFetch from "@/lib/api";
import Step9Table from "@/components/estimators/Step9Table";
import ProductPicker from "@/components/ProductPicker";
import Step11Preview from "@/components/Step11Preview";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Project = {
  id: string;
  name: string;
  client: string;
  budget: string;
  location?: string;
  status?: string;
};

type BOQVersion = {
  id: string;
  project_id: string;
  version_number: number;
  status: "draft" | "submitted";
  created_at: string;
  updated_at: string;
};

type BOQItem = {
  id: string;
  estimator: string;
  session_id: string;
  table_data: any;
  created_at: string;
};

type Product = {
  id: string;
  name: string;
  code: string;
  category?: string;
  subcategory?: string;
  description?: string;
  category_name?: string;
  subcategory_name?: string;
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

export default function CreateBoq() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [boqItems, setBoqItems] = useState<BOQItem[]>([]);
  const [versions, setVersions] = useState<BOQVersion[]>([]);
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [budget, setBudget] = useState("");
  const [projectLocation, setProjectLocation] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showStep11Preview, setShowStep11Preview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [editedFields, setEditedFields] = useState<{
    [key: string]: {
      description?: string;
      unit?: string;
      qty?: number;
      supply_rate?: number;
      install_rate?: number;
    };
  }>({});

  // Load projects from DB on mount
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const response = await apiFetch("/api/boq-projects", {
          headers: {},
        });
        if (response.ok) {
          const data = await response.json();
          setProjects(data.projects || []);
        }
      } catch (err) {
        console.error("Failed to load projects:", err);
      } finally {
        setLoading(false);
      }
    };

    loadProjects();
  }, []);

  // Load versions when project is selected
  useEffect(() => {
    if (!selectedProjectId) {
      setVersions([]);
      setSelectedVersionId(null);
      setBoqItems([]);
      return;
    }

    const loadVersions = async () => {
      try {
        const response = await apiFetch(
          `/api/boq-versions/${encodeURIComponent(selectedProjectId)}`,
          { headers: {} },
        );
        if (response.ok) {
          const data = await response.json();
          const versionList = data.versions || [];
          setVersions(versionList);

          // If we already have a selectedVersionId and it's still present, keep it.
          if (
            selectedVersionId &&
            versionList.some((v: BOQVersion) => v.id === selectedVersionId)
          ) {
            // keep current selection
          } else {
            // Auto-select first draft version, or first version
            const draftVersion = versionList.find(
              (v: BOQVersion) => v.status === "draft",
            );
            if (draftVersion) {
              setSelectedVersionId(draftVersion.id);
            } else if (versionList.length > 0) {
              setSelectedVersionId(versionList[0].id);
            } else {
              setSelectedVersionId(null);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load versions:", err);
      }
    };

    loadVersions();
  }, [selectedProjectId]);

  // Load BOQ items for selected version
  useEffect(() => {
    if (!selectedVersionId) {
      setBoqItems([]);
      setEditedFields({});
      return;
    }

    const loadBoqItemsAndEdits = async () => {
      try {
        // Helper to safely parse JSON responses and log non-JSON bodies
        const safeParseJson = async (res: Response) => {
          const ct = (res.headers.get("content-type") || "").toLowerCase();
          const text = await res.text();

          // Allow empty/no-content responses (204) — treat as empty object
          if (res.status === 204 || text.trim() === "") {
            return {};
          }

          // If Content-Type explicitly says JSON, parse it
          if (ct.includes("application/json")) {
            try {
              return JSON.parse(text);
            } catch (e) {
              console.error("safeParseJson: JSON parse failed", { url: res.url, status: res.status, bodySnippet: text.slice(0, 300), error: e });
              throw new Error("Invalid JSON response from server");
            }
          }

          // If Content-Type is missing or not JSON but body *looks like* JSON, try parsing
          const trimmed = text.trim();
          if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
            try {
              return JSON.parse(trimmed);
            } catch (e) {
              console.error("safeParseJson: body looks like JSON but parse failed", { url: res.url, status: res.status, bodySnippet: trimmed.slice(0, 300), error: e });
              throw new Error("Invalid JSON response from server");
            }
          }

          // Helpful debug when server returns HTML (Vite index.html) or other unexpected body
          console.error(
            "safeParseJson: server returned non-JSON response",
            { url: res.url, status: res.status, contentType: ct, bodySnippet: text.slice(0, 200) },
          );
          const hint = trimmed.startsWith("<!DOCTYPE html")
            ? "Looks like the request hit the frontend dev server (index.html) instead of the backend API. Check VITE_API_BASE_URL and dev server ports."
            : undefined;
          const errMsg = `Server returned non-JSON response (status=${res.status})${hint ? ' - ' + hint : ''}`;
          throw new Error(errMsg);
        };

        // Load BOQ items
        const response = await apiFetch(
          `/api/boq-items/version/${encodeURIComponent(selectedVersionId)}`,
          { headers: {} },
        );
        if (response.ok) {
          try {
            const data = await safeParseJson(response as unknown as Response);
            setBoqItems(data.items || []);
          } catch (e) {
            toast({ title: "Error", description: "Failed to parse BOQ items response", variant: "destructive" });
            console.error("BOQ items parse error:", e);
          }
        } else {
          const body = await response.text();
          console.error("Failed to fetch BOQ items:", response.status, body);
          toast({ title: "Error", description: `Failed to load BOQ items (${response.status})`, variant: "destructive" });
        }

        // Load edited fields from this version
        const editsResponse = await apiFetch(
          `/api/boq-versions/${encodeURIComponent(selectedVersionId)}/edits`,
          { headers: {} },
        );
        if (editsResponse.ok) {
          try {
            const editsData = await safeParseJson(editsResponse as unknown as Response);
            setEditedFields(editsData.editedFields || {});
          } catch (e) {
            // Don't show a destructive toast here — the edits response may be empty
            // or served without Content-Type in some dev setups. Log warning for diagnostics.
            console.warn("Edits parse warning (non-fatal):", e);
          }
        } else {
          const body = await editsResponse.text();
          console.error("Failed to fetch edits:", editsResponse.status, body);
        }
      } catch (err) {
        console.error("Failed to load BOQ items or edits:", err);
        toast({ title: "Error", description: "Failed to load BOQ items or edits", variant: "destructive" });
      }
    };

    loadBoqItemsAndEdits();
  }, [selectedVersionId]);

  // If URL contains ?project=, auto-select that project
  // Only auto-select a project from the URL if it exists in the loaded projects.
  useEffect(() => {
    try {
      const qs =
        typeof location === "string" ? location.split("?")[1] || "" : "";
      const params = new URLSearchParams(qs);
      const projectParam = params.get("project");
      if (projectParam && projectParam !== selectedProjectId) {
        const exists = projects.find((p) => p.id === projectParam);
        if (exists) setSelectedProjectId(projectParam);
      }
    } catch (e) {
      // ignore
    }
  }, [location, projects]);

  const addProject = async () => {
    if (!name.trim()) {
      toast({
        title: "Error",
        description: "Project name is required",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await apiFetch("/api/boq-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          client: client.trim(),
          budget: budget.trim(),
          location: projectLocation.trim(),
        }),
      });

      if (response.ok) {
        const newProject = await response.json();
        setProjects((prev) => [newProject, ...prev]);
        setName("");
        setClient("");
        setBudget("");
        setProjectLocation("");
        setSelectedProjectId(newProject.id);
        toast({
          title: "Success",
          description: "Project created",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to create project",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Failed to create project:", err);
      toast({
        title: "Error",
        description: "Failed to create project",
        variant: "destructive",
      });
    }
  };

  const handleAddProduct = () => {
    if (!selectedProjectId) return;
    setShowProductPicker(true);
  };

  const handleSelectProduct = (product: Product) => {
    // Show Step 11 preview instead of navigating
    setSelectedProduct(product);
    setShowProductPicker(false);
    setShowStep11Preview(true);
  };

  const handleAddToBoq = async (selectedItems: Step11Item[]) => {
    console.log("handleAddToBoq called with items:", selectedItems);
    console.log("Selected project:", selectedProjectId);
    console.log("Selected product:", selectedProduct);
    console.log("Selected version:", selectedVersionId);

    if (!selectedProjectId || !selectedProduct || !selectedVersionId) {
      console.error("Missing required data for adding to BOQ");
      toast({
        title: "Error",
        description: "Please select a project, version, and product",
        variant: "destructive",
      });
      return;
    }

    try {
      // Get the estimator type from the product
      const estimatorType = getEstimatorTypeFromProduct(selectedProduct);
      console.log("Estimator type:", estimatorType);

      if (!estimatorType) {
        toast({
          title: "Error",
          description: "Could not determine estimator type",
          variant: "destructive",
        });
        return;
      }

      // Create a new BOQ item with the selected Step 11 data
      const tableData = {
        product_name: selectedProduct.name,
        product_id: selectedProduct.id,
        category: selectedProduct.category,
        subcategory: selectedProduct.subcategory,
        step11_items: selectedItems,
        created_at: new Date().toISOString(),
      };

      const requestBody = {
        project_id: selectedProjectId,
        version_id: selectedVersionId,
        estimator: estimatorType,
        table_data: tableData,
      };

      console.log("Sending request to /api/boq-items:", requestBody);

      const response = await apiFetch("/api/boq-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      console.log("Response status:", response.status);
      console.log("Response ok:", response.ok);

      if (response.ok) {
        // Parse POST response safely and log helpful debug info on non-JSON
        const respText = await response.text();
        const respCT = response.headers.get("content-type") || "";
        if (!respCT.toLowerCase().includes("application/json")) {
          console.error("Add-to-BOQ: server returned non-JSON response", {
            url: response.url,
            status: response.status,
            contentType: respCT,
            bodySnippet: respText.slice(0, 500),
          });
          throw new Error("Server returned non-JSON response when adding BOQ item");
        }

        let newItem;
        try {
          newItem = JSON.parse(respText);
        } catch (e) {
          console.error("Add-to-BOQ: JSON parse failed", { url: response.url, status: response.status, bodySnippet: respText.slice(0, 500), error: e });
          throw new Error("Invalid JSON response from server when adding BOQ item");
        }

        console.log("Item added successfully:", newItem);
        setBoqItems((prev) => [...prev, newItem]);

        toast({
          title: "Success",
          description: `Added ${selectedItems.length} items to BOQ`,
        });

        // Close the Step 11 preview
        setShowStep11Preview(false);
        setSelectedProduct(null);

        // Reload BOQ items to get updated list
        const loadResponse = await apiFetch(
          `/api/boq-items/version/${encodeURIComponent(selectedVersionId)}`,
          { headers: {} },
        );
        if (loadResponse.ok) {
          const loadText = await loadResponse.text();
          const loadCT = loadResponse.headers.get("content-type") || "";
          if (!loadCT.toLowerCase().includes("application/json")) {
            console.error("Reload BOQ items: non-JSON response", { url: loadResponse.url, status: loadResponse.status, bodySnippet: loadText.slice(0, 300) });
          } else {
            try {
              const data = JSON.parse(loadText);
              console.log("Reloaded BOQ items:", data);
              setBoqItems(data.items || []);
            } catch (e) {
              console.error("Reload BOQ items: JSON parse failed", { url: loadResponse.url, status: loadResponse.status, error: e, bodySnippet: loadText.slice(0, 300) });
            }
          }
        }
      } else {
        const errorText = await response.text();
        console.error("API response error:", response.status, errorText);
        throw new Error(
          `Failed to add items to BOQ: ${response.status} ${errorText}`,
        );
      }
    } catch (error) {
      console.error("Failed to add to BOQ:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to add items to BOQ",
        variant: "destructive",
      });
    }
  };

  const getEstimatorTypeFromProduct = (product: Product): string | null => {
    const subcat = (product.subcategory || product.subcategory_name || "").toLowerCase();
    const cat = (product.category || product.category_name || "").toLowerCase();
    const name = (product.name || "").toLowerCase();

    // Known keyword mappings (keep old behavior)
    const check = (s: string) => s.includes("door") || s.includes("electrical") || s.includes("plumb") || s.includes("floor") || s.includes("paint") || s.includes("ceiling") || s.includes("blind") || s.includes("civil") || s.includes("wall") || s.includes("ms") || s.includes("ss") || s.includes("fire");

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

    // As a fallback, if the raw subcategory/category/name looks like an estimator key created by DynamicEstimator (e.g. "residential", "falseceiling"), return the normalized form.
    const candidate = (subcat || cat || name).trim();
    if (candidate) {
      // normalize by removing spaces/hyphens
      const normalized = candidate.replace(/[-\s]/g, "");
      // if normalized contains any letters/numbers, assume it's a valid estimator key
      if (/\w+/.test(normalized)) return normalized;
    }

    return null;
  };

  const updateEditedField = (itemKey: string, field: string, value: any) => {
    setEditedFields((prev) => ({
      ...prev,
      [itemKey]: {
        ...prev[itemKey],
        [field]: value,
      },
    }));
  };

  const getEditedValue = (
    itemKey: string,
    field: string,
    originalValue: any,
  ) => {
    return (
      editedFields[itemKey]?.[
        field as keyof (typeof editedFields)[keyof typeof editedFields]
      ] ?? originalValue
    );
  };

  const handleSaveProject = async () => {
    if (!selectedVersionId) return;
    try {
      // Permanently save the current edited fields to the database
      const response = await apiFetch(
        `/api/boq-versions/${encodeURIComponent(selectedVersionId)}/save-edits`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ editedFields }),
        },
      );

      if (response.ok) {
        toast({
          title: "Success",
          description: "BOQ version saved permanently with all edits",
        });
      } else {
        throw new Error("Failed to save edits");
      }
    } catch (err) {
      console.error("Failed to save project:", err);
      toast({
        title: "Error",
        description: "Failed to save BOQ version",
        variant: "destructive",
      });
    }
  };

  const handleSubmitVersion = async () => {
    if (!selectedVersionId) return;
    try {
      await apiFetch(`/api/boq-versions/${selectedVersionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "submitted" }),
      });

      // Reload versions
      const response = await apiFetch(
        `/api/boq-versions/${encodeURIComponent(selectedProjectId!)}`,
        { headers: {} },
      );
      if (response.ok) {
        const data = await response.json();
        setVersions(data.versions || []);
      }

      toast({
        title: "Success",
        description: "BOQ version submitted and locked",
      });
    } catch (err) {
      console.error("Failed to submit version:", err);
      toast({
        title: "Error",
        description: "Failed to submit version",
        variant: "destructive",
      });
    }
  };

  const handleCreateNewVersion = async (copyFromPrevious: boolean) => {
    if (!selectedProjectId) return;

    try {
      const previousVersion = versions.length > 0 ? versions[0].id : null;

      const response = await apiFetch("/api/boq-versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: selectedProjectId,
          copy_from_version: copyFromPrevious ? previousVersion : null,
        }),
      });

      if (response.ok) {
        const newVersion = await response.json();
        setVersions((prev) => [newVersion, ...prev]);
        setSelectedVersionId(newVersion.id);

        toast({
          title: "Success",
          description: `Created Version ${newVersion.version_number}`,
        });
      }
    } catch (err) {
      console.error("Failed to create version:", err);
      toast({
        title: "Error",
        description: "Failed to create version",
        variant: "destructive",
      });
    }
  };

  const handleDownloadExcel = () => {
    if (!selectedProjectId || boqItems.length === 0) {
      toast({
        title: "Info",
        description: "No BOQ items to download",
        variant: "default",
      });
      return;
    }

    try {
      // Prepare CSV data
      const headers = [
        "S.No",
        "Item",
        "Description",
        "Unit",
        "Qty",
        "Supply Rate",
        "Install Rate",
        "Supply Amount",
        "Install Amount",
      ];
      const rows: string[][] = [];

      let rowNum = 1;
      let totalSupplyAmount = 0;
      let totalInstallAmount = 0;

      let displayRowNum = 1;
      boqItems.forEach((boqItem) => {
        const tableData = boqItem.table_data || {};
        const step11Items = tableData.step11_items || [];
        const productName = tableData.product_name || boqItem.estimator;

        step11Items.forEach((step11Item: Step11Item, itemIdx: number) => {
          const itemKey = `${boqItem.id}-${itemIdx}`;
          const qty = getEditedValue(itemKey, "qty", step11Item.qty || 0);
          const supplyRate = getEditedValue(
            itemKey,
            "supply_rate",
            step11Item.supply_rate || 0,
          );
          const installRate = getEditedValue(
            itemKey,
            "install_rate",
            step11Item.install_rate || 0,
          );
          const description = getEditedValue(
            itemKey,
            "description",
            step11Item.description || "",
          );
          const unit = getEditedValue(
            itemKey,
            "unit",
            step11Item.unit || "pcs",
          );
          const location = getEditedValue(
            itemKey,
            "location",
            step11Item.location || "",
          );

          const supplyAmount = qty * supplyRate;
          const installAmount = qty * installRate;

          totalSupplyAmount += supplyAmount;
          totalInstallAmount += installAmount;

          rows.push([
            displayRowNum.toString(),
            step11Item.title || productName,
            description,
            unit,
            qty.toString(),
            supplyRate.toString(),
            installRate.toString(),
            supplyAmount.toFixed(2),
            installAmount.toFixed(2),
          ]);

          displayRowNum++;
        });
      });

      // Add total row
      rows.push([
        "",
        "",
        "",
        "",
        "",
        "",
        "Total",
        totalSupplyAmount.toFixed(2),
        totalInstallAmount.toFixed(2),
      ]);

      // Create CSV content
      const csvContent = [
        headers.join(","),
        ...rows.map((row) =>
          row
            .map((cell) => {
              // Escape cells that contain commas or quotes
              if (
                cell.includes(",") ||
                cell.includes('"') ||
                cell.includes("\n")
              ) {
                return `"${cell.replace(/"/g, '""')}"`;
              }
              return cell;
            })
            .join(","),
        ),
      ].join("\n");

      // Create blob and download
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);

      const projectName = selectedProject?.name || "BOQ";
      const versionName = selectedVersion
        ? `V${selectedVersion.version_number}`
        : "draft";
      const filename = `${projectName}_${versionName}_BOQ.csv`;

      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = "hidden";

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Success",
        description: `Downloaded ${filename}`,
      });
    } catch (error) {
      console.error("Download failed:", error);
      toast({
        title: "Error",
        description: "Failed to download BOQ",
        variant: "destructive",
      });
    }
  };

  const handleDownloadPdf = async () => {
    if (!selectedProjectId || boqItems.length === 0) {
      toast({
        title: "Info",
        description: "No BOQ items to download",
        variant: "default",
      });
      return;
    }

    try {
      // Prepare table body
      const body: any[] = [];
      let displayRowNum = 1;

      boqItems.forEach((boqItem) => {
        const tableData = boqItem.table_data || {};
        const step11Items = tableData.step11_items || [];
        const productName = tableData.product_name || boqItem.estimator;

        step11Items.forEach((step11Item: Step11Item, itemIdx: number) => {
          const itemKey = `${boqItem.id}-${itemIdx}`;
          const qty = getEditedValue(itemKey, "qty", step11Item.qty || 0);
          const supplyRate = getEditedValue(
            itemKey,
            "supply_rate",
            step11Item.supply_rate || 0,
          );
          const installRate = getEditedValue(
            itemKey,
            "install_rate",
            step11Item.install_rate || 0,
          );
          const description = getEditedValue(
            itemKey,
            "description",
            step11Item.description || "",
          );
          const unit = getEditedValue(
            itemKey,
            "unit",
            step11Item.unit || "pcs",
          );
          const location = getEditedValue(
            itemKey,
            "location",
            step11Item.location || "",
          );

          const supplyAmount = qty * supplyRate;
          const installAmount = qty * installRate;

          body.push({
            sno: displayRowNum,
            item: step11Item.title || productName,
            description,
            unit,
            qty,
            supply_rate: supplyRate,
            install_rate: installRate,
            supply_amount: supplyAmount,
            install_amount: installAmount,
          });

          displayRowNum++;
        });
      });

      // Fetch logo and convert to data URL
      const logoPath = "/image.png";
      let logoDataUrl: string | null = null;
      try {
        const resp = await fetch(logoPath);
        const blob = await resp.blob();
        const reader = new FileReader();
        logoDataUrl = await new Promise<string | null>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        console.warn("Could not load logo for PDF header", e);
      }

      const doc = new jsPDF({ orientation: "landscape" });
      const pageWidth = doc.internal.pageSize.getWidth();

      // Header: logo left, project meta right
      const headerY = 10;
      if (logoDataUrl) {
        // Draw logo at top-left (keep height 24)
        const imgProps: any = doc.getImageProperties(logoDataUrl);
        const imgH = 24;
        const imgW = (imgProps.width / imgProps.height) * imgH;
        doc.addImage(logoDataUrl, "PNG", 10, headerY, imgW, imgH);
      }

      const metaX = pageWidth - 10;
      doc.setFontSize(10);
      doc.setFont(undefined, "bold");
      const projectName = selectedProject?.name || "BOQ";
      const clientName = selectedProject?.client || "-";
      const budgetText = selectedProject?.budget || "-";
      doc.text(projectName, metaX, headerY + 6, { align: "right" });
      doc.setFontSize(9);
      doc.setFont(undefined, "normal");
      doc.text(`Client: ${clientName}`, metaX, headerY + 12, {
        align: "right",
      });
      doc.text(`Budget: ${budgetText}`, metaX, headerY + 18, {
        align: "right",
      });

      // Table columns for autoTable
      const columns = [
        { header: "S.No", dataKey: "sno" },
        { header: "Item", dataKey: "item" },
        { header: "Description", dataKey: "description" },
        { header: "Unit", dataKey: "unit" },
        { header: "Qty", dataKey: "qty" },
        { header: "Supply Rate", dataKey: "supply_rate" },
        { header: "Install Rate", dataKey: "install_rate" },
        { header: "Supply Amount", dataKey: "supply_amount" },
        { header: "Install Amount", dataKey: "install_amount" },
      ];

      // @ts-ignore - autotable types
      autoTable(doc, {
        head: [columns.map((c) => c.header)],
        body: body.map((row) => columns.map((c) => row[c.dataKey])),
        startY: headerY + 30,
        styles: { fontSize: 8 },
        headStyles: {
          fillColor: [64, 64, 64],
          textColor: [255, 255, 255],
          fontStyle: "bold",
        },
        theme: "grid",
        didDrawPage: (data: any) => {
          // page footer optional
        },
      });

      const versionName = selectedVersion
        ? `V${selectedVersion.version_number}`
        : "draft";
      const filename = `${projectName}_${versionName}_BOQ.pdf`;
      doc.save(filename);
      toast({ title: "Success", description: `Downloaded ${filename}` });
    } catch (err) {
      console.error("Failed to generate PDF", err);
      toast({
        title: "Error",
        description: "Failed to generate PDF",
        variant: "destructive",
      });
    }
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const selectedVersion = versions.find((v) => v.id === selectedVersionId);
  const isVersionSubmitted = selectedVersion?.status === "submitted";

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-8">Loading projects...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Create BOQ</h1>

        {/* Project creation moved to dedicated Create Project page */}

        {/* Select Project Section */}
        <Card>
          <CardContent className="space-y-4 pt-6">
            <h2 className="text-lg font-semibold">Select Project</h2>
            <div className="flex-1">
              <Label>Projects</Label>
              <Select onValueChange={(v) => setSelectedProjectId(v || null)}>
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      projects.length === 0 ? "No projects" : "Select project"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem value={p.id} key={p.id}>
                      {p.name} — {p.client || "(No client)"} — {p.location || "(No location)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedProject && (
              <div className="text-sm text-gray-600 space-y-1">
                <div>
                  <strong>Budget:</strong> {selectedProject.budget || "—"}
                </div>
                <div>
                  <strong>Status:</strong> {selectedProject.status || "draft"}
                </div>
              </div>
            )}

            {selectedProjectId && (
              <div className="pt-4 space-y-4">
                {/* Version Selector */}
                <div className="space-y-2">
                  <Label>BOQ Versions</Label>
                  <div className="flex gap-2">
                    <Select
                      value={selectedVersionId || ""}
                      onValueChange={setSelectedVersionId}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select version" />
                      </SelectTrigger>
                      <SelectContent>
                        {versions.map((v) => (
                          <SelectItem value={v.id} key={v.id}>
                            {v.project_name ? `[${v.project_name}] ` : ""}V
                            {v.version_number} (
                            {v.status === "submitted" ? "Locked" : "Draft"})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedVersionId && (
                      <Button
                        onClick={async () => {
                          if (!selectedVersionId) return;
                          if (
                            !confirm(
                              "Delete this version and all its BOQ items? This cannot be undone.",
                            )
                          )
                            return;
                          try {
                            const resp = await apiFetch(
                              `/api/boq-versions/${encodeURIComponent(selectedVersionId)}`,
                              { method: "DELETE" },
                            );
                            if (resp.ok) {
                              // Reload versions for the project
                              const r2 = await apiFetch(
                                `/api/boq-versions/${encodeURIComponent(selectedProjectId!)}`,
                                { headers: {} },
                              );
                              if (r2.ok) {
                                const data = await r2.json();
                                setVersions(data.versions || []);
                                // auto-select a draft or first version
                                const draftVersion = (data.versions || []).find(
                                  (v: any) => v.status === "draft",
                                );
                                if (draftVersion)
                                  setSelectedVersionId(draftVersion.id);
                                else if ((data.versions || []).length > 0)
                                  setSelectedVersionId(data.versions[0].id);
                                else setSelectedVersionId(null);
                                setBoqItems([]);
                                toast({
                                  title: "Deleted",
                                  description: "Version removed",
                                });
                              }
                            } else {
                              const text = await resp.text();
                              throw new Error(
                                text || "Failed to delete version",
                              );
                            }
                          } catch (e) {
                            console.error("Failed to delete version", e);
                            toast({
                              title: "Error",
                              description: "Failed to delete version",
                              variant: "destructive",
                            });
                          }
                        }}
                        variant="destructive"
                      >
                        Delete Version
                      </Button>
                    )}
                    {versions.length > 0 && (
                      <Button
                        onClick={() => {
                          const lastVersion = versions[0];
                          if (
                            confirm(
                              `Copy items from V${lastVersion.version_number}?`,
                            )
                          ) {
                            handleCreateNewVersion(true);
                          } else {
                            handleCreateNewVersion(false);
                          }
                        }}
                        variant="outline"
                      >
                        + New Version
                      </Button>
                    )}
                    {versions.length === 0 && selectedProjectId && (
                      <Button
                        onClick={() => handleCreateNewVersion(false)}
                        variant="outline"
                      >
                        Create V1
                      </Button>
                    )}
                  </div>
                  {selectedVersion && (
                    <div className="text-sm text-gray-600 space-y-1 bg-blue-50 p-3 rounded">
                      <div>
                        <strong>Project:</strong>{" "}
                        {selectedVersion.project_name || "Unknown"}
                      </div>
                      <div>
                        <strong>Version:</strong> V
                        {selectedVersion.version_number}
                      </div>
                      {selectedVersion.project_client && (
                        <div>
                          <strong>Client:</strong>{" "}
                          {selectedVersion.project_client}
                        </div>
                      )}
                      {selectedVersion.project_location && (
                        <div>
                          <strong>Location:</strong>{" "}
                          {selectedVersion.project_location}
                        </div>
                      )}
                      {isVersionSubmitted && (
                        <span className="inline-block bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs font-semibold">
                          Submitted (Locked)
                        </span>
                      )}
                      {!isVersionSubmitted && (
                        <span className="inline-block bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-semibold">
                          Draft (Editable)
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Add Product - Disabled if submitted */}
                <Button
                  onClick={handleAddProduct}
                  className="w-full"
                  disabled={isVersionSubmitted}
                >
                  Add Product +
                </Button>

                <ProductPicker
                  open={showProductPicker}
                  onOpenChange={setShowProductPicker}
                  onSelectProduct={handleSelectProduct}
                  selectedProjectId={selectedProjectId}
                />

                {selectedProduct && (
                  <Step11Preview
                    product={selectedProduct}
                    open={showStep11Preview}
                    onClose={() => {
                      setShowStep11Preview(false);
                      // Clear product after modal closes to avoid unmounting mid-operation
                      setTimeout(() => {
                        setSelectedProduct(null);
                      }, 300);
                    }}
                    onAddToBoq={handleAddToBoq}
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* BOQ Items Section */}
        {selectedProjectId && (
          <Card>
            <CardContent className="space-y-4 pt-6">
              <h2 className="text-lg font-semibold">BOQ Items</h2>
              {boqItems.length === 0 ? (
                <div className="text-gray-500 text-center py-4">
                  No products added yet. Click Add Product +
                </div>
              ) : (
                <div className="overflow-x-auto border rounded-lg">
                  <table className="border-collapse text-xs min-w-full">
                    <thead>
                      <tr className="bg-gray-100 border-b-2 border-gray-300">
                        <th className="border px-2 py-2 text-left font-semibold w-10">
                          S.No
                        </th>
                        <th className="border px-2 py-2 text-left font-semibold w-24">
                          Item
                        </th>

                        <th className="border px-2 py-2 text-left font-semibold w-24">
                          Description
                        </th>
                        <th className="border px-2 py-2 text-center font-semibold w-16">
                          Unit
                        </th>
                        <th className="border px-2 py-2 text-center font-semibold w-18">
                          Qty
                        </th>
                        <th
                          colSpan={2}
                          className="border px-1 py-2 text-center font-semibold"
                        >
                          Rate
                        </th>
                        <th
                          colSpan={2}
                          className="border px-1 py-2 text-center font-semibold"
                        >
                          Amount
                        </th>
                        <th className="border px-2 py-2 text-center font-semibold w-16">
                          Action
                        </th>
                      </tr>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th colSpan={5}></th>
                        <th className="border px-1 py-1 text-center text-xs font-medium w-14">
                          Supply
                        </th>
                        <th className="border px-1 py-1 text-center text-xs font-medium w-14">
                          Install
                        </th>
                        <th className="border px-1 py-1 text-center text-xs font-medium w-16">
                          Supply
                        </th>
                        <th className="border px-1 py-1 text-center text-xs font-medium w-16">
                          Install
                        </th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        let globalSeqNo = 0;
                        return boqItems.flatMap((boqItem, boqIdx) => {
                          const tableData = boqItem.table_data || {};
                          const step11Items = tableData.step11_items || [];
                          const productName =
                            tableData.product_name || boqItem.estimator;

                          return step11Items.map(
                            (step11Item: Step11Item, itemIdx: number) => {
                              globalSeqNo += 1;
                              const itemKey = `${boqItem.id}-${itemIdx}`;
                              const qty = getEditedValue(
                                itemKey,
                                "qty",
                                step11Item.qty || 0,
                              );
                              const supplyRate = getEditedValue(
                                itemKey,
                                "supply_rate",
                                step11Item.supply_rate || 0,
                              );
                              const installRate = getEditedValue(
                                itemKey,
                                "install_rate",
                                step11Item.install_rate || 0,
                              );
                              const description = getEditedValue(
                                itemKey,
                                "description",
                                step11Item.description || "",
                              );
                              const unit = getEditedValue(
                                itemKey,
                                "unit",
                                step11Item.unit || "pcs",
                              );
                              const location = getEditedValue(
                                itemKey,
                                "location",
                                step11Item.location || "",
                              );

                              const supplyAmount = qty * supplyRate;
                              const installAmount = qty * installRate;

                              return (
                                <tr
                                  key={itemKey}
                                  className="border-b border-gray-200 hover:bg-blue-50"
                                >
                                  <td className="border px-2 py-1 text-center text-xs">
                                    {globalSeqNo}
                                  </td>
                                  <td className="border px-2 py-1 font-medium text-xs">
                                    {step11Item.title || productName}
                                  </td>

                                  <td className="border px-2 py-1">
                                    <textarea
                                      value={description}
                                      onChange={(e) =>
                                        updateEditedField(
                                          itemKey,
                                          "description",
                                          e.target.value,
                                        )
                                      }
                                      disabled={isVersionSubmitted}
                                      className="w-full border rounded px-1 py-0.5 text-xs min-h-8 resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                                      placeholder="Enter description"
                                    />
                                  </td>
                                  <td className="border px-2 py-1">
                                    <input
                                      type="text"
                                      value={unit}
                                      onChange={(e) =>
                                        updateEditedField(
                                          itemKey,
                                          "unit",
                                          e.target.value,
                                        )
                                      }
                                      disabled={isVersionSubmitted}
                                      className="w-full border rounded px-1 py-0.5 text-xs text-center disabled:bg-gray-100 disabled:cursor-not-allowed"
                                      placeholder="pcs"
                                    />
                                  </td>
                                  <td className="border px-2 py-1">
                                    <input
                                      type="number"
                                      value={qty}
                                      onChange={(e) =>
                                        updateEditedField(
                                          itemKey,
                                          "qty",
                                          parseFloat(e.target.value) || 0,
                                        )
                                      }
                                      disabled={isVersionSubmitted}
                                      className="w-full border rounded px-1 py-0.5 text-xs text-center disabled:bg-gray-100 disabled:cursor-not-allowed font-semibold"
                                    />
                                  </td>
                                  <td className="border px-1 py-1">
                                    <input
                                      type="number"
                                      value={supplyRate}
                                      onChange={(e) =>
                                        updateEditedField(
                                          itemKey,
                                          "supply_rate",
                                          parseFloat(e.target.value) || 0,
                                        )
                                      }
                                      disabled={isVersionSubmitted}
                                      className="w-full border rounded px-0.5 py-0.5 text-xs text-right disabled:bg-gray-100 disabled:cursor-not-allowed"
                                      placeholder="0"
                                    />
                                  </td>
                                  <td className="border px-1 py-1">
                                    <input
                                      type="number"
                                      value={installRate}
                                      onChange={(e) =>
                                        updateEditedField(
                                          itemKey,
                                          "install_rate",
                                          parseFloat(e.target.value) || 0,
                                        )
                                      }
                                      disabled={isVersionSubmitted}
                                      className="w-full border rounded px-0.5 py-0.5 text-xs text-right disabled:bg-gray-100 disabled:cursor-not-allowed"
                                      placeholder="0"
                                    />
                                  </td>
                                  <td className="border px-1 py-1 text-right font-medium text-xs">
                                    ₹{supplyAmount.toFixed(2)}
                                  </td>
                                  <td className="border px-1 py-1 text-right font-medium text-xs">
                                    ₹{installAmount.toFixed(2)}
                                  </td>
                                  <td className="border px-2 py-1 text-center">
                                    <Button
                                      variant="outline"
                                      size="xs"
                                      disabled={isVersionSubmitted}
                                      onClick={async () => {
                                        try {
                                          await apiFetch(
                                            `/api/boq-items/${boqItem.id}`,
                                            {
                                              method: "DELETE",
                                            },
                                          );
                                          setBoqItems((prev) =>
                                            prev.filter(
                                              (i) => i.id !== boqItem.id,
                                            ),
                                          );
                                          toast({
                                            title: "Deleted",
                                            description: "BOQ item removed",
                                          });
                                        } catch (error) {
                                          toast({
                                            title: "Error",
                                            description:
                                              "Failed to delete item",
                                            variant: "destructive",
                                          });
                                        }
                                      }}
                                    >
                                      Delete
                                    </Button>
                                  </td>
                                </tr>
                              );
                            },
                          );
                        });
                      })()}
                    </tbody>
                    {boqItems.length > 0 && (
                      <tfoot>
                        <tr className="bg-gray-100 border-t-2 border-gray-300 font-semibold text-xs">
                          <td
                            colSpan={7}
                            className="border px-1 py-1 text-right"
                          >
                            Subtotal
                          </td>
                          <td className="border px-1 py-1 text-right">
                            ₹
                            {boqItems
                              .flatMap((item, boqIdx) =>
                                (item.table_data?.step11_items || []).map(
                                  (step11: Step11Item, step11Idx: number) => {
                                    const itemKey = `${item.id}-${step11Idx}`;
                                    const qty = getEditedValue(
                                      itemKey,
                                      "qty",
                                      step11.qty || 0,
                                    );
                                    const supplyRate = getEditedValue(
                                      itemKey,
                                      "supply_rate",
                                      step11.supply_rate || 0,
                                    );
                                    return qty * supplyRate;
                                  },
                                ),
                              )
                              .reduce((sum, val) => sum + val, 0)
                              .toFixed(2)}
                          </td>
                          <td className="border px-1 py-1 text-right">
                            ₹
                            {boqItems
                              .flatMap((item, boqIdx) =>
                                (item.table_data?.step11_items || []).map(
                                  (step11: Step11Item, step11Idx: number) => {
                                    const itemKey = `${item.id}-${step11Idx}`;
                                    const qty = getEditedValue(
                                      itemKey,
                                      "qty",
                                      step11.qty || 0,
                                    );
                                    const installRate = getEditedValue(
                                      itemKey,
                                      "install_rate",
                                      step11.install_rate || 0,
                                    );
                                    return qty * installRate;
                                  },
                                ),
                              )
                              .reduce((sum, val) => sum + val, 0)
                              .toFixed(2)}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        {selectedProjectId && selectedVersionId && (
          <Card>
            <CardContent className="space-y-3 pt-6">
              {isVersionSubmitted ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded p-4 text-sm text-yellow-800">
                  <strong>This version is locked.</strong> Submit a new version
                  to make edits.
                </div>
              ) : null}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Button
                  onClick={handleSaveProject}
                  variant="outline"
                  disabled={isVersionSubmitted}
                >
                  Save Draft
                </Button>
                <Button
                  onClick={handleSubmitVersion}
                  variant="default"
                  disabled={isVersionSubmitted || boqItems.length === 0}
                >
                  Submit & Lock Version
                </Button>
                <Button
                  onClick={handleDownloadExcel}
                  variant="outline"
                  disabled={boqItems.length === 0}
                >
                  Download as Excel
                </Button>
                <Button
                  onClick={handleDownloadPdf}
                  variant="outline"
                  disabled={boqItems.length === 0}
                >
                  Download as PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
