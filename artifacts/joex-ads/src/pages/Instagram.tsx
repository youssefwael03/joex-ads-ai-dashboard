import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Instagram as InstagramIcon } from "lucide-react";

export default function Instagram() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <InstagramIcon className="h-8 w-8 text-pink-500" />
          Instagram Insights
        </h2>
        <p className="text-muted-foreground mt-1">Profile and media performance analytics.</p>
      </div>

      <Card className="bg-card border-card-border max-w-2xl mx-auto mt-20">
        <CardContent className="flex flex-col items-center text-center pt-10 pb-10">
          <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-xl font-medium text-card-foreground mb-2">No Instagram Account Linked</h3>
          <p className="text-muted-foreground max-w-md">
            Your Meta token does not have the required permissions or no Instagram Business Account is linked to your Pages.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
