import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from '../prisma/prisma.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { BillingReconciler } from './billing.reconciler';
import { RazorpayService } from './razorpay.service';
import { RazorpayWebhookController } from './webhooks/razorpay-webhook.controller';

@Module({
    imports: [ConfigModule, PrismaModule],
    controllers: [BillingController, RazorpayWebhookController],
    providers: [BillingService, RazorpayService, BillingReconciler],
    exports: [BillingService],
})
export class BillingModule { }
