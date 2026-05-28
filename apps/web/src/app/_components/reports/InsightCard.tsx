import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/cn";

interface InsightCardProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly children: React.ReactNode;
  readonly className?: string;
}

export function InsightCard({ title, subtitle, children, className }: InsightCardProps) {
  return (
    <Card className={cn("h-full", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {subtitle ? (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </CardHeader>
      <CardContent className="text-sm">{children}</CardContent>
    </Card>
  );
}
