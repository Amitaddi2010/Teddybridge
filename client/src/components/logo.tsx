import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

const sizeStyles = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-12 w-12",
};

const textSizeStyles = {
  sm: "text-lg",
  md: "text-xl",
  lg: "text-3xl",
};

export function Logo({ size = "md", showText = true, className }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2", className)} data-testid="logo-teddybridge">
      <div className={cn(
        "rounded-lg bg-primary flex items-center justify-center",
        sizeStyles[size]
      )}>
        <Heart className={cn(
          "text-primary-foreground",
          size === "sm" ? "h-3.5 w-3.5" : size === "md" ? "h-5 w-5" : "h-7 w-7"
        )} />
      </div>
      {showText && (
        <span className={cn(
          "font-bold tracking-tight font-sans",
          textSizeStyles[size]
        )}>
          <span className="text-primary">Teddy</span>
          <span className="text-foreground">Bridge</span>
        </span>
      )}
    </div>
  );
}
