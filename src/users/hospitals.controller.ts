import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { HospitalsService } from './users.service';
import { CreateHospitalDto, UpdateHospitalDto } from '@shared/contracts/users';
import { HospitalFilter } from '@shared/enums/users/user.enums';

@Controller('hospitals')
export class HospitalsController {
  constructor(private readonly hospitalsService: HospitalsService) { }

  @Post()
  create(@Body() createHospitalDto: CreateHospitalDto) {
    return this.hospitalsService.create(createHospitalDto);
  }

  @Get()
  findAll(
    @Query('limit') limit: number,
    @Query('offset') offset: number,
    @Query('search') search?: string,
    @Query() filter?: HospitalFilter,
  ) {
    return this.hospitalsService.findAll(Number(limit), Number(offset), search, filter);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.hospitalsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateHospitalDto: UpdateHospitalDto) {
    return this.hospitalsService.update(id, updateHospitalDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Query('updaterId') updaterId: string) {
    return this.hospitalsService.remove(id, updaterId);
  }

  @Delete(':id/permanent')
  permanentDelete(@Param('id') id: string) {
    return this.hospitalsService.permanentDelete(id);
  }
}
