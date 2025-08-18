import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto, LoginUserDto } from '@shared/contracts/users';

@Controller('users')
export class UsersController {
  constructor(private readonly userService: UsersService) { }

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }

  @Post('login')
  login(@Body() loginUserDto: LoginUserDto) {
    return this.userService.login(loginUserDto);
  }

  @Get()
  findAll(@Query('limit') limit: number, @Query('offset') offset: number, @Query('status') status?: string) {
    return this.userService.findAll(Number(limit), Number(offset), status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Query('updaterId') updaterId: string) {
    return this.userService.remove(id, updaterId);
  }

  @Delete(':id/permanent')
  permanentDelete(@Param('id') id: string) {
    return this.userService.permanentDelete(id);
  }
}
