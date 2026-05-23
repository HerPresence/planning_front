import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

const BASE = `${API_BASE_URL}/admin`;

export const getMenuItems        = ()                          => axios.get(`${BASE}/menu-items`).then((r) => r.data);
export const getRolePermissions  = (roleId)                    => axios.get(`${BASE}/roles/${roleId}/permissions`).then((r) => r.data);
export const updateRolePermissions = (roleId, permissions)     => axios.put(`${BASE}/roles/${roleId}/permissions`, { permissions }).then((r) => r.data);
