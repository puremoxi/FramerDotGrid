// Dot grid hero background with 3x3 cluster highlight on cursor hover, no wave/inertia effects
import {
    useRef,
    useEffect,
    useState,
    useCallback,
    useMemo,
    startTransition,
} from "react"
import { addPropertyControls, ControlType, useIsStaticRenderer } from "framer"

interface DotGridHeroProps {
    dotSize: number
    gap: number
    baseColor: string
    activeColor: string
    backgroundColor: string
    circleRadius?: number
    hoverSquareRadius?: number
    hoverDotCount?: number
    smoothIntensity?: number
    style?: React.CSSProperties
}

/**
 * DotGridHero
 *
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 */
export default function DotGridHero(props: DotGridHeroProps) {
    const {
        dotSize = 16,
        gap = 32,
        baseColor = "#5227FF",
        activeColor = "#FFFFFF",
        backgroundColor = "rgba(0, 0, 0, 0)",
        style,
    } = props
    const containerRef = useRef<HTMLDivElement>(null)
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
    const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
    const isStatic = useIsStaticRenderer()

    // Responsive sizing
    useEffect(() => {
        function update() {
            if (!containerRef.current) return
            const rect = containerRef.current.getBoundingClientRect()
            startTransition(() =>
                setDimensions({ width: rect.width, height: rect.height })
            )
        }
        update()
        window.addEventListener("resize", update)
        return () => window.removeEventListener("resize", update)
    }, [])

    // Mouse tracking
    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!containerRef.current) return
        const rect = containerRef.current.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        startTransition(() => setHover({ x, y }))
    }, [])
    const handleMouseLeave = useCallback(() => {
        startTransition(() => setHover(null))
    }, [])

    // Grid calculation
    const { cols, rows, grid, cell } = useMemo(() => {
        const cell = dotSize + gap
        const cols = Math.max(1, Math.floor((dimensions.width + gap) / cell))
        const rows = Math.max(1, Math.floor((dimensions.height + gap) / cell))
        const grid: { x: number; y: number; col: number; row: number }[] = []
        const gridW = cell * cols - gap
        const gridH = cell * rows - gap
        const extraX = dimensions.width - gridW
        const extraY = dimensions.height - gridH
        const startX = extraX / 2 + dotSize / 2
        const startY = extraY / 2 + dotSize / 2
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                grid.push({
                    x: startX + col * cell,
                    y: startY + row * cell,
                    col,
                    row,
                })
            }
        }
        return { cols, rows, grid, cell }
    }, [dimensions, dotSize, gap])

    // Find hovered dot index
    const hoveredDot = useMemo(() => {
        if (!hover) return null
        let minDist = Infinity
        let idx = -1
        for (let i = 0; i < grid.length; i++) {
            const d = Math.hypot(grid[i].x - hover.x, grid[i].y - hover.y)
            if (d < minDist) {
                minDist = d
                idx = i
            }
        }
        if (idx === -1) return null
        return grid[idx]
    }, [hover, grid])

    // 3x3 cluster indices
    const activeSet = useMemo(() => {
        if (!hoveredDot) return new Set()
        const set = new Set<number>()
        // Use hoverDotCount if provided, else fallback to hoverSquareRadius
        const count =
            typeof props.hoverDotCount === "number" ? props.hoverDotCount : 5
        const hoverRadius = Math.floor(count / 2)
        for (let dr = -hoverRadius; dr <= hoverRadius; dr++) {
            for (let dc = -hoverRadius; dc <= hoverRadius; dc++) {
                const r = hoveredDot.row + dr
                const c = hoveredDot.col + dc
                if (r < 0 || r >= rows || c < 0 || c >= cols) continue
                set.add(r * cols + c)
            }
        }
        return set
    }, [hoveredDot, cols, rows, props.hoverDotCount])

    // Color helpers
    function hexToRgb(hex: string) {
        const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
        if (!m) return { r: 0, g: 0, b: 0 }
        return {
            r: parseInt(m[1], 16),
            g: parseInt(m[2], 16),
            b: parseInt(m[3], 16),
        }
    }
    function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
        return (
            "#" +
            [r, g, b]
                .map((x) => {
                    const v = Math.max(0, Math.min(255, Math.round(x)))
                    return v.toString(16).padStart(2, "0")
                })
                .join("")
        )
    }
    function blend(a: string, b: string, t: number) {
        const ca = hexToRgb(a)
        const cb = hexToRgb(b)
        return rgbToHex({
            r: ca.r + (cb.r - ca.r) * t,
            g: ca.g + (cb.g - ca.g) * t,
            b: ca.b + (cb.b - ca.b) * t,
        })
    }

    // Render
    return (
        <section
            ref={containerRef}
            style={{
                width: "100%",
                height: "100%",
                position: "relative",
                overflow: "hidden",
                background: backgroundColor,
                ...style,
                cursor: hover ? "none" : "none",
                touchAction: "none",
            }}
            onMouseMove={isStatic ? undefined : handleMouseMove}
            onMouseLeave={isStatic ? undefined : handleMouseLeave}
            aria-label="Dot grid hero background"
            role="img"
        >
            <svg
                width={dimensions.width}
                height={dimensions.height}
                style={{ display: "block", width: "100%", height: "100%" }}
                aria-hidden="true"
            >
                {grid.map((dot, i) => {
                    let scale = 1
                    let color = baseColor
                    let isActive = false
                    if (hover && activeSet.has(i) && hoveredDot) {
                        isActive = true
                        // Calculate distance from hovered dot in grid coordinates
                        const dRow = Math.abs(dot.row - hoveredDot.row)
                        const dCol = Math.abs(dot.col - hoveredDot.col)
                        const dist = Math.max(dRow, dCol)
                        // All dots in hover square get activeColor, no blending
                        color = activeColor
                        // Gradually decrease scale as distance increases
                        // SMOOTHER: use exponential falloff for scale
                        const maxDist = Math.floor(
                            (typeof props.hoverDotCount === "number"
                                ? props.hoverDotCount
                                : 5) / 2
                        )
                        const t = 1 - dist / (maxDist === 0 ? 1 : maxDist)
                        // Intensity control for smoothness
                        const intensity =
                            typeof props.smoothIntensity === "number"
                                ? props.smoothIntensity
                                : 0.95
                        scale = 1 + intensity * Math.max(0, t)
                    }
                    const baseRadius =
                        typeof props.circleRadius === "number"
                            ? props.circleRadius
                            : dotSize / 2
                    return (
                        <circle
                            key={i}
                            cx={dot.x}
                            cy={dot.y}
                            r={baseRadius * scale}
                            fill={color}
                            style={{
                                transition: hover
                                    ? "r 0.22s cubic-bezier(.4,1.2,.4,1), fill 0.18s cubic-bezier(.4,1.2,.4,1)"
                                    : "none",
                                willChange: hover ? "r, fill" : undefined,
                            }}
                        />
                    )
                })}
            </svg>
        </section>
    )
}

