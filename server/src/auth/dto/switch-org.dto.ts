import { IsString } from 'class-validator';

export class SwitchOrgDto {
    @IsString()
    orgId: string;
}
