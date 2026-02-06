import { useEffect, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import apiFetch from "@/lib/api";

export default function CreateProject() {
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [budget, setBudget] = useState("");
  const [location, setLocation] = useState("");
  const { toast } = useToast();
  const [projects, setProjects] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [projectVersions, setProjectVersions] = useState<Record<string, any[]>>(
    {},
  );
  const [versionItems, setVersionItems] = useState<Record<string, any[]>>({});
  const [selectedVersions, setSelectedVersions] = useState<Set<string>>(new Set());

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch("/api/boq-projects", { headers: {} });
        if (res.ok) {
          const data = await res.json();
          setProjects(data.projects || []);
        }
      } catch (e) {
        console.warn("Failed to load projects", e);
      }
    };
    load();
  }, []);

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
          location: location.trim(),
        }),
      });

      if (response.ok) {
        const newProject = await response.json();
        setName("");
        setClient("");
        setBudget("");
        setLocation("");
        setProjects((p) => [newProject, ...p]);
        toast({ title: "Success", description: "Project created" });
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

  const toggleProject = async (projectId: string) => {
    setExpanded((s) => ({ ...s, [projectId]: !s[projectId] }));

    // if expanding and versions not loaded, fetch versions
    if (!expanded[projectId] && !projectVersions[projectId]) {
      try {
        const res = await apiFetch(
          `/api/boq-versions/${encodeURIComponent(projectId)}`,
          { headers: {} },
        );
        if (res.ok) {
          const data = await res.json();
          setProjectVersions((pv) => ({
            ...pv,
            [projectId]: data.versions || [],
          }));

          // preload items for all versions (both draft and submitted)
          (data.versions || []).forEach(async (v: any) => {
            try {
              const r = await apiFetch(
                `/api/boq-items/version/${encodeURIComponent(v.id)}`,
                { headers: {} },
              );
              if (r.ok) {
                const items = await r.json();
                setVersionItems((vi) => ({
                  ...vi,
                  [v.id]: items.items || [],
                }));
              }
            } catch (e) {
              console.warn("Failed to load items for version", v.id, e);
            }
          });
        }
      } catch (e) {
        console.warn("Failed to load versions", e);
      }
    }
  };

  const deleteProject = async (projectId: string) => {
    if (!confirm("Are you sure you want to delete this project? This cannot be undone.")) {
      return;
    }

    try {
      const response = await apiFetch(`/api/boq-projects/${projectId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setProjects((p) => p.filter((proj) => proj.id !== projectId));
        toast({ title: "Success", description: "Project deleted" });
      } else {
        toast({
          title: "Error",
          description: "Failed to delete project",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Failed to delete project:", err);
      toast({
        title: "Error",
        description: "Failed to delete project",
        variant: "destructive",
      });
    }
  };

  const renderStep11Table = (items: any[]) => {
    // items is array of boq_items rows; each has table_data.step11_items
    const rows = items.flatMap((it) =>
      (it.table_data?.step11_items || []).map((si: any, idx: number) => ({
        ...si,
        _sourceId: it.id,
        _idx: idx,
      })),
    );
    if (rows.length === 0)
      return (
        <div className="text-sm text-muted-foreground">No Step 11 items</div>
      );

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100 border-b">
              <th className="border px-2 py-1">S.No</th>
              <th className="border px-2 py-1">Item</th>
              <th className="border px-2 py-1">Description</th>
              <th className="border px-2 py-1">Unit</th>
              <th className="border px-2 py-1">Qty</th>
              <th className="border px-2 py-1">Supply Rate</th>
              <th className="border px-2 py-1">Install Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any, i: number) => (
              <tr
                key={`${r._sourceId}-${r._idx}`}
                className="border-b hover:bg-blue-50"
              >
                <td className="border px-2 py-1 text-center">{i + 1}</td>
                <td className="border px-2 py-1">
                  {r.title || r.bill_no || "—"}
                </td>
                <td className="border px-2 py-1">{r.description || ""}</td>
                <td className="border px-2 py-1 text-center">
                  {r.unit || "pcs"}
                </td>
                <td className="border px-2 py-1 text-right">{r.qty ?? "0"}</td>
                <td className="border px-2 py-1 text-right">
                  {r.supply_rate ?? "0"}
                </td>
                <td className="border px-2 py-1 text-right">
                  {r.install_rate ?? "0"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Create Project</h1>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <h2 className="text-lg font-semibold">Create New Project</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Project Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Project name"
                />
              </div>
              <div className="space-y-2">
                <Label>Client Name</Label>
                <Input
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                  placeholder="Client"
                />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Location"
                />
              </div>
              <div className="space-y-2">
                <Label>Budget</Label>
                <Input
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="Budget"
                />
              </div>
            </div>

            <Button onClick={addProject}>Create Project</Button>
          </CardContent>
        </Card>
        {/* Projects list */}
        <Card>
          <CardContent className="space-y-4 pt-6">
            <h2 className="text-lg font-semibold">Existing Projects</h2>
            {projects.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No projects yet.
              </div>
            ) : (
              <ul className="space-y-2">
                {projects.map((p) => (
                  <li key={p.id} className="border rounded">
                    <div className="flex items-center justify-between p-2">
                      <div className="flex items-center gap-3">
                        <button
                          className="text-sm px-2"
                          onClick={() => toggleProject(p.id)}
                          aria-expanded={!!expanded[p.id]}
                        >
                          {expanded[p.id] ? "▼" : "▶"}
                        </button>
                        <div>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {p.client || "—"} • {p.location || "—"} • {p.budget || "—"}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-xs text-muted-foreground">
                          V{p.current_version || "—"}
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteProject(p.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>

                    {expanded[p.id] && (
                      <div className="p-3 border-t">
                        {projectVersions[p.id] ? (
                          projectVersions[p.id].length === 0 ? (
                            <div className="text-sm text-muted-foreground">
                              No versions for this project.
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {projectVersions[p.id].map((v: any) => (
                                <div key={v.id} className="border rounded p-3 bg-gray-50 flex items-start gap-3">
                                  <input
                                    type="checkbox"
                                    checked={selectedVersions.has(v.id)}
                                    onChange={(e) => {
                                      const newSelected = new Set(selectedVersions);
                                      if (e.target.checked) {
                                        newSelected.add(v.id);
                                      } else {
                                        newSelected.delete(v.id);
                                      }
                                      setSelectedVersions(newSelected);
                                    }}
                                    className="mt-1 w-4 h-4 cursor-pointer"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="font-medium">
                                        V{v.version_number}
                                      </div>
                                      <div
                                        className={`text-xs px-2 py-0.5 rounded ${v.status === "submitted" ? "bg-green-100 text-green-800" : "bg-gray-100 text-muted-foreground"}`}
                                      >
                                        {v.status}
                                      </div>
                                    </div>

                                    {v.status === "submitted" ? (
                                      <div className="mb-2">
                                        {versionItems[v.id] ? (
                                          versionItems[v.id].length > 0 ? (
                                            renderStep11Table(versionItems[v.id])
                                          ) : (
                                            <div className="text-sm text-muted-foreground">
                                              No items in this version
                                            </div>
                                          )
                                        ) : (
                                          <div className="text-sm text-muted-foreground">
                                            Loading items...
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="mb-2">
                                        {versionItems[v.id] ? (
                                          versionItems[v.id].length > 0 ? (
                                            renderStep11Table(versionItems[v.id])
                                          ) : (
                                            <div className="text-sm text-muted-foreground">
                                              No items added yet
                                            </div>
                                          )
                                        ) : (
                                          <div className="text-sm text-muted-foreground">
                                            Loading items...
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            Loading versions...
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
