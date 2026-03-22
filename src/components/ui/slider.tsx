import * as React from "react"

import { cn } from "@/lib/utils"

export interface SliderProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        type="range"
        className={cn(
          "w-full cursor-pointer appearance-none bg-transparent",
          "[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-primary/20",
          "[&::-webkit-slider-thumb]:mt-[-4px] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:transition-colors",
          "[&::-webkit-slider-thumb]:hover:bg-primary/90",
          "[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-primary/20",
          "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:shadow [&::-moz-range-thumb]:transition-colors",
          "[&::-moz-range-thumb]:hover:bg-primary/90",
          "focus-visible:outline-none focus-visible:[&::-webkit-slider-thumb]:ring-1 focus-visible:[&::-webkit-slider-thumb]:ring-ring",
          "disabled:pointer-events-none disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Slider.displayName = "Slider"

export { Slider }
