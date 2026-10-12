import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { JwtService } from '@nestjs/jwt';
import { CreateUserDto } from '@shared/contracts/users/create-user.dto';
import { LoginUserDto, UserDto } from '@shared/contracts/users';
import { $Enums, Prisma } from '../../generated/prisma/client';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { UserStatus, UserType } from '@shared/enums/users/user.enums';
import * as fs from 'fs';
import * as path from 'path';
import { UploadOptions } from '@shared/interfaces';

@Injectable()
export class UsersService {
    constructor(
        private readonly jwtService: JwtService,
        private readonly databaseService: DatabaseService
    ) { }

    async create(createUserDto: CreateUserDto): Promise<UserDto> {

        const hashedPassword = await bcrypt.hash(createUserDto.password ? createUserDto.password : "Password", 10);
        const restrictUser = createUserDto.type !== $Enums.UserType.PATIENT

        // restrict all account on creation pending approval except patient accounts
        const userStatus = restrictUser ? $Enums.UserStatus.NOTAPPROVED : $Enums.UserStatus.ACTIVE

        const newUserInput: Prisma.UserCreateInput = {
            firstName: createUserDto.firstName,
            middleName: createUserDto.middleName,
            lastName: createUserDto.lastName,
            email: createUserDto.email,
            password: hashedPassword,
            phone: createUserDto.phone,
            type: createUserDto.type as $Enums.UserType,
            status: userStatus as $Enums.UserStatus
        }

        try {
            // Start a transaction - for an all or fail process of creating a user
            const account = await this.databaseService.client.$transaction(async (prisma) => {

                const existingUser = await this.databaseService.client.user.findFirst({
                    where: {
                      OR: [
                        // Spread the mapped array into the OR array
                        ...createUserDto.phone.map((phoneNumber) => ({
                          phone: {
                            has: phoneNumber
                          },
                          lastName: newUserInput.lastName
                        })),
                        {
                          email: newUserInput.email,
                          lastName: newUserInput.lastName
                        }
                      ]
                    }
                  });


                if (existingUser) {
                    throw new ConflictException('This user phone or email and last name exist in our system. Kidly find account', {
                        cause: new Error(),
                        description: 'This user phone or email and last name exist in our system. Kidly find account'
                    });

                }



                // Create the related entity based on user type
                switch (createUserDto.type) {
                    case $Enums.UserType.ADMIN:
                        // Create the user
                        const admin = await prisma.user.create({ data: newUserInput });
                        return admin;

                    case $Enums.UserType.SUPERADMIN:
                        // Check if any superadmins already exist
                        const existingSuperAdminCount = await prisma.user.count({
                            where: { type: $Enums.UserType.SUPERADMIN },
                        });

                        // If it's the first superadmin, auto-approve
                        if (existingSuperAdminCount === 0) {
                            newUserInput.status = $Enums.UserStatus.ACTIVE; // or whatever approved status you use
                        }

                        // Create the user
                        const superAdmin = await prisma.user.create({ data: newUserInput });

                        return superAdmin;

                    case $Enums.UserType.PATIENT:
                        const hospital = await this.databaseService.client.organization.findUnique({
                            where: {
                              id: createUserDto.hospitalId
                            }
                        });

                        if (!hospital) {
                            throw new NotFoundException('This hospital does not exist in our system', {
                                cause: new Error(),
                                description: 'This hospital does not exist in our system'
                            });
                        }


                        const regFee = hospital.registrationFee
                        const nfcCardFee = hospital.nfcCardFee
                        const totalRegFee = regFee.add(nfcCardFee)
                        const userBalance =  (totalRegFee as unknown as number) - createUserDto.amount!

                        // update user account with balance from transaction whilst using 1 database call
                        newUserInput.balance = userBalance as unknown as Prisma.Decimal

                        // Create the user
                        let userAccount = await prisma.user.create({ data: newUserInput });


                        const newPatientInput: Prisma.PatientCreateInput = {
                            user: { connect: { id: userAccount.id } },
                            nfcId: uuidv4(),
                            hospital: {connect: {id: hospital.id }},
                            billingtype: createUserDto.billingType!,
                        }

                        // credit and debit user account with registration fee
                        await prisma.transaction.createMany({
                            data: [
                              {
                                userId: userAccount.id,
                                amount: createUserDto.amount!,
                                type: $Enums.TransactionType.CREDIT,
                                status: $Enums.TransactionStatus.COMPLETED,
                                description: 'Patient Registration deposit',
                                reference: createUserDto.paymentReference,
                                modeOfPayment: createUserDto.modeOfPayment!,
                              },
                              {
                                userId: userAccount.id,
                                amount: totalRegFee,
                                type: $Enums.TransactionType.DEBIT,
                                status: $Enums.TransactionStatus.COMPLETED,
                                description: 'Patient file opening, card and registration fee',
                                reference: createUserDto.paymentReference,
                                modeOfPayment: $Enums.TransactionMode.SYSTEM_DEBIT!,
                              },
                            ],
                        });

                        await prisma.patient.create({data: newPatientInput });

                        return userAccount;

                    case $Enums.UserType.NHIS_WORKER:
                        const insuranceScheme = await this.databaseService.client.insuranceScheme.findUnique({
                            where: {
                              id: createUserDto.insuranceSchemeId
                            }
                        });

                        if (!insuranceScheme) {
                            throw new NotFoundException('This insurance Scheme does not exist in our system', {
                                cause: new Error(),
                                description: 'This insurance Scheme does not exist in our system'
                            });
                        }

                        // Create the user
                        let nhisAccount = await prisma.user.create({ data: newUserInput });


                        const newNHISWorkerInput: Prisma.NHISWorkerCreateInput = {
                            user: { connect: { id: nhisAccount.id } },
                            insuranceScheme: {connect: {id: insuranceScheme.id }},
                        }

                        await prisma.nHISWorker.create({data: newNHISWorkerInput });
                        return nhisAccount;

                    case $Enums.UserType.PUBLIC_HEALTH_WORKER:
                        // Create the user
                        let publichealthAccount = await prisma.user.create({ data: newUserInput });


                        const newPublicHealthWorkerInput: Prisma.PublicHealthWorkerCreateInput = {
                            user: { connect: { id: publichealthAccount.id } },
                        }

                        await prisma.publicHealthWorker.create({data: newPublicHealthWorkerInput });

                        return publichealthAccount;

                    case $Enums.UserType.HOSPITAL_STAFF:
                        const staffhospital = await this.databaseService.client.organization.findUnique({
                            where: {
                                id: createUserDto.hospitalId
                            }
                        });

                        if (!staffhospital) {
                            throw new NotFoundException('This hospital does not exist in our system', {
                                cause: new Error(),
                                description: 'This hospital does not exist in our system'
                            });
                        }

                        // Create the user
                        let staffAccount = await prisma.user.create({ data: newUserInput });


                        const newHospitalStaffInput: Prisma.HospitalStaffCreateInput = {
                            user: { connect: { id: staffAccount.id } },
                            hospital: {connect: {id: staffhospital.id }},
                        }


                        await prisma.hospitalStaff.create({data: newHospitalStaffInput });

                        return staffAccount;


                    default:
                        // If accountType  is unknown, rollback the transaction
                        throw new Error('Invalid user type, are you creating a patient, or staff account');
                }


            }, {
                timeout: 10000 // 10 seconds in ms
            });

            const userAccount: UserDto = {
                ...account,
                type: account.type as unknown as UserType,
                status: account.status as unknown as UserStatus,
                balance: account.balance as unknown as number
            };
            return userAccount;

        } catch (error) {
            console.log(error)
            throw new ConflictException('sever error could not create user', {
                cause: new Error(),
                description: 'User account creation failed, please try again'
            });
        }



    }

