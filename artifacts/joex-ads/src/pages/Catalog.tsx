import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, ShoppingBag } from "lucide-react";

export default function Catalog() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <ShoppingBag className="h-8 w-8 text-orange-500" />
          Catalog Analytics
        </h2>
        <p className="text-muted-foreground mt-1">Product-level performance and inventory health.</p>
      </div>

      <Card className="bg-card border-card-border max-w-2xl mx-auto mt-20">
        <CardContent className="flex flex-col items-center text-center pt-10 pb-10">
          <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-xl font-medium text-card-foreground mb-2">Commerce Catalog Required</h3>
          <p className="text-muted-foreground max-w-md">
            Please link a Meta Business Manager Commerce Catalog to view product-level analytics.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
