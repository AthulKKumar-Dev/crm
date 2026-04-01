import { apiClient } from "~/lib/api-client";
import type { ChangePasswordRequest, UpdateUserRequest } from "~/types/api";

export const userService = {
  getProfile: () =>
    apiClient.get("/users/me").then((r) => r.data),

  updateProfile: (data: UpdateUserRequest) =>
    apiClient.patch("/users/me", data).then((r) => r.data),

  changePassword: (data: ChangePasswordRequest) =>
    apiClient.post<{ message: string }>("/users/me/change-password", data).then((r) => r.data),

  deleteAccount: () =>
    apiClient.delete<{ message: string }>("/users/me").then((r) => r.data),
};
