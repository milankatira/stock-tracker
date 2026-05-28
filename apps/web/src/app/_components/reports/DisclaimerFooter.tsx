import type { Disclaimers } from "@finsight/shared";
import { ShieldAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface DisclaimerFooterProps {
  readonly disclaimers: Disclaimers;
}

export function DisclaimerFooter({ disclaimers }: DisclaimerFooterProps) {
  return (
    <footer role="contentinfo" className="mt-8 space-y-3">
      <Alert>
        <ShieldAlert className="h-4 w-4 text-muted-foreground" aria-hidden />
        <AlertDescription className="text-xs leading-relaxed text-muted-foreground">
          {disclaimers.analysis}
        </AlertDescription>
      </Alert>
      {disclaimers.pastPerformance ? (
        <Alert>
          <AlertDescription className="text-xs leading-relaxed text-muted-foreground">
            {disclaimers.pastPerformance}
          </AlertDescription>
        </Alert>
      ) : null}
    </footer>
  );
}
