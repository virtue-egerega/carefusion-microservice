import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { DEPARTMENT_CATALOG, RETIRED_QUEUE_KEYS, getActiveKeys } from './departments.catalog';

export type UpdateDepartmentDto = { name?: string; isActive?: boolean; updatedBy?: string };
export type UpdateQueueDto     = { name?: string; isActive?: boolean; updatedBy?: string };

@Injectable()
export class DepartmentsService {
    constructor(private readonly databaseService: DatabaseService) {}

    async seedForOrg(prisma: any, businessType: string): Promise<void> {
        const activeKeys = getActiveKeys(businessType);

        for (const dept of DEPARTMENT_CATALOG) {
            const isActive = activeKeys.has(dept.systemKey);

            const created = await prisma.department.upsert({
                where: { systemKey: dept.systemKey },
                create: { systemKey: dept.systemKey, name: dept.name, isActive },
                update: {},
            });

            for (const queue of dept.queues) {
                await prisma.queue.upsert({
                    where: { systemKey: queue.systemKey },
                    create: {
                        systemKey: queue.systemKey,
                        name: queue.name,
                        departmentId: created.id,
                        isActive,
                    },
                    update: {},
                });
            }
        }

        await prisma.queue.updateMany({
            where: { systemKey: { in: RETIRED_QUEUE_KEYS }, deletedAt: null },
            data:  { isActive: false, deletedAt: new Date() },
        });
    }

    async findAll() {
        return this.databaseService.client.department.findMany({
            where: { deletedAt: null },
            orderBy: { name: 'asc' },
            include: { queues: { where: { deletedAt: null }, orderBy: { name: 'asc' } } },
        });
    }

    async update(id: string, dto: UpdateDepartmentDto) {
        const dept = await this.databaseService.client.department.findUnique({ where: { id } });
        if (!dept) throw new NotFoundException('Department not found');

        return this.databaseService.client.department.update({
            where: { id },
            data: dto,
        });
    }

    async findQueues(departmentId: string) {
        const dept = await this.databaseService.client.department.findUnique({ where: { id: departmentId } });
        if (!dept) throw new NotFoundException('Department not found');

        return this.databaseService.client.queue.findMany({
            where: { departmentId, deletedAt: null },
            orderBy: { name: 'asc' },
        });
    }

    async updateQueue(queueId: string, dto: UpdateQueueDto) {
        const queue = await this.databaseService.client.queue.findUnique({ where: { id: queueId } });
        if (!queue) throw new NotFoundException('Queue not found');

        return this.databaseService.client.queue.update({
            where: { id: queueId },
            data: dto,
        });
    }
}
