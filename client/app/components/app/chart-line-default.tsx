"use client"

import * as React from "react"
import { Area, AreaChart, Line, LineChart } from "recharts"

import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "~/components/ui/chart"
import { cn } from "~/lib/utils"

const chartData = [
    { month: "January", desktop: 186 },
    { month: "February", desktop: 305 },
    { month: "March", desktop: 237 },
    { month: "April", desktop: 73 },
    { month: "May", desktop: 209 },
    { month: "June", desktop: 214 },
]

/** Approved chart tones. Add a case here rather than passing a raw color. */
const CHART_TONE = {
    brand: "var(--brand)",
    forest: "var(--brand-forest)",
    success: "var(--success)",
    warning: "var(--warning)",
    danger: "var(--danger)",
    info: "var(--info)",
    neutral: "var(--muted-foreground)",
} as const

export type ChartTone = keyof typeof CHART_TONE

export function ChartLineDefault({
    tone = "brand",
    variant = "line",
    className,
}: {
    tone?: ChartTone
    variant?: "line" | "area"
    className?: string
}) {
    // useId() emits colons, which are invalid in SVG url(#...) references.
    const gradientId = `fill-${React.useId().replace(/:/g, "")}`

    const chartConfig = {
        desktop: { label: "Desktop", color: CHART_TONE[tone] },
    } satisfies ChartConfig

    const margin = { left: 12, right: 12 }

    return (
        <ChartContainer
            config={chartConfig}
            className={cn("aspect-auto h-16 w-full", className)}
        >
            {variant === "area" ? (
                <AreaChart accessibilityLayer data={chartData} margin={margin}>
                    <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--color-desktop)" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="var(--color-desktop)" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                    <Area
                        dataKey="desktop"
                        type="natural"
                        stroke="var(--color-desktop)"
                        strokeWidth={2}
                        fill={`url(#${gradientId})`}
                    />
                </AreaChart>
            ) : (
                <LineChart accessibilityLayer data={chartData} margin={margin}>
                    <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                    <Line
                        dataKey="desktop"
                        type="natural"
                        stroke="var(--color-desktop)"
                        strokeWidth={2}
                        dot={false}
                    />
                </LineChart>
            )}
        </ChartContainer>
    )
}