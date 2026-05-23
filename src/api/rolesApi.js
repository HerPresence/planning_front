import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

const BASE = `${API_BASE_URL}/admin/roles`;

export const getRoles       = ()           => axios.get(BASE).then((r) => r.data);
export const createRole     = (data)       => axios.post(BASE, data).then((r) => r.data);
export const updateRole     = (id, data)   => axios.put(`${BASE}/${id}`, data).then((r) => r.data);
export const toggleRole     = (id)         => axios.patch(`${BASE}/${id}/toggle`).then((r) => r.data);
