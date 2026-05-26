import * as bcrypt from 'bcrypt';
import { Injectable } from '@nestjs/common';

const SALT_ROUNDS = 12;

@Injectable()
export class PasswordHasher {
  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, SALT_ROUNDS);
  }

  verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
