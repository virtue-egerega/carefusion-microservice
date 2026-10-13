import * as crypto from 'crypto';

const UPPER  = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // no I/O: temporary passwords are read aloud / handed over
const LOWER  = 'abcdefghijkmnpqrstuvwxyz';   // no l/o
const DIGITS = '23456789';                   // no 0/1
const SYMS   = '!@#$%&*';
const ALL    = UPPER + LOWER + DIGITS + SYMS;

const pick = (set: string) => set[crypto.randomInt(set.length)];

/**
 * A 12-character temporary password with at least one of each character class, shuffled with a
 * cryptographic Fisher–Yates. Shown once to the issuing admin; the user must replace it at first login.
 */
export function generateTemporaryPassword(length = 12): string {
    const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMS)];
    while (chars.length < length) chars.push(pick(ALL));

    for (let i = chars.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}
