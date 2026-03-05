import bcrypt from 'bcrypt';
import usersRepository from './users.repository';
import { CreateUserDTO, UpdateUserDTO, UserResponseDTO, UserQueryParams } from './users.types';
import { IUser } from '../../models/user.model';

class UsersService {
  private mapToResponseDTO(user: IUser): UserResponseDTO {
    return {
      _id: user._id as string,
      name: user.name,
      email: user.email,
      role: user.role,
      phoneNumber: user.phoneNumber,
      isEmailVerified: user.isEmailVerified,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async createUser(userData: CreateUserDTO): Promise<UserResponseDTO> {
    // Check if email already exists
    const emailExists = await usersRepository.checkEmailExists(userData.email);
    if (emailExists) {
      throw new Error('Email already exists');
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(userData.password, salt);

    const user = await usersRepository.create({
      ...userData,
      password: hashedPassword,
    });

    return this.mapToResponseDTO(user);
  }

  async getUserById(id: string): Promise<UserResponseDTO> {
    const user = await usersRepository.findById(id);
    if (!user) {
      throw new Error('User not found');
    }
    return this.mapToResponseDTO(user);
  }

  async getAllUsers(params: UserQueryParams): Promise<{
    users: UserResponseDTO[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 10 } = params;
    const { users, total } = await usersRepository.findAll(params);

    return {
      users: users.map((user) => this.mapToResponseDTO(user)),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateUser(id: string, updateData: UpdateUserDTO): Promise<UserResponseDTO> {
    const user = await usersRepository.update(id, updateData);
    if (!user) {
      throw new Error('User not found');
    }
    return this.mapToResponseDTO(user);
  }

  async deleteUser(id: string): Promise<void> {
    const user = await usersRepository.delete(id);
    if (!user) {
      throw new Error('User not found');
    }
  }

  async verifyEmail(id: string): Promise<UserResponseDTO> {
    const user = await usersRepository.updateEmailVerification(id, true);
    if (!user) {
      throw new Error('User not found');
    }
    return this.mapToResponseDTO(user);
  }

  async toggleUserStatus(id: string): Promise<UserResponseDTO> {
    const user = await usersRepository.findById(id);
    if (!user) {
      throw new Error('User not found');
    }

    const updated = await usersRepository.update(id, { isActive: !user.isActive });
    return this.mapToResponseDTO(updated!);
  }
}

export default new UsersService();
