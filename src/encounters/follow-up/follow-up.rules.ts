/**
 * Open encounters with no task activity since this moment need following up (11 §14.2): the
 * start of today (UTC), so a visit untouched since yesterday shows. Nothing closes on its own;
 * staff reach the patient and record what happened.
 */
export function followUpCutoff(now: Date): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
