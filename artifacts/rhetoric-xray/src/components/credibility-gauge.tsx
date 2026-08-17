import { cn } from "@/lib/utils";

interface CredibilityGaugeProps {
  score: number;
  className?: string;
}

export function CredibilityGauge({ score, className }: CredibilityGaugeProps) {
  // Score 0 to 100
  // Safe: 70-100 (Green/Teal)
  // Caution: 40-69 (Amber/Yellow)
  // Danger: 0-39 (Red/Orange)
  const radius = 60;
  const circumference = radius * Math.PI; // Half circle
  const dashoffset = circumference - (score / 100) * circumference;
  
  let colorClass = "text-emerald-500";
  let label = "值得信賴";
  
  if (score < 40) {
    colorClass = "text-destructive";
    label = "高度操縱";
  } else if (score < 70) {
    colorClass = "text-amber-500";
    label = "需要留意";
  }

  return (
    <div className={cn("relative flex flex-col items-center", className)}>
      <svg className="w-48 h-24 overflow-visible" viewBox="0 0 140 70">
        {/* Background Arc */}
        <path
          d="M 10 70 A 60 60 0 0 1 130 70"
          className="stroke-muted fill-none"
          strokeWidth="12"
          strokeLinecap="round"
        />
        {/* Value Arc */}
        <path
          d="M 10 70 A 60 60 0 0 1 130 70"
          className={cn("fill-none stroke-current transition-all duration-1000 ease-out", colorClass)}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
        />
      </svg>
      <div className="absolute bottom-0 text-center flex flex-col items-center translate-y-2">
        <div className="flex items-baseline gap-1">
          <span className={cn("text-4xl font-bold font-serif leading-none", colorClass)}>{score}</span>
        </div>
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground mt-1">{label}</span>
      </div>
    </div>
  );
}
