import { cn } from "@/lib/utils";

interface TeddyIconProps {
  className?: string;
  size?: number;
}

export function TeddyIcon({ className, size = 24 }: TeddyIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      className={cn("fill-current", className)}
      width={size}
      height={size}
    >
      {/* Teddy Bear Head */}
      <circle cx="50" cy="50" r="35" fill="currentColor" stroke="currentColor" strokeWidth="2" opacity="0.9"/>
      
      {/* Left Ear */}
      <circle cx="30" cy="30" r="12" fill="currentColor" stroke="currentColor" strokeWidth="2" opacity="0.9"/>
      <circle cx="30" cy="30" r="7" fill="currentColor" opacity="0.7"/>
      
      {/* Right Ear */}
      <circle cx="70" cy="30" r="12" fill="currentColor" stroke="currentColor" strokeWidth="2" opacity="0.9"/>
      <circle cx="70" cy="30" r="7" fill="currentColor" opacity="0.7"/>
      
      {/* Left Eye */}
      <circle cx="42" cy="45" r="4" fill="currentColor" opacity="1"/>
      <circle cx="43" cy="44" r="1.5" fill="currentColor" opacity="0.3"/>
      
      {/* Right Eye */}
      <circle cx="58" cy="45" r="4" fill="currentColor" opacity="1"/>
      <circle cx="59" cy="44" r="1.5" fill="currentColor" opacity="0.3"/>
      
      {/* Nose */}
      <ellipse cx="50" cy="55" rx="4" ry="3" fill="currentColor" opacity="1"/>
      
      {/* Mouth */}
      <path d="M 50 55 Q 45 60 40 58" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" opacity="1"/>
      <path d="M 50 55 Q 55 60 60 58" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" opacity="1"/>
      
      {/* Snout Highlight */}
      <ellipse cx="50" cy="52" rx="3" ry="2" fill="currentColor" opacity="0.2"/>
    </svg>
  );
}

