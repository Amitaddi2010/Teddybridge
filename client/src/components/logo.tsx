import { cn } from "@/lib/utils";
import { TeddyIcon } from "./teddy-icon";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

const sizeStyles = {
  sm: "h-7 w-7",
  md: "h-9 w-9",
  lg: "h-14 w-14",
};

const iconSizes = {
  sm: 20,
  md: 28,
  lg: 40,
};

const textSizeStyles = {
  sm: "text-base font-semibold",
  md: "text-xl font-bold",
  lg: "text-3xl font-bold",
};

export function Logo({ size = "md", showText = true, className }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)} data-testid="logo-teddybridge">
      <div className={cn(
        "rounded-xl bg-primary flex items-center justify-center shadow-sm",
        "ring-1 ring-primary/20",
        sizeStyles[size]
      )}>
        <TeddyIcon 
          size={iconSizes[size]} 
          className="text-primary-foreground"
        />
      </div>
      {showText && (
        <span className={cn(
          "tracking-tight font-sans leading-tight",
          textSizeStyles[size]
        )}>
          <span className="text-primary">Teddy</span>
          <span className="text-foreground">Bridge</span>
        </span>
      )}
    </div>
  );
}
