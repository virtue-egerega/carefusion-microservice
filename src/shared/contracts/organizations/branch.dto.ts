import { BranchStatus } from '@shared/enums/organizations/organization.enums';

export class BranchDto {
  id!: string;
  organizationId!: string;
  name!: string;
  code!: string;
  address!: string;
  city!: string;
  state!: string;
  country!: string;
  phone!: string[];
  email?: string | null;
  isMainBranch!: boolean;
  status!: BranchStatus;
  createdAt!: Date;
  updatedAt!: Date;
  updatedBy?: string | null;
  deletedAt?: Date | null;
  deletedBy?: string | null;
}
