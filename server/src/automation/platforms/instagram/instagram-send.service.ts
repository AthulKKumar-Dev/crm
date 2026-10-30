import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ChannelStatus } from "@prisma/client";
import { InstagramOAuthService } from "src/channel/instagram-oauth.service";
import { MetaGraphClient } from "src/channel/meta-graph.client";
import { MetaGraphError, metaScope } from "src/channel/meta-graph.types";
import { PrismaService } from "src/prisma/prisma.service";
import { Priority } from "src/rate-limit/rate-limit.types";
import { IG_GRAPH_HOST } from "src/channel/instagram-login.util";

export interface IgSendResult {
    externalId: string | null;
    recipientId: string | null;
    request: unknown;
    response: unknown
}

type InstagramMessagePayload = {
    recipient: { comment_id: string } | { id: string };
    message: { text: string };
};

interface IgSendResponse { recipient_id?: string; message_id?: string }

interface PrivateReplyParams {
    channelId: string;
    commentId: string;
    text: string;
}

interface DirectMessageParams {
    channelId: string;
    igsid: string;
    text: string;
}

const RECONNECT_MESSAGE = 'Instagram access expired or was revoked. Reconnect the account.';

/**
 * Instagram Login messaging. One door: POST /{igUserId}/messages. Private
 * replies name the comment; DMs name the IGSID. Rate limits propagate as
 * RateLimitedError so the processor parks the job.
 */
@Injectable()
export class InstagramSendService {
    private readonly logger = new Logger(InstagramSendService.name)
    private readonly graphVersion: string

    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
        private readonly oauth: InstagramOAuthService,
        private readonly metaGraph: MetaGraphClient
    ) {
        this.graphVersion = this.config.get<string>('instagram.graphVersion') ?? 'v21.0'
    }

    /** One per comment, within 7 days of it. */
    sendPrivateReply({ channelId, commentId, text }: PrivateReplyParams) {
        return this.send(channelId, {
            recipient: { comment_id: commentId },
            message: { text },
        });
    }

    /** Within 24 h of the person's last inbound message. */
    sendDirectMessage({ channelId, igsid, text }: DirectMessageParams) {
        return this.send(channelId, {
            recipient: { id: igsid },
            message: { text },
        });
    }

    private async send(channelId: string, payload: InstagramMessagePayload): Promise<IgSendResult> {
        const { token: accessToken, igUserId } = await this.oauth.getAccessToken(channelId);

        const graphResponse = await this.metaGraph.request<IgSendResponse>({
            method: 'POST',
            url: `${IG_GRAPH_HOST}/${this.graphVersion}/${igUserId}/messages`,
            accessToken,
            body: payload,
            scopes: [...this.metaGraph.baseScopes(), metaScope.igUser(igUserId)],
            priority: Priority.INTERACTIVE,
            channelId,
        });

        return {
            externalId: graphResponse.data.message_id ?? null,
            recipientId: graphResponse.data.recipient_id ?? null,
            request: payload,
            response: graphResponse.data,
        };
    }

    /**
     * MetaGraphClient already retried transient codes and turned throttles into
     * RateLimitedError (never reaches here). Deterministic 4xx = permanent.
     */
    async classifySendError(error: unknown, channelId: string) {
        if (!(error instanceof MetaGraphError)) {
            const message = error instanceof Error ? error.message : String(error);
            return { permanent: false, code: 'NETWORK', label: message };
        }

        if (error.code === 'AUTH_FAILED') {
            await this.prisma.channel.update({
                where: { id: channelId },
                data: { status: ChannelStatus.ERROR, lastError: RECONNECT_MESSAGE },
            });
            this.logger.warn(`Instagram channel ${channelId} token dead; marked ERROR`);
            return { permanent: true, code: 'AUTH_FAILED', label: error.message, response: error.details };
        }

        if (error.code === 'API_ERROR') {
            return { permanent: true, code: metaErrorLabel(error), label: error.message, response: error.details };
        }

        const isClientError = error.code === 'HTTP_ERROR' && (error.httpStatus ?? 500) < 500;
        if (isClientError) {
            return { permanent: true, code: `HTTP_${error.httpStatus}`, label: error.message, response: error.details };
        }

        return { permanent: false, code: error.code, label: error.message };
    }
}

/** Meta's numeric error → the short label stored in messages.error_code. */
function metaErrorLabel(error: MetaGraphError): string {
    const { metaCode, subcode } = error;

    if (metaCode === 10 || metaCode === 200) return 'PERMISSION_OR_WINDOW';
    if (metaCode === 100) return 'INVALID_RECIPIENT';
    if (metaCode === 551) return 'PERSON_UNAVAILABLE';
    if (metaCode === undefined) return 'API_ERROR';

    return subcode ? `META_${metaCode}_${subcode}` : `META_${metaCode}`;
}