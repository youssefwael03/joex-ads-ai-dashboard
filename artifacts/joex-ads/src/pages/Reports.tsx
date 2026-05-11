import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function Reports() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Reports</h2>
        <p className="text-muted-foreground mt-1">Generate PDF executive summaries.</p>
      </div>

      <Card className="bg-card border-card-border max-w-2xl mx-auto mt-20">
        <CardContent className="flex flex-col items-center text-center pt-10 pb-10">
          <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-xl font-medium text-card-foreground mb-2">Reporting Engine Unavailable</h3>
          <p className="text-muted-foreground max-w-md">
            The react-pdf/renderer integration requires server-side dependencies or complex client-side setups that are currently stubbed in this demo mode.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
