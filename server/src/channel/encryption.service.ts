import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as CryptoJS from 'crypto-js';

@Injectable()
export class EncryptionService {
    private readonly key: string;

    constructor(private readonly config: ConfigService) {
        this.key = this.config.get<string>('encryptionKey')!;
    }

    encrypt(plainText: string): string {
        return CryptoJS.AES.encrypt(plainText, this.key).toString();
    }

    decrypt(cipherText: string): string {
        const bytes = CryptoJS.AES.decrypt(cipherText, this.key);
        return bytes.toString(CryptoJS.enc.Utf8);
    }
}