import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Users } from "lucide-react";

export default function Leads() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Users className="h-8 w-8 text-blue-500" />
          Leads Center
        </h2>
        <p className="text-muted-foreground mt-1">Lead form submissions and quality scoring.</p>
      </div>

      <Card className="bg-card border-card-border max-w-2xl mx-auto mt-20">
        <CardContent className="flex flex-col items-center text-center pt-10 pb-10">
          <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-xl font-medium text-card-foreground mb-2">No Lead Forms Found</h3>
          <p className="text-muted-foreground max-w-md">
            We couldn't find any active Lead Generation campaigns or forms associated with the selected account.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
