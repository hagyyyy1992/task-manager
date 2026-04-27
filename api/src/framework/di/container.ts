import { createPrismaClient, type PrismaClient } from '../prisma/client.js'

import { PrismaTaskRepository } from '../../interface-adapters/repositories/PrismaTaskRepository.js'
import { PrismaCategoryRepository } from '../../interface-adapters/repositories/PrismaCategoryRepository.js'
import { PrismaUserRepository } from '../../interface-adapters/repositories/PrismaUserRepository.js'
import { ScryptPasswordHashService } from '../../interface-adapters/services/ScryptPasswordHashService.js'
import { JoseTokenService } from '../../interface-adapters/services/JoseTokenService.js'

import { RegisterInteractor } from '../../usecases/auth/register/interactor.js'
import { LoginInteractor } from '../../usecases/auth/login/interactor.js'
import { MeInteractor } from '../../usecases/auth/me/interactor.js'
import { ChangePasswordInteractor } from '../../usecases/auth/change-password/interactor.js'
import { DeleteAccountInteractor } from '../../usecases/auth/delete-account/interactor.js'

import { ListTasksInteractor } from '../../usecases/tasks/list/interactor.js'
import { CreateTaskInteractor } from '../../usecases/tasks/create/interactor.js'
import { UpdateTaskInteractor } from '../../usecases/tasks/update/interactor.js'
import { DeleteTaskInteractor } from '../../usecases/tasks/delete/interactor.js'

import { ListCategoriesInteractor } from '../../usecases/categories/list/interactor.js'
import { CreateCategoryInteractor } from '../../usecases/categories/create/interactor.js'
import { UpdateCategoryInteractor } from '../../usecases/categories/update/interactor.js'
import { DeleteCategoryInteractor } from '../../usecases/categories/delete/interactor.js'
import { ReorderCategoriesInteractor } from '../../usecases/categories/reorder/interactor.js'

import type { TokenService } from '../../domain/services/TokenService.js'
import type { RegisterUseCase } from '../../usecases/auth/register/input-port.js'
import type { LoginUseCase } from '../../usecases/auth/login/input-port.js'
import type { MeUseCase } from '../../usecases/auth/me/input-port.js'
import type { ChangePasswordUseCase } from '../../usecases/auth/change-password/input-port.js'
import type { DeleteAccountUseCase } from '../../usecases/auth/delete-account/input-port.js'
import type { ListTasksUseCase } from '../../usecases/tasks/list/input-port.js'
import type { CreateTaskUseCase } from '../../usecases/tasks/create/input-port.js'
import type { UpdateTaskUseCase } from '../../usecases/tasks/update/input-port.js'
import type { DeleteTaskUseCase } from '../../usecases/tasks/delete/input-port.js'
import type { ListCategoriesUseCase } from '../../usecases/categories/list/input-port.js'
import type { CreateCategoryUseCase } from '../../usecases/categories/create/input-port.js'
import type { UpdateCategoryUseCase } from '../../usecases/categories/update/input-port.js'
import type { DeleteCategoryUseCase } from '../../usecases/categories/delete/input-port.js'
import type { ReorderCategoriesUseCase } from '../../usecases/categories/reorder/input-port.js'

export interface Container {
  tokens: TokenService
  register: RegisterUseCase
  login: LoginUseCase
  me: MeUseCase
  changePassword: ChangePasswordUseCase
  deleteAccount: DeleteAccountUseCase
  listTasks: ListTasksUseCase
  createTask: CreateTaskUseCase
  updateTask: UpdateTaskUseCase
  deleteTask: DeleteTaskUseCase
  listCategories: ListCategoriesUseCase
  createCategory: CreateCategoryUseCase
  updateCategory: UpdateCategoryUseCase
  deleteCategory: DeleteCategoryUseCase
  reorderCategories: ReorderCategoriesUseCase
}

export interface ContainerOverrides {
  prisma?: PrismaClient
  tokens?: TokenService
}

export function createContainer(overrides: ContainerOverrides = {}): Container {
  const prisma = overrides.prisma ?? createPrismaClient()

  const taskRepo = new PrismaTaskRepository(prisma)
  const categoryRepo = new PrismaCategoryRepository(prisma)
  const userRepo = new PrismaUserRepository(prisma)
  const passwords = new ScryptPasswordHashService()
  let tokens: TokenService
  if (overrides.tokens) {
    tokens = overrides.tokens
  } else {
    const secret = process.env.JWT_SECRET
    if (!secret) throw new Error('JWT_SECRET is required')
    tokens = new JoseTokenService(secret)
  }

  const isRegistrationAllowed = () => process.env.ALLOW_REGISTRATION === 'true'

  return {
    tokens,
    register: new RegisterInteractor(
      userRepo,
      categoryRepo,
      passwords,
      tokens,
      isRegistrationAllowed,
    ),
    login: new LoginInteractor(userRepo, passwords, tokens),
    me: new MeInteractor(userRepo),
    changePassword: new ChangePasswordInteractor(userRepo, passwords),
    deleteAccount: new DeleteAccountInteractor(userRepo, passwords),
    listTasks: new ListTasksInteractor(taskRepo),
    createTask: new CreateTaskInteractor(taskRepo),
    updateTask: new UpdateTaskInteractor(taskRepo),
    deleteTask: new DeleteTaskInteractor(taskRepo),
    listCategories: new ListCategoriesInteractor(categoryRepo),
    createCategory: new CreateCategoryInteractor(categoryRepo),
    updateCategory: new UpdateCategoryInteractor(categoryRepo),
    deleteCategory: new DeleteCategoryInteractor(categoryRepo),
    reorderCategories: new ReorderCategoriesInteractor(categoryRepo),
  }
}
