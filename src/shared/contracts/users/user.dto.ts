import { UserStatus, UserType } from "@shared/enums/users/user.enums";

export class UserDto {
    id!: string;
    email!: string;
    password!: string;
    firstName!: string;
    middleName!: string | null;
    lastName!: string;
    phone!: string[];
    balance!: number;
    loginAttempts!: number;
    lastLogin!: Date | null;
    type!: UserType;
    status!: UserStatus;
    createdAt!: Date;
    updatedAt!: Date;
    updatedBy?: string | null;
    deletedAt?: Date | null;
    deletedBy?: string | null;
    hospitalId?: string | null;
    roleId?: string | null;
}
