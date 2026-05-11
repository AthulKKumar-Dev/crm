import { motion, type Variants } from "framer-motion";
import { Crown, MapPin, ShoppingBag } from "lucide-react";

const container: Variants = {
    hidden: {},
    visible: {
        transition: { staggerChildren: 0.2, delayChildren: 0.15 },
    },
};

const cardEnter: Variants = {
    hidden: { opacity: 0, scale: 0.92 },
    visible: {
        opacity: 1,
        scale: 1,
        transition: { duration: 0.5, ease: "easeOut" },
    },
};

const tagPop: Variants = {
    hidden: { opacity: 0, scale: 0.5, y: 6 },
    visible: {
        opacity: 1,
        scale: 1,
        y: 0,
        transition: { duration: 0.4, ease: "backOut" },
    },
};

export function CustomerProfileIllustration() {
    return (
        <motion.div
            variants={container}
            initial="hidden"
            animate="visible"
            className="relative mx-auto aspect-[16/9] w-full max-w-[360px]"
        >
            {/* Central customer card */}
            <motion.div
                variants={cardEnter}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2.5 rounded-2xl bg-white px-4 py-3 shadow-lg shadow-black/30 ring-1 ring-black/5"
            >
                <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 text-[11px] font-bold text-white">
                    AP
                </div>
                <div className="flex flex-col">
                    <span className="text-[12px] font-semibold text-gray-900 leading-tight">
                        Aarav Patel
                    </span>
                    <span className="text-[10px] text-gray-500 leading-tight">
                        aarav@example.com
                    </span>
                </div>
            </motion.div>

            {/* Tag: VIP (top-right) */}
            <motion.div
                variants={tagPop}
                className="absolute right-3 top-2 flex items-center gap-1 rounded-full bg-[#CEF17B] px-2 py-0.5 shadow-md shadow-black/20"
            >
                <Crown className="size-3 text-[#084734]" fill="currentColor" />
                <span className="text-[10px] font-semibold text-[#084734]">VIP</span>
            </motion.div>

            {/* Tag: Mumbai (mid-right) */}
            <motion.div
                variants={tagPop}
                className="absolute right-6 bottom-8 flex items-center gap-1 rounded-full bg-white px-2 py-0.5 shadow-md shadow-black/20"
            >
                <MapPin className="size-3 text-[#3B82F6]" />
                <span className="text-[10px] font-medium text-gray-900">Mumbai</span>
            </motion.div>

            {/* Tag: 5 orders (bottom-left) */}
            <motion.div
                variants={tagPop}
                className="absolute left-3 bottom-2 flex items-center gap-1 rounded-full bg-white px-2 py-0.5 shadow-md shadow-black/20"
            >
                <ShoppingBag
                    className="size-3 text-[#3B82F6]"
                    fill="currentColor"
                />
                <span className="text-[10px] font-medium text-gray-900">5 orders</span>
            </motion.div>
        </motion.div>
    );
}