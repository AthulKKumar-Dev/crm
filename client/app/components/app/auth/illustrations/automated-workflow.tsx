import { motion, type Variants } from "framer-motion";
import { Rocket } from "lucide-react";

// Master container — staggers children
const container: Variants = {
    hidden: {},
    visible: {
        transition: { staggerChildren: 0.25, delayChildren: 0.2 },
    },
};

// Pills (top + two bottom)
const pillFromTop: Variants = {
    hidden: { opacity: 0, y: -12 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.5, ease: "easeOut" },
    },
};

const pillFromBottom: Variants = {
    hidden: { opacity: 0, y: 12 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.5, ease: "easeOut" },
    },
};

// SVG line — draws stroke from 0 → 1
const drawLine: Variants = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: {
        pathLength: 1,
        opacity: 1,
        transition: { duration: 0.7, ease: "easeInOut" },
    },
};

// Junction dots — pop in
const dotPop: Variants = {
    hidden: { scale: 0, opacity: 0 },
    visible: {
        scale: 1,
        opacity: 1,
        transition: { duration: 0.3, ease: "backOut" },
    },
};


export function AutomatedWorkflowIllustration() {
    return (
        <motion.div
            variants={container}
            initial="hidden"
            animate="visible"
            className="relative mx-auto aspect-[16/9] w-full max-w-[360px]"
        >
            {/* Top pill */}
            <motion.div
                variants={pillFromTop}
                className="absolute left-1/2 top-0 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 shadow-lg shadow-black/30 ring-1 ring-black/5"
            >
                <Rocket className="size-3.5 text-blue-500" fill="currentColor" />
                <span className="text-[11px] font-medium text-gray-900 whitespace-nowrap">
                    New Shopify order
                </span>
            </motion.div>

            {/* Connecting lines (SVG so we can animate pathLength) */}
            <svg
                viewBox="0 0 360 200"
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full text-white/40"
                fill="none"
            >
                {/* Vertical from top pill down to split point */}
                <motion.path
                    d="M 180 30 L 180 100"
                    stroke="currentColor"
                    strokeWidth="1"
                    variants={drawLine}
                />
                {/* Horizontal split */}
                <motion.path
                    d="M 70 100 L 290 100"
                    stroke="currentColor"
                    strokeWidth="1"
                    variants={drawLine}
                />
                {/* Left vertical to "Responsed" */}
                <motion.path
                    d="M 70 100 L 70 165"
                    stroke="currentColor"
                    strokeWidth="1"
                    variants={drawLine}
                />
                {/* Right vertical to "No Response" */}
                <motion.path
                    d="M 290 100 L 290 165"
                    stroke="currentColor"
                    strokeWidth="1"
                    variants={drawLine}
                />

                {/* Junction dots */}
                <motion.circle
                    cx="180"
                    cy="100"
                    r="3"
                    fill="#3B82F6"
                    variants={dotPop}
                />
                <motion.circle cx="70" cy="100" r="3" fill="#3B82F6" variants={dotPop} />
                <motion.circle
                    cx="290"
                    cy="100"
                    r="3"
                    fill="#3B82F6"
                    variants={dotPop}
                />
                <motion.circle cx="180" cy="30" r="3" fill="#3B82F6" variants={dotPop} />
            </svg>

            {/* Bottom-left pill: Responsed */}
            <motion.div
                variants={pillFromBottom}
                className="absolute bottom-0 left-11 -translate-x-1/4 rounded-full bg-white px-3 py-1 shadow-lg shadow-black/30 ring-1 ring-black/5"
            >
                <span className="text-[11px] font-medium text-gray-900">WhatsApp sent</span>
            </motion.div>

            {/* Bottom-right pill: No Response */}
            <motion.div
                variants={pillFromBottom}
                className="absolute bottom-0 right-11 translate-x-1/4 rounded-full bg-white px-3 py-1 shadow-lg shadow-black/30 ring-1 ring-black/5"
            >
                <span className="text-[11px] font-medium text-gray-900">Synced to CRM</span>
            </motion.div>
        </motion.div>
    );
}