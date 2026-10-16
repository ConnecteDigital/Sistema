import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] font-medium transition-[background-color,box-shadow,color,transform] outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(201_79_23/0.3)] hover:brightness-110",
        danger:
          "bg-destructive text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(239_68_68/0.3)] hover:brightness-110",
        outline: "border bg-card text-foreground shadow-xs hover:bg-accent",
        soft: "bg-brand-soft text-brand-foreground border border-brand/30 hover:brightness-95",
        ghost: "text-foreground hover:bg-accent",
        muted: "bg-muted text-foreground hover:bg-accent",
      },
      size: {
        sm: "h-7 px-2.5 text-[12.25px]",
        md: "h-8 px-3 text-[13px]",
        lg: "h-9 px-4 text-sm",
        icon: "size-7",
      },
    },
    defaultVariants: { variant: "outline", size: "sm" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
