import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, Copy, ArrowLeft, Layers, FileText, Search, LayoutGrid, List, ArrowUpDown, Calendar, Clock } from "lucide-react";
import apiFetch from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { DeleteConfirmationDialog } from "@/components/ui/DeleteConfirmationDialog";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";

export default function SketchTemplates() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'name' | 'created_at' | 'updated_at'>('created_at');

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const res = await apiFetch("/api/sketch-templates");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
    } catch (err) {
      console.error("Failed to load templates", err);
      toast({ title: "Error", description: "Failed to load templates", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const deleteTemplate = async (action: 'archive' | 'trash') => {
    if (!deleteTarget) return;
    try {
      const res = await apiFetch(`/api/sketch-templates/${deleteTarget}?action=${action}`, { method: "DELETE" });
      if (res.ok) {
        toast({ title: "Success", description: action === 'trash' ? "Template moved to Trash" : "Template archived" });
        loadTemplates();
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to delete template", variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  };

  const useTemplate = (template: any) => {
    // We'll store the template data in sessionStorage to be picked up by the Create page
    sessionStorage.setItem("sketch_template_data", JSON.stringify(template.template_data));
    setLocation("/create-sketch-plan");
  };

  const filteredAndSortedTemplates = templates
    .filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'created_at') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sortBy === 'updated_at') {
        const timeA = new Date(a.updated_at || a.created_at).getTime();
        const timeB = new Date(b.updated_at || b.created_at).getTime();
        return timeB - timeA;
      }
      return 0;
    });

  return (
    <React.Fragment>
      <Layout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => setLocation("/sketch-plans")} className="p-0 hover:bg-transparent">
                <ArrowLeft className="w-6 h-6" />
              </Button>
              <h1 className="text-2xl font-bold tracking-tight">Sketch Templates</h1>
            </div>
          </div>

          <Card className="border-slate-200">
             <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                  <div className="relative flex-1 w-full">
                     <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                     <Input 
                        value={search} 
                        onChange={(e) => setSearch(e.target.value)} 
                        placeholder="Search templates..." 
                        className="pl-10"
                     />
                  </div>
                  
                  <div className="flex items-center gap-3 w-full md:w-auto">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="gap-2">
                          <ArrowUpDown className="w-4 h-4" />
                          Sort by: {sortBy === 'name' ? 'Name' : sortBy === 'created_at' ? 'Created Date' : 'Last Updated'}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel>Sorting Options</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setSortBy('created_at')} className="flex items-center justify-between cursor-pointer">
                          <span>Latest First</span>
                          {sortBy === 'created_at' && <span className="w-2 h-2 rounded-full bg-indigo-600" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setSortBy('name')} className="flex items-center justify-between cursor-pointer">
                          <span>Template Name</span>
                          {sortBy === 'name' && <span className="w-2 h-2 rounded-full bg-indigo-600" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setSortBy('updated_at')} className="flex items-center justify-between cursor-pointer">
                          <span>Last Updated</span>
                          {sortBy === 'updated_at' && <span className="w-2 h-2 rounded-full bg-indigo-600" />}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'grid' | 'list')} className="w-auto">
                      <TabsList className="grid w-[120px] grid-cols-2">
                        <TabsTrigger value="grid" className="px-0"><LayoutGrid className="w-4 h-4" /></TabsTrigger>
                        <TabsTrigger value="list" className="px-0"><List className="w-4 h-4" /></TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </div>
             </CardContent>
          </Card>

          <div className="space-y-6">
            {loading ? (
              <div className="py-10 text-center text-muted-foreground italic">Loading templates...</div>
            ) : filteredAndSortedTemplates.length === 0 ? (
              <div className="py-20 text-center space-y-4 border rounded-lg border-dashed">
                  <Layers className="w-12 h-12 mx-auto text-slate-300" />
                  <p className="text-slate-500">No templates found. Save a plan as a template to see it here.</p>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredAndSortedTemplates.map((t) => (
                  <Card key={t.id} className="hover:border-indigo-300 transition-colors shadow-sm group">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center justify-between">
                        <span className="truncate">{t.name}</span>
                        <Layers className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                           <FileText className="w-3.5 h-3.5" />
                           <span>{t.template_data?.items?.length || 0} items defined</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                           <Calendar className="w-3.5 h-3.5" />
                           <span>Created: {t.created_at ? format(new Date(t.created_at), "MMM d, yyyy") : "N/A"}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <Button onClick={() => useTemplate(t)} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                          <Copy className="w-4 h-4" /> Use Template
                        </Button>
                        <Button variant="outline" size="icon" onClick={() => setDeleteTarget(t.id)} className="text-red-500 hover:bg-red-50 border-slate-200">
                           <Trash2 className="w-4 h-4" />
                         </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Template Name</th>
                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Items</th>
                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Created Date & Time</th>
                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Modified</th>
                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredAndSortedTemplates.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-100 transition-colors">
                                <Layers className="w-4 h-4" />
                              </div>
                              <span className="font-medium text-slate-900">{t.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                              {t.template_data?.items?.length || 0} items
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-sm text-slate-700">{t.created_at ? format(new Date(t.created_at), "MMM d, yyyy") : "N/A"}</span>
                              <span className="text-xs text-slate-400">{t.created_at ? format(new Date(t.created_at), "hh:mm a") : ""}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-xs text-slate-500">
                              {t.updated_at ? format(new Date(t.updated_at), "MMM d, yyyy") : (t.created_at ? format(new Date(t.created_at), "MMM d, yyyy") : "N/A")}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => useTemplate(t)} className="gap-2 border-slate-200 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200">
                                <Copy className="w-3.5 h-3.5" /> Use
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(t.id)} className="text-slate-400 hover:text-red-600 hover:bg-red-50">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        </div>
      </Layout>
      <DeleteConfirmationDialog
        isOpen={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={(action) => deleteTemplate(action)}
        itemName="sketch template"
      />
    </React.Fragment>
  );
}
