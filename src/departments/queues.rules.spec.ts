import { pickerDepartmentWhere, pickerQueueWhere } from './queues.rules';

describe('pickerQueueWhere', () => {
    it('offers only active, undeleted queues', () => {
        expect(pickerQueueWhere()).toEqual({ isActive: true, deletedAt: null });
    });

    it("matches the queue's or its department's name, ignoring case", () => {
        expect(pickerQueueWhere(' pharmacy ')).toEqual({
            isActive:  true,
            deletedAt: null,
            OR: [
                { name: { contains: 'pharmacy', mode: 'insensitive' } },
                { department: { name: { contains: 'pharmacy', mode: 'insensitive' } } },
            ],
        });
    });

    it('ignores a blank search', () => {
        expect(pickerQueueWhere('   ')).toEqual({ isActive: true, deletedAt: null });
    });
});

describe('pickerDepartmentWhere', () => {
    it('pages over departments that hold a pickable queue', () => {
        expect(pickerDepartmentWhere()).toEqual({ deletedAt: null, queues: { some: { isActive: true, deletedAt: null } } });
    });

    it('applies the same queue filter, so a department with no matching queue drops out', () => {
        expect(pickerDepartmentWhere('triage').queues.some).toEqual(pickerQueueWhere('triage'));
    });

    it('narrows to one department', () => {
        expect(pickerDepartmentWhere(undefined, 'dept-1')).toMatchObject({ id: 'dept-1' });
    });
});
