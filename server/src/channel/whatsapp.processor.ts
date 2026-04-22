import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WHATSAPP_MESSAGING_QUEUE, WhatsAppMessageJobData } from './whatsapp.queue';
import { WhatsAppMessagingService } from './whatsapp-messaging.service';

/**
 * BullMQ worker for the WhatsApp messaging queue.
 * Jobs are enqueued by WhatsAppTriggerService; this worker dispatches them to
 * Meta's Cloud API via WhatsAppMessagingService.
 *
 * Failures thrown from the service bubble up to BullMQ, which retries with
 * exponential backoff per the `attempts` + `backoff` options set at enqueue time.
 */
@Processor(WHATSAPP_MESSAGING_QUEUE)
export class WhatsAppMessagingProcessor extends WorkerHost {
    private readonly logger = new Logger(WhatsAppMessagingProcessor.name);

    constructor(private readonly messagingService: WhatsAppMessagingService) {
        super();
    }

    async process(job: Job<WhatsAppMessageJobData>): Promise<void> {
        const { toPhone, templateName, triggerType } = job.data;
        this.logger.log(
            `Processing WhatsApp job ${job.id}: ${templateName} → ${toPhone} (trigger=${triggerType})`,
        );

        await this.messagingService.sendTemplate(job.data);

        this.logger.log(`WhatsApp job ${job.id} completed`);
    }
}
