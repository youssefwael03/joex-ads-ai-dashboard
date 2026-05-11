import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BellRing, CheckCircle2 } from "lucide-react";

export default function Alerts() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <BellRing className="h-8 w-8 text-foreground" />
          Automation & Alerts
        </h2>
        <p className="text-muted-foreground mt-1">Active monitors and notification rules.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">Active Rules</h3>
          
          {[
            "ROAS Drop Alert (< 1.5)",
            "High Frequency Alert (> 4)",
            "Spend Spike Alert",
            "Low CTR Alert (< 0.5%)"
          ].map((rule) => (
            <Card key={rule} className="bg-card/40 border-card-border">
              <CardContent className="flex items-center justify-between p-4">
                <span className="font-medium">{rule}</span>
                <Badge variant="outline" className="text-green-500 border-green-500/50 bg-green-500/10">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Active
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <h3 className="text-xl font-semibold">Recent Notifications</h3>
          <Card className="bg-card/40 border-card-border">
            <CardContent className="p-6 text-center text-muted-foreground py-20">
              No recent alerts triggered in the last 24 hours.
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
