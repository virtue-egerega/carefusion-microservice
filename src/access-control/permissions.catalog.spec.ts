import { PERMISSION_CATALOG, RETIRED_PERMISSIONS, SYSTEM_DUTY_PROFILES } from './permissions.catalog';

const KEYS = new Set(PERMISSION_CATALOG.map(p => p.key));
const profile = (name: string) => SYSTEM_DUTY_PROFILES.find(p => p.name === name)!;

describe('SYSTEM_DUTY_PROFILES', () => {
    it.each(SYSTEM_DUTY_PROFILES.map(p => [p.name, p.permissions]))('%s holds only catalogued permissions', (_, permissions) => {
        expect((permissions as string[]).filter(key => !KEYS.has(key))).toEqual([]);
    });

    it('names each profile once', () => {
        const names = SYSTEM_DUTY_PROFILES.map(p => p.name);
        expect(new Set(names).size).toBe(names.length);
    });

    describe('pharmacy (PRD 15 §17)', () => {
        it('lets a technician record a receipt, but not post it or release quarantine', () => {
            const { permissions } = profile('Pharmacy Technician');
            expect(permissions).toEqual(expect.arrayContaining(['inventory.view', 'inventory.receipt.create', 'inventory.status.change']));
            expect(permissions).not.toContain('inventory.receipt.post');
            expect(permissions).not.toContain('inventory.status.release');
        });

        it("gives a pharmacist everything a technician has, plus posting and release", () => {
            const { permissions } = profile('Pharmacist');
            expect(permissions).toEqual(expect.arrayContaining([
                ...profile('Pharmacy Technician').permissions, 'inventory.receipt.post', 'inventory.status.release', 'inventory.batch.quality',
            ]));
        });

        it('gives the pharmacy manager every inventory permission and cost figures', () => {
            const { permissions } = profile('Pharmacy Manager');
            const inventory = [...KEYS].filter(key => key.startsWith('inventory.'));
            expect(permissions).toEqual(expect.arrayContaining([...inventory, 'billable.cost.view']));
        });

        it('lets the hospital administrator see stock but not change it', () => {
            const { permissions } = profile('Hospital Administrator');
            expect(permissions).toContain('inventory.view');
            expect(permissions.filter(key => key.startsWith('inventory.') && key !== 'inventory.view')).toEqual([]);
        });
    });
});

describe('RETIRED_PERMISSIONS', () => {
    it('maps each retired key to catalogued replacements, and no longer catalogues it', () => {
        for (const [oldKey, replacements] of Object.entries(RETIRED_PERMISSIONS)) {
            expect(KEYS.has(oldKey)).toBe(false);
            expect(replacements.filter(key => !KEYS.has(key))).toEqual([]);
        }
    });
});
