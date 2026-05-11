import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuthStore } from "@/store/authStore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { metaApi } from "@/lib/metaApi";
import { toast } from "sonner";
import { Loader2, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export default function Landing() {
  const [location, setLocation] = useLocation();
  const { token, setToken, setValidated } = useAuthStore();
  const [inputToken, setInputToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (token) {
      setLocation("/dashboard");
    }
  }, [token, location, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputToken.trim()) return;

    setIsLoading(true);
    try {
      localStorage.setItem("joex_ads_token", inputToken);
      const data = await metaApi.getMe();
      if (data?.id) {
        setToken(inputToken);
        setValidated(true);
        toast.success("Successfully connected to Meta Ads");
        setLocation("/dashboard");
      } else {
        throw new Error("Invalid response format");
      }
    } catch (err: any) {
      localStorage.removeItem("joex_ads_token");
      toast.error(err.message || "Invalid token. Please check and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[128px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/20 rounded-full blur-[128px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="w-full max-w-md z-10"
      >
        <div className="text-center mb-10">
          <h1 className="text-6xl font-black tracking-tighter text-primary drop-shadow-[0_0_16px_rgba(252,211,77,0.6)] mb-4">
            JOEX
          </h1>
          <p className="text-lg text-muted-foreground font-medium tracking-wide">
            The Ultimate Performance Marketing Cockpit.
          </p>
        </div>

        <Card className="bg-card/60 backdrop-blur-xl border-card-border/50 shadow-2xl shadow-black/50">
          <CardHeader>
            <CardTitle className="text-2xl text-card-foreground">Connect Account</CardTitle>
            <CardDescription className="text-muted-foreground">
              Paste your Meta Graph API long-lived access token to continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="token" className="text-card-foreground/80">Access Token</Label>
                <Input
                  id="token"
                  type="password"
                  value={inputToken}
                  onChange={(e) => setInputToken(e.target.value)}
                  placeholder="EAAGm0PX4ZCpsBO..."
                  className="bg-input/50 border-border focus:border-primary/50 transition-colors h-12 text-lg font-mono"
                  data-testid="input-token"
                />
              </div>
              <Button 
                type="submit" 
                className="w-full h-12 text-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_20px_rgba(252,211,77,0.3)] transition-all"
                disabled={isLoading || !inputToken.trim()}
                data-testid="button-connect"
              >
                {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <ArrowRight className="mr-2 h-5 w-5" />}
                Connect Account
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
