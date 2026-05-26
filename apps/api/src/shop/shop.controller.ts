import { Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { ShopService } from './shop.service';

@Controller('shop')
@UseGuards(ClerkAuthGuard)
export class ShopController {
  constructor(private readonly shop: ShopService) {}

  @Get('products')
  listProducts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('activeOnly', new DefaultValuePipe('true')) activeOnly: string,
  ) {
    return this.shop.listProducts(user.tenantId, activeOnly !== 'false');
  }

  @Post('products')
  createProduct(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.shop.createProduct(user.tenantId, body);
  }

  @Patch('products/:id')
  updateProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.shop.updateProduct(user.tenantId, id, body);
  }

  @Post('orders')
  placeOrder(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.shop.placeOrder(user.tenantId, body);
  }

  @Get('orders')
  listOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(25), ParseIntPipe) pageSize: number,
  ) {
    return this.shop.listOrders(user.tenantId, page, pageSize);
  }

  @Post('orders/:id/mark-paid')
  markPaid(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.shop.markOrderPaid(user.tenantId, id);
  }
}
