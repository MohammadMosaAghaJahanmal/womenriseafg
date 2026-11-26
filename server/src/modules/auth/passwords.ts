import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../../middleware/errors';

// OWASP's scrypt profile for a 32 MiB working set when Argon2id is unavailable.
const parameters = { N: 1 << 15, r: 8, p: 3, maxmem: 40 * 1024 * 1024 };
const saltLength = 16;
const keyLength = 32;
const maxConcurrent = 2;
let concurrent = 0;

async function derive(password: string, salt: Buffer) {
  if (concurrent >= maxConcurrent) {
    throw new ApiError(503, 'AUTH_BUSY', 'Sign-in is busy. Try again in a moment.');
  }
  concurrent++;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, keyLength, parameters, (error, key) => {
        if (error) reject(error);
        else resolve(key);
      });
    });
  } finally {
    concurrent--;
  }
}

export async function hashPassword(password: string) {
  const salt = randomBytes(saltLength);
  const key = await derive(password, salt);
  return 'scrypt-v1:' + salt.toString('hex') + ':' + key.toString('hex');
}

export async function verifyPassword(password: string, hash: string | null) {
  const parts = /^scrypt-v1:([\da-f]{32}):([\da-f]{64})$/.exec(hash ?? '');
  // Unknown users still incur the full password hashing work and a comparison.
  const salt = parts ? Buffer.from(parts[1]!, 'hex') : Buffer.alloc(saltLength);
  const expectedKey = parts ? Buffer.from(parts[2]!, 'hex') : Buffer.alloc(keyLength);
  const matches = timingSafeEqual(await derive(password, salt), expectedKey);
  return parts !== null && matches;
}
