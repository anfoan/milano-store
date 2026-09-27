import React from 'react';
import { Minus, Plus } from 'lucide-react';

/**
 * Quantity control shared by product details and the cart.
 * The maximum is always supplied by the live inventory calculation.
 */
export default function QuantityStepper({
    value,
    min = 0,
    max = Infinity,
    onChange,
    disabled = false,
    compact = false,
    label = 'Quantity'
}) {
    const numericValue = Math.max(min, Math.min(Number(value) || min, max));
    const canDecrease = !disabled && numericValue > min;
    const canIncrease = !disabled && numericValue < max;

    return (
        <div className={`inline-flex items-center gap-2 ${compact ? 'gap-1.5' : 'gap-3'}`} dir="ltr" aria-label={label}>
            <button
                type="button"
                onClick={() => canDecrease && onChange(numericValue - 1)}
                disabled={!canDecrease}
                aria-label={`${label} -`}
                className={`${compact ? 'w-7 h-7 rounded-lg' : 'w-10 h-10 rounded-xl'} flex items-center justify-center text-red-700 dark:text-red-300 bg-red-500/15 border border-red-500/25 hover:bg-red-500/25 active:scale-95 transition-all disabled:opacity-35 disabled:cursor-not-allowed shadow-sm`}
            >
                <Minus size={compact ? 15 : 18} strokeWidth={3} />
            </button>
            <span
                className={`${compact ? 'min-w-7 h-7 text-xs' : 'min-w-10 h-10 text-lg'} rounded-xl border border-gray-200 dark:border-white/15 bg-white dark:bg-white/5 flex items-center justify-center font-black text-gray-900 dark:text-white px-2`}
                aria-live="polite"
            >
                {numericValue}
            </span>
            <button
                type="button"
                onClick={() => canIncrease && onChange(numericValue + 1)}
                disabled={!canIncrease}
                aria-label={`${label} +`}
                title={!canIncrease && max !== Infinity ? `Available: ${max}` : label}
                className={`${compact ? 'w-7 h-7 rounded-lg' : 'w-10 h-10 rounded-xl'} flex items-center justify-center text-blue-700 dark:text-blue-300 bg-blue-500/15 border border-blue-500/25 hover:bg-blue-500/25 active:scale-95 transition-all disabled:opacity-35 disabled:cursor-not-allowed shadow-sm`}
            >
                <Plus size={compact ? 15 : 18} strokeWidth={3} />
            </button>
        </div>
    );
}
