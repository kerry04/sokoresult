import { Link } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldCheck, AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VerificationGateModal({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-warning/15 flex items-center justify-center">
            <ShieldCheck className="h-6 w-6 text-warning" />
          </div>
          <DialogTitle className="text-center">Verification required to trade</DialogTitle>
          <DialogDescription className="text-center">
            Please complete verification to start trading. It takes about 2 minutes — you'll upload an ID and a selfie.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1.5">
          <p>You'll need:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>A valid government ID (National ID or Passport)</li>
            <li>A clear selfie</li>
          </ul>
        </div>

        <DialogFooter className="sm:justify-center gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button asChild>
            <Link to="/kyc">Apply for verification</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface FirstTradeProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function FirstTradeWarning({ open, onConfirm, onCancel }: FirstTradeProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-warning/15 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-warning" />
          </div>
          <DialogTitle className="text-center">Before your first trade</DialogTitle>
          <DialogDescription className="text-center">
            SokoResult is real money. You can lose some or all of what you invest.
          </DialogDescription>
        </DialogHeader>

        <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
          <li>Each share pays out KSh 100 if your outcome wins, KSh 0 if it loses.</li>
          <li>Only trade with funds you can afford to lose.</li>
          <li>Don't risk more than 1–5% of your bankroll on a single market.</li>
          <li>
            Read the <Link to="/learn/risk" className="underline text-foreground">risk management guide</Link> if you're new.
          </li>
        </ul>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button onClick={onConfirm}>I understand — continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
