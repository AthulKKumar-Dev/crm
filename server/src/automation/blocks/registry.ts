import { BlockExecute } from "./block.types";
import { executeSendMessage } from "./send-message.execute";
import { executeWait } from "./wait.execute";

/** Triggers are matched before a run exists; nothing to execute. */
const executeTrigger: BlockExecute = () => Promise.resolve({ kind: 'done', output: { simulated: true } });

const executeSendInvoice: BlockExecute = () =>
    Promise.resolve({
        kind: 'fail',
        error: 'send_invoice is not available on Instagram automations yet',
        permanent: true,
    });

const EXECUTORS: Record<string, BlockExecute> = {
    trigger: executeTrigger,
    send_message: executeSendMessage,
    send_invoice: executeSendInvoice,
    wait: executeWait
}

export function getExecutor(type: string): BlockExecute | undefined {
    return EXECUTORS[type]
}