import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { AlertTriangle, TrendingUp, TrendingDown, Target, BrainCircuit } from "lucide-react";

export default function AIInsights() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <BrainCircuit className="h-8 w-8 text-secondary" />
          AI Intelligence Center
        </h2>
        <p className="text-muted-foreground mt-1">Algorithmic segmentation and automated optimization recommendations.</p>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold">Campaign Segmentation Engine</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[
            { title: "Winners", count: 4, desc: "ROAS > 3, CTR > 2%", color: "text-green-500", border: "border-green-500/20" },
            { title: "Scaling Opps", count: 2, desc: "ROAS > 2.5, Freq < 3", color: "text-primary", border: "border-primary/20" },
            { title: "Fatigued", count: 7, desc: "Freq > 4, CTR dropping", color: "text-yellow-500", border: "border-yellow-500/20" },
            { title: "High Risk", count: 1, desc: "High spend, ROAS < 1", color: "text-destructive", border: "border-destructive/20" },
          ].map((seg, i) => (
            <motion.div key={seg.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
              <Card className={`bg-card/40 border-card-border hover:${seg.border} transition-colors`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium text-muted-foreground">{seg.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-3xl font-bold ${seg.color}`}>{seg.count}</div>
                  <p className="text-xs text-muted-foreground mt-1">{seg.desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-semibold">AI Recommendations</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }}>
            <Card className="bg-card/40 border-card-border h-full relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-destructive" />
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <CardTitle className="text-lg">Critical Creative Fatigue</CardTitle>
                  </div>
                  <Badge variant="destructive">Critical Priority</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  "Q4 Retargeting - Video" ad set has reached saturation.
                </div>
                <ul className="text-sm space-y-2 list-disc pl-4 text-card-foreground">
                  <li>Frequency exceeded <span className="text-destructive font-mono">5.2</span> in last 7 days.</li>
                  <li>CTR dropped <span className="text-destructive font-mono">-42%</span> week over week.</li>
                  <li>CPA increased by <span className="text-destructive font-mono">$18.50</span>.</li>
                </ul>
                <div className="p-3 bg-destructive/10 rounded-md border border-destructive/20 mt-4">
                  <div className="font-medium text-destructive mb-1">Recommended Action:</div>
                  <p className="text-sm">Pause current creatives immediately and launch fresh visual angles. Duplicate the ad set to reset the algorithm learning phase.</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5 }}>
            <Card className="bg-card/40 border-card-border h-full relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">Scale Winner Campaign</CardTitle>
                  </div>
                  <Badge className="bg-primary text-primary-foreground">High Priority</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  "Broad Advantage+ Shopping" is significantly outperforming account averages.
                </div>
                <ul className="text-sm space-y-2 list-disc pl-4 text-card-foreground">
                  <li>ROAS is holding strong at <span className="text-primary font-mono">3.8x</span>.</li>
                  <li>Frequency is very low at <span className="text-primary font-mono">1.4</span>.</li>
                </ul>
                <div className="p-3 bg-primary/10 rounded-md border border-primary/20 mt-4">
                  <div className="font-medium text-primary mb-1">Recommended Action:</div>
                  <p className="text-sm">Increase daily budget by 20% every 48 hours until CPA hits target ceiling. Massive untapped audience remaining.</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
