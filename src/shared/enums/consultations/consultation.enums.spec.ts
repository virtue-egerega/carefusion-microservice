import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as consultationEnums from './consultation.enums';

/** The values of `enum <name> { … }` in prisma/schema.prisma, in declaration order. */
function prismaEnum(name: string): string[] {
    const schema = readFileSync(join(__dirname, '../../../../prisma/schema.prisma'), 'utf8');
    const body = schema.match(new RegExp(`enum ${name} \\{([^}]*)\\}`))?.[1];
    if (!body) throw new Error(`enum ${name} not found in schema.prisma`);
    return body.split('\n').map(line => line.replace(/\/\/.*/, '').trim()).filter(Boolean);
}

// The frontend gets these from GET /enums; they're kept by hand, so they must not drift from the database
describe('consultation enums mirror schema.prisma', () => {
    for (const [name, values] of Object.entries(consultationEnums)) {
        it(name, () => {
            expect(Object.values(values)).toEqual(prismaEnum(name));
        });
    }
});
