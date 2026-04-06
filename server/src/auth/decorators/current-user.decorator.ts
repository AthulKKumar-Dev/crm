import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

export const CurrentUser = createParamDecorator(
    (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
        console.log('CurrentUser decorator called');
        const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
        const user = request.user;
        return data ? user?.[data] : user;
    },
);