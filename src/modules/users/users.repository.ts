import User, { IUser } from '../../models/user.model';
import { CreateUserDTO, UpdateUserDTO, UserQueryParams } from './users.types';

class UsersRepository {
  async create(userData: CreateUserDTO): Promise<IUser> {
    const user = await User.create(userData);
    return user;
  }

  async findById(id: string): Promise<IUser | null> {
    return await User.findById(id).select('-password');
  }

  async findByEmail(email: string): Promise<IUser | null> {
    return await User.findOne({ email }).select('+password');
  }

  async findAll(params: UserQueryParams): Promise<{ users: IUser[]; total: number }> {
    const { page = 1, limit = 10, role, search, isActive } = params;
    const skip = (page - 1) * limit;

    const query: any = {};

    if (role) query.role = role;
    if (isActive !== undefined) query.isActive = isActive;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query).select('-password').limit(limit).skip(skip).sort({ createdAt: -1 }),
      User.countDocuments(query),
    ]);

    return { users, total };
  }

  async update(id: string, updateData: UpdateUserDTO): Promise<IUser | null> {
    return await User.findByIdAndUpdate(id, updateData, { new: true }).select('-password');
  }

  async delete(id: string): Promise<IUser | null> {
    return await User.findByIdAndDelete(id);
  }

  async updateEmailVerification(id: string, isVerified: boolean): Promise<IUser | null> {
    return await User.findByIdAndUpdate(
      id,
      { isEmailVerified: isVerified },
      { new: true }
    ).select('-password');
  }

  async checkEmailExists(email: string): Promise<boolean> {
    const user = await User.findOne({ email });
    return !!user;
  }
}

export default new UsersRepository();
