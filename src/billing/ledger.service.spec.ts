import { matchCreditsToAllocations, toDecimal } from './ledger.service';

const credit = (id: string, amount: number, appliedAmount = 0) =>
    ({ id, amount: toDecimal(amount), appliedAmount: toDecimal(appliedAmount) });
const bill = (id: string, amount: number, paidAmount = 0) =>
    ({ id, amount: toDecimal(amount), paidAmount: toDecimal(paidAmount) });
const summary = (apps: ReturnType<typeof matchCreditsToAllocations>) =>
    apps.map(a => [a.creditEntryId, a.allocationId, a.amount.toNumber()]);

describe('matchCreditsToAllocations', () => {
    it('pays oldest bills first across family members, leaving the shortfall owed (PRD 10 §12)', () => {
        const deposit = credit('deposit', 20000);
        const chidi = bill('chidi-copay', 1000);
        const obi   = bill('obi-drugs', 7000);
        const ada   = bill('ada-lab', 15000);

        const apps = matchCreditsToAllocations([deposit], [chidi, obi, ada]);

        expect(summary(apps)).toEqual([
            ['deposit', 'chidi-copay', 1000],
            ['deposit', 'obi-drugs', 7000],
            ['deposit', 'ada-lab', 12000],
        ]);
        expect(ada.paidAmount.toNumber()).toBe(12000);
        expect(deposit.appliedAmount.toNumber()).toBe(20000);
    });

    it('splits one bill across several credits, consuming the oldest credit first', () => {
        const older = credit('older', 3000);
        const newer = credit('newer', 10000);
        const lab   = bill('lab', 5000);

        const apps = matchCreditsToAllocations([older, newer], [lab]);

        expect(summary(apps)).toEqual([['older', 'lab', 3000], ['newer', 'lab', 2000]]);
        expect(newer.appliedAmount.toNumber()).toBe(2000);
    });

    it('respects what is already paid on a bill and already applied from a credit', () => {
        const partlyUsed = credit('c1', 5000, 4000);
        const partlyPaid = bill('b1', 3000, 2500);

        const apps = matchCreditsToAllocations([partlyUsed], [partlyPaid]);

        expect(summary(apps)).toEqual([['c1', 'b1', 500]]);
        expect(partlyUsed.appliedAmount.toNumber()).toBe(4500);
    });

    it('pays bills in the order given, so targeted bills come first', () => {
        const apps = matchCreditsToAllocations(
            [credit('cash', 4000)],
            [bill('targeted', 4000), bill('older', 1000)],
        );
        expect(summary(apps)).toEqual([['cash', 'targeted', 4000]]);
    });

    it('keeps decimal precision on kobo amounts', () => {
        const apps = matchCreditsToAllocations([credit('c', 100.1)], [bill('b1', 33.37), bill('b2', 66.73)]);
        expect(summary(apps)).toEqual([['c', 'b1', 33.37], ['c', 'b2', 66.73]]);
    });

    it('does nothing when there is no credit', () => {
        expect(matchCreditsToAllocations([], [bill('b', 100)])).toEqual([]);
    });
});
