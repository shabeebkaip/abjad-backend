import { Request, Response, NextFunction } from 'express';
import usersService from './users.service';
import { CreateUserDTO, UpdateUserDTO, UserQueryParams } from './users.types';

class UsersController {
  async createUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userData: CreateUserDTO = req.body;
      const user = await usersService.createUser(userData);
      
      res.status(201).json({
        success: true,
        message: 'User created successfully',
        data: user,
      });
    } catch (error: any) {
      next(error);
    }
  }

  async getUserById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const user = await usersService.getUserById(id as string);
      
      res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error: any) {
      next(error);
    }
  }

  async getAllUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const params: UserQueryParams = {
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 10,
        role: req.query.role as string,
        search: req.query.search as string,
        isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
      };

      const result = await usersService.getAllUsers(params);
      
      res.status(200).json({
        success: true,
        data: result.users,
        pagination: {
          total: result.total,
          page: result.page,
          totalPages: result.totalPages,
        },
      });
    } catch (error: any) {
      next(error);
    }
  }

  async updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const updateData: UpdateUserDTO = req.body;
      
      const user = await usersService.updateUser(id as string, updateData);
      
      res.status(200).json({
        success: true,
        message: 'User updated successfully',
        data: user,
      });
    } catch (error: any) {
      next(error);
    }
  }

  async deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      await usersService.deleteUser(id as string);
      
      res.status(200).json({
        success: true,
        message: 'User deleted successfully',
      });
    } catch (error: any) {
      next(error);
    }
  }

  async verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const user = await usersService.verifyEmail(id as string);
      
      res.status(200).json({
        success: true,
        message: 'Email verified successfully',
        data: user,
      });
    } catch (error: any) {
      next(error);
    }
  }

  async toggleUserStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const user = await usersService.toggleUserStatus(id as string);
      
      res.status(200).json({
        success: true,
        message: 'User status toggled successfully',
        data: user,
      });
    } catch (error: any) {
      next(error);
    }
  }
}

export default new UsersController();
