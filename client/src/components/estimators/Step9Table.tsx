import React, { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";

export default function Step9Table({
  initialData,
  onChange,
  onDelete,
}: {
  initialData: any;
  onChange?: (data: any) => void;
  onDelete?: (groupId: string) => void;
}) {
  const inferGroups = (data: any) => {
    if (!data) return [];
    if (data.groups && Array.isArray(data.groups)) return data.groups;
    return [
      {
        id: data.group_id || "group-1",
        title: data.group_title || data.title || "Item Group",
        description: data.group_description || "",
        unit: data.unit || "pcs",
        rows: data.rows || [],
        totals: data.totals || {},
        qty: data.qty || 1,
        supply_rate: data.supply_rate || 0,
        install_rate: data.install_rate || 0,
      },
    ];
  };

  const [groups, setGroups] = useState<any[]>(inferGroups(initialData));
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const gs = inferGroups(initialData);
    setGroups(gs);
    const initial: Record<string, boolean> = {};
    gs.forEach((g: any) => (initial[g.id] = false));
    setExpanded(initial);
  }, [initialData]);

  useEffect(() => {
    if (onChange) onChange({ groups, totals: computeTotals(groups) });
  }, [groups]);

  const toggle = (groupId: string) =>
    setExpanded((s) => ({ ...s, [groupId]: !s[groupId] }));

  const toggleSelect = (groupId: string) => {
    setSelected((s) => ({ ...s, [groupId]: !s[groupId] }));
  };

  const updateGroup = (groupId: string, patch: any) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, ...patch } : g)),
    );
  };

  const updateRow = (groupId: string, rowIdx: number, patch: any) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        const rows = g.rows.map((r: any, i: number) =>
          i === rowIdx ? { ...r, ...patch } : r,
        );
        return { ...g, rows };
      }),
    );
  };

  const computeTotals = (groupsParam: any[]) => {
    const grand = groupsParam.reduce(
      (G: any, g: any) => {
        const subtotal = (g.rows || []).reduce(
          (s: number, r: any) => s + Number(r.qty || 0) * Number(r.rate || 0),
          0,
        );
        const sgst = +(+subtotal * 0.09).toFixed(2);
        const cgst = +(+subtotal * 0.09).toFixed(2);
        const grand_total = +(subtotal + sgst + cgst).toFixed(2);
        G[g.id] = { subtotal, sgst, cgst, grand_total };
        return G;
      },
      {} as Record<string, any>,
    );
    return grand;
  };

  const totals = computeTotals(groups);

  const groupAmount = (g: any) => {
    // Header-level supply_rate is intended to represent the BOM grand total
    // (from Step 8) per group. To avoid double-counting the material rows
    // (which are displayed separately), compute header amounts solely from
    // the header rates and qty.
    const supplyAmount = Number(g.qty || 1) * Number(g.supply_rate || 0);
    const installAmount = Number(g.qty || 1) * Number(g.install_rate || 0);
    return {
      supplyAmount,
      installAmount,
      // keep material subtotals available if needed elsewhere
      materialSupplySubtotal: (g.rows || []).reduce(
        (s: number, r: any) =>
          s + Number(r.qty || 0) * Number(r.supply_rate || 0),
        0,
      ),
      materialInstallSubtotal: (g.rows || []).reduce(
        (s: number, r: any) =>
          s + Number(r.qty || 0) * Number(r.install_rate || 0),
        0,
      ),
      total: supplyAmount + installAmount,
    };
  };

  const deleteSelected = () => {
    const toDelete = Object.keys(selected).filter((k) => selected[k]);
    toDelete.forEach((gId) => {
      if (onDelete) onDelete(gId);
    });
    setSelected({});
  };

  const deleteSingleItem = (groupId: string) => {
    if (onDelete) onDelete(groupId);
  };

  return (
    <div className="space-y-4">
      <table className="min-w-full border-collapse text-sm w-full">
        <thead className="bg-gray-100">
          <tr>
            <th colSpan={2} className="border px-2 py-2 w-16 text-center">
              Action
            </th>
            <th className="border px-2 py-2">Item Name</th>
            <th className="border px-2 py-2">Description</th>
            <th className="border px-2 py-2">Unit</th>
            <th className="border px-2 py-2">Qty</th>
            <th colSpan={2} className="border px-2 py-2 text-center">
              Rate
            </th>
            <th colSpan={2} className="border px-2 py-2 text-center">
              Amount
            </th>
          </tr>
          <tr className="bg-gray-50">
            <th colSpan={6} className="border px-2 py-1" />
            <th className="border px-2 py-1 text-center text-xs">Supply</th>
            <th className="border px-2 py-1 text-center text-xs">Install</th>
            <th className="border px-2 py-1 text-center text-xs">Supply</th>
            <th className="border px-2 py-1 text-center text-xs">Install</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const amounts = groupAmount(g);
            return (
              <React.Fragment key={g.id}>
                <tr className="bg-white border-t hover:bg-blue-50">
                  <td className="border px-2 py-3 text-center w-8">
                    <Checkbox
                      checked={selected[g.id] || false}
                      onCheckedChange={() => toggleSelect(g.id)}
                    />
                  </td>
                  <td className="border px-2 py-3 text-center w-8">
                    <div className="flex gap-1">
                      <button onClick={() => toggle(g.id)} className="text-sm">
                        {expanded[g.id] ? "▼" : "▶"}
                      </button>
                      <button
                        onClick={() => deleteSingleItem(g.id)}
                        className="text-red-500 hover:text-red-700"
                        title="Delete this item"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                  <td className="border px-2 py-3 font-semibold">{g.title}</td>
                  <td className="border px-2 py-3">
                    <Input
                      placeholder="Description"
                      value={g.description || ""}
                      onChange={(e: any) =>
                        updateGroup(g.id, { description: e.target.value })
                      }
                      className="text-xs"
                    />
                  </td>
                  <td className="border px-2 py-3 w-16">
                    <Input
                      placeholder="Unit"
                      value={g.unit || ""}
                      onChange={(e: any) =>
                        updateGroup(g.id, { unit: e.target.value })
                      }
                      className="text-xs"
                    />
                  </td>
                  <td className="border px-2 py-3 text-center w-16">
                    <Input
                      type="number"
                      value={String(g.qty ?? "")}
                      onChange={(e: any) =>
                        updateGroup(g.id, { qty: Number(e.target.value || 0) })
                      }
                      className="text-xs w-16 text-center"
                    />
                  </td>
                  <td className="border px-2 py-3 text-right w-20">
                    <Input
                      type="number"
                      placeholder="0"
                      title="Supply Rate (from Step 8 BOM)"
                      value={String(g.supply_rate ?? "")}
                      onChange={(e: any) =>
                        updateGroup(g.id, {
                          supply_rate: Number(e.target.value || 0),
                        })
                      }
                      className="text-xs w-full text-right"
                    />
                  </td>
                  <td className="border px-2 py-3 text-right w-20">
                    <Input
                      type="number"
                      placeholder="0"
                      title="Install Rate (manual entry)"
                      value={String(g.install_rate ?? "")}
                      onChange={(e: any) =>
                        updateGroup(g.id, {
                          install_rate: Number(e.target.value || 0),
                        })
                      }
                      className="text-xs w-full text-right"
                    />
                  </td>
                  <td className="border px-2 py-3 text-right w-24 font-semibold">
                    ₹{amounts.supplyAmount.toFixed(2)}
                  </td>
                  <td className="border px-2 py-3 text-right w-24 font-semibold">
                    ₹{amounts.installAmount.toFixed(2)}
                  </td>
                </tr>

                {expanded[g.id] && (
                  <tr>
                    <td colSpan={10} className="p-0">
                      <div className="overflow-x-auto border rounded-lg m-2">
                        <table className="min-w-full border-collapse text-sm w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="border px-2 py-2" />
                              <th className="border px-2 py-2">S.No</th>
                              <th className="border px-2 py-2">Item</th>
                              <th className="border px-2 py-2">Description</th>
                              <th className="border px-2 py-2">Unit</th>
                              <th className="border px-2 py-2">Qty</th>
                              <th className="border px-2 py-2 text-right">
                                Rate
                              </th>
                              <th className="border px-2 py-2 text-right">
                                Amount
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {(g.rows || []).map((r: any, i: number) => (
                              <tr key={`${g.id}-row-${i}`} className="border">
                                <td className="border p-2 text-center">
                                  <Checkbox />
                                </td>
                                <td className="border p-2">{i + 1}</td>
                                <td className="border p-2">{r.item}</td>
                                <td className="border p-2">
                                  <Input
                                    value={r.description || ""}
                                    onChange={(e: any) =>
                                      updateRow(g.id, i, {
                                        description: e.target.value,
                                      })
                                    }
                                    className="text-xs"
                                  />
                                </td>
                                <td className="border p-2">{r.unit || ""}</td>
                                <td className="border p-2 text-center">
                                  <Input
                                    type="number"
                                    value={String(r.qty ?? "")}
                                    onChange={(e: any) =>
                                      updateRow(g.id, i, {
                                        qty: Number(e.target.value || 0),
                                      })
                                    }
                                    className="text-xs w-20 text-center"
                                  />
                                </td>
                                <td className="border p-2 text-right">
                                  <Input
                                    type="number"
                                    value={String(r.supply_rate ?? "")}
                                    onChange={(e: any) =>
                                      updateRow(g.id, i, {
                                        supply_rate: Number(
                                          e.target.value || 0,
                                        ),
                                      })
                                    }
                                    className="text-xs w-20 text-right"
                                  />
                                </td>
                                <td className="border p-2 text-right">
                                  ₹
                                  {(
                                    Number(r.qty || 0) *
                                    (Number(r.supply_rate || 0) +
                                      Number(r.install_rate || 0))
                                  ).toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      {Object.values(selected).some((v) => v) && (
        <div className="flex gap-2">
          <button
            onClick={deleteSelected}
            className="px-4 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600"
          >
            Delete Selected ({Object.values(selected).filter((v) => v).length})
          </button>
        </div>
      )}
    </div>
  );
}
