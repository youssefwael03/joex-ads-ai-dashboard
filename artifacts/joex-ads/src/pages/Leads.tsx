import { useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { usePages, useLeadForms, useLeads } from "@/hooks/useMeta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import { Users, AlertCircle, Search, ClipboardList } from "lucide-react";

export default function Leads() {
  const { token } = useAuthStore();
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const { data: pagesData, isLoading: pagesLoading } = usePages(!!token);
  const { data: formsData, isLoading: formsLoading } = useLeadForms(selectedPageId);
  const { data: leadsData, isLoading: leadsLoading } = useLeads(selectedFormId, selectedPageId);

  const pages: any[] = pagesData?.data ?? [];
  const forms: any[] = formsData?.data ?? [];
  const leads: any[] = leadsData?.data ?? [];

  const handlePageChange = (pageId: string) => {
    setSelectedPageId(pageId);
    setSelectedFormId(null);
  };

  const allFieldNames = Array.from(
    new Set(
      leads.flatMap((lead: any) =>
        (lead.field_data ?? []).map((f: any) => f.name as string)
      )
    )
  );

  const filteredLeads = leads.filter((lead: any) => {
    if (!search.trim()) return true;
    const allValues = (lead.field_data ?? [])
      .map((f: any) => String(f.values?.[0] ?? "").toLowerCase())
      .join(" ");
    return allValues.includes(search.toLowerCase());
  });

  const selectedForm = forms.find((f) => f.id === selectedFormId);

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Users className="h-8 w-8 text-blue-400" />
          Leads Center
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          View lead form submissions from your Meta Lead Generation campaigns.
        </p>
      </div>

      {/* Selectors */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground shrink-0">Page:</label>
          {pagesLoading ? (
            <Skeleton className="h-9 w-[240px]" />
          ) : pages.length === 0 ? (
            <span className="text-sm text-muted-foreground">No pages found.</span>
          ) : (
            <Select onValueChange={handlePageChange} value={selectedPageId ?? ""}>
              <SelectTrigger className="w-[240px] bg-card/40 border-card-border">
                <SelectValue placeholder="Select a Page..." />
              </SelectTrigger>
              <SelectContent>
                {pages.map((page: any) => (
                  <SelectItem key={page.id} value={page.id}>{page.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {selectedPageId && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-muted-foreground shrink-0">Form:</label>
            {formsLoading ? (
              <Skeleton className="h-9 w-[240px]" />
            ) : forms.length === 0 ? (
              <span className="text-sm text-muted-foreground">No lead forms found for this page.</span>
            ) : (
              <Select onValueChange={setSelectedFormId} value={selectedFormId ?? ""}>
                <SelectTrigger className="w-[280px] bg-card/40 border-card-border">
                  <SelectValue placeholder="Select a Lead Form..." />
                </SelectTrigger>
                <SelectContent>
                  {forms.map((form: any) => (
                    <SelectItem key={form.id} value={form.id}>
                      {form.name}
                      {form.leads_count != null ? ` (${form.leads_count} leads)` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>

      {/* Forms list overview */}
      {selectedPageId && !formsLoading && forms.length > 0 && !selectedFormId && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {forms.map((form: any, i: number) => (
            <motion.button
              key={form.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => setSelectedFormId(form.id)}
              className="text-left p-4 rounded-xl bg-card/40 border border-card-border hover:border-primary/30 hover:bg-card/70 transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-blue-500/15 border border-blue-500/20 flex items-center justify-center shrink-0">
                  <ClipboardList className="h-4 w-4 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm line-clamp-1">{form.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {form.leads_count != null ? `${form.leads_count} leads` : "Leads count unavailable"}
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[9px] mt-1.5 ${form.status === "ACTIVE" ? "border-green-500 text-green-400" : "border-muted text-muted-foreground"}`}
                  >
                    {form.status ?? "UNKNOWN"}
                  </Badge>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {/* Leads table */}
      {selectedFormId && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-sm font-semibold">{selectedForm?.name}</div>
              <div className="text-xs text-muted-foreground">
                {leadsLoading ? "Loading leads..." : `${filteredLeads.length} of ${leads.length} leads`}
              </div>
            </div>
            {leads.length > 0 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search leads..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-[220px] bg-card border-card-border"
                />
              </div>
            )}
          </div>

          {leadsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : leads.length === 0 ? (
            <Card className="bg-card/40 border-card-border">
              <CardContent className="flex items-center gap-4 pt-6 pb-6">
                <AlertCircle className="h-6 w-6 text-muted-foreground shrink-0" />
                <div className="text-sm text-muted-foreground">No leads found for this form. Leads may require a Page access token with <code className="bg-muted px-1 rounded text-[11px]">leads_retrieval</code> permission.</div>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-card/40 border-card-border overflow-hidden">
              <CardHeader className="bg-card/80 py-3 px-4">
                <CardTitle className="text-sm">Lead Submissions</CardTitle>
              </CardHeader>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-card/80">
                    <TableRow className="border-card-border hover:bg-transparent">
                      <TableHead className="text-xs">Date</TableHead>
                      {allFieldNames.map((field) => (
                        <TableHead key={field} className="text-xs capitalize">{field.replace(/_/g, " ")}</TableHead>
                      ))}
                      <TableHead className="text-xs">Ad</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLeads.map((lead: any, i: number) => {
                      const fieldMap: Record<string, string> = {};
                      for (const f of lead.field_data ?? []) {
                        fieldMap[f.name] = f.values?.[0] ?? "—";
                      }
                      return (
                        <TableRow key={lead.id ?? i} className="border-card-border hover:bg-sidebar-accent/40 text-xs">
                          <TableCell className="text-muted-foreground whitespace-nowrap">
                            {lead.created_time ? new Date(lead.created_time).toLocaleDateString("en-GB") : "—"}
                          </TableCell>
                          {allFieldNames.map((field) => (
                            <TableCell key={field}>{fieldMap[field] ?? "—"}</TableCell>
                          ))}
                          <TableCell className="text-muted-foreground line-clamp-1 max-w-[150px]">
                            {lead.ad_name ?? "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </div>
      )}

      {!selectedPageId && !pagesLoading && (
        <Card className="bg-card/40 border-card-border max-w-xl">
          <CardContent className="flex items-center gap-4 pt-6 pb-6">
            <AlertCircle className="h-8 w-8 text-muted-foreground shrink-0" />
            <div>
              <div className="font-medium text-sm">Select a Facebook Page to continue</div>
              <div className="text-xs text-muted-foreground mt-1">
                Your token needs <code className="bg-muted px-1 rounded text-[11px]">leads_retrieval</code> permission and the page must have Lead Gen campaigns.
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