    async login(loginUserDto: LoginUserDto) {

        const { email, password } = loginUserDto;

        const user = await this.databaseService.client.user.findUnique({
            where: {
                email: email,
                deletedAt: null
            },

        });

        if (!user) {
            throw new NotFoundException('we could not find a user with this email', {
                cause: new Error(),
                description: "we could not find a user with this email"
            });
        }


        if (user.status === $Enums.UserStatus.RESTRICTED || user.status === $Enums.UserStatus.NOTAPPROVED) {
            throw new UnauthorizedException('Unauthorized error, user account is not active. Contact support');
        }

        const lastLoginTime = user.lastLogin ? new Date(user.lastLogin) : null;
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago

        if (user.loginAttempts >= 4 && lastLoginTime && lastLoginTime > tenMinutesAgo) {
            throw new UnauthorizedException('Too many failed login attempts. Please wait 10 minutes before trying again.');
        }

        const validatePassword = await bcrypt.compare(password, user.password);

        if (!validatePassword) {

            await this.databaseService.client.user.update({
                where: { email: email },
                data: {
                    loginAttempts: user.loginAttempts + 1,
                    lastLogin: new Date(),
                    status: user.loginAttempts + 1 > 7 ? $Enums.UserStatus.RESTRICTED : user.status
                }
            });

            if (user.loginAttempts + 1 > 7) {
                throw new UnauthorizedException('Authentication error',
                    {
                        cause: new Error(),
                        description: 'Your account has been disabled due to too many failed login attempts.'
                    }
                )
            }

            throw new UnauthorizedException('Authentication error, Incorrected password for this user',
                {
                    cause: new Error(),
                    description: "incorrect password"
                }
            )
        }

        const refreshToken = this.jwtService.sign({ sub: user.id, type: user.type}, {
            secret: process.env.JWT_REFRESH_TOKEN_SECRET,
            expiresIn: '7d',
        });

        // reset login attempts to 0 once successful login
        await this.databaseService.client.user.update({
            where: { email: email },
            data: {
                loginAttempts: 1,
                lastLogin: new Date(),
                refreshToken: refreshToken
            }
        });
        const { password: userpassword, refreshToken: userRefreshToken, ...rest } = user
        return {
            user: { ...rest },
            access_token: this.jwtService.sign({ sub: user.id, type: user.type}, {
                secret: process.env.JWT_ACCESS_TOKEN_SECRET,
                expiresIn: '59m',
            }),
            refresh_token: refreshToken,
        };

    }

