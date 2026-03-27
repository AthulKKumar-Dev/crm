import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
    private readonly logger = new Logger(EmailService.name);
    private readonly resend: Resend;
    private readonly fromEmail: string;
    private readonly fromName: string;
    private readonly frontendUrl: string;
    private readonly isDev: boolean;

    constructor(private readonly config: ConfigService) {
        this.resend = new Resend(this.config.get<string>('resend.apiKey'));
        this.fromEmail = this.config.get<string>('resend.fromEmail')!;
        this.fromName = this.config.get<string>('resend.fromName')!;
        this.frontendUrl = this.config.get<string>('frontendUrl')!;
        this.isDev = this.config.get('nodeEnv') !== 'production';
    }

    private get from(): string {
        return `${this.fromName} <${this.fromEmail}>`;
    }

    async sendVerificationCode(email: string, code: string): Promise<void> {
        // In development, just log to console (no real email sent)
        if (this.isDev) {
            this.logger.log(`[DEV] Verification code for ${email}: ${code}`);
            return;
        }

        try {
            await this.resend.emails.send({
                from: this.from,
                to: email,
                subject: 'Your verification code',
                html: `
                    <h2>Verify your email</h2>
                    <p>Your verification code is:</p>
                    <h1 style="font-size: 32px; letter-spacing: 8px; text-align: center; padding: 16px; background: #f3f4f6; border-radius: 8px;">${code}</h1>
                    <p>This code expires in 10 minutes.</p>
                    <p>If you didn't create an account, you can safely ignore this email.</p>
                `,
            });
            this.logger.log(`Verification email sent to ${email}`);
        } catch (error) {
            this.logger.error(`Failed to send verification email to ${email}`, error);
            // Don't throw — email failure shouldn't block signup
        }
    }

    async sendPasswordResetLink(email: string, token: string): Promise<void> {
        const resetLink = `${this.frontendUrl}/reset-password?token=${token}`;

        if (this.isDev) {
            this.logger.log(`[DEV] Password reset for ${email}: ${resetLink}`);
            return;
        }

        try {
            await this.resend.emails.send({
                from: this.from,
                to: email,
                subject: 'Reset your password',
                html: `
                    <h2>Reset your password</h2>
                    <p>Click the button below to reset your password:</p>
                    <a href="${resetLink}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px;">Reset Password</a>
                    <p>This link expires in 1 hour.</p>
                    <p>If you didn't request this, you can safely ignore this email.</p>
                `,
            });
            this.logger.log(`Password reset email sent to ${email}`);
        } catch (error) {
            this.logger.error(`Failed to send password reset email to ${email}`, error);
        }
    }

    async sendTeamInvite(email: string, orgName: string, token: string): Promise<void> {
        const inviteLink = `${this.frontendUrl}/invite?token=${token}`;

        if (this.isDev) {
            this.logger.log(`[DEV] Team invite for ${email} to join ${orgName}: ${inviteLink}`);
            return;
        }

        try {
            await this.resend.emails.send({
                from: this.from,
                to: email,
                subject: `You're invited to join ${orgName}`,
                html: `
                    <h2>You've been invited!</h2>
                    <p>You've been invited to join <strong>${orgName}</strong>.</p>
                    <a href="${inviteLink}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px;">Accept Invite</a>
                    <p>This invite expires in 7 days.</p>
                    <p>If you don't recognize this organization, you can safely ignore this email.</p>
                `,
            });
            this.logger.log(`Invite email sent to ${email} for ${orgName}`);
        } catch (error) {
            this.logger.error(`Failed to send invite email to ${email}`, error);
        }
    }
}