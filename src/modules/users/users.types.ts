export interface CreateUserDTO {
  name: string;
  email: string;
  password: string;
  role?: 'teacher' | 'admin' | 'student';
  phoneNumber?: string;
}

export interface UpdateUserDTO {
  name?: string;
  phoneNumber?: string;
  isActive?: boolean;
}

export interface UserResponseDTO {
  _id: string;
  name: string;
  email: string;
  role: string;
  phoneNumber?: string;
  isEmailVerified: boolean;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface UserQueryParams {
  page?: number;
  limit?: number;
  role?: string;
  search?: string;
  isActive?: boolean;
}