    async findAll(limit: number, offset: number, status?: string): Promise<UserDto[]> {
        try {
            const whereClause: any = {};

            if (status) {
                whereClause.status = status;
            }

            const users = await this.databaseService.client.user.findMany({
                take: limit,
                skip: offset,
                where: whereClause,
            });

            return users.map(user => this.mapToUserDto(user));
        } catch (error) {
            throw new ConflictException(error);
        }

    }

    async findOne(id: string): Promise<UserDto> {

        const user = await this.databaseService.client.user.findUnique({
            where: {
                id: id
            },
            include: {
                staff: true,
                address: true,
                patient: true,
                nhisWorker: true,
                publicHealthWorker: true
            }
        });
        if (!user) {
            throw new NotFoundException('sever error could not find this user', {
                cause: new Error(),
                description: 'no user found'
            });
        }

        const userAccount: UserDto = {
            ...user,
            type: user.type as unknown as UserType,
            status: user.status as unknown as UserStatus,
            balance: user.balance as unknown as number
        };
        return userAccount;

    }

    async remove(id: string, updaterId: string): Promise<UserDto> {

        const deletedUser = await this.databaseService.client.$transaction(async (prisma) => {
            const user = await prisma.user.update({
                where: { id },
                data: {
                    deletedAt: new Date(),
                    deletedBy: updaterId
                }
            });

            return user
        });

        const userAccount: UserDto = {
            ...deletedUser,
            type: deletedUser.type as unknown as UserType,
            status: deletedUser.status as unknown as UserStatus,
            balance: deletedUser.balance as unknown as number
        };
        return userAccount;

    }

    async permanentDelete(id: string): Promise<UserDto> {

        const deletedUser = await this.databaseService.client.$transaction(async (prisma) => {
            const user = await prisma.user.delete({
                where: { id },
            });

            return user
        });
        const userAccount: UserDto = {
            ...deletedUser,
            type: deletedUser.type as unknown as UserType,
            status: deletedUser.status as unknown as UserStatus,
            balance: deletedUser.balance as unknown as number
        };
        return userAccount;

    }

    /**
     *
     * Maps a raw event center from the database to EventCenterDto.
     *
     */
    async assignDepartment(staffId: string, departmentId: string) {
        const staff = await this.databaseService.client.hospitalStaff.findUnique({ where: { id: staffId } });
        if (!staff) throw new NotFoundException('Staff member not found');

        const dept = await this.databaseService.client.department.findUnique({ where: { id: departmentId } });
        if (!dept) throw new NotFoundException('Department not found');

        return this.databaseService.client.hospitalStaff.update({
            where: { id: staffId },
            data: { departmentId },
        });
    }

    private mapToUserDto(user: any): UserDto {
        return {
            ...user,
            type: user.type as unknown as UserType,
            status: user.status as unknown as UserStatus,
            balance: user.balance as unknown as number
        };
    }
}

@Injectable()
export class UploadService{

    constructor(
        private readonly databaseService: DatabaseService
    ) { }

    async uploadFile  (uploadData: UploadOptions): Promise<string>
    {
        switch (uploadData.isOnline) {
            case true:
                // Stubbed for now - replace with your S3, Cloudinary, etc. logic
                console.log('Uploading to cloud...');
                return 'https://cdn.example.com/';


            default:
                const basePath = path.resolve(uploadData.parentdirectory, uploadData.directory); // Absolute path: ./media/user-123/
                console.log(basePath)

                if (!fs.existsSync(basePath)) {
                fs.mkdirSync(basePath, { recursive: true });
                }

                const filePath = path.join(basePath, uploadData.file.originalname);
                fs.writeFileSync(filePath, uploadData.file.buffer);
                return filePath;
        }

    };
}
