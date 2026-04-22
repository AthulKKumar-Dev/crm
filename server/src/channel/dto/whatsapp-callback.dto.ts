import { IsString, IsNotEmpty } from 'class-validator';

export class WhatsAppCallbackDto {
    @IsString()
    @IsNotEmpty({ message: 'code is required' })
    code: string;

    @IsString()
    @IsNotEmpty({ message: 'state is required' })
    state: string;
}