addPropertyControls(DotGridHero, {
    dotSize: {
        type: ControlType.Number,
        title: "Dot Size",
        defaultValue: 16,
        min: 1,
        max: 48,
        step: 1,
        unit: "px",
    },
    gap: {
        type: ControlType.Number,
        title: "Gap",
        defaultValue: 32,
        min: 4,
        max: 80,
        step: 1,
        unit: "px",
        description: "Space between small circles",
    },
    backgroundColor: {
        type: ControlType.Color,
        title: "Background",
        defaultValue: "rgba(0, 0, 0, 0)",
        optional: true,
    },
    baseColor: {
        type: ControlType.Color,
        title: "Base Color",
        defaultValue: "#5227FF",
    },
    activeColor: {
        type: ControlType.Color,
        title: "Active Color",
        defaultValue: "#FFFFFF",
    },
    hoverSquareRadius: {
        type: ControlType.Number,
        title: "Hover Square Radius",
        defaultValue: 2,
        min: 1,
        max: 5,
        step: 1,
        unit: "dot",
        description:
            "Number of dots from center to edge of hover square (2 = 5x5)",
    },
    hoverDotCount: {
        type: ControlType.Number,
        title: "Hover Dots (NxN)",
        defaultValue: 5,
        min: 2,
        max: 10,
        step: 1,
        unit: "dot",
        description: "Number of dots per side in hover square (e.g. 5 = 5x5)",
    },
    smoothIntensity: {
        type: ControlType.Number,
        title: "Smooth Intensity",
        defaultValue: 0.95,
        min: 0.1,
        max: 5,
        step: 0.01,
        unit: "x",
        description:
            "Controls the zoom intensity of the hover animation (higher = more zoom)",
    },
})
