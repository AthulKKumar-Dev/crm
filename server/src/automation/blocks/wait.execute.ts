import { BlockExecute } from "./block.types";

const MS_PER_UNIT = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 } as const;
type WaitUnit = keyof typeof MS_PER_UNIT;

export const executeWait: BlockExecute = async (ctx) => {
    const waitConfig = ctx.step.config as { amount: number; unit: WaitUnit };
    const waitDurationMs = waitConfig.amount * MS_PER_UNIT[waitConfig.unit];
    const resumeAt = new Date(Date.now() + waitDurationMs);

    if (ctx.dry) {
        return Promise.resolve({ kind: 'done', output: { wouldWaitUntil: resumeAt.toISOString() } });
    }
    return Promise.resolve({ kind: 'wait', resumeAt });
}