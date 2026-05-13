import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

const API_URL = `${API_BASE_URL}/branches`;

export async function getBranches() {
  const res = await axios.get(API_URL);
  return res.data;
}

export async function createBranch(form) {
  const data = new FormData();

  data.append("branch_name", form.branch_name);
  data.append("region_id", form.region_id || "");

  const res = await axios.post(API_URL, data);
  return res.data;
}

export async function updateBranch(oldBranchId, form) {
  const data = new FormData();

  data.append("branch_name", form.branch_name);
  data.append("region_id", form.region_id || "");
  data.append("is_active", form.is_active ? "true" : "false");

  const res = await axios.put(`${API_URL}/${oldBranchId}`, data);
  return res.data;
}

export async function deactivateBranch(branchId) {
  const res = await axios.delete(`${API_URL}/${branchId}`);
  return res.data;
}