import { useState } from "react";
import { useCatalogs, useCatalogProducts } from "@/hooks/useMeta";
import { useFormatCurrency } from "@/hooks/useCurrency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingBag, Search, AlertCircle, Package, ChevronRight, ExternalLink } from "lucide-react";

export default function Catalog() {
  const fmt = useFormatCurrency();
  const [businessId, setBusinessId] = useState("");
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");

  const { data: catalogsData, isLoading: catalogsLoading, error: catalogsError } = useCatalogs(submittedId);
  const { data: productsData, isLoading: productsLoading } = useCatalogProducts(selectedCatalogId);

  const catalogs: any[] = catalogsData?.data ?? [];
  const products: any[] = productsData?.data ?? [];

  const filteredProducts = products.filter((p: any) =>
    !productSearch || p.name?.toLowerCase().includes(productSearch.toLowerCase())
  );

  const selectedCatalog = catalogs.find((c) => c.id === selectedCatalogId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (businessId.trim()) setSubmittedId(businessId.trim());
  };

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <ShoppingBag className="h-8 w-8 text-orange-400" />
          Catalog Analytics
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Browse product catalogs from your Meta Business Manager.
        </p>
      </div>

      {/* Business ID Input */}
      <Card className="bg-card/40 border-card-border max-w-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Enter Business Manager ID</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex gap-3">
            <Input
              placeholder="e.g. 1234567890"
              value={businessId}
              onChange={(e) => setBusinessId(e.target.value)}
              className="bg-card border-card-border flex-1"
            />
            <Button type="submit" disabled={!businessId.trim()} className="bg-primary hover:bg-primary/90">
              Load Catalogs
            </Button>
          </form>
          <p className="text-[11px] text-muted-foreground mt-2">
            Find your Business ID in Meta Business Manager → Settings → Business Info.
          </p>
        </CardContent>
      </Card>

      {/* Error state */}
      {catalogsError && (
        <Card className="bg-card/40 border-destructive/20">
          <CardContent className="flex items-center gap-3 pt-4 pb-4">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <span className="text-sm text-muted-foreground">
              Could not load catalogs. Check that the Business ID is correct and your token has <code className="bg-muted px-1 rounded text-[11px]">catalog_management</code> permission.
            </span>
          </CardContent>
        </Card>
      )}

      {/* Catalogs list */}
      {submittedId && (
        <div className="space-y-4">
          {catalogsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
          ) : catalogs.length === 0 && !catalogsError ? (
            <Card className="bg-card/40 border-card-border max-w-xl">
              <CardContent className="flex items-center gap-4 pt-6 pb-6">
                <AlertCircle className="h-6 w-6 text-muted-foreground shrink-0" />
                <div className="text-sm text-muted-foreground">No catalogs found for Business ID <strong>{submittedId}</strong>.</div>
              </CardContent>
            </Card>
          ) : (
            <>
              {!selectedCatalogId && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {catalogs.map((catalog: any, i: number) => (
                    <motion.button
                      key={catalog.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => setSelectedCatalogId(catalog.id)}
                      className="text-left p-4 rounded-xl bg-card/40 border border-card-border hover:border-primary/30 hover:bg-card/70 transition-all group"
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-xl bg-orange-500/15 border border-orange-500/20 flex items-center justify-center shrink-0">
                          <Package className="h-5 w-5 text-orange-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm line-clamp-1">{catalog.name}</div>
                          {catalog.product_count != null && (
                            <div className="text-xs text-muted-foreground mt-0.5">{Number(catalog.product_count).toLocaleString()} products</div>
                          )}
                          {catalog.vertical && <Badge variant="outline" className="text-[9px] mt-1.5">{catalog.vertical}</Badge>}
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0 mt-0.5" />
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}

              {/* Products table */}
              <AnimatePresence>
                {selectedCatalogId && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <button
                          onClick={() => setSelectedCatalogId(null)}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          ← Back to catalogs
                        </button>
                        <div className="text-sm font-semibold mt-0.5">{selectedCatalog?.name}</div>
                        <div className="text-xs text-muted-foreground">{filteredProducts.length} of {products.length} products</div>
                      </div>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search products..."
                          value={productSearch}
                          onChange={(e) => setProductSearch(e.target.value)}
                          className="pl-9 w-[220px] bg-card border-card-border"
                        />
                      </div>
                    </div>

                    {productsLoading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                      </div>
                    ) : (
                      <Card className="bg-card/40 border-card-border overflow-hidden">
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader className="bg-card/80">
                              <TableRow className="border-card-border hover:bg-transparent">
                                <TableHead className="text-xs">Product</TableHead>
                                <TableHead className="text-xs">Availability</TableHead>
                                <TableHead className="text-right text-xs">Price</TableHead>
                                <TableHead className="text-right text-xs">Sale Price</TableHead>
                                <TableHead className="text-xs">Link</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredProducts.length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={5} className="text-center text-muted-foreground h-24 text-sm">
                                    No products found.
                                  </TableCell>
                                </TableRow>
                              ) : (
                                filteredProducts.map((product: any) => (
                                  <TableRow key={product.id} className="border-card-border hover:bg-sidebar-accent/40 text-xs">
                                    <TableCell>
                                      <div className="flex items-center gap-3">
                                        {product.image_url && (
                                          <img src={product.image_url} alt={product.name} className="h-9 w-9 rounded-md object-cover border border-border shrink-0" />
                                        )}
                                        <span className="font-medium line-clamp-1 max-w-[200px]">{product.name}</span>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="outline" className={`text-[9px] ${product.availability === "in stock" ? "border-green-500 text-green-400" : "border-yellow-500 text-yellow-400"}`}>
                                        {product.availability ?? "—"}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                      {product.price ? fmt(Number(product.price) / 100) : "—"}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-green-400">
                                      {product.sale_price ? fmt(Number(product.sale_price) / 100) : "—"}
                                    </TableCell>
                                    <TableCell>
                                      {product.url && (
                                        <a href={product.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                                          <ExternalLink className="h-3.5 w-3.5" />
                                        </a>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </Card>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
      )}
    </div>
  );
}
