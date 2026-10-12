import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { CreateBranchDto, OnboardOrganizationDto, UpdateBranchDto, UpdateOrganizationDto } from '@shared/contracts/organizations';
import { OrganizationFilter } from '@shared/enums/organizations/organization.enums';

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) { }

  @Post()
  @ApiOperation({ summary: 'Onboard organization — creates org, Headquarters branch, and first admin user in one transaction. Returns JWT tokens.' })
  create(@Body() dto: OnboardOrganizationDto) {
    return this.organizationsService.create(dto);
  }

  @Get()
  findAll(
    @Query('limit') limit: number,
    @Query('offset') offset: number,
    @Query('search') search?: string,
    @Query() filter?: OrganizationFilter,
  ) {
    return this.organizationsService.findAll(Number(limit), Number(offset), search, filter);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.organizationsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateOrganizationDto: UpdateOrganizationDto) {
    return this.organizationsService.update(id, updateOrganizationDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Query('updaterId') updaterId: string) {
    return this.organizationsService.remove(id, updaterId);
  }

  @Delete(':id/permanent')
  permanentDelete(@Param('id') id: string) {
    return this.organizationsService.permanentDelete(id);
  }

  // ── Branch endpoints ──────────────────────────────────────────────

  @Post(':id/branches')
  @ApiOperation({ summary: 'Add a branch to the organization (chains only after onboarding)' })
  createBranch(@Param('id') id: string, @Body() dto: CreateBranchDto) {
    return this.organizationsService.createBranch(id, dto);
  }

  @Get(':id/branches')
  @ApiOperation({ summary: 'List all active branches for an organization' })
  findBranches(@Param('id') id: string) {
    return this.organizationsService.findBranches(id);
  }

  @Patch(':id/branches/:branchId')
  @ApiOperation({ summary: 'Update a branch' })
  updateBranch(
    @Param('id') id: string,
    @Param('branchId') branchId: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.organizationsService.updateBranch(id, branchId, dto);
  }

  @Delete(':id/branches/:branchId')
  @ApiOperation({ summary: 'Soft-delete a branch — blocked if it is the main branch' })
  removeBranch(
    @Param('id') id: string,
    @Param('branchId') branchId: string,
    @Query('deletedBy') deletedBy: string,
  ) {
    return this.organizationsService.removeBranch(id, branchId, deletedBy);
  }
}
