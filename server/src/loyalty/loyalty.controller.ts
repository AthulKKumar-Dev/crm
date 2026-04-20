import { Controller, HttpCode, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { LoyaltyService } from './loyalty.service';

@Controller('loyalty')
export class LoyaltyController {
    constructor(private readonly loyalty: LoyaltyService) {}

    // POST /api/v1/loyalty/recompute — re-evaluates every customer's tier
    // against the org's current thresholds. OWNER/ADMIN only.
    @Post('recompute')
    @HttpCode(200)
    @Roles(UserRole.OWNER, UserRole.ADMIN)
    recompute(@CurrentUser() user: JwtPayload) {
        return this.loyalty.recomputeAll(user.orgId!);
    }
}
