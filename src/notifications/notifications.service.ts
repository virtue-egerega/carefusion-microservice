import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { CreateNotificationDto, NotificationDto, NotificationType, UpdateNotificationDto } from '@shared/contracts/notifications';
import { NotificationInterface } from '@shared/interfaces/Notification/notification.interface';
import { MailerService } from '@nestjs-modules/mailer';
import { DatabaseService } from '../database/database.service';
import { $Enums, Prisma } from '../../generated/prisma/client';

@Injectable()
export class NotificationsService {
	constructor(
		private readonly databaseService: DatabaseService,
		private readonly mailService: MailerService
	) { }

	async create(createNotificationDto: CreateNotificationDto): Promise<NotificationDto> {
		const newNotificationInput: Prisma.NotificationCreateInput = {
			userId: createNotificationDto.userId,
			message: createNotificationDto.message,
			type: createNotificationDto.type as $Enums.NotificationType,
			isRead: createNotificationDto.isRead
		}

		try {
			// Start a transaction - for an all or fail process of creating a user
			const notification = await this.databaseService.client.$transaction(async (prisma) => {

				// Create the user
				const notification = await prisma.notification.create({ data: newNotificationInput });
				return notification; // Return created user
			});

			return {
				...notification,
				type: notification.type as unknown as NotificationType
			};

		} catch (error) {
			throw new InternalServerErrorException('sever error could not create notification ', {
				cause: new Error(),
				description: 'notification creation failed, please try again'
			});
		}
	}

	async findAll(limit: number, offset: number, search?: string): Promise<{ count: number; docs: NotificationDto[] }> {
		const [notifications, count] = await this.databaseService.client.$transaction([
			this.databaseService.client.notification.findMany({
				take: limit,
				skip: offset,
				where: {
					deletedAt: null,
					...(search && {
						message: {
							contains: search,
							mode: 'insensitive', // case-insensitive search
						},
					})},
				orderBy: { createdAt: 'asc' },
			}),

			this.databaseService.client.notification.count({
				where: {
					deletedAt: null,
					...(search && {
						message: {
							contains: search,
							mode: 'insensitive', // case-insensitive search
						},
					})},
			}),
		]);

		return {
			count,
			docs: notifications.map((notification) => this.mapToNotification(notification))
		};

	}


	async findOne(id: string): Promise<NotificationDto> {

		const notification = await this.databaseService.client.notification.findUnique({
			where: {
				id: id,
				deletedAt: null
			},
		});

		if (!notification) {
			throw new NotFoundException('no notification found');
		}

		return {
			...notification,
			type: notification.type as unknown as NotificationType
		};
	}

	async update(id: string, updateNotificationDto: UpdateNotificationDto): Promise<NotificationDto> {
		try {
			const updateNotificationInput: Prisma.NotificationUpdateInput = {
				...updateNotificationDto
			};

			const notification = await this.databaseService.client.notification.update({
				where: { id },
				data: updateNotificationInput
			});


			return {
				...notification,
				type: notification.type as unknown as NotificationType
			};

		} catch (error) {
			throw new InternalServerErrorException(error);
		}
	}


	async read(id: string): Promise<NotificationDto> {
		try {

			const notification = await this.databaseService.client.notification.update({
				where: { id },
				data: {
					isRead: true
				}
			});


			return {
				...notification,
				type: notification.type as unknown as NotificationType
			};

		} catch (error) {
			throw new InternalServerErrorException(error);
		}
	}

	async readAll(userId: string): Promise<{ count: number }> {
		try {
			const result = await this.databaseService.client.notification.updateMany({
				where: { userId, isRead: false },
				data: { isRead: true },
			});

			return { count: result.count };
		} catch (error) {
			throw new InternalServerErrorException(error);
		}
	}


	async remove(id: string): Promise<NotificationDto> {

		const notification = await this.databaseService.client.$transaction(async (prisma) => {
			const deletedNotification = await prisma.notification.update({
				where: { id },
				data: {
					deletedAt: new Date()
				}
			});

			return deletedNotification
		});

		return {
			...notification,
			type: notification.type as unknown as NotificationType
		};

	}

	async permanentDelete(id: string): Promise<NotificationDto> {

		const notification = await this.databaseService.client.$transaction(async (prisma) => {
			const deletedNotification = await prisma.notification.delete({
				where: { id },
			});
			return deletedNotification
		});

		return {
			...notification,
			type: notification.type as unknown as NotificationType
		};

	}


	async send(payload: NotificationInterface): Promise<void> {
		const { type } = payload;

		if (type === 'EMAIL') {
			await this.retryOperation(() => this.sendEmail(payload));
		}

		// Handle other types like IN_APP, SMS, etc.
	}

	// pending a job or task or service that would handle the sending of emails
	private async sendEmail(payload: NotificationInterface): Promise<void> {
		const { data } = payload;
		await this.mailService.sendMail({
			from: 'CareFusion',
			to: data.recipientEmail,
			subject: data.subject,
			text: data.message,
			html: data.html
		});

	}

	private async retryOperation<T>(
		operation: () => Promise<T>,
		retries = 5
	): Promise<T> {
		let lastError: any;

		for (let i = 0; i < retries; i++) {
			try {
				return await operation();
			} catch (error) {
				lastError = error;
				console.warn(`Retry ${i + 1} failed. Retrying...`, error);
			}
		}

		throw lastError;
	}

	/**
	 *
	 * Maps a raw event center from the database to EventCenterDto.
	 */
	private mapToNotification(notification: any): NotificationDto {
		return {
			...notification,
			type: notification.type as unknown as NotificationType
		};
	}
}
