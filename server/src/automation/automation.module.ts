import { Module } from '@nestjs/common';
import { InstagramWebhookController } from './platforms/instagram/instagram-webhook.controller';
import { InstagramIngestService } from './platforms/instagram/instagram-ingest.service';
import { ContactService } from './messaging/contact.service';
import { MessageService } from './messaging/message.service';
import { AutomationEventService } from './automation-event.service';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { ChannelModule } from '../channel/channel.module';
import { InstagramMediaService } from './platforms/instagram/instagram-media.service';
import { BullModule } from '@nestjs/bullmq';
import { AutomationEventsQueue, AUTOMATION_EVENTS_QUEUE } from './automation-events.queue';
import { AutomationEventProcessor } from './automation-events.processor';
import { TriggerMatcherService } from './trigger-matcher.service';
import { AutomationRunnerService } from './automation-runner.service';
import { OutboundService } from './messaging/outbound.service';
import { InstagramSendService } from './platforms/instagram/instagram-send.service';
import { WaitResumeScheduler } from './wait-resume.scheduler';

@Module({
  imports: [ChannelModule, BullModule.registerQueue({ name: AUTOMATION_EVENTS_QUEUE })],
  controllers: [InstagramWebhookController, AutomationController],
  providers: [ContactService, MessageService, AutomationEventService, InstagramIngestService, AutomationService, InstagramMediaService,
    AutomationEventsQueue,
    AutomationEventProcessor,
    TriggerMatcherService,
    AutomationRunnerService,
    OutboundService,
    InstagramSendService,
    WaitResumeScheduler
  ],
  exports: [ContactService, MessageService, AutomationEventService, AutomationService, InstagramMediaService, OutboundService],
})

export class AutomationModule { }