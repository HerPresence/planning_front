import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

const API_URL = `${API_BASE_URL}/departments`;

export async function getDepartments() {
  const res = await axios.get(API_URL);
  return res.data;
}

export async function createDepartment(form) {
  const data = new FormData();

  data.append("holding_name", String(form.holding_name ?? ""));
  data.append("organization_name", String(form.organization_name ?? ""));
  data.append("region_name", String(form.region_name ?? ""));
  data.append("branch_name", String(form.branch_name ?? ""));
  data.append("department_name", String(form.department_name ?? ""));

  const res = await axios.post(API_URL, data);
  return res.data;
}

export async function updateDepartment(oldDepartmentId, form) {
  const data = new FormData();

  data.append("holding_name", String(form.holding_name ?? ""));
  data.append("organization_name", String(form.organization_name ?? ""));
  data.append("region_name", String(form.region_name ?? ""));
  data.append("branch_name", String(form.branch_name ?? ""));
  data.append("department_name", String(form.department_name ?? ""));
  data.append("is_active", form.is_active ? "true" : "false");

  const res = await axios.put(`${API_URL}/${oldDepartmentId}`, data);
  return res.data;
}

export async function deactivateDepartment(departmentId) {
  const res = await axios.delete(`${API_URL}/${departmentId}`);
  return res.data;
}
