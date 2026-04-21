import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

// AuthModule is @Global() so AuthService is already available for injection.
// RedisModule + PrismaModule are likewise globally provided.
@Module({
    controllers: [AdminController],
    providers: [AdminService],
})
export class AdminModule { }
