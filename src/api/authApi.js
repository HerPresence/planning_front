import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

export const loginUser = (email, password) =>
  axios.post(`${API_BASE_URL}/auth/login`, { email, password }).then((r) => r.data);

export const changePassword = (data) =>
  axios.post(`${API_BASE_URL}/auth/change-password`, data).then((r) => r.data);

export const getMyProfile = () =>
  axios.get(`${API_BASE_URL}/me`).then((r) => r.data);

export const logoutUser = () =>
  axios.post(`${API_BASE_URL}/auth/logout`).catch(() => {});
