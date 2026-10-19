import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConsultationPayment } from './organization.enums';

/** The values of `enum <name> { … }` in prisma/schema.prisma, in declaration order. */
function prismaEnum(name: string): string[] {
    const schema = readFileSync(join(__dirname, '../../../../prisma/schema.prisma'), 'utf8');
    const body = schema.match(new RegExp(`enum ${name} \\{([^}]*)\\}`))?.[1];
    if (!body) throw new Error(`enum ${name} not found in schema.prisma`);
    return body.split('\n').map(line => line.replace(/\/\/.*/, '').trim()).filter(Boolean);
}

// Served to the frontend by GET /enums; kept by hand, so it must not drift from the database
describe('organization enums mirror schema.prisma', () => {
    it('ConsultationPayment', () => {
        expect(Object.values(ConsultationPayment)).toEqual(prismaEnum('ConsultationPayment'));
    });
});
