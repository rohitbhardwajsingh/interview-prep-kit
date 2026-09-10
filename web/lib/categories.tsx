import {
  Braces,
  Building2,
  MessageSquareQuote,
  Network,
  type LucideIcon,
} from "lucide-react";

/**
 * Everything the interface needs to render a question category consistently:
 * a colour so a long list sorts by eye before it is read, an icon so it is
 * recognisable at a glance, and a short human label.
 *
 * The class strings are written out in full rather than composed, because
 * Tailwind only keeps classes it can see literally — and these are also
 * safelisted for the cases where the category arrives at runtime.
 */
export interface CategoryMeta {
  label: string;
  icon: LucideIcon;
  text: string;
  bgSoft: string;
  border: string;
  dot: string;
}

const CATEGORIES: Record<string, CategoryMeta> = {
  technical: {
    label: "Technical",
    icon: Braces,
    text: "text-technical",
    bgSoft: "bg-technical/10",
    border: "border-technical/30",
    dot: "bg-technical",
  },
  behavioural: {
    label: "Behavioural",
    icon: MessageSquareQuote,
    text: "text-behavioural",
    bgSoft: "bg-behavioural/10",
    border: "border-behavioural/30",
    dot: "bg-behavioural",
  },
  "system-design": {
    label: "System design",
    icon: Network,
    text: "text-system-design",
    bgSoft: "bg-system-design/10",
    border: "border-system-design/30",
    dot: "bg-system-design",
  },
  "company-fit": {
    label: "Company fit",
    icon: Building2,
    text: "text-company-fit",
    bgSoft: "bg-company-fit/10",
    border: "border-company-fit/30",
    dot: "bg-company-fit",
  },
};

const FALLBACK: CategoryMeta = {
  label: "Question",
  icon: MessageSquareQuote,
  text: "text-dim",
  bgSoft: "bg-surface-high",
  border: "border-line",
  dot: "bg-faint",
};

export function categoryMeta(category: string): CategoryMeta {
  return CATEGORIES[category] ?? FALLBACK;
}
