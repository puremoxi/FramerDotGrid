// Dot grid hero background with NxN cluster highlight + optional trailing linger/fade
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

    // NEW: trailing controls
    trailEnabled?: boolean
    trailHoldMs?: number
    trailFadeMs?: number
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

        // NEW
        trailEnabled = false,
        trailHoldMs = 180,
        trailFadeMs = 520,
    } = props

    const containerRef = useRef<HTMLDivElement>(null)
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
    const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
    const isStatic = useIsStaticRenderer()

    // NEW: per-dot "last activated" timestamps (ms since epoch)
    const lastHitRef = useRef<Map<number, number>>(new Map())
    // NEW: clock for trail animation (only ticks while needed)
    const [now, setNow] = useState(0)
    const rafRef = useRef<number | null>(null)

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
        // NOTE: do NOT clear lastHitRef here; trail should continue if enabled
    }, [])

    // Grid calculation
    const { cols, rows, grid } = useMemo(() => {
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
        return { cols, rows, grid }
    }, [dimensions, dotSize, gap])

    // Find hovered dot
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

    // NxN cluster indices
    const activeSet = useMemo(() => {
        if (!hoveredDot) return new Set<number>()
        const set = new Set<number>()
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

    // NEW: Update trail timestamps when hover cluster changes
    useEffect(() => {
        if (!trailEnabled) return
        if (!hover) return
        const t = performance.now()
        activeSet.forEach((idx) => lastHitRef.current.set(idx, t))
        // Ensure we have a clock tick at least once
        setNow(t)
    }, [trailEnabled, hover, activeSet])

    // NEW: If trail is turned off, clear lingering state
    useEffect(() => {
        if (trailEnabled) return
        lastHitRef.current.clear()
        setNow(0)
    }, [trailEnabled])

    // NEW: RAF clock runs only while needed (hovering or lingering dots exist)
    useEffect(() => {
        if (isStatic) return

        const shouldRun =
            trailEnabled && (hover !== null || lastHitRef.current.size > 0)

        if (!shouldRun) {
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
            rafRef.current = null
            return
        }

        let mounted = true
        const tick = () => {
            if (!mounted) return
            const t = performance.now()
            setNow(t)

            // Cleanup expired dots to stop RAF naturally
            const hold = Math.max(0, trailHoldMs)
            const fade = Math.max(0, trailFadeMs)
            const expire = hold + fade

            if (expire <= 0) {
                lastHitRef.current.clear()
            } else {
                for (const [idx, hit] of lastHitRef.current.entries()) {
                    if (t - hit > expire) lastHitRef.current.delete(idx)
                }
            }

            const stillNeeded =
                trailEnabled &&
                (hover !== null || lastHitRef.current.size > 0)

            if (stillNeeded) {
                rafRef.current = requestAnimationFrame(tick)
            } else {
                rafRef.current = null
            }
        }

        rafRef.current = requestAnimationFrame(tick)

        return () => {
            mounted = false
            if (rafRef.current) cancelAnimationFrame(rafRef.current)
            rafRef.current = null
        }
    }, [isStatic, trailEnabled, trailHoldMs, trailFadeMs, hover])

    // NEW: activation level per dot (0..1) combining hover + trail
    const getTrailLevel = useCallback(
        (i: number) => {
            if (!trailEnabled) return 0
            const hit = lastHitRef.current.get(i)
            if (hit == null) return 0

            const hold = Math.max(0, trailHoldMs)
            const fade = Math.max(0, trailFadeMs)
            const elapsed = now - hit

            // Fully on during hold
            if (elapsed <= hold) return 1

            // Fade down after hold
            if (fade <= 0) return 0
            const t = (elapsed - hold) / fade
            return Math.max(0, Math.min(1, 1 - t))
        },
        [trailEnabled, trailHoldMs, trailFadeMs, now]
    )

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
                    const baseRadius =
                        typeof props.circleRadius === "number"
                            ? props.circleRadius
                            : dotSize / 2

                    // Base state
                    let level = 0 // 0..1
                    let scaleTarget = 1

                    // If currently hovered, hard-override to level 1
                    const isHoverActive = !!(hover && activeSet.has(i) && hoveredDot)

                    if (isHoverActive && hoveredDot) {
                        level = 1

                        // Distance-based scale falloff
                        const dRow = Math.abs(dot.row - hoveredDot.row)
                        const dCol = Math.abs(dot.col - hoveredDot.col)
                        const dist = Math.max(dRow, dCol)

                        const maxDist = Math.floor(
                            (typeof props.hoverDotCount === "number"
                                ? props.hoverDotCount
                                : 5) / 2
                        )
                        const t = 1 - dist / (maxDist === 0 ? 1 : maxDist)
                        const intensity =
                            typeof props.smoothIntensity === "number"
                                ? props.smoothIntensity
                                : 0.95

                        scaleTarget = 1 + intensity * Math.max(0, t)
                    } else {
                        // Not currently hovered; optionally trail
                        level = getTrailLevel(i)
                        // When trailing, keep the "peak" scaleTarget at the max hover scale
                        // (simple + punchy; if you want it to preserve per-dot dist scale, we can store dist too)
                        if (level > 0) {
                            const intensity =
                                typeof props.smoothIntensity === "number"
                                    ? props.smoothIntensity
                                    : 0.95
                            scaleTarget = 1 + intensity
                        }
                    }

                    // Blend back to base using level
                    const color = level > 0 ? blend(baseColor, activeColor, level) : baseColor

                    // Ease radius back to base with level
                    const scale = 1 + (scaleTarget - 1) * level
                    const r = baseRadius * scale

                    // Keep transitions for "pop", but trail is driven by RAF updates
                    const useTransition = hover !== null || (trailEnabled && lastHitRef.current.size > 0)

                    return (
                        <circle
                            key={i}
                            cx={dot.x}
                            cy={dot.y}
                            r={r}
                            fill={color}
                            style={{
                                transition: useTransition
                                    ? "r 0.18s cubic-bezier(.4,1.2,.4,1), fill 0.14s cubic-bezier(.4,1.2,.4,1)"
                                    : "none",
                                willChange: useTransition ? "r, fill" : undefined,
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

    // NEW: Trailing controls
    trailEnabled: {
        type: ControlType.Boolean,
        title: "Trail Enabled",
        defaultValue: false,
    },
    trailHoldMs: {
        type: ControlType.Number,
        title: "Trail Hold",
        defaultValue: 180,
        min: 0,
        max: 2000,
        step: 10,
        unit: "ms",
        description: "How long dots stay fully active after leaving the cursor",
        hidden: (p) => !p.trailEnabled,
    },
    trailFadeMs: {
        type: ControlType.Number,
        title: "Trail Fade",
        defaultValue: 520,
        min: 0,
        max: 4000,
        step: 10,
        unit: "ms",
        description: "How long dots take to fade back to base",
        hidden: (p) => !p.trailEnabled,
    },
})
