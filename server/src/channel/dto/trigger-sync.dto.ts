import { IsArray, IsIn, IsString } from 'class-validator';

export class TriggerSyncDto {
    @IsArray()
    @IsString({ each: true })
    @IsIn(['locations', 'products', 'orders', 'customers', 'inventory', 'collections'], { each: true })
    entityTypes: string[];
}